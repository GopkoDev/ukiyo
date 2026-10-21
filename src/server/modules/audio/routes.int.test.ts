import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixture } from "../../../../tests/helpers/fake-fetch";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { AudioGeneration, AudioGenerationsResponse, SpeechModelsResponse } from "../../../shared/audio";

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3]);
const okSpeech = () => new Response(MP3, { headers: { "content-type": "audio/mpeg", "x-generation-id": "gen-tts-1" } });

/** OpenRouter stand-in: the speech catalog (recorded), credits and `/audio/speech`; records each call. */
function openRouterFetch(speech: () => Response = okSpeech) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/models?output_modalities=speech"))
      return Response.json(fixture("openrouter/speech-models.json"));
    if (url.endsWith("/credits")) return Response.json({ data: { total_credits: 20, total_usage: 7.5 } });
    if (url.endsWith("/audio/speech")) return speech();
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

const post = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("audio routes", () => {
  let t: ReturnType<typeof createTestApp> | undefined;
  afterEach(() => t?.cleanup());

  it("lists only ElevenLabs speech models, in spec order, with catalog price, voices and controls", async () => {
    t = createTestApp({}, { fetch: openRouterFetch() });
    const { models } = SpeechModelsResponse.parse(await (await t.app.request("/api/audio/models")).json());
    expect(models.map((m) => m.id)).toEqual([
      "elevenlabs/eleven-v4",
      "elevenlabs/eleven-v3",
      "elevenlabs/eleven-flash-v2.5",
    ]);
    const [v4, v3, flash] = models;
    expect(v4).toMatchObject({ name: "Eleven v4", maxChars: 10_000, pricePerChar: 0.00008 });
    expect(v4?.controls).toEqual(["stability", "similarity"]);
    expect(v4?.voices).toContain("george");
    expect(v3?.stabilitySteps).toEqual([0, 0.5, 1]);
    expect(flash).toMatchObject({ maxChars: 40_000, pricePerChar: 0.00004 });
    expect(flash?.controls).toContain("speed");
  });

  it("answers 409 for credits and generation when OpenRouter is not configured", async () => {
    t = createTestApp({}, { fetch: openRouterFetch() });
    const res = await t.app.request("/api/audio/credits");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("PROVIDER_NOT_CONFIGURED");
    const gen = await t.app.request("/api/audio", post({ text: "Hi", model: "elevenlabs/eleven-v4", voice: "george" }));
    expect(gen.status).toBe(409);
  });

  it("reports the remaining OpenRouter balance", async () => {
    t = createTestApp({ openRouterApiKey: "k" }, { fetch: openRouterFetch() });
    expect(await (await t.app.request("/api/audio/credits")).json()).toEqual({ remainingUsd: 12.5 });
  });

  it("generates speech with only the model's controls, prices it, saves the file, serves and deletes it", async () => {
    const fetch = openRouterFetch();
    t = createTestApp({ openRouterApiKey: "k" }, { fetch });
    const res = await t.app.request(
      "/api/audio",
      post({
        text: "Hello",
        model: "elevenlabs/eleven-v4",
        voice: "george",
        settings: { stability: 1, similarity: 0.6, speed: 1.1, style: 0.4 },
      }),
    );
    expect(res.status).toBe(201);
    const g = AudioGeneration.parse(await res.json());
    expect(g.settings).toEqual({ stability: 1, similarity: 0.6 });
    expect(g.characters).toBe(5);
    expect(g.costMicros).toBe(400); // 5 chars × $0.00008

    const last = fetch.calls.at(-1);
    expect(last?.url).toBe("https://openrouter.ai/api/v1/audio/speech");
    expect(new Headers(last?.init.headers).get("authorization")).toBe("Bearer k");
    const sent = JSON.parse(String(last?.init.body));
    expect(sent).toMatchObject({
      model: "elevenlabs/eleven-v4",
      input: "Hello",
      voice: "george",
      response_format: "mp3",
      provider: { options: { elevenlabs: { voice_settings: { stability: 1, similarity_boost: 0.6 } } } },
    });
    expect(sent.speed).toBeUndefined();
    expect(sent.provider.options.elevenlabs.voice_settings.style).toBeUndefined();

    const file = join(t.dataDir, "audio", `${g.id}.mp3`);
    expect(readFileSync(file)).toEqual(Buffer.from(MP3));

    const list = AudioGenerationsResponse.parse(await (await t.app.request("/api/audio")).json());
    expect(list.items.map((i) => i.id)).toEqual([g.id]);

    const served = await t.app.request(g.url);
    expect(served.headers.get("content-type")).toBe("audio/mpeg");
    expect(new Uint8Array(await served.arrayBuffer())).toEqual(MP3);

    expect((await t.app.request(`/api/audio/${g.id}`, { method: "DELETE" })).status).toBe(204);
    expect(existsSync(file)).toBe(false);
    expect((await t.app.request(g.url)).status).toBe(404);
  });

  it("sends speed top-level for a model that takes it", async () => {
    const fetch = openRouterFetch();
    t = createTestApp({ openRouterApiKey: "k" }, { fetch });
    await t.app.request(
      "/api/audio",
      post({ text: "Hi", model: "elevenlabs/eleven-flash-v2.5", voice: "sarah", settings: { speed: 1.1 } }),
    );
    expect(JSON.parse(String(fetch.calls.at(-1)?.init.body)).speed).toBe(1.1);
  });

  it("rejects a model outside the ElevenLabs list and text over the model's limit", async () => {
    t = createTestApp({ openRouterApiKey: "k" }, { fetch: openRouterFetch() });
    const base = { voice: "george" };
    expect((await t.app.request("/api/audio", post({ ...base, text: "x", model: "fish-audio/s1" }))).status).toBe(400);
    expect(
      (await t.app.request("/api/audio", post({ ...base, text: "x".repeat(5001), model: "elevenlabs/eleven-v3" })))
        .status,
    ).toBe(400);
  });

  it("maps an OpenRouter failure to PROVIDER_ERROR and saves nothing", async () => {
    t = createTestApp(
      { openRouterApiKey: "k" },
      { fetch: openRouterFetch(() => Response.json({ error: { message: "Insufficient credits" } }, { status: 402 })) },
    );
    const res = await t.app.request("/api/audio", post({ text: "Hi", model: "elevenlabs/eleven-v4", voice: "george" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Insufficient credits",
      details: { provider: "openrouter", upstreamStatus: 402 },
    });
    expect(AudioGenerationsResponse.parse(await (await t.app.request("/api/audio")).json()).items).toEqual([]);
  });
});
