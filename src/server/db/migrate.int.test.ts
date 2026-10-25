import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestApp } from "../../../tests/helpers/test-app";
import { type Db, openDb } from "./client";
import { appliedVersions, listMigrations, migrateDown, migrateUp } from "./migrate";

describe("migration runner", () => {
  let dir: string;
  let db: Db;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gen-img-migrate-"));
    db = openDb(dir);
  });
  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** Rolls back until `version` is the latest applied one — independent of how many migrations exist. */
  function downTo(version: string) {
    while (appliedVersions(db).at(-1) !== version) migrateDown(db);
  }

  it("0010_add_generation_prompt_key keys prompts with a fixed length, serves a prompt's page from an index, and reverts", () => {
    migrateUp(db);
    const cols = db.prepare("SELECT name FROM pragma_table_info('generations')").pluck().all();
    expect(cols).toContain("prompt_key");
    const insert = db.prepare(
      `INSERT INTO generations (id, provider, model, prompt, requested_params, accepted_params, images_requested,
         cost_micros, cost_status, created_at, duration_ms, raw_request, raw_response, prompt_key)
       VALUES (?, 'openrouter', 'm', 'p', '{}', NULL, 1, NULL, 'unavailable', '2026-10-19T00:00:00.000Z', 1, '{}', '{}', ?)`,
    );
    insert.run("01A", "0123456789abcdef0123456789abcdef");
    insert.run("01B", null); // NULL until the boot backfill (ADR-0037)
    expect(() => insert.run("01C", "short")).toThrow(/CHECK/);
    const plan = db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM generations WHERE prompt_key = ? AND id < ? ORDER BY id DESC LIMIT 25",
      )
      .all("x", "01Z") as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" ")).toMatch(/generations_by_prompt/);
    downTo("0009");
    expect(db.prepare("SELECT name FROM pragma_table_info('generations')").pluck().all()).not.toContain("prompt_key");
  });

  it("0009_index_generations_by_model serves one model's page newest first from an index, and reverts", () => {
    migrateUp(db);
    const plan = db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM generations WHERE provider = ? AND model = ? AND id < ? ORDER BY id DESC LIMIT 25",
      )
      .all("openrouter", "m", "01Z") as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" ")).toMatch(/generations_by_model/);
    downTo("0008");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'generations_by_model'").pluck().all()).toEqual([]);
  });

  it("0008_create_model_preferences keeps one row per provider + model with at least one flag on, and reverts", () => {
    migrateUp(db);
    const insert = db.prepare(
      "INSERT INTO model_preferences (provider, model, favorite, hidden, updated_at) VALUES (?, ?, ?, ?, 'x')",
    );
    insert.run("openrouter", "google/gemini-2.5-flash-image", 1, 0);
    insert.run("vercel", "google/gemini-2.5-flash-image", 0, 1); // same id under another provider is another model
    expect(() => insert.run("openrouter", "google/gemini-2.5-flash-image", 0, 1)).toThrow(/UNIQUE|PRIMARY/);
    expect(() => insert.run("openrouter", "m", 0, 0)).toThrow(/CHECK/);
    expect(() => insert.run("other", "m", 1, 0)).toThrow(/CHECK/);
    expect(() => insert.run("openrouter", "", 1, 0)).toThrow(/CHECK/);
    downTo("0007");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'model_preferences'").pluck().all()).toEqual([]);
  });

  it("0007_add_generation_source records lineage without a foreign key and serves the derived list from an index", () => {
    migrateUp(db);
    const insert = db.prepare(
      `INSERT INTO generations (id, provider, model, prompt, requested_params, accepted_params, images_requested,
         cost_micros, cost_status, created_at, duration_ms, raw_request, raw_response, source_id, source_relation, source_output)
       VALUES (@id, 'openrouter', 'm', 'p', '{}', NULL, 1, NULL, 'unavailable', '2026-10-18T00:00:00.000Z', 1, '{}', '{}',
         @src, @rel, @out)`,
    );
    insert.run({ id: "01A", src: null, rel: null, out: null });
    insert.run({ id: "01B", src: "01A", rel: "rerun", out: null });
    insert.run({ id: "01C", src: "01GONE", rel: "reuse", out: 2 }); // no FK: a deleted source stays recorded
    expect(() => insert.run({ id: "01D", src: "01A", rel: "copy", out: null })).toThrow(/CHECK/);
    expect(() => insert.run({ id: "01E", src: "01A", rel: "reuse", out: 0 })).toThrow(/CHECK/);
    db.prepare("DELETE FROM generations WHERE id = '01A'").run();
    expect(db.prepare("SELECT source_id FROM generations WHERE id = '01B'").pluck().get()).toBe("01A");
    const plan = db
      .prepare("EXPLAIN QUERY PLAN SELECT id FROM generations WHERE source_id = ? ORDER BY id DESC LIMIT 50")
      .all("01A") as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" ")).toMatch(/generations_source/);
    downTo("0006");
    const cols = db.prepare("SELECT name FROM pragma_table_info('generations')").pluck().all();
    expect(cols).not.toContain("source_id");
  });

  it("0006_create_generation_curation enforces comment/tag rules, cascades with the generation and reverts", () => {
    migrateUp(db);
    db.prepare(
      `INSERT INTO generations (id, provider, model, prompt, requested_params, accepted_params, images_requested,
         cost_micros, cost_status, created_at, duration_ms, raw_request, raw_response)
       VALUES ('01G', 'openrouter', 'm', 'p', '{}', NULL, 1, NULL, 'unavailable', '2026-10-18T00:00:00.000Z', 1, '{}', '{}')`,
    ).run();
    const comment = db.prepare(
      "INSERT INTO generation_comments (generation_id, body, updated_at) VALUES ('01G', ?, 'x')",
    );
    const tag = db.prepare("INSERT INTO generation_tags (generation_id, tag, position) VALUES ('01G', ?, ?)");
    expect(() => comment.run("   ")).toThrow(/CHECK/);
    expect(() => comment.run("x".repeat(2001))).toThrow(/CHECK/);
    comment.run("Good one");
    expect(() => tag.run("x".repeat(33), 1)).toThrow(/CHECK/);
    expect(() => tag.run("Upper", 1)).toThrow(/CHECK/);
    tag.run("neon city", 1);
    expect(() => tag.run("neon city", 2)).toThrow(/UNIQUE|PRIMARY/);
    db.prepare("DELETE FROM generations WHERE id = '01G'").run();
    expect(db.prepare("SELECT count(*) FROM generation_tags").pluck().get()).toBe(0);
    expect(db.prepare("SELECT count(*) FROM generation_comments").pluck().get()).toBe(0);
    downTo("0005");
    const left = db
      .prepare("SELECT name FROM sqlite_master WHERE name IN ('generation_tags','generation_comments')")
      .pluck()
      .all();
    expect(left).toEqual([]);
  });

  it("0005_add_generation_cost_ref adds the cost reference and serves pending lookups from an index", () => {
    migrateUp(db);
    const cols = db.prepare("SELECT name FROM pragma_table_info('generations')").pluck().all();
    expect(cols).toContain("cost_ref");
    const plan = db
      .prepare("EXPLAIN QUERY PLAN SELECT id, cost_ref FROM generations WHERE cost_status = 'pending'")
      .all() as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" ")).toMatch(/generations_cost_pending/);
    downTo("0004");
    expect(db.prepare("SELECT name FROM pragma_table_info('generations')").pluck().all()).not.toContain("cost_ref");
  });

  it("applies → rolls back → re-applies the repo migrations; re-running up is a no-op", () => {
    expect(migrateUp(db).map((m) => m.version)).toEqual([
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
      "0007",
      "0008",
      "0009",
      "0010",
      "0011",
      "0012",
      "0013",
      "0014",
      "0015",
      "0016",
    ]);
    expect(appliedVersions(db)).toEqual([
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
      "0007",
      "0008",
      "0009",
      "0010",
      "0011",
      "0012",
      "0013",
      "0014",
      "0015",
      "0016",
    ]);
    expect(migrateUp(db)).toEqual([]);

    expect(migrateDown(db)?.version).toBe("0016");
    expect(migrateDown(db)?.version).toBe("0015");
    expect(migrateDown(db)?.version).toBe("0014");
    expect(migrateDown(db)?.version).toBe("0013");
    expect(migrateDown(db)?.version).toBe("0012");
    expect(migrateDown(db)?.version).toBe("0011");
    expect(migrateDown(db)?.version).toBe("0010");
    expect(migrateDown(db)?.version).toBe("0009");
    expect(migrateDown(db)?.version).toBe("0008");
    expect(migrateDown(db)?.version).toBe("0007");
    expect(migrateDown(db)?.version).toBe("0006");
    expect(migrateDown(db)?.version).toBe("0005");
    expect(migrateDown(db)?.version).toBe("0004");
    expect(migrateDown(db)?.version).toBe("0003");
    expect(migrateDown(db)?.version).toBe("0002");
    expect(migrateDown(db)?.version).toBe("0001");
    expect(appliedVersions(db)).toEqual([]);
    expect(migrateDown(db)).toBeUndefined();

    expect(migrateUp(db).map((m) => m.version)).toEqual([
      "0001",
      "0002",
      "0003",
      "0004",
      "0005",
      "0006",
      "0007",
      "0008",
      "0009",
      "0010",
      "0011",
      "0012",
      "0013",
      "0014",
      "0015",
      "0016",
    ]);
  });

  it("0004_create_generation_inputs keeps input copies consistent and reverts cleanly", () => {
    migrateUp(db);
    db.prepare(
      `INSERT INTO generations (id, provider, model, prompt, requested_params, accepted_params, images_requested,
         cost_micros, cost_status, created_at, duration_ms, raw_request, raw_response)
       VALUES ('01A', 'openrouter', 'm', 'p', '{}', NULL, 1, NULL, 'unavailable', '2026-10-18T00:00:00.000Z', 1, '{}', '{}')`,
    ).run();
    const input = db.prepare(
      `INSERT INTO generation_inputs (generation_id, position, path, media_type, width, height, byte_size, original_name)
       VALUES (?, ?, ?, ?, 1, 1, ?, ?)`,
    );
    input.run("01A", 1, "generations/01A/input-1.png", "image/png", 10_485_760, "cat.png");
    input.run("01A", 2, "generations/01A/input-2.jpg", "image/jpeg", 5, null);
    expect(() => input.run("01A", 3, "generations/01A/input-3.png", "image/png", 10_485_761, null)).toThrow(/CHECK/);
    expect(() => input.run("01A", 3, "generations/01A/input-3.heic", "image/heic", 5, null)).toThrow(/CHECK/);
    expect(() => input.run("01A", 3, "generations/01A/input-1.png", "image/png", 5, null)).toThrow(/UNIQUE/);
    expect(() => input.run("nope", 1, "generations/nope/input-1.png", "image/png", 5, null)).toThrow(/FOREIGN KEY/);
    db.prepare("DELETE FROM generations WHERE id = '01A'").run();
    expect(db.prepare("SELECT count(*) FROM generation_inputs").pluck().get()).toBe(0);

    downTo("0003");
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'generation_inputs%'").pluck().all()).toEqual([]);
  });

  it("0003 serves the image-by-path lookup from an index, not a table scan", () => {
    migrateUp(db);
    const plan = db
      .prepare("EXPLAIN QUERY PLAN SELECT media_type FROM generation_images WHERE path = ?")
      .all("generations/x/output-1.png") as { detail: string }[];
    expect(plan.map((p) => p.detail).join(" ")).toMatch(/USING (COVERING )?INDEX generation_images_path/);
  });

  it("0002_create_generations enforces the generation invariants and reverts cleanly", () => {
    migrateUp(db);
    const insert = db.prepare(
      `INSERT INTO generations (id, provider, model, prompt, requested_params, accepted_params, images_requested,
         cost_micros, cost_status, created_at, duration_ms, raw_request, raw_response)
       VALUES (@id, 'openrouter', 'm', @prompt, '{}', NULL, 1, @cost, @status, '2026-10-18T00:00:00.000Z', 10, '{}', '{}')`,
    );
    insert.run({ id: "01A", prompt: "ok", cost: 40000, status: "known" });
    insert.run({ id: "01B", prompt: "ok", cost: null, status: "unavailable" });
    expect(() => insert.run({ id: "01C", prompt: "   ", cost: null, status: "unavailable" })).toThrow(/CHECK/);
    expect(() => insert.run({ id: "01D", prompt: "ok", cost: null, status: "known" })).toThrow(/CHECK/);
    expect(() => insert.run({ id: "01E", prompt: "ok", cost: 1, status: "free" })).toThrow(/CHECK/);

    const img = db.prepare(
      `INSERT INTO generation_images (generation_id, position, path, media_type, width, height, byte_size)
       VALUES (?, 1, ?, ?, 1, 1, 1)`,
    );
    img.run("01A", "generations/01A/output-1.png", "image/png");
    expect(() => img.run("01B", "generations/01B/output-1.svg", "image/svg+xml")).toThrow(/CHECK/);
    expect(() => img.run("nope", "generations/nope/output-1.png", "image/png")).toThrow(/FOREIGN KEY/);
    db.prepare("DELETE FROM generations WHERE id = '01A'").run();
    expect(db.prepare("SELECT count(*) FROM generation_images").pluck().get()).toBe(0);

    downTo("0001");
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'generation%'")
      .pluck()
      .all();
    expect(tables).toEqual([]);
  });

  it("runs up/down SQL and reverts only the latest migration", () => {
    const migDir = join(dir, "migrations");
    const files: Record<string, string> = {
      "0001_a.up.sql": "CREATE TABLE a (id TEXT PRIMARY KEY);",
      "0001_a.down.sql": "DROP TABLE a;",
      "0002_b.up.sql": "CREATE TABLE b (id TEXT PRIMARY KEY);",
      "0002_b.down.sql": "DROP TABLE b;",
    };
    mkdirSync(migDir);
    for (const [name, sql] of Object.entries(files)) writeFileSync(join(migDir, name), sql);

    const tables = () =>
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('a','b') ORDER BY name").pluck().all();

    migrateUp(db, migDir);
    expect(tables()).toEqual(["a", "b"]);
    migrateDown(db, migDir);
    expect(tables()).toEqual(["a"]);
    expect(appliedVersions(db)).toEqual(["0001"]);
  });

  it("rejects a migration missing its down half", () => {
    const migDir = mkdtempSync(join(tmpdir(), "gen-img-lone-"));
    writeFileSync(join(migDir, "0001_lonely.up.sql"), "SELECT 1;");
    expect(() => listMigrations(migDir)).toThrow(/missing its down file/);
    rmSync(migDir, { recursive: true, force: true });
  });

  it("the app's boot path leaves the database migrated", () => {
    const t = createTestApp();
    try {
      expect(appliedVersions(t.db)).toEqual(listMigrations().map((m) => m.version));
    } finally {
      t.cleanup();
    }
  });
});
