import { afterEach, describe, expect, it } from "vitest";
import { fixture } from "../../../../tests/helpers/fake-fetch";
import { seedGeneration } from "../../../../tests/helpers/generations";
import { seedRecording } from "../../../../tests/helpers/recordings";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { CommentResponse, TagsResponse } from "../../../shared/curation";
import { ErrorResponse } from "../../../shared/errors";
import { GenerationPage } from "../../../shared/generations";
import { Recording, RecordingModelGroupsResponse, RecordingPage } from "../../../shared/speech";

/** The speech catalog only — the gallery never generates. `hang` simulates an unreachable catalog. */
function catalog(mode: "ok" | "hang" = "ok") {
  const calls: string[] = [];
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("/models?output_modalities=speech")) {
      if (mode === "hang") return new Promise<Response>(() => {});
      return Response.json(fixture("openrouter/speech/models.json"));
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return Object.assign(fn, { calls });
}

const json = (method: string, body?: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const foreign = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };
const id = (n: number) => `01R${String(n).padStart(23, "0")}`;

let t: ReturnType<typeof createTestApp> | undefined;
afterEach(() => t?.cleanup());
const app = (mode: "ok" | "hang" = "ok") => {
  t = createTestApp({ openRouterApiKey: "sk-test" }, { fetch: catalog(mode) });
  return t;
};
const errorOf = async (res: Response) => ErrorResponse.parse(await res.json()).error;

describe("audio gallery routes", () => {
  it("lists recordings with their tags and comment, all or one exact model, paging by cursor", async () => {
    const a = app();
    seedRecording(a.db, a.dataDir, { id: id(1), model: "elevenlabs/eleven-v3", tags: ["intro"], comment: "keep" });
    seedRecording(a.db, a.dataDir, { id: id(2), model: "openai/gpt-4o-mini-tts", modelName: "GPT-4o mini TTS" });
    seedRecording(a.db, a.dataDir, { id: id(3), model: "elevenlabs/eleven-v3" });
    const all = RecordingPage.parse(await (await a.app.request("/api/audio/recordings?limit=24")).json());
    expect(all.items.map((r) => r.id)).toEqual([id(3), id(2), id(1)]);
    expect(all.items[2]).toMatchObject({ tags: ["intro"], comment: { body: "keep" } });
    expect(all.items[0]).toMatchObject({ tags: [], comment: null });
    const res = await a.app.request(
      `/api/audio/recordings?limit=1&model=${encodeURIComponent("elevenlabs/eleven-v3")}`,
    );
    const one = RecordingPage.parse(await res.json());
    expect(one.items.map((r) => r.id)).toEqual([id(3)]);
    const next = RecordingPage.parse(
      await (
        await a.app.request(`/api/audio/recordings?limit=1&model=elevenlabs%2Feleven-v3&cursor=${one.nextCursor}`)
      ).json(),
    );
    expect(next).toMatchObject({ items: [{ id: id(1) }], nextCursor: null });
    const none = RecordingPage.parse(await (await a.app.request("/api/audio/recordings?model=no%2Fsuch")).json());
    expect(none.items).toEqual([]);
    expect((await a.app.request(`/api/audio/recordings?model=${"x".repeat(101)}`)).status).toBe(400);
  });

  it("reads model groups ordered by newest recording, with counts, the latest N and one display name", async () => {
    const a = app();
    seedRecording(a.db, a.dataDir, { id: id(1), model: "a/one", modelName: "One" });
    seedRecording(a.db, a.dataDir, { id: id(2), model: "b/two", modelName: "Two" });
    seedRecording(a.db, a.dataDir, { id: id(3), model: "a/one", modelName: null });
    const body = RecordingModelGroupsResponse.parse(
      await (await a.app.request("/api/audio/recordings/models?latest=4")).json(),
    );
    expect(body.models.map((g) => [g.model, g.modelName, g.count, g.latestId, g.items.length])).toEqual([
      ["a/one", "One", 2, id(3), 2],
      ["b/two", "Two", 1, id(2), 1],
    ]);
    // the newest card of «a/one» has no stored name, yet shows the model's one display name
    expect(body.models[0]?.items[0]?.modelName).toBe("One");
    expect((await a.app.request("/api/audio/recordings/models?latest=25")).status).toBe(400);
  });

  it("falls back to the last catalog read, then the id, and never waits on a hanging catalog", async () => {
    const a = app("hang");
    seedRecording(a.db, a.dataDir, { id: id(1), model: "elevenlabs/eleven-v3", modelName: null });
    const started = performance.now();
    const page = RecordingPage.parse(await (await a.app.request("/api/audio/recordings")).json());
    const groups = RecordingModelGroupsResponse.parse(
      await (await a.app.request("/api/audio/recordings/models?latest=4")).json(),
    );
    const one = Recording.parse(await (await a.app.request(`/api/audio/recordings/${id(1)}`)).json());
    expect(performance.now() - started).toBeLessThan(1000);
    expect([page.items[0]?.modelName, groups.models[0]?.modelName, one.modelName]).toEqual([
      "elevenlabs/eleven-v3",
      "elevenlabs/eleven-v3",
      "elevenlabs/eleven-v3",
    ]);
  });

  it("uses the catalog's name for a prototype-only model once the catalog has been read", async () => {
    const a = app();
    seedRecording(a.db, a.dataDir, { id: id(1), model: "elevenlabs/eleven-v3", modelName: null });
    await a.app.request("/api/audio/models"); // the catalog is now cached
    const page = RecordingPage.parse(await (await a.app.request("/api/audio/recordings")).json());
    expect(page.items[0]?.modelName).toBe("Eleven v3");
    expect(a.db.prepare("SELECT model_name FROM audio_generations").pluck().get()).toBeNull(); // no row rewritten
  });

  it("adds, dedups and removes tags; refuses a bad tag and an eleventh with the reason", async () => {
    const a = app();
    seedRecording(a.db, a.dataDir, { id: id(1) });
    const add = async (tag: string) => a.app.request(`/api/audio/recordings/${id(1)}/tags`, json("POST", { tag }));
    expect(TagsResponse.parse(await (await add("  Intro   Take ")).json()).tags).toEqual(["intro take"]);
    expect(TagsResponse.parse(await (await add("INTRO TAKE")).json()).tags).toEqual(["intro take"]);
    const bad = await add("no<html>");
    expect(bad.status).toBe(400);
    expect((await errorOf(bad)).details?.fields).toHaveProperty("tag");
    for (let i = 2; i <= 10; i++) await add(`t${i}`);
    const eleventh = await add("eleven");
    expect(eleventh.status).toBe(400);
    expect((await errorOf(eleventh)).details?.fields).toHaveProperty("tag");
    const del = await a.app.request(`/api/audio/recordings/${id(1)}/tags/${encodeURIComponent("intro take")}`, {
      method: "DELETE",
    });
    expect(TagsResponse.parse(await del.json()).tags).not.toContain("intro take");
  });

  it("stores the comment exactly, removes it when blank, refuses one over 2 000 characters", async () => {
    const a = app();
    seedRecording(a.db, a.dataDir, { id: id(1) });
    const put = (body: string) => a.app.request(`/api/audio/recordings/${id(1)}/comment`, json("PUT", { body }));
    expect(CommentResponse.parse(await (await put("  keep\nthis ")).json()).comment?.body).toBe("  keep\nthis ");
    expect(Recording.parse(await (await a.app.request(`/api/audio/recordings/${id(1)}`)).json()).comment?.body).toBe(
      "  keep\nthis ",
    );
    expect(CommentResponse.parse(await (await put(" \n ")).json()).comment).toBeNull();
    const long = await put("é".repeat(2001));
    expect(long.status).toBe(400);
    expect((await errorOf(long)).details?.fields).toHaveProperty("body");
  });

  it("answers not found for curation on an unknown recording, changing nothing", async () => {
    const a = app();
    const gone = id(9);
    expect((await a.app.request(`/api/audio/recordings/${gone}`)).status).toBe(404);
    expect((await a.app.request(`/api/audio/recordings/${gone}/tags`, json("POST", { tag: "x" }))).status).toBe(404);
    expect((await a.app.request(`/api/audio/recordings/${gone}/tags/x`, { method: "DELETE" })).status).toBe(404);
    expect((await a.app.request(`/api/audio/recordings/${gone}/comment`, json("PUT", { body: "x" }))).status).toBe(404);
    expect(a.db.prepare("SELECT count(*) FROM audio_generation_tags").pluck().get()).toBe(0);
  });

  it("refuses every gallery request from another site and changes nothing", async () => {
    const a = app();
    seedRecording(a.db, a.dataDir, { id: id(1), tags: ["keep"] });
    const reqs: [string, RequestInit][] = [
      ["/api/audio/recordings", { headers: foreign }],
      ["/api/audio/recordings/models?latest=4", { headers: foreign }],
      [
        `/api/audio/recordings/${id(1)}/comment`,
        { ...json("PUT", { body: "x" }), headers: { ...foreign, "content-type": "application/json" } },
      ],
      [
        `/api/audio/recordings/${id(1)}/tags`,
        { ...json("POST", { tag: "x" }), headers: { ...foreign, "content-type": "application/json" } },
      ],
      [`/api/audio/recordings/${id(1)}/tags/keep`, { method: "DELETE", headers: foreign }],
      [`/api/audio/recordings/${id(1)}`, { method: "DELETE", headers: foreign }],
    ];
    for (const [path, init] of reqs) expect((await a.app.request(path, init)).status).toBe(403);
    const r = Recording.parse(await (await a.app.request(`/api/audio/recordings/${id(1)}`)).json());
    expect(r).toMatchObject({ tags: ["keep"], comment: null });
  });

  it("deleting a recording takes its tags and comment along; image lists never show recordings", async () => {
    const a = app();
    seedRecording(a.db, a.dataDir, { id: id(1), tags: ["intro"], comment: "note" });
    seedGeneration(a.db, a.dataDir);
    expect((await a.app.request(`/api/audio/recordings/${id(1)}`, { method: "DELETE" })).status).toBe(204);
    expect(a.db.prepare("SELECT count(*) FROM audio_generation_tags").pluck().get()).toBe(0);
    expect(a.db.prepare("SELECT count(*) FROM audio_generation_comments").pluck().get()).toBe(0);
    const images = GenerationPage.parse(await (await a.app.request("/api/generations")).json());
    expect(images.items.every((g) => !g.id.startsWith("01R"))).toBe(true);
  });
});
