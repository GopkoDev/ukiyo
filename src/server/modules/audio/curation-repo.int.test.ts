import { afterEach, describe, expect, it } from "vitest";
import { seedRecording } from "../../../../tests/helpers/recordings";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { createRecordingsRepo } from "./repo";

let t: ReturnType<typeof createTestApp>;
afterEach(() => t.cleanup());

const id = (n: number) => `01R${String(n).padStart(23, "0")}`;

describe("recordings repo — model views (audio-gallery)", () => {
  it("pages one model's recordings newest first by exact model id, without duplicates or skips", () => {
    t = createTestApp();
    for (let i = 1; i <= 7; i++)
      seedRecording(t.db, t.dataDir, { id: id(i), model: i % 2 ? "elevenlabs/eleven-v3" : "openai/gpt-4o-mini-tts" });
    const repo = createRecordingsRepo(t.db);
    const first = repo.list({ limit: 2, model: "elevenlabs/eleven-v3" });
    expect(first.items.map((r) => r.id)).toEqual([id(7), id(5)]);
    const second = repo.list({ limit: 2, model: "elevenlabs/eleven-v3", cursor: first.nextCursor ?? undefined });
    expect(second.items.map((r) => r.id)).toEqual([id(3), id(1)]);
    expect(second.nextCursor).toBeNull();
    expect(repo.list({ limit: 5, model: "elevenlabs/eleven" }).items).toEqual([]);
  });

  it("groups recordings by model id, ordered by each model's newest recording, with exact counts and the latest N", () => {
    t = createTestApp();
    seedRecording(t.db, t.dataDir, { id: id(1), model: "a/one" });
    seedRecording(t.db, t.dataDir, { id: id(2), model: "b/two" });
    seedRecording(t.db, t.dataDir, { id: id(3), model: "a/one" });
    seedRecording(t.db, t.dataDir, { id: id(4), model: "c/three" });
    const groups = createRecordingsRepo(t.db).modelGroups({ latest: 1 });
    expect(groups.map((g) => [g.model, g.count, g.latestId, g.items.map((r) => r.id)])).toEqual([
      ["c/three", 1, id(4), [id(4)]],
      ["a/one", 2, id(3), [id(3)]],
      ["b/two", 1, id(2), [id(2)]],
    ]);
    expect(groups[0]?.provider).toBe("openrouter");
    expect(createRecordingsRepo(t.db).modelGroups({ latest: 0 })[1]?.items).toEqual([]);
  });

  it("gives each model the name stored with its newest recording that has one", () => {
    t = createTestApp();
    seedRecording(t.db, t.dataDir, { id: id(1), model: "a/one", modelName: "Old name" });
    seedRecording(t.db, t.dataDir, { id: id(2), model: "a/one", modelName: "New name" });
    seedRecording(t.db, t.dataDir, { id: id(3), model: "a/one", modelName: null });
    seedRecording(t.db, t.dataDir, { id: id(4), model: "proto/only", modelName: null });
    const names = createRecordingsRepo(t.db).storedNames(["a/one", "proto/only", "none"]);
    expect([...names]).toEqual([["a/one", "New name"]]);
  });
});

describe("recordings repo — tags and comment (audio-gallery)", () => {
  it("adds tags in insertion order, ignores a duplicate, refuses an eleventh, removes one", () => {
    t = createTestApp();
    seedRecording(t.db, t.dataDir, { id: id(1) });
    const repo = createRecordingsRepo(t.db);
    expect(repo.addTag(id(1), "intro")).toEqual({ status: "added", tags: ["intro"] });
    expect(repo.addTag(id(1), "take two")).toEqual({ status: "added", tags: ["intro", "take two"] });
    expect(repo.addTag(id(1), "intro")).toEqual({ status: "duplicate", tags: ["intro", "take two"] });
    for (let i = 3; i <= 10; i++) repo.addTag(id(1), `t${i}`);
    expect(repo.addTag(id(1), "eleven").status).toBe("limit");
    expect(repo.removeTag(id(1), "intro")).toEqual({
      status: "ok",
      tags: ["take two", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"],
    });
    expect(repo.addTag(id(9), "x")).toEqual({ status: "missing" });
    expect(repo.removeTag(id(9), "x")).toEqual({ status: "missing" });
  });

  it("stores, replaces and removes the one comment; an unknown recording is missing", () => {
    t = createTestApp();
    seedRecording(t.db, t.dataDir, { id: id(1) });
    const repo = createRecordingsRepo(t.db);
    expect(repo.setComment(id(1), "first", "2026-10-25T10:00:00.000Z")).toEqual({
      status: "ok",
      comment: { body: "first", updatedAt: "2026-10-25T10:00:00.000Z" },
    });
    repo.setComment(id(1), "  second\n", "2026-10-25T11:00:00.000Z");
    expect(repo.curationOf([id(1)]).get(id(1))?.comment).toEqual({
      body: "  second\n",
      updatedAt: "2026-10-25T11:00:00.000Z",
    });
    expect(repo.setComment(id(1), null, "2026-10-25T12:00:00.000Z")).toEqual({ status: "ok", comment: null });
    expect(repo.setComment(id(9), "x", "2026-10-25T12:00:00.000Z")).toEqual({ status: "missing" });
  });

  it("reads tags and comments for a page in one go, and they go with the recording on delete", () => {
    t = createTestApp();
    seedRecording(t.db, t.dataDir, { id: id(1), tags: ["a", "b"], comment: "note" });
    seedRecording(t.db, t.dataDir, { id: id(2) });
    const repo = createRecordingsRepo(t.db);
    const cur = repo.curationOf([id(1), id(2)]);
    expect(cur.get(id(1))).toEqual({ tags: ["a", "b"], comment: { body: "note", updatedAt: expect.any(String) } });
    expect(cur.get(id(2))).toEqual({ tags: [], comment: null });
    repo.deleteAtomic(id(1), () => {});
    expect(repo.curationOf([id(1)]).get(id(1))).toEqual({ tags: [], comment: null });
    expect(t.db.prepare("SELECT count(*) FROM audio_generation_tags").pluck().get()).toBe(0);
  });
});
