import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearPromptKey, seedGeneration } from "../../../../tests/helpers/generations";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { promptKey } from "./promptKey";
import { createGenerationsRepo } from "./repo";

// curate-gallery spec §6 NFRs, measured in-process (server time only).
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

const json = (method: string, body: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("curate-gallery NFRs", () => {
  let t: ReturnType<typeof createTestApp>;
  afterEach(() => t?.cleanup());

  it("comment/tag saves ≤ 100 ms p95; gallery page ≤ 300 ms p95 with 1 000 generations × 10 tags + comment", async () => {
    t = createTestApp();
    const tags = Array.from({ length: 10 }, (_, i) => `tag ${i}`);
    t.db.transaction(() => {
      for (let i = 0; i < 1000; i++)
        seedGeneration(t.db, t.dataDir, { id: `01CUR${String(i).padStart(21, "0")}`, tags, comment: "A note" });
    })();
    const id = "01CUR000000000000000000999";
    const saves = await timed(20, async (i) => {
      const res =
        i % 2
          ? await t.app.request(`/api/generations/${id}/comment`, json("PUT", { body: `note ${i}` }))
          : await t.app.request(`/api/generations/${id}/tags/${encodeURIComponent("tag 0")}`, { method: "DELETE" });
      expect(res.status).toBe(200);
    });
    const page = await timed(20, async () =>
      expect((await t.app.request("/api/generations?limit=24")).status).toBe(200),
    );
    expect(p95(saves)).toBeLessThanOrEqual(100);
    expect(p95(page)).toBeLessThanOrEqual(300);
  });

  it("a continued gallery page of 24 (cursor mid-list, with durationMs) ≤ 300 ms p95 with 1 000 generations × 10 tags + comment", async () => {
    t = createTestApp();
    const tags = Array.from({ length: 10 }, (_, i) => `tag ${i}`);
    t.db.transaction(() => {
      for (let i = 0; i < 1000; i++)
        seedGeneration(t.db, t.dataDir, { id: `01CON${String(i).padStart(21, "0")}`, tags, comment: "A note" });
    })();
    const cursor = "01CON000000000000000000500";
    const runs = await timed(20, async () => {
      const res = await t.app.request(`/api/generations?cursor=${cursor}&limit=24`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { items: { durationMs?: number }[] };
      expect(body.items).toHaveLength(24);
      expect(body.items[0]?.durationMs).toBe(1234);
    });
    expect(p95(runs)).toBeLessThanOrEqual(300);
  });

  it("deletes a generation with 4 outputs + 8 input copies ≤ 300 ms p95 and its files are gone", async () => {
    t = createTestApp();
    const ids = Array.from(
      { length: 20 },
      (_, i) =>
        seedGeneration(t.db, t.dataDir, {
          id: `01DEL${String(i).padStart(21, "0")}`,
          images: 4,
          inputs: 8,
          tags: ["x"],
          comment: "y",
        }).id,
    );
    const runs = await timed(20, async (i) =>
      expect((await t.app.request(`/api/generations/${ids[i]}`, { method: "DELETE" })).status).toBe(204),
    );
    expect(p95(runs)).toBeLessThanOrEqual(300);
    expect(readdirSync(join(t.dataDir, "generations"))).toEqual([]);
    expect(readdirSync(join(t.dataDir, ".staging"))).toEqual([]);
  });

  it("a crash between commit and purge leaves nothing behind after restart", () => {
    t = createTestApp();
    const keep = seedGeneration(t.db, t.dataDir);
    const trash = join(t.dataDir, ".staging", "01CRASHED.deleted");
    mkdirSync(trash, { recursive: true });
    writeFileSync(join(trash, "output-1.png"), "x");
    t.restart();
    expect(existsSync(trash)).toBe(false);
    expect(existsSync(join(t.dataDir, keep.images[0]?.path ?? ""))).toBe(true);
  });
});

describe("rerun-and-reuse NFRs", () => {
  let t: ReturnType<typeof createTestApp>;
  afterEach(() => t?.cleanup());

  it("detail with lineage ≤ 150 ms p95 with 1 000 generations and 50 derived from the opened one", async () => {
    t = createTestApp();
    const src = "01NFRL00000000000000000000";
    t.db.transaction(() => {
      seedGeneration(t.db, t.dataDir, { id: src });
      for (let i = 0; i < 999; i++)
        seedGeneration(t.db, t.dataDir, {
          id: `01NFRM${String(i).padStart(20, "0")}`,
          ...(i < 50 ? { sourceId: src, sourceRelation: "rerun" as const } : {}),
        });
    })();
    const runs = await timed(20, async () => expect((await t.app.request(`/api/generations/${src}`)).status).toBe(200));
    expect(p95(runs)).toBeLessThanOrEqual(150);
  });

  it("server work before the provider call ≤ 300 ms p95 for 8 stored input images of ≤ 10 MB each", async () => {
    let sentAt = 0;
    const models = {
      data: [
        {
          id: "x/editor",
          name: "Editor",
          architecture: { output_modalities: ["image"] },
          supported_parameters: { input_references: { type: "range", min: 0, max: 8 } },
        },
      ],
    };
    const { fakeFetch } = await import("../../../../tests/helpers/fake-fetch");
    const fetch = fakeFetch((url) => {
      if (url.endsWith("/images/models")) return { body: models };
      sentAt = performance.now();
      return { status: 503, body: { error: { code: 503, message: "stub" } } };
    });
    t = createTestApp({ openRouterApiKey: "k" }, { fetch });
    const src = seedGeneration(t.db, t.dataDir, { id: "01NFRS00000000000000000000", inputs: 8 });
    const big = new Uint8Array(10 * 1024 * 1024 - 1024);
    big.set((await import("../../../../tests/helpers/generations")).TINY_PNG);
    for (const i of src.inputs) writeFileSync(join(t.dataDir, i.path), big);
    await t.app.request("/api/providers/openrouter/models"); // warm the catalog cache, as a real panel does
    const body = {
      provider: "openrouter",
      model: "x/editor",
      prompt: "Again",
      params: { n: 1 },
      inputs: src.inputs.map((i) => ({ stored: { generationId: src.id, kind: "input", position: i.position } })),
    };
    const runs: number[] = [];
    // Run 0 warms the file cache and JIT and is not measured; 20 measured runs follow.
    for (let r = 0; r <= 20; r++) {
      const t0 = performance.now();
      expect((await t.app.request("/api/generations", json("POST", body))).status).toBe(202);
      for (let w = 0; w < 400 && sentAt < t0; w++) await new Promise((res) => setTimeout(res, 1));
      if (r > 0) runs.push(sentAt - t0);
      for (let w = 0; w < 400; w++) {
        const job = (await (await t.app.request("/api/generation-job")).json()) as { job: { status: string } | null };
        if (job.job?.status !== "running") break;
        await new Promise((res) => setTimeout(res, 2));
      }
    }
    expect(p95(runs)).toBeLessThanOrEqual(300);
  }, 60_000); // 21 × (80 MB read + base64) — well past Vitest's 5 s default
});

describe("gallery-by-model NFRs", () => {
  let t: ReturnType<typeof createTestApp>;
  afterEach(() => t?.cleanup());

  it("a filtered continued page and models read (latest=4) ≤ 300 ms p95 with 1 000 generations over 30 models × 10 tags + comment", async () => {
    t = createTestApp();
    const tags = Array.from({ length: 10 }, (_, i) => `tag ${i}`);
    t.db.transaction(() => {
      for (let i = 0; i < 1000; i++)
        seedGeneration(t.db, t.dataDir, {
          id: `01BYM${String(i).padStart(21, "0")}`,
          model: `vendor/model-${i % 30}`,
          tags,
          comment: "A note",
        });
    })();
    const cursor = "01BYM000000000000000000900";
    const page = await timed(20, async () => {
      const res = await t.app.request(
        `/api/generations?provider=openrouter&model=vendor%2Fmodel-7&cursor=${cursor}&limit=24`,
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as { items: unknown[] }).items.length).toBeGreaterThan(0);
    });
    const read = await timed(20, async () => {
      const res = await t.app.request("/api/generations/models?latest=4");
      expect(res.status).toBe(200);
      expect(((await res.json()) as { models: unknown[] }).models).toHaveLength(30);
    });
    expect(p95(page)).toBeLessThanOrEqual(300);
    expect(p95(read)).toBeLessThanOrEqual(300);
  });
});

describe("model-price-preview NFRs", () => {
  let t: ReturnType<typeof createTestApp>;
  afterEach(() => t.cleanup());

  it("cost history ≤ 50 ms p95 with 1 000 generations", async () => {
    t = createTestApp();
    t.db.transaction(() => {
      for (let i = 0; i < 1000; i++)
        seedGeneration(t.db, t.dataDir, {
          id: `01NFRP${String(i).padStart(20, "0")}`,
          model: i % 3 === 0 ? "x/tok" : "x/other",
          costMicros: 40_000,
          costStatus: "known",
        });
    })();
    const runs = await timed(20, async () =>
      expect((await t.app.request("/api/generations/cost-history?provider=openrouter&model=x%2Ftok")).status).toBe(200),
    );
    expect(p95(runs)).toBeLessThanOrEqual(50);
  });
});

describe("model-price-preview NFRs — price", () => {
  let t: ReturnType<typeof createTestApp>;
  afterEach(() => t.cleanup());

  it("cached price ≤ 50 ms p95; first pick adds ≤ 100 ms p95 on top of the provider's answer", async () => {
    const { fakeFetch, fixture } = await import("../../../../tests/helpers/fake-fetch");
    let answeredAt = 0;
    const fetch = fakeFetch((url) => {
      if (url.endsWith("/images/models")) return { body: fixture("openrouter/models.json") };
      answeredAt = performance.now();
      return { body: fixture("openrouter/endpoints/qwen_qwen-image-2.1-turbo.json") };
    });
    let clock = 0;
    t = createTestApp({ openRouterApiKey: "k" }, { fetch, now: () => clock });
    const url = "/api/providers/openrouter/price?model=qwen%2Fqwen-image-2.1-turbo";
    await t.app.request("/api/providers/openrouter/models"); // the panel has loaded the model list
    const first: number[] = [];
    for (let i = 0; i <= 20; i++) {
      clock += 11 * 60 * 1000; // expire the cache: every request is a first pick
      expect((await t.app.request(url)).status).toBe(200);
      if (i > 0) first.push(performance.now() - answeredAt); // warm-up run not measured
    }
    const cached = await timed(20, async () => expect((await t.app.request(url)).status).toBe(200));
    expect(p95(first)).toBeLessThanOrEqual(100);
    expect(p95(cached)).toBeLessThanOrEqual(50);
  });
});

describe("gallery-by-prompt NFRs", () => {
  let t: ReturnType<typeof createTestApp>;
  afterEach(() => t?.cleanup());

  it("a groups page (single=1) and a prompt page ≤ 300 ms p95 with 1 000 generations across 200 prompts × 10 tags + comment", async () => {
    t = createTestApp();
    const tags = Array.from({ length: 10 }, (_, i) => `tag ${i}`);
    t.db.transaction(() => {
      for (let i = 0; i < 1000; i++)
        seedGeneration(t.db, t.dataDir, {
          id: `01PRM${String(i).padStart(21, "0")}`,
          prompt: `prompt number ${i % 200}`,
          tags,
          comment: "A note",
        });
    })();
    const key = promptKey("prompt number 7");
    const groupRuns = await timed(20, async () => {
      const res = await t.app.request("/api/generations/prompts?single=1&limit=24");
      expect(res.status).toBe(200);
      expect(((await res.json()) as { groups: unknown[] }).groups).toHaveLength(24);
    });
    const pageRuns = await timed(20, async () => {
      const res = await t.app.request(`/api/generations?prompt=${key}&limit=24`);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(5);
    });
    expect(p95(groupRuns)).toBeLessThanOrEqual(300);
    expect(p95(pageRuns)).toBeLessThanOrEqual(300);
  });
});

// gallery-by-prompt spec §6 — moved here from prompt-key.int.test.ts: a timing test runs in the serial nfr project.
describe("prompt key backfill NFR", () => {
  it("boot backfills 1 000 keyless generations within 2 s, then updates nothing", () => {
    const t = createTestApp();
    const keyOf = (id: string) => t.db.prepare("SELECT prompt_key FROM generations WHERE id = ?").pluck().get(id);
    const ids = Array.from(
      { length: 1000 },
      (_, i) => seedGeneration(t.db, t.dataDir, { prompt: `prompt ${i % 300}` }).id,
    );
    for (const id of ids) clearPromptKey(t.db, id);

    const start = performance.now();
    t.restart();
    expect(performance.now() - start).toBeLessThan(2000);

    const nulls = t.db.prepare("SELECT count(*) FROM generations WHERE prompt_key IS NULL").pluck().get();
    expect(nulls).toBe(0);
    expect(keyOf(ids[5] as string)).toBe(promptKey("prompt 5"));

    expect(createGenerationsRepo(t.db).backfillPromptKeys()).toBe(0);
    t.cleanup();
  });
});
