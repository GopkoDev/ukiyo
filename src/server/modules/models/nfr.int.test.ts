import { afterEach, describe, expect, it } from "vitest";
import { fakeFetch, fixture } from "../../../../tests/helpers/fake-fetch";
import { seedModelPreference } from "../../../../tests/helpers/models";
import { createTestApp } from "../../../../tests/helpers/test-app";

// model-picker-preferences spec §6 NFRs, measured in-process (server time only, catalog warm).
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

const MODEL = "qwen/qwen-image-2.1-turbo";

describe("model-picker-preferences NFRs", () => {
  let t: ReturnType<typeof createTestApp>;
  afterEach(() => t?.cleanup());

  it("lists 100 stored preferences ≤ 100 ms p95 and saves a ★ ≤ 50 ms p95", async () => {
    const fetch = fakeFetch((url) =>
      url.includes("openrouter")
        ? { body: fixture("openrouter/models.json") }
        : { body: fixture("vercel/models.json") },
    );
    t = createTestApp({ openRouterApiKey: "k", aiGatewayApiKey: "k" }, { fetch });
    t.db.transaction(() => {
      for (let i = 0; i < 100; i++)
        seedModelPreference(t.db, { provider: "openrouter", model: `seed/m-${i}`, favorite: true });
    })();
    const patch = (favorite: boolean) =>
      t.app.request("/api/model-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openrouter", model: MODEL, favorite }),
      });
    expect((await patch(true)).status).toBe(200); // warms the catalog cache

    const reads = await timed(50, async () => {
      const res = await t.app.request("/api/model-preferences?provider=openrouter");
      expect(res.status).toBe(200);
    });
    const saves = await timed(50, async (i) => expect((await patch(i % 2 === 0)).status).toBe(200));
    expect(p95(reads)).toBeLessThanOrEqual(100);
    expect(p95(saves)).toBeLessThanOrEqual(50);
  });

  it("saves an off-write (forget a retired id) ≤ 50 ms p95", async () => {
    t = createTestApp({}, { fetch: fakeFetch(() => "network-error") });
    t.db.transaction(() => {
      for (let i = 0; i < 50; i++)
        seedModelPreference(t.db, { provider: "openrouter", model: `gone/m-${i}`, favorite: true });
    })();
    const offs = await timed(50, async (i) => {
      const res = await t.app.request("/api/model-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openrouter", model: `gone/m-${i}`, favorite: false }),
      });
      expect(res.status).toBe(200);
    });
    expect(p95(offs)).toBeLessThanOrEqual(50);
  });

  it("saves a speech-model ★ ≤ 50 ms p95 with a warm speech catalog (models-page-audio §6)", async () => {
    const fetch = fakeFetch((url) =>
      url.includes("output_modalities=speech")
        ? { body: fixture("openrouter/speech/models.json") }
        : { body: fixture("openrouter/models.json") },
    );
    t = createTestApp({ openRouterApiKey: "k" }, { fetch });
    const patch = (favorite: boolean) =>
      t.app.request("/api/model-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "openrouter", kind: "speech", model: "elevenlabs/eleven-v3", favorite }),
      });
    expect((await patch(true)).status).toBe(200); // warms the speech catalog
    const saves = await timed(50, async (i) => expect((await patch(i % 2 === 0)).status).toBe(200));
    expect(p95(saves)).toBeLessThanOrEqual(50);
  });
});
