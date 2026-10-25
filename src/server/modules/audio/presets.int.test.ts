import { afterEach, describe, expect, it } from "vitest";
import { fixture } from "../../../../tests/helpers/fake-fetch";
import { seedRecording } from "../../../../tests/helpers/recordings";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { ErrorResponse } from "../../../shared/errors";
import { SpeechModelsResponse, settingsFor } from "../../../shared/speech";
import { VoicePreset, VoicePresetsResponse } from "../../../shared/voice-presets";

const MODEL = "elevenlabs/eleven-multilingual-v2";

/** The speech catalog; `down` makes it unreadable from then on. */
function catalog() {
  const state = { down: false, calls: 0 };
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/models?output_modalities=speech")) {
      state.calls += 1;
      if (state.down) return new Response("{}", { status: 500 });
      return Response.json(fixture("openrouter/speech/models.json"));
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return Object.assign(fn, { state });
}

const json = (method: string, body?: unknown) => ({
  method,
  headers: { "content-type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const foreign = { origin: "https://evil.example", "sec-fetch-site": "cross-site" };

let t: ReturnType<typeof createTestApp> | undefined;
afterEach(() => t?.cleanup());
const app = (key: string | null = "sk-test") => {
  const f = catalog();
  t = createTestApp({ openRouterApiKey: key ?? undefined }, { fetch: f });
  return { ...t, f };
};
const errorOf = async (res: Response) => ErrorResponse.parse(await res.json()).error;
type A = ReturnType<typeof app>;
const create = (a: A, body: Record<string, unknown>) =>
  a.app.request("/api/audio/presets", json("POST", { model: MODEL, voice: "george", settings: {}, ...body }));
const created = async (a: A, body: Record<string, unknown>) => {
  const res = await create(a, body);
  expect(res.status).toBe(201);
  return VoicePreset.parse(await res.json());
};
const link = (a: A, recording: string, preset: string) =>
  a.db
    .prepare("INSERT INTO voice_preset_recordings (audio_generation_id, preset_id) VALUES (?, ?)")
    .run(recording, preset);

describe("voice presets", () => {
  it("saves name, model, voice and exactly the settings the model accepts — never a text (AC-01)", async () => {
    const a = app();
    const models = SpeechModelsResponse.parse(await (await a.app.request("/api/audio/models")).json()).models;
    const model = models.find((m) => m.id === MODEL);
    if (!model) throw new Error("fixture lacks the model");
    const sent = { speed: 1.1, stability: 0.4 };
    const p = await created(a, { name: "  Narrator  ", settings: sent, text: "ignored" });
    expect(p).toMatchObject({ name: "Narrator", model: MODEL, modelName: model.name, voice: "george" });
    expect(p.settings).toEqual(settingsFor(model.controls, sent));
    expect(p.stats).toEqual({ recordings: 0, knownCostMicros: null, pending: 0, unavailable: 0, lastUsedAt: null });
    expect(JSON.stringify(a.db.prepare("SELECT * FROM voice_presets").all())).not.toContain("ignored");
    a.restart();
    const again = VoicePreset.parse(await (await a.app.request(`/api/audio/presets/${p.id}`)).json());
    expect(again).toEqual(p);
  });

  it("refuses an empty, too long or taken name — any case, any alphabet (AC-02)", async () => {
    const a = app();
    await created(a, { name: "Диктор" });
    for (const [name, message] of [
      ["   ", "Enter a name"],
      ["a".repeat(61), "At most 60 characters"],
      ["диктор", "A voice named «диктор» already exists"],
      [" ДИКТОР ", "A voice named «ДИКТОР» already exists"],
    ]) {
      const res = await create(a, { name });
      expect(res.status).toBe(400);
      const err = await errorOf(res);
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.details?.fields).toEqual({ name: message });
    }
    expect(VoicePresetsResponse.parse(await (await a.app.request("/api/audio/presets")).json()).presets).toHaveLength(
      1,
    );
  });

  it("refuses a setup the catalog doesn't offer, and needs OpenRouter for it", async () => {
    const a = app();
    const unknown = await create(a, { name: "A", model: "no/such" });
    expect(unknown.status).toBe(400);
    expect((await errorOf(unknown)).details?.fields).toHaveProperty("model");
    const voice = await create(a, { name: "A", voice: "nobody" });
    expect(voice.status).toBe(400);
    expect((await errorOf(voice)).details?.fields).toHaveProperty("voice");
    t?.cleanup();
    const b = app(null);
    const res = await create(b, { name: "A" });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe("PROVIDER_NOT_CONFIGURED");
  });

  it("validates a setup change against the last catalog read without waiting on the provider", async () => {
    const a = app();
    const p = await created(a, { name: "A" });
    a.f.state.down = true;
    const res = await a.app.request(`/api/audio/presets/${p.id}`, json("PATCH", { model: MODEL, voice: "george" }));
    expect(res.status).toBe(200);
  });

  it("lists presets by name ignoring case, with count, known total, pending, unavailable and last use (AC-11, AC-12)", async () => {
    const a = app();
    const b = await created(a, { name: "beta" });
    const al = await created(a, { name: "Alpha" });
    await created(a, { name: "gamma" });
    const r1 = seedRecording(a.db, a.dataDir, { costMicros: 100, costStatus: "known", estimateMicros: 999 });
    const r2 = seedRecording(a.db, a.dataDir, { costMicros: 250, costStatus: "known" });
    const r3 = seedRecording(a.db, a.dataDir, { costMicros: null, costStatus: "pending", estimateMicros: 50 });
    const r4 = seedRecording(a.db, a.dataDir, { costMicros: null, costStatus: "unavailable" });
    for (const r of [r1, r2, r3, r4]) link(a, r.id, b.id);
    const r5 = seedRecording(a.db, a.dataDir, { costMicros: null, costStatus: "pending" });
    link(a, r5.id, al.id);
    const list = VoicePresetsResponse.parse(await (await a.app.request("/api/audio/presets")).json()).presets;
    expect(list.map((p) => p.name)).toEqual(["Alpha", "beta", "gamma"]);
    expect(list[1]?.stats).toEqual({
      recordings: 4,
      knownCostMicros: 350,
      pending: 1,
      unavailable: 1,
      lastUsedAt: r4.createdAt,
    });
    expect(list[0]?.stats).toMatchObject({ recordings: 1, knownCostMicros: null, pending: 1 });
    expect(list[2]?.stats.lastUsedAt).toBeNull();
  });

  it("renames without the catalog, allows a case-only rename of itself, refuses a taken name (AC-02, AC-07)", async () => {
    const a = app();
    const p = await created(a, { name: "Narrator" });
    await created(a, { name: "Other" });
    a.f.state.down = true;
    const calls = a.f.state.calls;
    const rename = (name: string) => a.app.request(`/api/audio/presets/${p.id}`, json("PATCH", { name }));
    const res = await rename("NARRATOR");
    expect(res.status).toBe(200);
    expect(VoicePreset.parse(await res.json()).name).toBe("NARRATOR");
    const taken = await rename("other");
    expect(taken.status).toBe(400);
    expect((await errorOf(taken)).details?.fields).toEqual({ name: "A voice named «other» already exists" });
    expect(a.f.state.calls).toBe(calls);
  });

  it("replaces the setup on update, keeping its name and links (AC-06)", async () => {
    const a = app();
    const p = await created(a, { name: "Narrator", settings: { speed: 1.1 } });
    const r = seedRecording(a.db, a.dataDir, { settings: { speed: 1.1 } });
    link(a, r.id, p.id);
    const res = await a.app.request(
      `/api/audio/presets/${p.id}`,
      json("PATCH", { model: MODEL, voice: "george", settings: { speed: 0.9 } }),
    );
    const u = VoicePreset.parse(await res.json());
    expect(u).toMatchObject({ id: p.id, name: "Narrator", settings: { speed: 0.9 }, stats: { recordings: 1 } });
    expect(u.updatedAt >= p.updatedAt).toBe(true);
    const rec = a.db.prepare("SELECT settings FROM audio_generations WHERE id = ?").pluck().get(r.id);
    expect(JSON.parse(String(rec))).toEqual({ speed: 1.1 });
    for (const body of [{}, { voice: "george" }, { settings: {} }, { name: "x", extra: 1 }]) {
      const bad = await a.app.request(`/api/audio/presets/${p.id}`, json("PATCH", body));
      expect(bad.status).toBe(400);
    }
  });

  it("deletes a preset and keeps its recordings, unlinked (AC-07, AC-08)", async () => {
    const a = app();
    const p = await created(a, { name: "Narrator" });
    const r = seedRecording(a.db, a.dataDir, { tags: ["intro"], comment: "keep" });
    link(a, r.id, p.id);
    const before = a.db.prepare("SELECT * FROM audio_generations").all();
    expect((await a.app.request(`/api/audio/presets/${p.id}`, json("DELETE"))).status).toBe(204);
    expect((await a.app.request(`/api/audio/presets/${p.id}`)).status).toBe(404);
    expect((await a.app.request(`/api/audio/presets/${p.id}`, json("DELETE"))).status).toBe(404);
    expect(a.db.prepare("SELECT * FROM audio_generations").all()).toEqual(before);
    expect(a.db.prepare("SELECT count(*) FROM audio_generation_tags").pluck().get()).toBe(1);
    expect(a.db.prepare("SELECT count(*) FROM voice_preset_recordings").pluck().get()).toBe(0);
  });

  it("answers not found for an unknown or malformed id", async () => {
    const a = app();
    for (const path of ["/api/audio/presets/01ZZZZZZZZZZZZZZZZZZZZZZZZ", "/api/audio/presets/nope"]) {
      expect((await a.app.request(path)).status).toBe(404);
      expect((await a.app.request(path, json("PATCH", { name: "x" }))).status).toBe(404);
    }
  });

  it("refuses every preset route from another site and changes nothing (AC-17)", async () => {
    const a = app();
    const p = await created(a, { name: "Narrator" });
    const reqs: [string, string, unknown?][] = [
      ["GET", "/api/audio/presets"],
      ["POST", "/api/audio/presets", { name: "B", model: MODEL, voice: "george" }],
      ["GET", `/api/audio/presets/${p.id}`],
      ["PATCH", `/api/audio/presets/${p.id}`, { name: "Evil" }],
      ["DELETE", `/api/audio/presets/${p.id}`],
    ];
    for (const [method, path, body] of reqs) {
      const init = json(method, body);
      const res = await a.app.request(path, { ...init, headers: { ...init.headers, ...foreign } });
      expect(res.status).toBe(403);
    }
    const list = VoicePresetsResponse.parse(await (await a.app.request("/api/audio/presets")).json()).presets;
    expect(list.map((x) => x.name)).toEqual(["Narrator"]);
  });
});
