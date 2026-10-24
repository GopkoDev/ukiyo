import { describe, expect, it } from "vitest";
import { costFromResult, toRecordingDto } from "./domain";
import type { RecordingRecord } from "./repo";

describe("audio domain", () => {
  it("records a stated price as known, a reference as pending, neither as unavailable — never $0 for unknown", () => {
    expect(costFromResult(0.00016, "gen-1")).toEqual({ costMicros: 160, costStatus: "known", costRef: "gen-1" });
    expect(costFromResult(null, "gen-1")).toEqual({ costMicros: null, costStatus: "pending", costRef: "gen-1" });
    expect(costFromResult(null, null)).toEqual({ costMicros: null, costStatus: "unavailable", costRef: null });
  });

  it("names the model by its stored name, else the catalog's, else its id; points at the file route", () => {
    const rec = {
      id: "01N0000000000000000000000A",
      provider: "openrouter",
      model: "elevenlabs/eleven-v4",
      modelName: null,
      voice: "george",
      text: "Hi",
      settings: {},
      filePath: "audio/01N0000000000000000000000A.mp3",
      mediaType: "audio/mpeg",
      characters: 2,
      costMicros: 160,
      costStatus: "known",
      costRef: "gen-1",
      estimateMicros: null,
      createdAt: "2026-10-21T15:40:00.000Z",
      durationMs: null,
    } satisfies RecordingRecord;
    expect(toRecordingDto(rec, "Eleven v4")).toMatchObject({
      modelName: "Eleven v4",
      url: "/api/audio/recordings/01N0000000000000000000000A/file",
    });
    expect(toRecordingDto(rec, undefined).modelName).toBe("elevenlabs/eleven-v4");
    expect(toRecordingDto({ ...rec, modelName: "Stored" }, "Catalog").modelName).toBe("Stored");
    expect(toRecordingDto(rec, undefined)).not.toHaveProperty("filePath");
    expect(toRecordingDto(rec, undefined)).not.toHaveProperty("costRef");
  });
});
