import { z } from "zod";
import { AudioMediaType, CostStatus, VoiceSettings } from "../../../shared/speech";
import type { Db } from "../../db/client";

/** One row of `audio_generations` (migration 0012), parsed before it leaves the repo. */
const Row = z
  .object({
    id: z.string(),
    provider: z.string(),
    model: z.string(),
    model_name: z.string().nullable(),
    voice: z.string().nullable(),
    text: z.string(),
    settings: z.string(),
    file_path: z.string(),
    media_type: AudioMediaType,
    characters: z.number().int(),
    cost_micros: z.number().int().nullable(),
    cost_status: CostStatus,
    cost_ref: z.string().nullable(),
    estimate_micros: z.number().int().nullable(),
    created_at: z.string(),
    duration_ms: z.number().int().nullable(),
  })
  .transform((r) => ({
    id: r.id,
    provider: r.provider,
    model: r.model,
    modelName: r.model_name,
    voice: r.voice,
    text: r.text,
    // Settings were validated on the way in; a prototype row may carry keys a later spec dropped — keep what parses.
    settings: VoiceSettings.catch({}).parse(JSON.parse(r.settings)),
    filePath: r.file_path,
    mediaType: r.media_type,
    characters: r.characters,
    costMicros: r.cost_micros,
    costStatus: r.cost_status,
    costRef: r.cost_ref,
    estimateMicros: r.estimate_micros,
    createdAt: r.created_at,
    durationMs: r.duration_ms,
  }));

export type RecordingRecord = z.output<typeof Row>;
export type PendingRecordingCost = { id: string; provider: string; costRef: string | null; answeredAt: number };

const PendingRow = z.object({
  id: z.string(),
  provider: z.string(),
  cost_ref: z.string().nullable(),
  created_at: z.string(),
  duration_ms: z.number().int().nullable(),
});

export function createRecordingsRepo(db: Db) {
  const insertStmt = db.prepare(
    `INSERT INTO audio_generations
       (id, provider, model, model_name, voice, text, settings, file_path, media_type, characters,
        cost_micros, cost_status, cost_ref, estimate_micros, created_at, duration_ms)
     VALUES (@id, @provider, @model, @modelName, @voice, @text, @settings, @filePath, @mediaType, @characters,
        @costMicros, @costStatus, @costRef, @estimateMicros, @createdAt, @durationMs)`,
  );
  const getStmt = db.prepare("SELECT * FROM audio_generations WHERE id = ?");
  const firstPage = db.prepare("SELECT * FROM audio_generations ORDER BY id DESC LIMIT ?");
  const nextPage = db.prepare("SELECT * FROM audio_generations WHERE id < ? ORDER BY id DESC LIMIT ?");
  const deleteStmt = db.prepare("DELETE FROM audio_generations WHERE id = ?");
  const selectIds = db.prepare("SELECT id FROM audio_generations").pluck();
  const selectPending = db.prepare(
    "SELECT id, provider, cost_ref, created_at, duration_ms FROM audio_generations WHERE cost_status = 'pending'",
  );
  const updateCost = db.prepare(
    "UPDATE audio_generations SET cost_status = @status, cost_micros = @micros WHERE id = @id AND cost_status = 'pending'",
  );

  const insertTx = db.transaction((rec: RecordingRecord, commitFile: () => void) => {
    insertStmt.run({ ...rec, settings: JSON.stringify(rec.settings) });
    commitFile(); // last step: if it throws, the transaction rolls back (ADR-0042)
  });
  const deleteTx = db.transaction((id: string, moveFile: (filePath: string) => void) => {
    const raw = getStmt.get(id);
    if (!raw) return undefined;
    const rec = Row.parse(raw);
    deleteStmt.run(id);
    moveFile(rec.filePath); // last step, like the save
    return rec;
  });

  return {
    /** Inserts a recording in one transaction whose last step moves its audio file into place. */
    insertAtomic(rec: RecordingRecord, commitFile: () => void): void {
      insertTx(rec, commitFile);
    },

    get(id: string): RecordingRecord | undefined {
      const raw = getStmt.get(id);
      return raw ? Row.parse(raw) : undefined;
    },

    /** Newest first; `cursor` = the last id shown, the page continues after it. */
    list(q: { cursor?: string; limit: number }): { items: RecordingRecord[]; nextCursor: string | null } {
      const rows = (q.cursor ? nextPage.all(q.cursor, q.limit + 1) : firstPage.all(q.limit + 1)).map((r) =>
        Row.parse(r),
      );
      const items = rows.slice(0, q.limit);
      return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
    },

    /** Deletes a recording; `moveFile` runs as the transaction's last step. `undefined` = no such id. */
    deleteAtomic(id: string, moveFile: (filePath: string) => void): RecordingRecord | undefined {
      return deleteTx(id, moveFile);
    },

    allIds(): string[] {
      return selectIds.all() as string[];
    },

    listPendingCosts(): PendingRecordingCost[] {
      return selectPending.all().map((raw) => {
        const r = PendingRow.parse(raw);
        return {
          id: r.id,
          provider: r.provider,
          costRef: r.cost_ref,
          answeredAt: Date.parse(r.created_at) + (r.duration_ms ?? 0),
        };
      });
    },

    /** Final price for a pending recording: micro-USD → `known`, `null` → `unavailable`. No-op unless still pending. */
    resolveCost(id: string, micros: number | null): boolean {
      const status = micros === null ? "unavailable" : "known";
      return updateCost.run({ id, status, micros }).changes === 1;
    },
  };
}

export type RecordingsRepo = ReturnType<typeof createRecordingsRepo>;
