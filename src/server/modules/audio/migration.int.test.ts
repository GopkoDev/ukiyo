import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db, openDb } from "../../db/client";
import { appliedVersions, migrateDown, migrateUp } from "../../db/migrate";

/** Prototype-shaped rows, as migration 0011 stored them on the owner's machine (text-to-speech spec AC-18). */
const PROTOTYPE = [
  {
    id: "01M5FHKKTJG5G2H75G5K6H725Q",
    created_at: "2026-10-21T15:40:00.000Z",
    model: "elevenlabs/eleven-multilingual-v2",
    voice: "george",
    text: "Hi",
    settings: '{"speed":1.1,"stability":0.4,"similarity":0.8,"style":0.1,"speakerBoost":true}',
    file_path: "audio/01M5FHKKTJG5G2H75G5K6H725Q.mp3",
    media_type: "audio/mpeg",
    characters: 2,
    cost_micros: 160,
    cost_ref: "gen-tts-1792596888-MMkupXyNUqJTvlKLofio",
  },
  {
    id: "01M5FK4F6NT7Y4YKQ5DEF2MEM7",
    created_at: "2026-10-21T16:06:00.000Z",
    model: "elevenlabs/eleven-v4",
    voice: "sarah",
    text: "No price was published for this one.",
    settings: '{"stability":0.43,"similarity":0.77}',
    file_path: "audio/01M5FK4F6NT7Y4YKQ5DEF2MEM7.mp3",
    media_type: "audio/mpeg",
    characters: 36,
    cost_micros: null,
    cost_ref: null,
  },
];

describe("migration 0012_rebuild_audio_generations", () => {
  let dir: string;
  let db: Db;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gen-img-audio-migrate-"));
    db = openDb(dir);
    migrateUp(db);
    while (appliedVersions(db).at(-1) !== "0011") migrateDown(db);
    const insert = db.prepare(
      `INSERT INTO audio_generations (id, created_at, model, voice, text, settings, file_path, media_type, characters, cost_micros, cost_ref)
       VALUES (@id, @created_at, @model, @voice, @text, @settings, @file_path, @media_type, @characters, @cost_micros, @cost_ref)`,
    );
    for (const row of PROTOTYPE) insert.run(row);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps every prototype row: an amount becomes a known cost, no amount becomes unavailable", () => {
    migrateUp(db);
    expect(appliedVersions(db)).toContain("0012");
    const rows = db.prepare("SELECT * FROM audio_generations ORDER BY id").all() as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      ...PROTOTYPE[0],
      provider: "openrouter",
      model_name: null,
      cost_status: "known",
      estimate_micros: null,
      duration_ms: null,
    });
    expect(rows[1]).toMatchObject({ ...PROTOTYPE[1], cost_status: "unavailable", cost_micros: null });
  });

  it("allows a provider-default voice, ties the status to the amount and serves pending costs from an index", () => {
    migrateUp(db);
    const insert = db.prepare(
      `INSERT INTO audio_generations (id, provider, model, model_name, voice, text, settings, file_path, media_type,
         characters, cost_micros, cost_status, cost_ref, estimate_micros, created_at, duration_ms)
       VALUES (?, 'openrouter', 'fish-audio/s1', 'Fish S1', NULL, 'Hello', '{}', ?, ?, 5, ?, ?, 'gen-1', 75, '2026-10-25T10:00:00.000Z', 900)`,
    );
    insert.run("01N0000000000000000000000A", "audio/01N0000000000000000000000A.wav", "audio/wav", null, "pending");
    expect(() =>
      insert.run("01N0000000000000000000000B", "audio/01N0000000000000000000000B.mp3", "audio/mpeg", null, "known"),
    ).toThrow(/CHECK/);
    expect(() =>
      insert.run("01N0000000000000000000000C", "audio/01N0000000000000000000000C.ogg", "audio/ogg", 10, "known"),
    ).toThrow(/CHECK/);
    const plan = db
      .prepare("EXPLAIN QUERY PLAN SELECT id FROM audio_generations WHERE cost_status = 'pending'")
      .all() as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" ")).toContain("audio_generations_cost_pending");
  });

  it("reverts to the 0011 shape with the same rows; a provider-default voice becomes 'default'", () => {
    migrateUp(db);
    db.prepare(
      `INSERT INTO audio_generations (id, provider, model, voice, text, settings, file_path, media_type, characters,
         cost_status, created_at) VALUES ('01N0000000000000000000000D', 'openrouter', 'fish-audio/s1', NULL, 'Hi', '{}',
         'audio/01N0000000000000000000000D.mp3', 'audio/mpeg', 2, 'unavailable', '2026-10-25T10:00:00.000Z')`,
    ).run();
    migrateDown(db);
    expect(appliedVersions(db).at(-1)).toBe("0011");
    const cols = db.prepare("SELECT name FROM pragma_table_info('audio_generations')").pluck().all();
    expect(cols).toEqual([
      "id",
      "created_at",
      "model",
      "voice",
      "text",
      "settings",
      "file_path",
      "media_type",
      "characters",
      "cost_micros",
      "cost_ref",
    ]);
    const rows = db.prepare("SELECT * FROM audio_generations ORDER BY id").all() as Record<string, unknown>[];
    expect(rows.slice(0, 2)).toEqual(PROTOTYPE);
    expect(rows[2]).toMatchObject({ id: "01N0000000000000000000000D", voice: "default" });
  });
});
