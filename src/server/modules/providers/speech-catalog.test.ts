import { describe, expect, it } from "vitest";
import type { SpeechModel } from "../../../shared/speech";
import { ProviderError } from "./port";
import { createSpeechCatalog } from "./speech-catalog";
import type { SpeechProvider } from "./speech-port";

const model = (id: string): SpeechModel => ({
  id,
  name: id,
  maker: "X",
  maxChars: 100,
  maxCharsSource: "family",
  voiceMode: "required",
  voices: ["v"],
  price: { unit: "unknown" },
  controls: [],
});

function provider(list: () => Promise<SpeechModel[]>) {
  let calls = 0;
  const p = {
    id: "openrouter",
    name: "OpenRouter",
    configured: true,
    listModels: () => {
      calls++;
      return list();
    },
  } as unknown as SpeechProvider;
  return { p, calls: () => calls };
}

describe("speech catalog", () => {
  it("caches a provider's models for 10 minutes and dedupes concurrent loads", async () => {
    let t = 0;
    const { p, calls } = provider(async () => [model("a")]);
    const catalog = createSpeechCatalog({ get: () => p, list: () => [p] }, () => t);
    await Promise.all([catalog.models("openrouter"), catalog.models("openrouter")]);
    t = 9 * 60_000;
    await catalog.models("openrouter");
    expect(calls()).toBe(1);
    t = 10 * 60_000 + 1;
    await catalog.models("openrouter");
    expect(calls()).toBe(2);
  });

  it("never caches a failure, finds a model, and reports an unknown provider", async () => {
    let fail = true;
    const { p, calls } = provider(async () => {
      if (fail) throw new ProviderError("openrouter", 503, "down");
      return [model("a")];
    });
    const catalog = createSpeechCatalog({ get: (id) => (id === "openrouter" ? p : undefined), list: () => [p] });
    await expect(catalog.models("openrouter")).rejects.toThrow("down");
    fail = false;
    expect(await catalog.find("openrouter", "a")).toMatchObject({ id: "a" });
    expect(await catalog.find("openrouter", "zzz")).toBeUndefined();
    expect(calls()).toBe(2);
    await expect(catalog.models("nope")).rejects.toBeInstanceOf(ProviderError);
  });
});
