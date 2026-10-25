import { describe, expect, it } from "vitest";
import {
  billedChars,
  defaultSettings,
  estimateMicros,
  Recording,
  StartSpeechRequest,
  settingsFor,
  VoiceSettings,
} from "./speech";
import { controlsFor } from "./speech-models";

describe("billed characters", () => {
  it("counts the code points of the trimmed text, delivery tags included", () => {
    expect(billedChars("  hi  ")).toBe(2);
    expect(billedChars("[whispering] hi")).toBe(15);
    expect(billedChars("é")).toBe(1);
    expect(billedChars("é")).toBe(2); // e + combining accent: two code points
    expect(billedChars("👨‍👩‍👧")).toBe(5); // an emoji sequence counts per code point
    expect(billedChars("   ")).toBe(0);
  });
});

describe("settings for a model", () => {
  it("keeps only the model's accepted settings and fills its defaults", () => {
    const controls = controlsFor("elevenlabs/eleven-v4");
    expect(settingsFor(controls, { speed: 1.1, stability: 0.3, instructions: "slow" })).toEqual({
      stability: 0.3,
      similarity: 0.75,
    });
    expect(defaultSettings(controls)).toEqual({ stability: 0.5, similarity: 0.75 });
  });

  it("brings a shared value into the new model's range and snaps stepped controls", () => {
    expect(settingsFor(controlsFor("elevenlabs/eleven-flash-v2"), { speed: 1.6 }).speed).toBe(1.2);
    expect(settingsFor(controlsFor("elevenlabs/eleven-v3"), { stability: 0.4 }).stability).toBe(0.5);
  });

  it("trims delivery instructions, drops empty ones and caps their length", () => {
    const controls = controlsFor("google/gemini-3.8-flash-tts");
    expect(settingsFor(controls, { instructions: "  calm  " })).toEqual({ instructions: "calm" });
    expect(settingsFor(controls, { instructions: "   " })).toEqual({});
    expect(settingsFor(controls, { instructions: "a".repeat(1200) }).instructions).toHaveLength(1000);
  });

  it("sends nothing for an unknown model", () => {
    expect(settingsFor(controlsFor("someone/new"), { speed: 1, stability: 0.2 })).toEqual({});
  });
});

describe("estimate", () => {
  it("is billed characters × the per-character price, zero for free, none otherwise", () => {
    expect(estimateMicros(500, { unit: "per-character", usdPerChar: 0.00008 })).toBe(40_000);
    expect(estimateMicros(3, { unit: "per-character", usdPerChar: 0.00000062 })).toBe(2);
    expect(estimateMicros(500, { unit: "free" })).toBe(0);
    expect(estimateMicros(500, { unit: "per-output", outputLabel: "per second of audio" })).toBeNull();
    expect(estimateMicros(500, { unit: "unknown" })).toBeNull();
  });
});

describe("contract schemas", () => {
  it("parses a start request: text trimmed, voice optional, settings default to none", () => {
    expect(StartSpeechRequest.parse({ text: "  hi ", model: "fish-audio/s1" })).toEqual({
      text: "hi",
      model: "fish-audio/s1",
      voice: null,
      settings: {},
    });
    expect(StartSpeechRequest.safeParse({ text: "   ", model: "m" }).success).toBe(false);
    expect(StartSpeechRequest.safeParse({ text: "hi", model: "m", voice: "" }).success).toBe(false);
  });

  it("rejects settings a request may not carry", () => {
    expect(VoiceSettings.safeParse({ stability: 2 }).success).toBe(false);
    expect(VoiceSettings.safeParse({ bogus: 1 }).success).toBe(false);
    expect(VoiceSettings.safeParse({ instructions: "x".repeat(1001) }).success).toBe(false);
  });

  it("describes a recording with its cost status and estimate", () => {
    const r = {
      id: "01N0000000000000000000000A",
      createdAt: "2026-10-25T10:00:00.000Z",
      provider: "openrouter",
      model: "fish-audio/s1",
      modelName: "S1",
      voice: null,
      text: "Hello",
      settings: {},
      mediaType: "audio/wav",
      characters: 5,
      costMicros: null,
      costStatus: "pending",
      estimateMicros: 75,
      durationMs: 900,
      url: "/api/audio/recordings/01N0000000000000000000000A/file",
      tags: ["intro"],
      comment: { body: "keep", updatedAt: "2026-10-25T10:00:00.000Z" },
    };
    expect(Recording.parse(r)).toEqual(r);
    expect(Recording.safeParse({ ...r, mediaType: "audio/ogg" }).success).toBe(false);
  });
});
