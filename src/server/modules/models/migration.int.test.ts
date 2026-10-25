import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type Db, openDb } from "../../db/client";
import { appliedVersions, migrateDown, migrateUp } from "../../db/migrate";

const PREF = {
  provider: "openrouter",
  model: "google/gemini-2.5-flash-image",
  favorite: 1,
  hidden: 0,
  updated_at: "2026-10-20T10:00:00.000Z",
};

describe("migration 0015_create_speech_model_preferences", () => {
  let dir: string;
  let db: Db;
  const tables = () =>
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%model_preferences' ORDER BY name")
      .all()
      .map((r) => (r as { name: string }).name);
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gen-img-speech-prefs-"));
    db = openDb(dir);
    migrateUp(db);
    while (appliedVersions(db).at(-1) !== "0014") migrateDown(db);
    db.prepare(
      "INSERT INTO model_preferences (provider, model, favorite, hidden, updated_at) VALUES (@provider, @model, @favorite, @hidden, @updated_at)",
    ).run(PREF);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("adds an empty speech preference table and leaves image preferences unchanged; rollback drops only it", () => {
    migrateUp(db);
    expect(appliedVersions(db)).toContain("0015");
    expect(tables()).toEqual(["model_preferences", "speech_model_preferences"]);
    expect(db.prepare("SELECT * FROM model_preferences").all()).toEqual([PREF]);
    expect(db.prepare("SELECT count(*) AS n FROM speech_model_preferences").get()).toEqual({ n: 0 });
    // only OpenRouter, a row needs a flag on
    const ins = db.prepare(
      "INSERT INTO speech_model_preferences (provider, model, favorite, hidden, updated_at) VALUES (?, ?, ?, ?, ?)",
    );
    expect(() => ins.run("vercel", "a/b", 1, 0, "x")).toThrow();
    expect(() => ins.run("openrouter", "a/b", 0, 0, "x")).toThrow();
    ins.run("openrouter", "google/gemini-2.5-flash-image", 0, 1, "x");
    expect(db.prepare("SELECT * FROM model_preferences").all()).toEqual([PREF]);
    while (appliedVersions(db).at(-1) !== "0014") migrateDown(db);
    expect(tables()).toEqual(["model_preferences"]);
    expect(db.prepare("SELECT * FROM model_preferences").all()).toEqual([PREF]);
  });
});
