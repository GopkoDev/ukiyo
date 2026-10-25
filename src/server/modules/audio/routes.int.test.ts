import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixture } from "../../../../tests/helpers/fake-fetch";
import { seedRecording, TINY_MP3 } from "../../../../tests/helpers/recordings";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { ErrorResponse } from "../../../shared/errors";
import { Recording, RecordingPage, SpeechModelsResponse } from "../../../shared/speech";

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3]);

/** OpenRouter stand-in: the recorded speech catalog, speech and generation lookups; records each call. */
function openRouter(
  speech: () => Response = () =>
    new Response(MP3, { headers: { "content-type": "audio/mpeg", "x-generation-id": "gen-tts-1" } }),
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.includes("/models?output_modalities=speech"))
      return Response.json(fixture("openrouter/speech/models.json"));
    if (url.endsWith("/credits")) return Response.json(fixture("openrouter/speech/credits.json"));
    if (url.endsWith("/audio/speech")) return speech();
    if (url.includes("/generation?id="))
      return Response.json(fixture("openrouter/speech/generation-not-found.json"), { status: 404 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

const json = (method: string, body?: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const foreign = { headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } };

let t: ReturnType<typeof createTestApp> | undefined;
afterEach(() => t?.cleanup());

const configured = (fetchImpl = openRouter()) => {
  t = createTestApp({ openRouterApiKey: "sk-test" }, { fetch: fetchImpl });
  return t;
};
const errorOf = async (res: Response) => ErrorResponse.parse(await res.json()).error;

describe("audio routes", () => {
  it("lists every catalog speech model in the shared shape, ElevenLabs first", async () => {
    const app = configured().app;
    const res = await app.request("/api/audio/models");
    expect(res.status).toBe(200);
    const body = SpeechModelsResponse.parse(await res.json());
    expect(body.models).toHaveLength(36);
    expect(body.models[0]?.maker).toBe("ElevenLabs");
  });

  it("generates a recording, saves its file and serves it; the key never reaches the answer", async () => {
    const f = openRouter();
    const app = configured(f).app;
    const res = await app.request(
      "/api/audio/recordings",
      json("POST", { text: "Hello there", model: "elevenlabs/eleven-v3", voice: "george" }),
    );
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain("sk-test");
    const rec = Recording.parse(JSON.parse(text));
    expect(rec).toMatchObject({ model: "elevenlabs/eleven-v3", modelName: "Eleven v3", costStatus: "pending" });
    const speechCall = f.calls.find((c) => c.url.endsWith("/audio/speech"));
    expect(new Headers(speechCall?.init.headers).get("authorization")).toBe("Bearer sk-test");

    const file = await app.request(rec.url);
    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("audio/mpeg");
    expect(file.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(file.headers.get("content-disposition")).toBe(`inline; filename="george-${rec.id}.mp3"`);
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(MP3);
    const download = await app.request(`${rec.url}?download=1`);
    expect(download.headers.get("content-disposition")).toBe(`attachment; filename="george-${rec.id}.mp3"`);

    const one = Recording.parse(await (await app.request(`/api/audio/recordings/${rec.id}`)).json());
    expect(one.id).toBe(rec.id);
    const row = t?.db.prepare("SELECT * FROM audio_generations WHERE id = ?").get(rec.id);
    expect(JSON.stringify(row)).not.toContain("sk-test");
  });

  it("refuses an invalid request with the field that's wrong", async () => {
    const app = configured().app;
    const notJson = await app.request("/api/audio/recordings", { method: "POST", body: "nope" });
    expect(notJson.status).toBe(400);
    const long = await app.request(
      "/api/audio/recordings",
      json("POST", { text: "a".repeat(5001), model: "elevenlabs/eleven-v3", voice: "george" }),
    );
    expect(long.status).toBe(400);
    expect(await errorOf(long)).toMatchObject({
      code: "VALIDATION_ERROR",
      details: { fields: { text: "At most 5 000 characters" } },
    });
  });

  it("passes the provider's refusal through as a provider error and saves nothing", async () => {
    const app = configured(
      openRouter(() => Response.json(fixture("openrouter/speech/error-402.json"), { status: 402 })),
    ).app;
    const res = await app.request(
      "/api/audio/recordings",
      json("POST", { text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" }),
    );
    expect(res.status).toBe(502);
    expect(await errorOf(res)).toMatchObject({
      code: "PROVIDER_ERROR",
      details: { provider: "openrouter", upstreamStatus: 402 },
    });
    expect(existsSync(join(t?.dataDir ?? "", "audio")) ? readdirSync(join(t?.dataDir ?? "", "audio")) : []).toEqual([]);
  });

  it("lists recordings newest first in pages, prototype rows included", async () => {
    const app = configured().app;
    const db = t?.db;
    const dir = t?.dataDir;
    if (!db || !dir) throw new Error("no app");
    const ids = Array.from({ length: 12 }, () => seedRecording(db, dir).id);
    const first = RecordingPage.parse(await (await app.request("/api/audio/recordings")).json());
    expect(first.items.map((r) => r.id)).toEqual([...ids].reverse().slice(0, 10));
    expect(first.nextCursor).toBe(ids[2]);
    const rest = RecordingPage.parse(
      await (await app.request(`/api/audio/recordings?cursor=${ids[2]}&limit=10`)).json(),
    );
    expect(rest.items.map((r) => r.id)).toEqual([ids[1], ids[0]]);
    expect((await app.request("/api/audio/recordings?limit=0")).status).toBe(400);
    expect((await app.request("/api/audio/recordings?cursor=bad cursor")).status).toBe(400);
  });

  it("deletes a recording and its file; a second delete, a missing file and a bad id are not found", async () => {
    const app = configured().app;
    const db = t?.db;
    const dir = t?.dataDir;
    if (!db || !dir) throw new Error("no app");
    const rec = seedRecording(db, dir);
    expect((await app.request(`/api/audio/recordings/${rec.id}`, json("DELETE"))).status).toBe(204);
    expect(existsSync(join(dir, rec.filePath))).toBe(false);
    expect((await app.request(`/api/audio/recordings/${rec.id}`, json("DELETE"))).status).toBe(404);
    expect((await app.request(`/api/audio/recordings/${rec.id}`)).status).toBe(404);
    expect((await app.request("/api/audio/recordings/not-an-id/file")).status).toBe(404);
    const gone = seedRecording(db, dir);
    writeFileSync(join(dir, gone.filePath), TINY_MP3);
    expect((await app.request(`/api/audio/recordings/${gone.id}/file`)).status).toBe(200);
  });

  it("refuses a page from another site on every audio route", async () => {
    const app = configured().app;
    const routes: [string, string][] = [
      ["GET", "/api/audio/models"],
      ["GET", "/api/audio/recordings"],
      ["POST", "/api/audio/recordings"],
      ["GET", "/api/audio/recordings/01N0000000000000000000000A"],
      ["DELETE", "/api/audio/recordings/01N0000000000000000000000A"],
      ["GET", "/api/audio/recordings/01N0000000000000000000000A/file"],
    ];
    for (const [method, path] of routes) {
      const res = await app.request(path, { method, ...foreign });
      expect(res.status, `${method} ${path}`).toBe(403);
    }
  });

  it("restores an audio deletion that crashed after the trash move, on the next boot", async () => {
    const app = configured().app;
    const db = t?.db;
    const dir = t?.dataDir;
    if (!db || !dir || !t) throw new Error("no app");
    const rec = seedRecording(db, dir);
    // simulate: the file moved to trash, then the process died before the row was deleted
    const { renameSync } = await import("node:fs");
    renameSync(join(dir, rec.filePath), join(dir, ".staging", `audio-${rec.id}.mp3.deleted`));
    expect((await app.request(`/api/audio/recordings/${rec.id}/file`)).status).toBe(404);
    t.restart();
    expect((await t.app.request(`/api/audio/recordings/${rec.id}/file`)).status).toBe(200);
  });

  it("resumes waiting for a pending cost after a restart and settles it from the provider's lookup", async () => {
    const queue: (() => void)[] = [];
    const timers = { set: (fn: () => void) => queue.push(fn), clear: () => {} };
    let found = false;
    const lookups: string[] = [];
    const base = openRouter();
    const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/generation?id=")) {
        lookups.push(url);
        return found
          ? Response.json(fixture("openrouter/speech/generation-found.json"))
          : Response.json(fixture("openrouter/speech/generation-not-found.json"), { status: 404 });
      }
      return base(input, init);
    }) as typeof fetch;
    t = createTestApp({ openRouterApiKey: "sk-test" }, { fetch: f, timers });
    const res = await t.app.request(
      "/api/audio/recordings",
      json("POST", { text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" }),
    );
    const rec = Recording.parse(await res.json());
    expect(rec.costStatus).toBe("pending");
    queue.length = 0; // the lookups scheduled before the restart are gone with the old app
    t.restart(); // boot resume schedules the pending recording again (ADR-0043)
    expect(queue.length).toBeGreaterThan(0);
    found = true;
    for (const fire of queue.splice(0)) fire();
    await new Promise((r) => setTimeout(r, 20));
    expect(lookups.at(-1)).toContain("gen-tts-1");
    const after = Recording.parse(await (await t.app.request(`/api/audio/recordings/${rec.id}`)).json());
    expect(after).toMatchObject({ costStatus: "known", costMicros: 160 });
  });
});
