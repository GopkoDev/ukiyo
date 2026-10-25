import { describe, expect, it } from "vitest";
import type { SpeechModel } from "./speech";
import { checkPresetName, presetAvailability, presetMatches, presetNameKey } from "./voice-presets";

const model = (over: Partial<SpeechModel> = {}): SpeechModel => ({
  id: "elevenlabs/eleven-v3",
  name: "Eleven v3",
  maker: "ElevenLabs",
  maxChars: 5000,
  maxCharsSource: "family",
  voiceMode: "required",
  voices: ["george", "kore"],
  price: { unit: "free" },
  controls: [
    { key: "speed", kind: "slider", label: "Speed", min: 0.7, max: 1.2, step: 0.01, default: 1 },
    { key: "instructions", kind: "text", label: "Instructions", default: "", maxLength: 1000 },
  ],
  ...over,
});
const preset = { model: "elevenlabs/eleven-v3", voice: "george" as string | null, settings: { speed: 1.1 } };

describe("checkPresetName (spec AC-02)", () => {
  it("trims and accepts 1–60 characters as seen", () => {
    expect(checkPresetName("  Narrator  ")).toEqual({ ok: true, name: "Narrator" });
    expect(checkPresetName("é".repeat(60)).ok).toBe(true);
    expect(checkPresetName("é".repeat(60)).ok).toBe(true); // combining accents: 60 graphemes
    expect(checkPresetName("👩‍👩‍👧".repeat(60)).ok).toBe(true); // emoji sequences: 60 graphemes
  });
  it("refuses empty and longer than 60", () => {
    expect(checkPresetName("   ")).toEqual({ ok: false, message: "Enter a name" });
    expect(checkPresetName("a".repeat(61))).toEqual({ ok: false, message: "At most 60 characters" });
  });
  it("keys names ignoring case in any alphabet", () => {
    expect(presetNameKey("Диктор")).toBe(presetNameKey("диктор"));
    expect(presetNameKey("Narrator")).toBe(presetNameKey("NARRATOR"));
    expect(presetNameKey("Narrator")).not.toBe(presetNameKey("Narrator 2"));
  });
});

describe("presetMatches (spec AC-05, AC-10)", () => {
  it("matches the same model, voice and normalized settings, whatever the key order or defaults", () => {
    expect(presetMatches(preset, { model: preset.model, voice: "george", settings: { speed: 1.1 } }, model())).toBe(
      true,
    );
    expect(
      presetMatches(
        { ...preset, settings: { speed: 1, instructions: "calm" } },
        { model: preset.model, voice: "george", settings: { instructions: "  calm  " } },
        model(),
      ),
    ).toBe(true);
  });
  it("differs on model, voice, a value, or null vs a voice", () => {
    expect(
      presetMatches(preset, { model: "x/y", voice: "george", settings: { speed: 1.1 } }, model({ id: "x/y" })),
    ).toBe(false);
    expect(presetMatches(preset, { model: preset.model, voice: "kore", settings: { speed: 1.1 } }, model())).toBe(
      false,
    );
    expect(presetMatches(preset, { model: preset.model, voice: "george", settings: { speed: 1.2 } }, model())).toBe(
      false,
    );
    expect(
      presetMatches(
        { ...preset, voice: null },
        { model: preset.model, voice: "george", settings: { speed: 1.1 } },
        model(),
      ),
    ).toBe(false);
  });
  it("counts a stored setting the model no longer accepts as a difference", () => {
    const stored = { ...preset, settings: { speed: 1.1, stability: 0.5 } };
    expect(presetMatches(stored, { model: preset.model, voice: "george", settings: stored.settings }, model())).toBe(
      false,
    );
  });
  it("treats empty instructions as none", () => {
    expect(
      presetMatches(
        preset,
        { model: preset.model, voice: "george", settings: { speed: 1.1, instructions: "  " } },
        model(),
      ),
    ).toBe(true);
  });
});

describe("presetAvailability (spec AC-09)", () => {
  it("is loading without a catalog, retired when the model or a listed voice is gone, else ok", () => {
    expect(presetAvailability(preset, undefined)).toBe("loading");
    expect(presetAvailability(preset, [model()])).toBe("ok");
    expect(presetAvailability(preset, [model({ id: "other" })])).toBe("retired");
    expect(presetAvailability(preset, [model({ voices: ["kore"] })])).toBe("retired");
    expect(presetAvailability(preset, [model({ voices: ["kore"], voiceMode: "optional" })])).toBe("retired");
    expect(presetAvailability({ ...preset, voice: null }, [model({ voices: [], voiceMode: "optional" })])).toBe("ok");
    expect(presetAvailability(preset, [model({ voices: [], voiceMode: "optional" })])).toBe("ok"); // typed voice name
  });
});
