import { z } from "zod";
import { MAX_TAGS } from "../../../shared/curation";
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
export type RecordingComment = { body: string; updatedAt: string };
export type RecordingCuration = { tags: string[]; comment: RecordingComment | null };

const CommentRow = z
  .object({ audio_generation_id: z.string(), body: z.string(), updated_at: z.string() })
  .transform((r) => ({ id: r.audio_generation_id, comment: { body: r.body, updatedAt: r.updated_at } }));
const TagRow = z.object({ audio_generation_id: z.string(), tag: z.string() });
const GroupRow = z.object({
  provider: z.string(),
  model: z.string(),
  count: z.number().int(),
  latest_id: z.string(),
});
const NameRow = z.object({ model: z.string(), model_name: z.string() });
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
  // One model's recordings (audio_generations_by_model, migration 0014).
  const modelFirstPage = db.prepare("SELECT * FROM audio_generations WHERE model = ? ORDER BY id DESC LIMIT ?");
  // One voice preset's recordings through its link index (voice_preset_recordings_by_preset, migration 0016).
  const presetFirstPage = db.prepare(
    `SELECT a.* FROM voice_preset_recordings l JOIN audio_generations a ON a.id = l.audio_generation_id
      WHERE l.preset_id = ? ORDER BY l.audio_generation_id DESC LIMIT ?`,
  );
  const presetNextPage = db.prepare(
    `SELECT a.* FROM voice_preset_recordings l JOIN audio_generations a ON a.id = l.audio_generation_id
      WHERE l.preset_id = ? AND l.audio_generation_id < ? ORDER BY l.audio_generation_id DESC LIMIT ?`,
  );
  const modelNextPage = db.prepare(
    "SELECT * FROM audio_generations WHERE model = ? AND id < ? ORDER BY id DESC LIMIT ?",
  );
  const selectGroups = db.prepare(
    `SELECT g.model, g.count, g.latest_id, a.provider
       FROM (SELECT model, count(*) AS count, max(id) AS latest_id FROM audio_generations GROUP BY model) g
       JOIN audio_generations a ON a.id = g.latest_id
      ORDER BY g.latest_id DESC`,
  );
  const exists = db.prepare("SELECT 1 FROM audio_generations WHERE id = ?").pluck();
  const upsertComment = db.prepare(
    `INSERT INTO audio_generation_comments (audio_generation_id, body, updated_at) VALUES (@id, @body, @updatedAt)
     ON CONFLICT (audio_generation_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
  );
  const deleteComment = db.prepare("DELETE FROM audio_generation_comments WHERE audio_generation_id = ?");
  const selectTags = db
    .prepare("SELECT tag FROM audio_generation_tags WHERE audio_generation_id = ? ORDER BY position")
    .pluck();
  const tagExists = db.prepare("SELECT 1 FROM audio_generation_tags WHERE audio_generation_id = ? AND tag = ?").pluck();
  const countTags = db.prepare("SELECT count(*) FROM audio_generation_tags WHERE audio_generation_id = ?").pluck();
  const insertTag = db.prepare(
    `INSERT INTO audio_generation_tags (audio_generation_id, tag, position)
     VALUES (@id, @tag, (SELECT coalesce(max(position), 0) + 1 FROM audio_generation_tags WHERE audio_generation_id = @id))`,
  );
  const deleteTag = db.prepare("DELETE FROM audio_generation_tags WHERE audio_generation_id = ? AND tag = ?");
  const tagsOfId = (id: string) => selectTags.all(id) as string[];
  const deleteStmt = db.prepare("DELETE FROM audio_generations WHERE id = ?");
  const selectIds = db.prepare("SELECT id FROM audio_generations").pluck();
  const anyUnnamed = db.prepare("SELECT 1 FROM audio_generations WHERE model_name IS NULL LIMIT 1").pluck();
  const selectPending = db.prepare(
    "SELECT id, provider, cost_ref, created_at, duration_ms FROM audio_generations WHERE cost_status = 'pending'",
  );
  const updateCost = db.prepare(
    "UPDATE audio_generations SET cost_status = @status, cost_micros = @micros WHERE id = @id AND cost_status = 'pending'",
  );

  const insertTx = db.transaction((rec: RecordingRecord, commitFile: () => void, afterInsert?: () => void) => {
    insertStmt.run({ ...rec, settings: JSON.stringify(rec.settings) });
    afterInsert?.(); // e.g. the preset link (voice-presets ADR-0058)
    commitFile(); // last step: if it throws, the transaction rolls back (ADR-0042)
  });
  const addTagTx = db.transaction((id: string, tag: string) => {
    if (!exists.get(id)) return { status: "missing" as const };
    if (tagExists.get(id, tag)) return { status: "duplicate" as const, tags: tagsOfId(id) };
    if ((countTags.get(id) as number) >= MAX_TAGS) return { status: "limit" as const, tags: tagsOfId(id) };
    insertTag.run({ id, tag });
    return { status: "added" as const, tags: tagsOfId(id) };
  });
  const placeholders = (n: number) => Array.from({ length: n }, () => "?").join(",");
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
    insertAtomic(rec: RecordingRecord, commitFile: () => void, afterInsert?: () => void): void {
      insertTx(rec, commitFile, afterInsert);
    },

    get(id: string): RecordingRecord | undefined {
      const raw = getStmt.get(id);
      return raw ? Row.parse(raw) : undefined;
    },

    /** Newest first; `cursor` = the last id shown, the page continues after it; `model` = one exact model id. */
    list(q: { cursor?: string; limit: number; model?: string; preset?: string }): {
      items: RecordingRecord[];
      nextCursor: string | null;
    } {
      const raw =
        q.preset !== undefined
          ? q.cursor
            ? presetNextPage.all(q.preset, q.cursor, q.limit + 1)
            : presetFirstPage.all(q.preset, q.limit + 1)
          : q.model !== undefined
            ? q.cursor
              ? modelNextPage.all(q.model, q.cursor, q.limit + 1)
              : modelFirstPage.all(q.model, q.limit + 1)
            : q.cursor
              ? nextPage.all(q.cursor, q.limit + 1)
              : firstPage.all(q.limit + 1);
      const rows = raw.map((r) => Row.parse(r));
      const items = rows.slice(0, q.limit);
      return { items, nextCursor: rows.length > q.limit ? (items.at(-1)?.id ?? null) : null };
    },

    /** Deletes a recording; `moveFile` runs as the transaction's last step. `undefined` = no such id. */
    deleteAtomic(id: string, moveFile: (filePath: string) => void): RecordingRecord | undefined {
      return deleteTx(id, moveFile);
    },

    /** Every model id with recordings: its count, newest id and up to `latest` newest rows; newest model first. */
    modelGroups(q: { latest: number }) {
      return selectGroups.all().map((raw) => {
        const g = GroupRow.parse(raw);
        const items = q.latest > 0 ? modelFirstPage.all(g.model, q.latest).map((r) => Row.parse(r)) : [];
        return { provider: g.provider, model: g.model, count: g.count, latestId: g.latest_id, items };
      });
    },

    /** The name stored with each model's newest recording that has one; models without one are absent (ADR-0052). */
    storedNames(models: readonly string[]): Map<string, string> {
      const unique = [...new Set(models)];
      if (unique.length === 0) return new Map();
      const rows = db
        .prepare(
          `SELECT a.model, a.model_name FROM audio_generations a
            WHERE a.id = (SELECT max(b.id) FROM audio_generations b WHERE b.model = a.model AND b.model_name IS NOT NULL)
              AND a.model IN (${placeholders(unique.length)})`,
        )
        .all(...unique);
      return new Map(rows.map((r) => NameRow.parse(r)).map((r) => [r.model, r.model_name]));
    },

    /** Tags (insertion order) and the comment of several recordings in two queries; unknown ids get none. */
    curationOf(ids: readonly string[]): Map<string, RecordingCuration> {
      const out = new Map<string, RecordingCuration>(ids.map((id) => [id, { tags: [], comment: null }]));
      if (ids.length === 0) return out;
      const marks = placeholders(ids.length);
      for (const raw of db
        .prepare(
          `SELECT audio_generation_id, tag FROM audio_generation_tags WHERE audio_generation_id IN (${marks})
            ORDER BY audio_generation_id, position`,
        )
        .all(...ids)) {
        const r = TagRow.parse(raw);
        out.get(r.audio_generation_id)?.tags.push(r.tag);
      }
      for (const raw of db
        .prepare(
          `SELECT audio_generation_id, body, updated_at FROM audio_generation_comments WHERE audio_generation_id IN (${marks})`,
        )
        .all(...ids)) {
        const r = CommentRow.parse(raw);
        const entry = out.get(r.id);
        if (entry) entry.comment = r.comment;
      }
      return out;
    },

    /** Replaces the comment (`null` removes it). */
    setComment(
      id: string,
      body: string | null,
      updatedAt: string,
    ): { status: "ok"; comment: RecordingComment | null } | { status: "missing" } {
      if (!exists.get(id)) return { status: "missing" };
      if (body === null) {
        deleteComment.run(id);
        return { status: "ok", comment: null };
      }
      upsertComment.run({ id, body, updatedAt });
      return { status: "ok", comment: { body, updatedAt } };
    },

    /** Adds one normalized tag: dedup, at most `MAX_TAGS`, inside one transaction (as for images, ADR-0015). */
    addTag(id: string, tag: string) {
      return addTagTx(id, tag);
    },

    removeTag(id: string, tag: string): { status: "ok"; tags: string[] } | { status: "missing" } {
      if (!exists.get(id)) return { status: "missing" };
      deleteTag.run(id, tag);
      return { status: "ok", tags: tagsOfId(id) };
    },

    /** True when some recording has no stored model name (prototype rows). */
    hasUnnamed(): boolean {
      return anyUnnamed.get() !== undefined;
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
