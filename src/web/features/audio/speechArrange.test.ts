import { describe, expect, it } from "vitest";
import type { SpeechModel } from "../../../shared/speech";
import { arrangeSpeechModels, autoPickSpeech } from "./speechArrange";

const model = (id: string, maker: string): SpeechModel => ({
  id,
  name: id,
  maker,
  maxChars: 1000,
  maxCharsSource: "family",
  voiceMode: "optional",
  voices: [],
  price: { unit: "unknown" },
  controls: [],
});
const MODELS = [
  model("el/a", "ElevenLabs"),
  model("el/b", "ElevenLabs"),
  model("oa/c", "OpenAI"),
  model("oa/d", "OpenAI"),
];
const pref = (m: string, favorite: boolean, hidden: boolean) => ({
  provider: "openrouter" as const,
  model: m,
  favorite,
  hidden,
  updatedAt: "x",
});
const ids = (a: ReturnType<typeof arrangeSpeechModels>) => ({
  favorites: a.favorites.map((m) => m.id),
  makers: a.makers.map((g) => [g.maker, g.models.map((x) => (x.hidden ? `${x.model.id}*` : x.model.id))]),
});

describe("arrangeSpeechModels (models-page-audio AC-03, AC-04)", () => {
  it("without preferences is the step-18 list", () => {
    for (const prefs of [[], null, undefined])
      expect(ids(arrangeSpeechModels(MODELS, prefs, ""))).toEqual({
        favorites: [],
        makers: [
          ["ElevenLabs", ["el/a", "el/b"]],
          ["OpenAI", ["oa/c", "oa/d"]],
        ],
      });
  });

  it("puts favorites first in the Speech order and leaves hidden ones out, favorites included", () => {
    const prefs = [
      pref("oa/d", true, false),
      pref("el/b", true, false),
      pref("oa/c", true, true),
      pref("el/a", false, true),
    ];
    expect(ids(arrangeSpeechModels(MODELS, prefs, ""))).toEqual({ favorites: ["el/b", "oa/d"], makers: [] });
  });

  it("keeps a selected hidden model at the top of its maker's group, never in Favorites", () => {
    const prefs = [pref("el/b", true, true)];
    expect(ids(arrangeSpeechModels(MODELS, prefs, "el/b"))).toEqual({
      favorites: [],
      makers: [
        ["ElevenLabs", ["el/b*", "el/a"]],
        ["OpenAI", ["oa/c", "oa/d"]],
      ],
    });
  });

  it("picks the first favorite, else the first visible model, never a hidden one", () => {
    expect(autoPickSpeech(MODELS, [pref("oa/d", true, false)])?.id).toBe("oa/d");
    expect(autoPickSpeech(MODELS, [pref("el/a", false, true)])?.id).toBe("el/b");
    expect(autoPickSpeech(MODELS, null)?.id).toBe("el/a");
  });
});
