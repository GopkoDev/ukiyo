import { describe, expect, it } from "vitest";
import {
  controlsFor,
  displayName,
  formatFor,
  makerOf,
  maxCharsFor,
  outputLabelFor,
  priceFrom,
  sortByMaker,
  specFor,
  voiceModeFor,
  wireOf,
} from "./speech-models";

const keys = (id: string) => controlsFor(id).map((c) => c.key);

describe("speech model family spec", () => {
  it("gives ElevenLabs models their own controls, ranges and limits", () => {
    expect(keys("elevenlabs/eleven-v4")).toEqual(["stability", "similarity"]);
    expect(keys("elevenlabs/eleven-multilingual-v2")).toEqual([
      "speed",
      "stability",
      "similarity",
      "style",
      "speakerBoost",
    ]);
    expect(keys("elevenlabs/eleven-flash-v2.5")).toEqual(["speed", "stability", "similarity", "speakerBoost"]);
    expect(keys("elevenlabs/eleven-turbo-v2")).toEqual(["stability", "similarity", "speakerBoost"]);
    const v3stability = controlsFor("elevenlabs/eleven-v3").find((c) => c.key === "stability");
    expect(v3stability).toMatchObject({
      kind: "steps",
      steps: [0, 0.5, 1],
      stepLabels: ["Creative", "Natural", "Robust"],
    });
    const speed = controlsFor("elevenlabs/eleven-flash-v2").find((c) => c.key === "speed");
    expect(speed).toMatchObject({ kind: "slider", min: 0.7, max: 1.2, default: 1 });
    expect(maxCharsFor("elevenlabs/eleven-v3", 0)).toEqual({ maxChars: 5000, source: "family" });
    expect(maxCharsFor("elevenlabs/eleven-flash-v2.5", 0)).toEqual({ maxChars: 40_000, source: "family" });
    expect(wireOf("elevenlabs/eleven-v3")).toBe("elevenlabs");
  });

  it("lets a new id in a known family inherit that family's controls", () => {
    expect(keys("elevenlabs/eleven-v5")).toEqual(["stability", "similarity"]);
    expect(makerOf("elevenlabs/eleven-v5")).toBe("ElevenLabs");
  });

  it("offers delivery instructions where the provider honours them, and speed only where it is honoured", () => {
    expect(keys("google/gemini-3.8-flash-tts")).toEqual(["instructions"]);
    expect(keys("fish-audio/s2-pro")).toEqual(["instructions"]);
    expect(keys("openai/gpt-4o-mini-tts")).toEqual(["speed", "instructions"]);
    expect(keys("openai/tts-1")).toEqual(["speed"]);
    expect(controlsFor("bytedance-seed/seed-audio-1-0")).toEqual([
      expect.objectContaining({ key: "speed", min: 0.5, max: 2, default: 1 }),
    ]);
    const instructions = controlsFor("google/gemini-3.8-flash-tts")[0];
    expect(instructions).toMatchObject({ kind: "text", maxLength: 1000, default: "" });
    expect(keys("deepgram/aura-2")).toEqual([]);
  });

  it("asks for pcm only where the family answers pcm only", () => {
    expect(formatFor("heygen/heygen-voice-1")).toBe("pcm");
    expect(formatFor("google/gemini-3.1-flash-tts-preview")).toBe("pcm");
    expect(formatFor("minimax/speech-2.8-hd")).toBe("mp3");
    expect(formatFor("elevenlabs/eleven-v4")).toBe("mp3");
    expect(formatFor("someone/new-model")).toBe("mp3");
  });

  it("degrades an unknown model to voice and text only, with the catalog limit or a labelled default", () => {
    expect(controlsFor("someone/new-model")).toEqual([]);
    expect(specFor("someone/new-model").controls).toEqual([]);
    expect(maxCharsFor("someone/new-model", 4096)).toEqual({ maxChars: 4096, source: "catalog" });
    expect(maxCharsFor("someone/new-model", 0)).toEqual({ maxChars: 5000, source: "default" });
    expect(maxCharsFor("someone/new-model", undefined)).toEqual({ maxChars: 5000, source: "default" });
    expect(maxCharsFor("bytedance-seed/seed-audio-1-0", 0)).toEqual({ maxChars: 3000, source: "family" });
    expect(makerOf("someone/new-model")).toBe("Someone");
  });

  it("makes the voice optional when the model lists none", () => {
    expect(voiceModeFor("fish-audio/s1", [])).toBe("optional");
    expect(voiceModeFor("elevenlabs/eleven-v4", ["george"])).toBe("required");
    expect(voiceModeFor("someone/new-model", [])).toBe("optional");
  });

  it("reads the pricing unit from the catalog", () => {
    expect(priceFrom({ prompt: "0.00008", completion: "0" }, "elevenlabs/eleven-v4")).toEqual({
      unit: "per-character",
      usdPerChar: 0.00008,
    });
    expect(priceFrom({ prompt: "0", completion: "0" }, "fish-audio/s2.1-pro-free:free")).toEqual({ unit: "free" });
    expect(priceFrom({ prompt: "0", completion: "0.0025" }, "bytedance-seed/seed-audio-1-0")).toEqual({
      unit: "per-output",
      outputLabel: "per second of audio",
    });
    expect(priceFrom({ prompt: "0.0000005", completion: "0.000009" }, "google/gemini-3.8-flash-tts")).toEqual({
      unit: "per-output",
      outputLabel: "per token",
    });
    expect(priceFrom(undefined, "someone/x")).toEqual({ unit: "unknown" });
    expect(priceFrom({ prompt: "abc" }, "someone/x")).toEqual({ unit: "unknown" });
    expect(outputLabelFor("someone/x")).toBe("per token");
  });

  it("strips the maker prefix from catalog names and sorts ElevenLabs first, then makers alphabetically", () => {
    expect(displayName("ElevenLabs: Eleven v4", "elevenlabs/eleven-v4")).toBe("Eleven v4");
    expect(displayName(undefined, "elevenlabs/eleven-v4")).toBe("elevenlabs/eleven-v4");
    const sorted = sortByMaker([
      { id: "x-ai/grok-voice-tts-1.0", maker: "xAI" },
      { id: "deepgram/aura-2", maker: "Deepgram" },
      { id: "elevenlabs/eleven-v3", maker: "ElevenLabs" },
      { id: "elevenlabs/eleven-v4", maker: "ElevenLabs" },
    ]);
    expect(sorted.map((m) => m.id)).toEqual([
      "elevenlabs/eleven-v3",
      "elevenlabs/eleven-v4",
      "deepgram/aura-2",
      "x-ai/grok-voice-tts-1.0",
    ]);
  });
});
