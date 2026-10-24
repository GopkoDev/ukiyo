import { afterEach, describe, expect, it } from "vitest";
import { seedRecording } from "../../../../tests/helpers/recordings";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { createRecordingsRepo, type RecordingRecord } from "./repo";

let t: ReturnType<typeof createTestApp>;
afterEach(() => t.cleanup());

const record = (over: Partial<RecordingRecord> = {}): RecordingRecord => ({
  id: "01N0000000000000000000000A",
  provider: "openrouter",
  model: "elevenlabs/eleven-v3",
  modelName: "Eleven v3",
  voice: "george",
  text: "Hello",
  settings: { stability: 0.5, similarity: 0.75 },
  filePath: "audio/01N0000000000000000000000A.mp3",
  mediaType: "audio/mpeg",
  characters: 5,
  costMicros: null,
  costStatus: "pending",
  costRef: "gen-tts-1",
  estimateMicros: 400,
  createdAt: "2026-10-25T10:00:00.000Z",
  durationMs: 1200,
  ...over,
});

describe("recordings repo", () => {
  it("inserts a recording and its file in one transaction, and reads it back parsed", () => {
    t = createTestApp();
    const repo = createRecordingsRepo(t.db);
    let committed = false;
    repo.insertAtomic(record(), () => {
      committed = true;
    });
    expect(committed).toBe(true);
    expect(repo.get("01N0000000000000000000000A")).toEqual(record());
  });

  it("leaves no row when the file step throws", () => {
    t = createTestApp();
    const repo = createRecordingsRepo(t.db);
    expect(() =>
      repo.insertAtomic(record(), () => {
        throw new Error("disk full");
      }),
    ).toThrow("disk full");
    expect(repo.get("01N0000000000000000000000A")).toBeUndefined();
  });

  it("lists newest first, a page at a time", () => {
    t = createTestApp();
    const repo = createRecordingsRepo(t.db);
    const ids = Array.from({ length: 5 }, () => seedRecording(t.db, t.dataDir).id);
    const first = repo.list({ limit: 2 });
    expect(first.items.map((r) => r.id)).toEqual([ids[4], ids[3]]);
    expect(first.nextCursor).toBe(ids[3]);
    const last = repo.list({ cursor: ids[1], limit: 2 });
    expect(last.items.map((r) => r.id)).toEqual([ids[0]]);
    expect(last.nextCursor).toBeNull();
    expect(repo.allIds().sort()).toEqual([...ids].sort());
  });

  it("deletes a recording with its file step inside the transaction; a failed step keeps it", () => {
    t = createTestApp();
    const repo = createRecordingsRepo(t.db);
    const a = seedRecording(t.db, t.dataDir);
    expect(() =>
      repo.deleteAtomic(a.id, () => {
        throw new Error("rename failed");
      }),
    ).toThrow("rename failed");
    expect(repo.get(a.id)).toBeDefined();
    const moved: string[] = [];
    expect(repo.deleteAtomic(a.id, (path) => moved.push(path))?.id).toBe(a.id);
    expect(moved).toEqual([a.filePath]);
    expect(repo.get(a.id)).toBeUndefined();
    expect(repo.deleteAtomic(a.id, () => {})).toBeUndefined();
  });

  it("lists pending costs with their answer time, and resolves only a pending one", () => {
    t = createTestApp();
    const repo = createRecordingsRepo(t.db);
    repo.insertAtomic(record(), () => {});
    seedRecording(t.db, t.dataDir); // known
    expect(repo.listPendingCosts()).toEqual([
      {
        id: "01N0000000000000000000000A",
        provider: "openrouter",
        costRef: "gen-tts-1",
        answeredAt: Date.parse("2026-10-25T10:00:00.000Z") + 1200,
      },
    ]);
    expect(repo.resolveCost("01N0000000000000000000000A", 160)).toBe(true);
    expect(repo.get("01N0000000000000000000000A")).toMatchObject({ costStatus: "known", costMicros: 160 });
    expect(repo.resolveCost("01N0000000000000000000000A", null)).toBe(false); // no longer pending
    expect(repo.listPendingCosts()).toEqual([]);
  });

  it("reads a prototype row: no model name, no duration, provider-default voice allowed", () => {
    t = createTestApp();
    const repo = createRecordingsRepo(t.db);
    repo.insertAtomic(
      record({ modelName: null, durationMs: null, voice: null, costStatus: "unavailable", costRef: null }),
      () => {},
    );
    expect(repo.get("01N0000000000000000000000A")).toMatchObject({ modelName: null, durationMs: null, voice: null });
  });
});
