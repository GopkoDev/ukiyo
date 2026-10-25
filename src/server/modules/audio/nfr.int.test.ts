import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fixture } from "../../../../tests/helpers/fake-fetch";
import { seedRecording } from "../../../../tests/helpers/recordings";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { GENERATION_TIMEOUT_MS } from "../../app";

// text-to-speech spec §6 NFRs, measured in-process (server time only).
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1] ?? Number.NaN;

async function timed(n: number, fn: (i: number) => unknown) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    await fn(i);
    out.push(performance.now() - t0);
  }
  return out;
}

const TEN_MB = new Uint8Array(10 * 1024 * 1024).fill(0x55);

function openRouter(speech: (init: RequestInit) => Response | Promise<Response>) {
  let catalogCalls = 0;
  const fn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.includes("/models?output_modalities=speech")) {
      catalogCalls++;
      return Response.json(fixture("openrouter/speech/models.json"));
    }
    if (url.endsWith("/audio/speech")) return speech(init);
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return Object.assign(fn, { catalogCalls: () => catalogCalls });
}

const post = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("text-to-speech NFRs", () => {
  let t: ReturnType<typeof createTestApp> | undefined;
  afterEach(() => t?.cleanup());

  it("≤ 1 provider catalog request per 10 minutes; the model list ≤ 300 ms p95 from a warm catalog", async () => {
    let now = Date.parse("2026-10-25T10:00:00Z");
    const f = openRouter(() => new Response("{}", { status: 500 }));
    t = createTestApp({ openRouterApiKey: "sk" }, { fetch: f, now: () => now });
    const app = t.app;
    await app.request("/api/audio/models"); // warm
    const times = await timed(50, async () => {
      now += 10_000; // 50 requests over ~8 minutes
      expect((await app.request("/api/audio/models")).status).toBe(200);
    });
    expect(f.catalogCalls()).toBe(1);
    expect(p95(times)).toBeLessThanOrEqual(300);
  });

  it("the ten latest of 1 000 recordings ≤ 100 ms p95 server time", async () => {
    t = createTestApp({ openRouterApiKey: "sk" }, { fetch: openRouter(() => new Response("{}", { status: 500 })) });
    const { db, dataDir, app } = t;
    for (let i = 0; i < 1000; i++) seedRecording(db, dataDir);
    const times = await timed(50, async () => {
      const page = await (await app.request("/api/audio/recordings?limit=10")).json();
      expect(page.items).toHaveLength(10);
    });
    expect(p95(times)).toBeLessThanOrEqual(100);
  });

  it("file + record saved ≤ 500 ms p95 for a 10 MB audio answer", async () => {
    t = createTestApp(
      { openRouterApiKey: "sk" },
      {
        fetch: openRouter(
          () => new Response(TEN_MB, { headers: { "content-type": "audio/mpeg", "x-generation-id": "gen-1" } }),
        ),
      },
    );
    const app = t.app;
    await app.request("/api/audio/models"); // warm the catalog so only the save is measured
    const times = await timed(20, async () => {
      const res = await app.request(
        "/api/audio/recordings",
        post({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" }),
      );
      expect(res.status).toBe(201);
    });
    expect(p95(times)).toBeLessThanOrEqual(500);
  }, 30_000);

  it("a request with no answer ends in a plain error after the time limit (default 180 s, as images)", async () => {
    expect(GENERATION_TIMEOUT_MS).toBe(180_000);
    t = createTestApp(
      { openRouterApiKey: "sk" },
      {
        generationTimeoutMs: 100,
        fetch: openRouter(
          (init) =>
            new Promise((_, reject) =>
              init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
            ),
        ),
      },
    );
    const t0 = performance.now();
    const res = await t.app.request(
      "/api/audio/recordings",
      post({ text: "Hi", model: "elevenlabs/eleven-v3", voice: "george" }),
    );
    const elapsed = performance.now() - t0;
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toBe(
      "The provider did not answer within 0.1 s — the provider may still charge for it",
    );
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(2000);
  });
});

// audio-gallery spec §6 NFRs.
const jsonReq = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const galleryId = (n: number) => `01R${String(n).padStart(23, "0")}`;
const MODELS = Array.from({ length: 30 }, (_, i) => `maker${i}/model-${i}`);

for (const mode of ["catalog ok", "catalog hanging"] as const) {
  describe(`audio gallery NFRs (1 000 recordings, 30 models, 10 tags + a comment each; ${mode})`, () => {
    let t: ReturnType<typeof createTestApp>;
    beforeAll(() => {
      const fetchImpl = (async (input: RequestInfo | URL) => {
        if (String(input).includes("/models?output_modalities=speech")) {
          if (mode === "catalog hanging") return new Promise<Response>(() => {});
          return Response.json(fixture("openrouter/speech/models.json"));
        }
        return new Response("{}", { status: 404 });
      }) as typeof fetch;
      t = createTestApp({ openRouterApiKey: "sk-test" }, { fetch: fetchImpl });
      for (let i = 1; i <= 1000; i++)
        seedRecording(t.db, t.dataDir, {
          id: galleryId(i),
          model: MODELS[i % 30],
          modelName: i % 7 === 0 ? null : `Model ${i % 30}`,
          tags: Array.from({ length: 10 }, (_, k) => `tag ${k}`),
          comment: `A comment for recording ${i}`,
        });
    }, 120_000);
    afterAll(() => t.cleanup());

    it("any page of 24 (first, continued, one model) ≤ 300 ms p95", async () => {
      const first = await timed(50, () => t.app.request("/api/audio/recordings?limit=24"));
      const next = await timed(50, (i) =>
        t.app.request(`/api/audio/recordings?limit=24&cursor=${galleryId(900 - i * 10)}`),
      );
      const one = await timed(50, (i) =>
        t.app.request(`/api/audio/recordings?limit=24&model=${encodeURIComponent(MODELS[i % 30] ?? "")}`),
      );
      expect(p95(first)).toBeLessThanOrEqual(300);
      expect(p95(next)).toBeLessThanOrEqual(300);
      expect(p95(one)).toBeLessThanOrEqual(300);
    });

    it("model groups with the four latest ≤ 300 ms p95", async () => {
      const xs = await timed(50, () => t.app.request("/api/audio/recordings/models?latest=4"));
      expect(p95(xs)).toBeLessThanOrEqual(300);
    });

    it("tag add and comment save ≤ 100 ms p95", async () => {
      const tags = await timed(50, (i) =>
        t.app.request(`/api/audio/recordings/${galleryId(i + 1)}/tags`, jsonReq("POST", { tag: "tag 0" })),
      );
      const comments = await timed(50, (i) =>
        t.app.request(`/api/audio/recordings/${galleryId(i + 1)}/comment`, jsonReq("PUT", { body: `saved ${i}` })),
      );
      expect(p95(tags)).toBeLessThanOrEqual(100);
      expect(p95(comments)).toBeLessThanOrEqual(100);
    });

    it("deleting a recording with its file, tags and comment ≤ 300 ms p95", async () => {
      const xs = await timed(50, async (i) => {
        const res = await t.app.request(`/api/audio/recordings/${galleryId(951 + i)}`, { method: "DELETE" });
        expect(res.status).toBe(204);
      });
      expect(p95(xs)).toBeLessThanOrEqual(300);
    });
  });
}

describe("voice-presets NFRs (spec §6)", () => {
  let t: ReturnType<typeof createTestApp> | undefined;
  afterEach(() => t?.cleanup());

  /** 200 presets and 5 000 recordings, every 2nd linked round-robin; rows only (no files needed for reads). */
  function seedLarge(db: NonNullable<typeof t>["db"]) {
    const preset = db.prepare(
      `INSERT INTO voice_presets (id, name, name_key, provider, model, model_name, voice, settings, created_at, updated_at)
       VALUES (?, ?, ?, 'openrouter', 'elevenlabs/eleven-v3', 'Eleven v3', 'george', '{}', ?, ?)`,
    );
    const rec = db.prepare(
      `INSERT INTO audio_generations (id, provider, model, model_name, voice, text, settings, file_path, media_type,
         characters, cost_micros, cost_status, cost_ref, estimate_micros, created_at, duration_ms)
       VALUES (?, 'openrouter', 'elevenlabs/eleven-v3', 'Eleven v3', 'george', 'A test text', '{}', ?, 'audio/mpeg',
         11, ?, ?, NULL, 10, ?, 900)`,
    );
    const link = db.prepare("INSERT INTO voice_preset_recordings (audio_generation_id, preset_id) VALUES (?, ?)");
    const pid = (i: number) => `01P${String(i).padStart(23, "0")}`;
    db.transaction(() => {
      for (let i = 0; i < 200; i++)
        preset.run(pid(i), `Voice ${i}`, `voice ${i}`, "2026-10-25T10:00:00Z", "2026-10-25T10:00:00Z");
      for (let i = 0; i < 5000; i++) {
        const id = `01R${String(i).padStart(23, "0")}`;
        const known = i % 3 !== 0;
        rec.run(id, `audio/${id}.mp3`, known ? 100 : null, known ? "known" : "pending", "2026-10-25T10:00:00Z");
        if (i % 2 === 0) link.run(id, pid(i % 200));
      }
    })();
    return pid(0);
  }

  it("the Voices list with every preset's stats ≤ 100 ms p95 for 200 presets and 5 000 recordings, no provider call", async () => {
    const f = openRouter(() => new Response("{}", { status: 500 }));
    t = createTestApp({ openRouterApiKey: "sk" }, { fetch: f });
    const app = t.app;
    seedLarge(t.db);
    const times = await timed(50, async () => {
      const body = await (await app.request("/api/audio/presets")).json();
      expect(body.presets).toHaveLength(200);
    });
    expect(f.catalogCalls()).toBe(0);
    expect(p95(times)).toBeLessThanOrEqual(100);
  });

  it("one page of a preset's recordings ≤ 100 ms p95 with 5 000 recordings", async () => {
    t = createTestApp({ openRouterApiKey: "sk" }, { fetch: openRouter(() => new Response("{}", { status: 500 })) });
    const app = t.app;
    const first = seedLarge(t.db);
    const times = await timed(50, async () => {
      const page = await (await app.request(`/api/audio/recordings?preset=${first}&limit=24`)).json();
      expect(page.items).toHaveLength(24);
    });
    expect(p95(times)).toBeLessThanOrEqual(100);
  });

  it("save, update, rename, delete each ≤ 50 ms p95, never waiting on the provider (stale catalog entry)", async () => {
    let now = Date.parse("2026-10-25T10:00:00Z");
    let hang = false;
    const base = openRouter(() => new Response("{}", { status: 500 }));
    const f = (async (input: RequestInfo | URL, init?: RequestInit) =>
      hang && String(input).includes("/models?") ? new Promise<Response>(() => {}) : base(input, init)) as typeof fetch;
    t = createTestApp({ openRouterApiKey: "sk" }, { fetch: f, now: () => now });
    const app = t.app;
    seedLarge(t.db);
    await app.request("/api/audio/models"); // the Speech page has read the models once
    now += 60 * 60_000; // an hour later: the entry is past its TTL
    hang = true; // and the provider would never answer
    const json = (method: string, body?: unknown) => ({
      method,
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const ids: string[] = [];
    const save = await timed(30, async (i) => {
      const res = await app.request(
        "/api/audio/presets",
        json("POST", { name: `New ${i}`, model: "elevenlabs/eleven-v3", voice: "george" }),
      );
      expect(res.status).toBe(201);
      ids.push((await res.json()).id);
    });
    const update = await timed(30, async (i) => {
      const res = await app.request(
        `/api/audio/presets/${ids[i]}`,
        json("PATCH", { model: "elevenlabs/eleven-v3", voice: "george", settings: { style: 0.2 } }),
      );
      expect(res.status).toBe(200);
    });
    const rename = await timed(30, async (i) => {
      expect((await app.request(`/api/audio/presets/${ids[i]}`, json("PATCH", { name: `Renamed ${i}` }))).status).toBe(
        200,
      );
    });
    const remove = await timed(30, async (i) => {
      expect((await app.request(`/api/audio/presets/${ids[i]}`, json("DELETE"))).status).toBe(204);
    });
    for (const xs of [save, update, rename, remove]) expect(p95(xs)).toBeLessThanOrEqual(50);
  });
});
