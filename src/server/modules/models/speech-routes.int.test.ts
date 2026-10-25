import { afterEach, describe, expect, it } from "vitest";
import { fakeFetch, fixture } from "../../../../tests/helpers/fake-fetch";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { ModelPreference, PreferencesResponse } from "../../../shared/models";

/** Speech-model preferences (models-page-audio AC-02, AC-05…AC-07, AC-14; ADR-0054). */
const SPEECH = "elevenlabs/eleven-v3";
const IMAGE = "qwen/qwen-image-2.1-turbo";

const catalogs = (speechDown = false) =>
  fakeFetch((url) => {
    if (url.includes("output_modalities=speech"))
      return speechDown ? { status: 500, body: {} } : { body: fixture("openrouter/speech/models.json") };
    return url.includes("openrouter")
      ? { body: fixture("openrouter/models.json") }
      : { body: fixture("vercel/models.json") };
  });

describe("speech model preferences", () => {
  let t: ReturnType<typeof createTestApp>;
  afterEach(() => t?.cleanup());
  const setup = (fetch = catalogs(), keys: { openRouterApiKey?: string } = { openRouterApiKey: "k" }) => {
    t = createTestApp({ ...keys, aiGatewayApiKey: "k" }, { fetch });
  };
  const patch = (body: unknown, headers: Record<string, string> = {}) =>
    t.app.request("/api/model-preferences", {
      method: "PATCH",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  const list = async (kind?: "speech" | "image") =>
    PreferencesResponse.parse(
      await (await t.app.request(`/api/model-preferences?provider=openrouter${kind ? `&kind=${kind}` : ""}`)).json(),
    ).preferences;

  it("stars and hides a speech model, kept apart from image preferences (AC-02, AC-05)", async () => {
    setup();
    expect((await patch({ provider: "openrouter", kind: "speech", model: SPEECH, favorite: true })).status).toBe(200);
    expect((await patch({ provider: "openrouter", kind: "speech", model: SPEECH, hidden: true })).status).toBe(200);
    expect(await list("speech")).toMatchObject([{ model: SPEECH, favorite: true, hidden: true }]);
    expect(await list()).toEqual([]);
    expect(await list("image")).toEqual([]);
    // an image preference never shows as a speech one — even for the very same id
    expect((await patch({ provider: "openrouter", model: IMAGE, favorite: true })).status).toBe(200);
    expect((await list("speech")).map((p) => p.model)).toEqual([SPEECH]);
    t.db
      .prepare(
        "INSERT INTO model_preferences (provider, model, favorite, hidden, updated_at) VALUES ('openrouter', ?, 0, 1, 'x')",
      )
      .run(SPEECH);
    expect((await list("speech")).find((p) => p.model === SPEECH)).toMatchObject({ favorite: true, hidden: true });
    expect((await list()).find((p) => p.model === SPEECH)).toMatchObject({ favorite: false, hidden: true });
    await patch({ provider: "openrouter", model: SPEECH, hidden: false }); // the image row goes, the speech row stays
    expect((await list("speech")).find((p) => p.model === SPEECH)).toMatchObject({ favorite: true, hidden: true });
    expect((await list()).map((p) => p.model)).toEqual([IMAGE]);
    // toggling twice ends where it started
    await patch({ provider: "openrouter", kind: "speech", model: SPEECH, favorite: false });
    const off = ModelPreference.parse(
      await (await patch({ provider: "openrouter", kind: "speech", model: SPEECH, hidden: false })).json(),
    );
    expect(off.updatedAt).toBeNull();
    expect(await list("speech")).toEqual([]);
    expect((await list()).map((p) => p.model)).toEqual([IMAGE]);
  });

  it("refuses turning a flag on for a model that isn't a speech model of OpenRouter; nothing stored (AC-07)", async () => {
    setup();
    const res = await patch({ provider: "openrouter", kind: "speech", model: IMAGE, favorite: true });
    expect(res.status).toBe(404);
    const vercel = await patch({ provider: "vercel", kind: "speech", model: SPEECH, favorite: true });
    expect(vercel.status).toBe(404);
    expect(await list("speech")).toEqual([]);
  });

  it("turning flags off and Forget need no catalog or key (AC-06)", async () => {
    setup(catalogs(true), {});
    t.db
      .prepare(
        "INSERT INTO speech_model_preferences (provider, model, favorite, hidden, updated_at) VALUES ('openrouter', 'retired/tts', 1, 1, 'x')",
      )
      .run();
    const res = await patch({
      provider: "openrouter",
      kind: "speech",
      model: "retired/tts",
      favorite: false,
      hidden: false,
    });
    expect(res.status).toBe(200);
    expect(await list("speech")).toEqual([]);
    // turning one on with no key / list down is refused
    expect((await patch({ provider: "openrouter", kind: "speech", model: SPEECH, favorite: true })).status).toBe(409);
  });

  it("says the speech list couldn't be loaded when turning a flag on with the catalog down", async () => {
    setup(catalogs(true));
    expect((await patch({ provider: "openrouter", kind: "speech", model: SPEECH, favorite: true })).status).toBe(502);
  });

  it("rejects an unknown kind, and speech preferences of a provider without speech", async () => {
    setup();
    expect((await t.app.request("/api/model-preferences?provider=vercel&kind=speech")).status).toBe(400);
    expect((await t.app.request("/api/model-preferences?provider=openrouter&kind=video")).status).toBe(400);
    expect((await patch({ provider: "openrouter", kind: "video", model: SPEECH, favorite: true })).status).toBe(400);
  });

  it("refuses a foreign-origin change (AC-14)", async () => {
    setup();
    const res = await patch(
      { provider: "openrouter", kind: "speech", model: SPEECH, favorite: true },
      { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    );
    expect(res.status).toBe(403);
    expect(await list("speech")).toEqual([]);
  });
});
