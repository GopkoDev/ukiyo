import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db, openDb } from "../../db/client";
import { appliedVersions, migrateDown, migrateUp } from "../../db/migrate";

const REC = {
  id: "01M6000000000000000000000A",
  provider: "openrouter",
  model: "elevenlabs/eleven-v3",
  model_name: "Eleven v3",
  voice: "george",
  text: "Hello there",
  settings: '{"speed":1.1}',
  file_path: "audio/01M6000000000000000000000A.mp3",
  media_type: "audio/mpeg",
  characters: 11,
  cost_micros: 100,
  cost_status: "known",
  cost_ref: null,
  estimate_micros: 90,
  created_at: "2026-10-25T10:00:00.000Z",
  duration_ms: 900,
};
const PRESET = {
  id: "01M7000000000000000000000P",
  name: "Narrator",
  name_key: "narrator",
  provider: "openrouter",
  model: "elevenlabs/eleven-v3",
  model_name: "Eleven v3",
  voice: "george",
  settings: '{"speed":1.1}',
  created_at: "2026-10-25T11:00:00.000Z",
  updated_at: "2026-10-25T11:00:00.000Z",
};

describe("migration 0016_create_voice_presets", () => {
  let dir: string;
  let db: Db;
  const insert = (table: string, row: Record<string, unknown>) => {
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((c) => `@${c}`).join(", ")})`).run(row);
  };
  const snapshot = () => ({
    recordings: db.prepare("SELECT * FROM audio_generations ORDER BY id").all(),
    tags: db.prepare("SELECT * FROM audio_generation_tags ORDER BY audio_generation_id, tag").all(),
    comments: db.prepare("SELECT * FROM audio_generation_comments ORDER BY audio_generation_id").all(),
  });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gen-img-voice-presets-"));
    db = openDb(dir);
    migrateUp(db);
    while (appliedVersions(db).at(-1) !== "0015") migrateDown(db);
    insert("audio_generations", REC);
    insert("audio_generation_tags", { audio_generation_id: REC.id, tag: "intro", position: 1 });
    insert("audio_generation_comments", { audio_generation_id: REC.id, body: "keep", updated_at: REC.created_at });
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("applies over the Owner's recordings without changing them; they read as unlinked", () => {
    const before = snapshot();
    expect(migrateUp(db).map((m) => m.version)).toEqual(["0016"]);
    expect(snapshot()).toEqual(before);
    expect(db.prepare("SELECT count(*) FROM voice_preset_recordings").pluck().get()).toBe(0);
  });

  it("keeps names unique by key, allows one preset per recording, and cascades from both sides", () => {
    migrateUp(db);
    insert("voice_presets", PRESET);
    expect(() => insert("voice_presets", { ...PRESET, id: "01M7000000000000000000000Q", name: "NARRATOR" })).toThrow(
      /UNIQUE/,
    );
    expect(() =>
      insert("voice_presets", { ...PRESET, id: "01M7000000000000000000000R", name_key: "x", name: " a" }),
    ).toThrow(/CHECK/);
    insert("voice_preset_recordings", { audio_generation_id: REC.id, preset_id: PRESET.id });
    expect(() => insert("voice_preset_recordings", { audio_generation_id: REC.id, preset_id: PRESET.id })).toThrow(
      /UNIQUE|PRIMARY/,
    );
    expect(() => insert("voice_preset_recordings", { audio_generation_id: "nope", preset_id: PRESET.id })).toThrow(
      /FOREIGN KEY/,
    );
    const plan = db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT audio_generation_id FROM voice_preset_recordings WHERE preset_id = ? AND audio_generation_id < ? ORDER BY audio_generation_id DESC LIMIT 25",
      )
      .all("p", "z") as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" ")).toMatch(/voice_preset_recordings_by_preset/);

    // Deleting the preset drops the link only (AC-07, AC-08).
    const before = snapshot();
    db.prepare("DELETE FROM voice_presets WHERE id = ?").run(PRESET.id);
    expect(db.prepare("SELECT count(*) FROM voice_preset_recordings").pluck().get()).toBe(0);
    expect(snapshot()).toEqual(before);

    // Deleting a recording drops its link (AC-16).
    insert("voice_presets", PRESET);
    insert("voice_preset_recordings", { audio_generation_id: REC.id, preset_id: PRESET.id });
    db.prepare("DELETE FROM audio_generations WHERE id = ?").run(REC.id);
    expect(db.prepare("SELECT count(*) FROM voice_preset_recordings").pluck().get()).toBe(0);
    expect(db.prepare("SELECT count(*) FROM voice_presets").pluck().get()).toBe(1);
  });

  it("rolls back to 0015 dropping only the new tables", () => {
    migrateUp(db);
    insert("voice_presets", PRESET);
    insert("voice_preset_recordings", { audio_generation_id: REC.id, preset_id: PRESET.id });
    const before = snapshot();
    expect(migrateDown(db)?.version).toBe("0016");
    expect(appliedVersions(db).at(-1)).toBe("0015");
    expect(snapshot()).toEqual(before);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'voice_preset%'").pluck().all();
    expect(tables).toEqual([]);
  });
});
