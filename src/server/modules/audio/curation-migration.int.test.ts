import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db, openDb } from "../../db/client";
import { appliedVersions, migrateDown, migrateUp } from "../../db/migrate";

/** Rows as the owner's DB holds them after 0012: a prototype row (NULL name/duration) and a step-18 row. */
const ROWS = [
  {
    id: "01M5FHKKTJG5G2H75G5K6H725Q",
    provider: "openrouter",
    model: "elevenlabs/eleven-multilingual-v2",
    model_name: null,
    voice: "george",
    text: "Hi",
    settings: '{"speed":1.1}',
    file_path: "audio/01M5FHKKTJG5G2H75G5K6H725Q.mp3",
    media_type: "audio/mpeg",
    characters: 2,
    cost_micros: 160,
    cost_status: "known",
    cost_ref: null,
    estimate_micros: null,
    created_at: "2026-10-21T15:40:00.000Z",
    duration_ms: null,
  },
  {
    id: "01M6000000000000000000000A",
    provider: "openrouter",
    model: "google/gemini-3.8-flash-tts",
    model_name: "Gemini 3.8 Flash TTS",
    voice: null,
    text: "Hello there",
    settings: "{}",
    file_path: "audio/01M6000000000000000000000A.wav",
    media_type: "audio/wav",
    characters: 11,
    cost_micros: null,
    cost_status: "pending",
    cost_ref: "gen-1",
    estimate_micros: 12,
    created_at: "2026-10-25T10:00:00.000Z",
    duration_ms: 900,
  },
];

describe("migrations 0013_create_audio_curation + 0014_index_audio_generations_by_model", () => {
  let dir: string;
  let db: Db;
  const all = () => db.prepare("SELECT * FROM audio_generations ORDER BY id").all();
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gen-img-audio-curation-"));
    db = openDb(dir);
    migrateUp(db);
    while (appliedVersions(db).at(-1) !== "0012") migrateDown(db);
    const cols = Object.keys(ROWS[0] as object);
    const insert = db.prepare(
      `INSERT INTO audio_generations (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})`,
    );
    for (const row of ROWS) insert.run(row);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("applies on top of 0012 without changing any recording", () => {
    const before = all();
    migrateUp(db);
    expect(appliedVersions(db)).toEqual(expect.arrayContaining(["0013", "0014"]));
    expect(all()).toEqual(before);
    const names = db.prepare("SELECT name FROM sqlite_master ORDER BY name").pluck().all();
    expect(names).toEqual(
      expect.arrayContaining(["audio_generation_comments", "audio_generation_tags", "audio_generations_by_model"]),
    );
  });

  it("deleting a recording removes its tags and its comment (cascade)", () => {
    migrateUp(db);
    const id = ROWS[0]?.id;
    db.prepare("INSERT INTO audio_generation_tags VALUES (?, 'intro', 1)").run(id);
    db.prepare("INSERT INTO audio_generation_comments VALUES (?, 'keep', '2026-10-25T10:00:00.000Z')").run(id);
    db.prepare("DELETE FROM audio_generations WHERE id = ?").run(id);
    expect(db.prepare("SELECT count(*) FROM audio_generation_tags").pluck().get()).toBe(0);
    expect(db.prepare("SELECT count(*) FROM audio_generation_comments").pluck().get()).toBe(0);
  });

  it("enforces the image rules: normalized 1–32 char tags, a non-blank comment ≤ 2 000 chars, a real recording", () => {
    migrateUp(db);
    const id = ROWS[1]?.id;
    const tag = db.prepare("INSERT INTO audio_generation_tags VALUES (?, ?, 1)");
    expect(() => tag.run(id, "Upper")).toThrow();
    expect(() => tag.run(id, "x".repeat(33))).toThrow();
    expect(() => tag.run("01NOPE00000000000000000000", "ok")).toThrow();
    const comment = db.prepare("INSERT INTO audio_generation_comments VALUES (?, ?, 't')");
    expect(() => comment.run(id, "   ")).toThrow();
    expect(() => comment.run(id, "é".repeat(2001))).toThrow();
    expect(() => comment.run(id, "é".repeat(2000))).not.toThrow();
  });

  it("rolls back to 0012 cleanly: tables and index gone, recordings intact", () => {
    const before = all();
    migrateUp(db);
    while (appliedVersions(db).at(-1) !== "0012") migrateDown(db); // later migrations (0015+) roll back first
    expect(appliedVersions(db).at(-1)).toBe("0012");
    const names = db.prepare("SELECT name FROM sqlite_master").pluck().all();
    expect(names).not.toContain("audio_generation_tags");
    expect(names).not.toContain("audio_generation_comments");
    expect(names).not.toContain("audio_generations_by_model");
    expect(all()).toEqual(before);
  });
});
