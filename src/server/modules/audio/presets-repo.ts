import { z } from "zod";
import { VoiceSettings } from "../../../shared/speech";
import type { PresetRef, PresetStats } from "../../../shared/voice-presets";
import type { Db } from "../../db/client";

/** One row of `voice_presets` (migration 0016) with its stats over the linked recordings, parsed before it leaves. */
const Row = z
  .object({
    id: z.string(),
    name: z.string(),
    provider: z.string(),
    model: z.string(),
    model_name: z.string(),
    voice: z.string().nullable(),
    settings: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
    recordings: z.number().int(),
    known_cost: z.number().int().nullable(),
    known_count: z.number().int(),
    pending: z.number().int(),
    unavailable: z.number().int(),
    last_used_at: z.string().nullable(),
  })
  .transform((r) => ({
    id: r.id,
    name: r.name,
    provider: r.provider,
    model: r.model,
    modelName: r.model_name,
    voice: r.voice,
    settings: VoiceSettings.catch({}).parse(JSON.parse(r.settings)),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    stats: {
      recordings: r.recordings,
      knownCostMicros: r.known_count > 0 ? (r.known_cost ?? 0) : null,
      pending: r.pending,
      unavailable: r.unavailable,
      lastUsedAt: r.last_used_at,
    } satisfies PresetStats,
  }));

export type PresetRecord = z.output<typeof Row>;
export type PresetWrite = {
  name: string;
  nameKey: string;
  provider: string;
  model: string;
  modelName: string;
  voice: string | null;
  settings: VoiceSettings;
};

const RefRow = z.object({ audio_generation_id: z.string(), id: z.string(), name: z.string() });

// Stats are computed on read from the links (sad.md §4 item 4): known total, pending / unavailable counts, last use.
const WITH_STATS = `
  SELECT p.*, count(a.id) AS recordings,
         sum(CASE WHEN a.cost_status = 'known' THEN a.cost_micros END) AS known_cost,
         count(CASE WHEN a.cost_status = 'known' THEN 1 END) AS known_count,
         count(CASE WHEN a.cost_status = 'pending' THEN 1 END) AS pending,
         count(CASE WHEN a.cost_status = 'unavailable' THEN 1 END) AS unavailable,
         max(a.created_at) AS last_used_at
    FROM voice_presets p
    LEFT JOIN voice_preset_recordings l ON l.preset_id = p.id
    LEFT JOIN audio_generations a ON a.id = l.audio_generation_id`;

export class DuplicatePresetName extends Error {}

const isUniqueKey = (err: unknown) =>
  err instanceof Error && /UNIQUE constraint failed: voice_presets\.name_key/.test(err.message);

export function createPresetsRepo(db: Db) {
  const listStmt = db.prepare(`${WITH_STATS} GROUP BY p.id ORDER BY p.name_key, p.id`);
  const getStmt = db.prepare(`${WITH_STATS} WHERE p.id = ? GROUP BY p.id`);
  const insertStmt = db.prepare(
    `INSERT INTO voice_presets (id, name, name_key, provider, model, model_name, voice, settings, created_at, updated_at)
     VALUES (@id, @name, @nameKey, @provider, @model, @modelName, @voice, @settings, @at, @at)`,
  );
  const renameStmt = db.prepare("UPDATE voice_presets SET name = ?, name_key = ?, updated_at = ? WHERE id = ?");
  const setupStmt = db.prepare(
    `UPDATE voice_presets SET provider = @provider, model = @model, model_name = @modelName, voice = @voice,
       settings = @settings, updated_at = @at WHERE id = @id`,
  );
  const deleteStmt = db.prepare("DELETE FROM voice_presets WHERE id = ?");
  const exists = db.prepare("SELECT 1 FROM voice_presets WHERE id = ?").pluck();
  const linkStmt = db.prepare(
    `INSERT INTO voice_preset_recordings (audio_generation_id, preset_id)
     SELECT @recording, @preset WHERE EXISTS (SELECT 1 FROM voice_presets WHERE id = @preset)`,
  );

  const updateTx = db.transaction(
    (
      id: string,
      at: string,
      rename: { name: string; nameKey: string } | undefined,
      setup?: Omit<PresetWrite, "name" | "nameKey">,
    ) => {
      if (!exists.get(id)) return false;
      if (rename) renameStmt.run(rename.name, rename.nameKey, at, id);
      if (setup) setupStmt.run({ ...setup, settings: JSON.stringify(setup.settings), at, id });
      return true;
    },
  );

  const guard = <T>(fn: () => T): T => {
    try {
      return fn();
    } catch (err) {
      if (isUniqueKey(err)) throw new DuplicatePresetName();
      throw err;
    }
  };

  return {
    /** Every preset by name ignoring case, with its stats. */
    list(): PresetRecord[] {
      return listStmt.all().map((r) => Row.parse(r));
    },

    get(id: string): PresetRecord | undefined {
      const raw = getStmt.get(id);
      return raw ? Row.parse(raw) : undefined;
    },

    /** Inserts a preset; a taken name key throws `DuplicatePresetName`. */
    insert(id: string, p: PresetWrite, at: string): void {
      guard(() => insertStmt.run({ ...p, id, settings: JSON.stringify(p.settings), at }));
    },

    /** Renames and/or replaces the setup in one transaction; `false` = no such preset. */
    update(
      id: string,
      at: string,
      change: { rename?: { name: string; nameKey: string }; setup?: Omit<PresetWrite, "name" | "nameKey"> },
    ): boolean {
      return guard(() => updateTx(id, at, change.rename, change.setup));
    },

    /** Deletes a preset; its links cascade, recordings stay (ADR-0057). `false` = no such preset. */
    remove(id: string): boolean {
      return deleteStmt.run(id).changes === 1;
    },

    /** Links a recording when the preset still exists (ADR-0058); run inside the recording's save transaction. */
    linkIfExists(recordingId: string, presetId: string): boolean {
      return linkStmt.run({ recording: recordingId, preset: presetId }).changes === 1;
    },

    /** The preset each of these recordings is linked to; unlinked ones are absent. */
    presetsOf(recordingIds: readonly string[]): Map<string, PresetRef> {
      const ids = [...new Set(recordingIds)];
      if (ids.length === 0) return new Map();
      const rows = db
        .prepare(
          `SELECT l.audio_generation_id, p.id, p.name FROM voice_preset_recordings l
             JOIN voice_presets p ON p.id = l.preset_id
            WHERE l.audio_generation_id IN (${ids.map(() => "?").join(",")})`,
        )
        .all(...ids);
      return new Map(rows.map((r) => RefRow.parse(r)).map((r) => [r.audio_generation_id, { id: r.id, name: r.name }]));
    },
  };
}

export type PresetsRepo = ReturnType<typeof createPresetsRepo>;
