import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "../../src/server/db/client";
import { createRecordingsRepo, type RecordingRecord } from "../../src/server/modules/audio/recordings-repo";

/** A tiny MP3-looking payload (ID3 header bytes) — enough for the file to exist and be served. */
export const TINY_MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 1]);

let seq = 0;

/** Inserts a complete recording (row + tiny audio file on disk). No PII — test texts only. */
export function seedRecording(db: Db, dataDir: string, overrides: Partial<RecordingRecord> = {}): RecordingRecord {
  seq += 1;
  const id = overrides.id ?? `01SEEDREC${String(seq).padStart(17, "0")}`;
  const rec: RecordingRecord = {
    id,
    provider: "openrouter",
    model: "elevenlabs/eleven-v3",
    modelName: "Eleven v3",
    voice: "george",
    text: `A test text ${seq}`,
    settings: { stability: 0.5, similarity: 0.75 },
    filePath: `audio/${id}.mp3`,
    mediaType: "audio/mpeg",
    characters: 13,
    costMicros: 1040,
    costStatus: "known",
    costRef: null,
    estimateMicros: 1040,
    createdAt: new Date(Date.UTC(2026, 9, 25, 10, 0, seq % 60)).toISOString(),
    durationMs: 900,
    ...overrides,
  };
  createRecordingsRepo(db).insertAtomic(rec, () => {
    mkdirSync(join(dataDir, "audio"), { recursive: true });
    writeFileSync(join(dataDir, rec.filePath), TINY_MP3);
  });
  return rec;
}
