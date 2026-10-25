import { afterEach, describe, expect, it } from "vitest";
import { fixture } from "../../../../tests/helpers/fake-fetch";
import { seedRecording } from "../../../../tests/helpers/recordings";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { GENERATION_TIMEOUT_MS } from "../../app";

// text-to-speech spec §6 NFRs, measured in-process (server time only).
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1] ?? Number.NaN;

async function timed(n: number, fn: (i: number) => Promise<unknown>) {
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
