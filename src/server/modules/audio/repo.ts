import { z } from "zod";
import { VoiceSettings } from "../../../shared/audio";
import type { Db } from "../../db/client";

const Row = z
  .object({
    id: z.string(),
    created_at: z.string(),
    model: z.string(),
    voice: z.string(),
    text: z.string(),
    settings: z.string(),
    file_path: z.string(),
    media_type: z.string(),
    characters: z.number().int(),
    cost_micros: z.number().int().nullable(),
    cost_ref: z.string().nullable(),
  })
  .transform((r) => ({
    id: r.id,
    createdAt: r.created_at,
    model: r.model,
    voice: r.voice,
    text: r.text,
    settings: VoiceSettings.parse(JSON.parse(r.settings)),
    filePath: r.file_path,
    mediaType: r.media_type,
    characters: r.characters,
    costMicros: r.cost_micros,
    costRef: r.cost_ref,
  }));

export type AudioRecord = z.output<typeof Row>;

export function createAudioRepo(db: Db) {
  const insertStmt = db.prepare(
    `INSERT INTO audio_generations
       (id, created_at, model, voice, text, settings, file_path, media_type, characters, cost_micros, cost_ref)
     VALUES (@id, @createdAt, @model, @voice, @text, @settings, @filePath, @mediaType, @characters, @costMicros, @costRef)`,
  );
  const listStmt = db.prepare("SELECT * FROM audio_generations ORDER BY id DESC LIMIT ?");
  const getStmt = db.prepare("SELECT * FROM audio_generations WHERE id = ?");
  const deleteStmt = db.prepare("DELETE FROM audio_generations WHERE id = ?");

  return {
    insert(record: AudioRecord): void {
      insertStmt.run({ ...record, settings: JSON.stringify(record.settings) });
    },
    list(limit: number): AudioRecord[] {
      return listStmt.all(limit).map((r) => Row.parse(r));
    },
    get(id: string): AudioRecord | undefined {
      const row = getStmt.get(id);
      return row ? Row.parse(row) : undefined;
    },
    delete(id: string): boolean {
      return deleteStmt.run(id).changes > 0;
    },
  };
}

export type AudioRepo = ReturnType<typeof createAudioRepo>;
