import { afterEach, describe, expect, it } from "vitest";
import { fakeFetch, fixture } from "../../../../tests/helpers/fake-fetch";
import { createTestApp } from "../../../../tests/helpers/test-app";
import { BalanceResponse } from "../../../shared/providers";

/** Provider balances (models-page-audio AC-11, AC-12, AC-14, AC-15; ADR-0055). */
describe("provider balance read", () => {
  let t: ReturnType<typeof createTestApp>;
  afterEach(() => t?.cleanup());
  const read = (id: string, headers: Record<string, string> = {}) =>
    t.app.request(`/api/providers/${id}/balance`, { headers });

  it("answers OpenRouter's credits minus usage and Vercel's published balance, with the key sent server-side only", async () => {
    const fetch = fakeFetch((url) =>
      url.endsWith("openrouter.ai/api/v1/credits")
        ? { body: fixture("openrouter/speech/credits.json") }
        : url.endsWith("ai-gateway.vercel.sh/v1/credits")
          ? { body: fixture("vercel/credits.json") }
          : { status: 404, body: {} },
    );
    t = createTestApp({ openRouterApiKey: "or-key", aiGatewayApiKey: "vc-key" }, { fetch });
    const or = await read("openrouter");
    expect(or.status).toBe(200);
    const orBody = await or.json();
    expect(orBody).toEqual({ provider: "openrouter", remainingUsd: 12.5 });
    expect(BalanceResponse.parse(orBody)).toEqual(orBody);
    const vc = await read("vercel");
    expect(await vc.json()).toEqual({ provider: "vercel", remainingUsd: 95.5 });
    const auth = fetch.calls.map((c) => new Headers(c.init?.headers).get("authorization"));
    expect(auth).toEqual(["Bearer or-key", "Bearer vc-key"]);
    expect(JSON.stringify(orBody)).not.toContain("key");
  });

  it("a refusing, unparseable or hanging provider reads as null; the other is unaffected (AC-12)", async () => {
    const fetch = fakeFetch((url) =>
      url.includes("openrouter") ? { status: 401, body: { error: { message: "No auth" } } } : "hang",
    );
    t = createTestApp({ openRouterApiKey: "k", aiGatewayApiKey: "k" }, { fetch, balanceTimeoutMs: 50 });
    expect(await (await read("openrouter")).json()).toEqual({ provider: "openrouter", remainingUsd: null });
    expect(await (await read("vercel")).json()).toEqual({ provider: "vercel", remainingUsd: null });
    t.cleanup();
    for (const balance of ["lots", "", " "]) {
      t.cleanup();
      t = createTestApp({ aiGatewayApiKey: "k" }, { fetch: fakeFetch(() => ({ body: { balance } })) });
      expect(await (await read("vercel")).json()).toEqual({ provider: "vercel", remainingUsd: null }); // never $0
    }
  });

  it("unknown provider → not found; no key → not configured, without calling out", async () => {
    const fetch = fakeFetch(() => ({ body: {} }));
    t = createTestApp({}, { fetch });
    expect((await read("acme")).status).toBe(404);
    const res = await read("openrouter");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("PROVIDER_NOT_CONFIGURED");
    expect(fetch.calls).toHaveLength(0);
  });

  it("refuses a foreign page and the speech credits route is gone (AC-14)", async () => {
    t = createTestApp({ openRouterApiKey: "k" }, { fetch: fakeFetch(() => ({ body: {} })) });
    expect((await read("openrouter", { origin: "https://evil.example", "sec-fetch-site": "cross-site" })).status).toBe(
      403,
    );
    expect((await t.app.request("/api/audio/credits")).status).toBe(404);
  });
});
