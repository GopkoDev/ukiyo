import { afterEach, describe, expect, it } from "vitest";
import { fixture } from "../../../../tests/helpers/fake-fetch";
import { seedRecording } from "../../../../tests/helpers/recordings";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { Recording, RecordingPage } from "../../../shared/speech";
import { VoicePreset } from "../../../shared/voice-presets";

const MP3 = new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 1, 2, 3]);
const MODEL = "elevenlabs/eleven-multilingual-v2";

/** OpenRouter stand-in; `beforeAnswer` runs after the speech request is received, before it answers. */
function openRouter() {
  const state = { calls: [] as string[], beforeAnswer: undefined as undefined | (() => void) };
  const fn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    state.calls.push(url);
    if (url.includes("/models?output_modalities=speech"))
      return Response.json(fixture("openrouter/speech/models.json"));
    if (url.endsWith("/audio/speech")) {
      state.beforeAnswer?.();
      return new Response(MP3, { headers: { "content-type": "audio/mpeg" } });
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

let t: ReturnType<typeof createTestApp> | undefined;
afterEach(() => t?.cleanup());
const app = () => {
  const f = openRouter();
  t = createTestApp({ openRouterApiKey: "sk-test" }, { fetch: f });
  return { ...t, f };
};
type A = ReturnType<typeof app>;

const SETUP = { model: MODEL, voice: "george", settings: { speed: 1.1, stability: 0.4 } };
const preset = async (a: A, name = "Narrator") =>
  VoicePreset.parse(await (await a.app.request("/api/audio/presets", json("POST", { name, ...SETUP }))).json());
const speak = async (a: A, body: Record<string, unknown>) => {
  const res = await a.app.request("/api/audio/recordings", json("POST", { text: "Hi there", ...SETUP, ...body }));
  expect(res.status).toBe(201);
  return Recording.parse(await res.json());
};
const presetOf = async (a: A, id: string) =>
  VoicePreset.parse(await (await a.app.request(`/api/audio/presets/${id}`)).json());

describe("recordings linked to voice presets", () => {
  it("links a recording made with an unchanged preset and shows it everywhere (AC-04)", async () => {
    const a = app();
    const p = await preset(a);
    const rec = await speak(a, { presetId: p.id, settings: { stability: 0.4, speed: 1.1 } });
    expect(rec.preset).toEqual({ id: p.id, name: "Narrator" });
    const one = Recording.parse(await (await a.app.request(`/api/audio/recordings/${rec.id}`)).json());
    expect(one.preset).toEqual({ id: p.id, name: "Narrator" });
    const page = RecordingPage.parse(await (await a.app.request(`/api/audio/recordings?preset=${p.id}`)).json());
    expect(page.items.map((r) => r.id)).toEqual([rec.id]);
    expect((await presetOf(a, p.id)).stats).toMatchObject({ recordings: 1, lastUsedAt: rec.createdAt });
  });

  it("saves unlinked when the setup differs, the preset is unknown, or nothing is named (AC-05)", async () => {
    const a = app();
    const p = await preset(a);
    expect((await speak(a, { presetId: p.id, settings: { speed: 1.2, stability: 0.4 } })).preset).toBeNull();
    expect((await speak(a, { presetId: p.id, voice: "sarah" })).preset).toBeNull();
    expect((await speak(a, { presetId: "01ZZZZZZZZZZZZZZZZZZZZZZZZ" })).preset).toBeNull();
    expect((await speak(a, {})).preset).toBeNull();
    expect((await speak(a, { presetId: null })).preset).toBeNull();
    expect((await presetOf(a, p.id)).stats.recordings).toBe(0);
    const bad = await a.app.request("/api/audio/recordings", json("POST", { text: "Hi", ...SETUP, presetId: "nope" }));
    expect(bad.status).toBe(400);
  });

  it("adds no provider call for the link check", async () => {
    const a = app();
    const p = await preset(a);
    a.f.state.calls.length = 0;
    await speak(a, {});
    const plain = a.f.state.calls.length;
    a.f.state.calls.length = 0;
    await speak(a, { presetId: p.id });
    expect(a.f.state.calls.length).toBe(plain);
  });

  it("keeps a paid recording when the preset is deleted or updated while the provider answers (AC-18)", async () => {
    const a = app();
    const gone = await preset(a, "Gone");
    a.f.state.beforeAnswer = () => a.db.prepare("DELETE FROM voice_presets WHERE id = ?").run(gone.id);
    const r1 = await speak(a, { presetId: gone.id });
    expect(r1.preset).toBeNull();
    const kept = await preset(a, "Kept");
    a.f.state.beforeAnswer = () =>
      a.db.prepare("UPDATE voice_presets SET settings = '{\"speed\":0.8}' WHERE id = ?").run(kept.id);
    const r2 = await speak(a, { presetId: kept.id });
    expect(r2.preset).toEqual({ id: kept.id, name: "Kept" }); // decided when the request was received
  });

  it("unlinks on preset delete and drops the link on recording delete (AC-08, AC-16)", async () => {
    const a = app();
    const p = await preset(a);
    const rec = await speak(a, { presetId: p.id });
    const other = await speak(a, { presetId: p.id });
    expect((await a.app.request(`/api/audio/recordings/${other.id}`, json("DELETE"))).status).toBe(204);
    expect((await presetOf(a, p.id)).stats.recordings).toBe(1);
    expect((await a.app.request(`/api/audio/presets/${p.id}`, json("DELETE"))).status).toBe(204);
    const after = Recording.parse(await (await a.app.request(`/api/audio/recordings/${rec.id}`)).json());
    expect(after).toMatchObject({ id: rec.id, preset: null, settings: rec.settings, text: rec.text });
  });

  it("pages one preset's recordings newest first; refuses mixing it with a model (AC-13)", async () => {
    const a = app();
    const p = await preset(a);
    const linked = [];
    for (let i = 0; i < 3; i++) {
      seedRecording(a.db, a.dataDir); // unlinked neighbours in between
      linked.push(await speak(a, { presetId: p.id }));
    }
    const first = RecordingPage.parse(
      await (await a.app.request(`/api/audio/recordings?preset=${p.id}&limit=2`)).json(),
    );
    expect(first.items.map((r) => r.id)).toEqual([linked[2]?.id, linked[1]?.id]);
    const rest = RecordingPage.parse(
      await (await a.app.request(`/api/audio/recordings?preset=${p.id}&limit=2&cursor=${first.nextCursor}`)).json(),
    );
    expect(rest).toMatchObject({ items: [{ id: linked[0]?.id }], nextCursor: null });
    const none = RecordingPage.parse(
      await (await a.app.request("/api/audio/recordings?preset=01ZZZZZZZZZZZZZZZZZZZZZZZZ")).json(),
    );
    expect(none.items).toEqual([]);
    expect((await a.app.request(`/api/audio/recordings?preset=${p.id}&model=${MODEL}`)).status).toBe(400);
    expect((await a.app.request("/api/audio/recordings?preset=nope")).status).toBe(400);
  });
});
