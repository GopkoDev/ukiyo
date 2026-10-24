import { describe, expect, it } from "vitest";
import { fixture } from "../../../../tests/helpers/fake-fetch";
import type { SpeechModel } from "../../../shared/speech";
import { createOpenRouterSpeech } from "./openrouter-speech";
import { ProviderError } from "./port";

type Reply = Response | "hang" | "network-error";

/** OpenRouter stand-in answering real `Response`s (speech answers are raw bytes with headers); records each call. */
function router(route: (url: string, init: RequestInit) => Reply) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> | null }[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init, body: typeof init.body === "string" ? JSON.parse(init.body) : null });
    const reply = route(url, init);
    if (reply === "network-error") throw new TypeError("fetch failed");
    if (reply === "hang")
      return new Promise<Response>((_, reject) => {
        const abort = () => reject(init.signal?.reason ?? new DOMException("Aborted", "AbortError"));
        if (init.signal?.aborted) return abort();
        init.signal?.addEventListener("abort", abort);
      });
    return reply;
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3]);
const audio = (type = "audio/mpeg", id: string | null = "gen-tts-1") =>
  new Response(MP3, { headers: { "content-type": type, ...(id ? { "x-generation-id": id } : {}) } });
const catalog = () => Response.json(fixture("openrouter/speech/models.json"));

const signal = () => new AbortController().signal;

async function modelsOf(fetchImpl = router(catalog)) {
  return createOpenRouterSpeech({ apiKey: "sk-test", fetch: fetchImpl }).listModels();
}
const byId = (models: SpeechModel[], id: string) => {
  const m = models.find((x) => x.id === id);
  if (!m) throw new Error(`missing ${id}`);
  return m;
};

describe("OpenRouter speech adapter — catalog", () => {
  it("offers every catalog speech model, ElevenLabs first, then makers alphabetically", async () => {
    const models = await modelsOf();
    expect(models).toHaveLength(36);
    expect(models[0]?.maker).toBe("ElevenLabs");
    const makers = [...new Set(models.map((m) => m.maker))];
    expect(makers[0]).toBe("ElevenLabs");
    expect(makers.slice(1)).toEqual([...makers.slice(1)].sort((a, b) => a.localeCompare(b)));
  });

  it("shapes each model from the catalog and the family spec", async () => {
    const models = await modelsOf();
    expect(byId(models, "elevenlabs/eleven-v3")).toMatchObject({
      name: "Eleven v3",
      maker: "ElevenLabs",
      maxChars: 5000,
      maxCharsSource: "family",
      voiceMode: "required",
      price: { unit: "per-character", usdPerChar: 0.00008 },
    });
    expect(byId(models, "elevenlabs/eleven-v3").voices).toContain("george");
    expect(byId(models, "fish-audio/s1")).toMatchObject({ voiceMode: "optional", voices: [] });
    expect(byId(models, "mistralai/voxtral-mini-tts-2603")).toMatchObject({
      maxChars: 4096,
      maxCharsSource: "catalog",
    });
    expect(byId(models, "deepgram/aura-2")).toMatchObject({ controls: [], maxChars: 5000, maxCharsSource: "default" });
    expect(byId(models, "bytedance-seed/seed-audio-1-0").price).toEqual({
      unit: "per-output",
      outputLabel: "per second of audio",
    });
    expect(byId(models, "fish-audio/s2.1-pro-free:free").price).toEqual({ unit: "free" });
    expect(byId(models, "microsoft/mai-voice-2").voices).toContain("en-US-Harper:MAI-Voice-2");
  });

  it("reads the public catalog without the key", async () => {
    const f = router(catalog);
    await createOpenRouterSpeech({ apiKey: undefined, fetch: f }).listModels();
    expect(f.calls[0]?.url).toBe("https://openrouter.ai/api/v1/models?output_modalities=speech");
    expect(new Headers(f.calls[0]?.init.headers).get("authorization")).toBeNull();
  });

  it("fails as a provider error when the catalog can't be read", async () => {
    await expect(modelsOf(router(() => new Response("oops", { status: 503 })))).rejects.toBeInstanceOf(ProviderError);
    await expect(modelsOf(router(() => Response.json({ nope: 1 })))).rejects.toThrow(/unexpected/i);
  });
});

describe("OpenRouter speech adapter — speak", () => {
  async function speakWith(id: string, voice: string | null, settings: Record<string, unknown>, reply = () => audio()) {
    const models = await modelsOf();
    const f = router((url) => (url.endsWith("/audio/speech") ? reply() : catalog()));
    const result = await createOpenRouterSpeech({ apiKey: "sk-test", fetch: f }).speak(
      { model: byId(models, id), text: "Hello there", voice, settings },
      signal(),
    );
    const call = f.calls.find((c) => c.url.endsWith("/audio/speech"));
    return { result, body: call?.body ?? {}, init: call?.init };
  }

  it("sends ElevenLabs voice settings in its provider options and speed at the top level", async () => {
    const { body, init, result } = await speakWith("elevenlabs/eleven-multilingual-v2", "george", {
      speed: 1.1,
      stability: 0.4,
      similarity: 0.8,
      style: 0.1,
      speakerBoost: true,
    });
    expect(body).toEqual({
      model: "elevenlabs/eleven-multilingual-v2",
      input: "Hello there",
      voice: "george",
      response_format: "mp3",
      speed: 1.1,
      provider: {
        options: {
          elevenlabs: {
            voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.1, use_speaker_boost: true },
          },
        },
      },
    });
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer sk-test");
    expect(result).toEqual({ bytes: MP3, mediaType: "audio/mpeg", costUsd: null, costRef: "gen-tts-1" });
  });

  it("sends delivery instructions at the top level and asks pcm-only families for pcm", async () => {
    const { body, result } = await speakWith(
      "google/gemini-3.8-flash-tts",
      "Kore",
      { instructions: "warm and slow" },
      () => audio("audio/pcm;rate=24000;channels=1"),
    );
    expect(body).toEqual({
      model: "google/gemini-3.8-flash-tts",
      input: "Hello there",
      voice: "Kore",
      response_format: "pcm",
      instructions: "warm and slow",
    });
    expect(result.mediaType).toBe("audio/pcm;rate=24000;channels=1");
  });

  it("omits the voice for the provider default and sends nothing extra for an unknown model", async () => {
    const fish = await speakWith("fish-audio/s1", null, {});
    expect(fish.body).toEqual({ model: "fish-audio/s1", input: "Hello there", response_format: "mp3" });
    const deepgram = await speakWith("deepgram/aura-2", "aura-2-thalia-en", { speed: 1.2, stability: 0.3 });
    expect(deepgram.body).toEqual({
      model: "deepgram/aura-2",
      input: "Hello there",
      voice: "aura-2-thalia-en",
      response_format: "mp3",
    });
  });

  it("returns no reference when the answer carries no generation id", async () => {
    const { result } = await speakWith("elevenlabs/eleven-v4", "george", {}, () => audio("audio/mpeg", null));
    expect(result.costRef).toBeNull();
  });

  it("maps refusals, empty answers, timeouts and unreachable to provider errors", async () => {
    const refused = speakWith("elevenlabs/eleven-v4", "george", {}, () =>
      Response.json(fixture("openrouter/speech/error-402.json"), { status: 402 }),
    );
    await expect(refused).rejects.toMatchObject({
      upstreamStatus: 402,
      message: expect.stringMatching(/Insufficient/),
    });
    const empty = speakWith("elevenlabs/eleven-v4", "george", {}, () => new Response(new Uint8Array(0)));
    await expect(empty).rejects.toThrow(/no audio/i);
    const models = await modelsOf();
    const hang = createOpenRouterSpeech({ apiKey: "sk-test", fetch: router(() => "hang") });
    const ac = new AbortController();
    const pending = hang.speak(
      { model: byId(models, "elevenlabs/eleven-v4"), text: "x", voice: "george", settings: {} },
      ac.signal,
    );
    ac.abort(new DOMException("timeout", "TimeoutError"));
    await expect(pending).rejects.toThrow(/did not answer in time/);
    const down = createOpenRouterSpeech({ apiKey: "sk-test", fetch: router(() => "network-error") });
    await expect(
      down.speak({ model: byId(models, "elevenlabs/eleven-v4"), text: "x", voice: "george", settings: {} }, signal()),
    ).rejects.toThrow(/reach OpenRouter/);
  });

  it("refuses to speak or read credits without a key", async () => {
    const models = await modelsOf();
    const adapter = createOpenRouterSpeech({ apiKey: undefined, fetch: router(() => audio()) });
    expect(adapter.configured).toBe(false);
    await expect(
      adapter.speak(
        { model: byId(models, "elevenlabs/eleven-v4"), text: "x", voice: "george", settings: {} },
        signal(),
      ),
    ).rejects.toBeInstanceOf(ProviderError);
  });
});

describe("OpenRouter speech adapter — credits and cost lookup", () => {
  it("reads the remaining balance, or null when the key may not read it", async () => {
    const ok = createOpenRouterSpeech({
      apiKey: "sk",
      fetch: router(() => Response.json(fixture("openrouter/speech/credits.json"))),
    });
    expect(await ok.credits()).toEqual({ remainingUsd: 12.5 });
    const denied = createOpenRouterSpeech({ apiKey: "sk", fetch: router(() => Response.json({}, { status: 403 })) });
    expect(await denied.credits()).toBeNull();
  });

  it("looks up a speech request's actual cost by its generation id", async () => {
    const f = router(() => Response.json(fixture("openrouter/speech/generation-found.json")));
    const adapter = createOpenRouterSpeech({ apiKey: "sk", fetch: f });
    expect(await adapter.lookupCost("gen-tts-1792596888-MMkupXyNUqJTvlKLofio", signal())).toEqual({
      status: "known",
      costUsd: 0.00016,
    });
    expect(f.calls[0]?.url).toBe("https://openrouter.ai/api/v1/generation?id=gen-tts-1792596888-MMkupXyNUqJTvlKLofio");
    expect(new Headers(f.calls[0]?.init.headers).get("authorization")).toBe("Bearer sk");
  });

  it("asks again later while the generation isn't found yet, and gives up on a refusal or without a key", async () => {
    const notYet = router(() => Response.json(fixture("openrouter/speech/generation-not-found.json"), { status: 404 }));
    expect(await createOpenRouterSpeech({ apiKey: "sk", fetch: notYet }).lookupCost("gen-1", signal())).toEqual({
      status: "not-yet",
    });
    const busy = router(() => Response.json({}, { status: 503 }));
    expect(await createOpenRouterSpeech({ apiKey: "sk", fetch: busy }).lookupCost("gen-1", signal())).toEqual({
      status: "not-yet",
    });
    const refused = router(() => Response.json({}, { status: 401 }));
    expect(await createOpenRouterSpeech({ apiKey: "sk", fetch: refused }).lookupCost("gen-1", signal())).toEqual({
      status: "unavailable",
    });
    const odd = router(() => Response.json({ data: { total_cost: "free" } }));
    expect(await createOpenRouterSpeech({ apiKey: "sk", fetch: odd }).lookupCost("gen-1", signal())).toEqual({
      status: "unavailable",
    });
    expect(await createOpenRouterSpeech({ apiKey: undefined, fetch: busy }).lookupCost("gen-1", signal())).toEqual({
      status: "unavailable",
    });
  });
});
