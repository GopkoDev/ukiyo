import { afterEach, describe, expect, it } from "vitest";
import { fixture } from "../../../../tests/helpers/fake-fetch";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { CostHistory } from "../../../shared/pricing";
import { Recording } from "../../../shared/speech";

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3]);
const fetchImpl = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/models?output_modalities=speech")) return Response.json(fixture("openrouter/speech/models.json"));
  if (url.endsWith("/audio/speech"))
    return new Response(MP3, { headers: { "content-type": "audio/mpeg", "x-generation-id": "gen-tts-1" } });
  return new Response("{}", { status: 404 });
}) as typeof fetch;

let t: ReturnType<typeof createTestApp> | undefined;
afterEach(() => t?.cleanup());

describe("recordings stay apart from image generations (text-to-speech AC-14)", () => {
  it("never appear in the gallery, the recent generations, the model groups or an image model's cost history", async () => {
    t = createTestApp({ openRouterApiKey: "sk-test" }, { fetch: fetchImpl });
    const res = await t.app.request("/api/audio/recordings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Hello there", model: "elevenlabs/eleven-v3", voice: "george" }),
    });
    expect(res.status).toBe(201);
    const rec = Recording.parse(await res.json());

    const gallery = await (await t.app.request("/api/generations")).json();
    expect(gallery.items).toEqual([]);
    const recent = await (await t.app.request("/api/generations?limit=10")).json();
    expect(recent.items).toEqual([]);
    const groups = await (await t.app.request("/api/generations/models?latest=4")).json();
    expect(JSON.stringify(groups)).not.toContain("eleven");
    const history = CostHistory.parse(
      await (
        await t.app.request("/api/generations/cost-history?provider=openrouter&model=elevenlabs/eleven-v3")
      ).json(),
    );
    expect(history).toEqual({ count: 0, perImageMicros: null });
    // nor are their files reachable through the image file route
    expect((await t.app.request(`/api/files/audio/${rec.id}.mp3`)).status).toBe(404);
  });

  it("keeps the OpenRouter key out of answers, rows and stored settings", async () => {
    t = createTestApp({ openRouterApiKey: "sk-secret-key" }, { fetch: fetchImpl });
    const res = await t.app.request("/api/audio/recordings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text: "Hi",
        model: "google/gemini-3.8-flash-tts",
        voice: "Kore",
        settings: { instructions: "calm" },
      }),
    });
    // Gemini is pcm-only; the fake answers mp3 bytes as audio/mpeg, which is kept as mp3.
    const body = await res.text();
    expect(body).not.toContain("sk-secret-key");
    const rows = JSON.stringify(t.db.prepare("SELECT * FROM audio_generations").all());
    expect(rows).not.toContain("sk-secret-key");
    expect(rows).toContain('"instructions\\":\\"calm\\"');
    const list = await (await t.app.request("/api/audio/recordings")).text();
    expect(list).not.toContain("sk-secret-key");
  });
});
