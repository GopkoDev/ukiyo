import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { AudioGeneration, AudioGenerationsResponse, VoicesResponse } from "../../../shared/audio";

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3]);

/** ElevenLabs stand-in: voices, subscription and text-to-speech; records each call. */
function elevenLabsFetch(
  tts: () => Response = () => new Response(MP3, { headers: { "content-type": "audio/mpeg", "character-cost": "5" } }),
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/v1/voices"))
      return Response.json({
        voices: [{ voice_id: "v1", name: "James", category: "premade", labels: { use_case: "Narrative & Story" } }],
      });
    if (url.endsWith("/v1/user/subscription")) return Response.json({ character_count: 100, character_limit: 1000 });
    if (url.includes("/v1/text-to-speech/")) return tts();
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

  it("answers 409 when ElevenLabs is not configured", async () => {
    t = createTestApp();
    const res = await t.app.request("/api/audio/voices");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("lists voices and credits", async () => {
    t = createTestApp({ elevenLabsApiKey: "k" }, { fetch: elevenLabsFetch() });
    const voices = VoicesResponse.parse(await (await t.app.request("/api/audio/voices")).json());
    expect(voices.voices).toEqual([{ id: "v1", name: "James", category: "premade", description: "Narrative & Story" }]);
    expect(await (await t.app.request("/api/audio/credits")).json()).toEqual({ used: 100, limit: 1000 });
  });

  it("generates speech with only the model's controls, saves the file, serves and deletes it", async () => {
    const fetch = elevenLabsFetch();
    t = createTestApp({ elevenLabsApiKey: "k" }, { fetch });
    const res = await t.app.request(
      "/api/audio",
      post({
        text: "Hello",
        model: "eleven_v3",
        voiceId: "v1",
        voiceName: "James",
        settings: { stability: 1, speed: 1.1, style: 0.4 },
      }),
    );
    expect(res.status).toBe(201);
    const g = AudioGeneration.parse(await res.json());
    expect(g.settings).toEqual({ stability: 1 });
    expect(g.characters).toBe(5);

    const last = fetch.calls.at(-1);
    const sent = JSON.parse(String(last?.init.body));
    expect(sent).toMatchObject({ text: "Hello", model_id: "eleven_v3", voice_settings: { stability: 1 } });
    expect(sent.voice_settings.speed).toBeUndefined();
    expect(new Headers(last?.init.headers).get("xi-api-key")).toBe("k");

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

  it("rejects an unknown model and text over the model's limit", async () => {
    t = createTestApp({ elevenLabsApiKey: "k" }, { fetch: elevenLabsFetch() });
    const base = { voiceId: "v1", voiceName: "James" };
    expect((await t.app.request("/api/audio", post({ ...base, text: "x", model: "gpt" }))).status).toBe(400);
    expect(
      (await t.app.request("/api/audio", post({ ...base, text: "x".repeat(5001), model: "eleven_v3" }))).status,
    ).toBe(400);
  });

  it("maps an ElevenLabs failure to PROVIDER_ERROR and saves nothing", async () => {
    t = createTestApp(
      { elevenLabsApiKey: "k" },
      { fetch: elevenLabsFetch(() => Response.json({ detail: { message: "quota exceeded" } }, { status: 401 })) },
    );
    const res = await t.app.request(
      "/api/audio",
      post({ text: "Hi", model: "eleven_multilingual_v2", voiceId: "v1", voiceName: "James" }),
    );
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatchObject({
      code: "PROVIDER_ERROR",
      message: "quota exceeded",
      details: { provider: "elevenlabs", upstreamStatus: 401 },
    });
    expect(AudioGenerationsResponse.parse(await (await t.app.request("/api/audio")).json()).items).toEqual([]);
  });
});
