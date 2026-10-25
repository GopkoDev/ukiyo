import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CostLookup, ImageProvider } from "../providers/port";
import { registryOf } from "../providers/registry";
import { COST_DEADLINE_MS, createCostSync, lookupDelays } from "./cost-sync";
import type { PendingCost } from "./repo";

const T0 = Date.parse("2026-10-18T12:00:00.000Z");

function setup(answers: (CostLookup | Error)[], withLookup = true) {
  const calls: string[] = [];
  const resolved = new Map<string, number | null>();
  const provider = {
    id: "vercel",
    name: "Vercel AI Gateway",
    configured: true,
    listModels: async () => [],
    generate: async () => {
      throw new Error("unused");
    },
    ...(withLookup
      ? {
          lookupCost: async (ref: string) => {
            calls.push(`${Date.now() - T0}:${ref}`);
            const next = answers.shift() ?? { status: "not-yet" };
            if (next instanceof Error) throw next;
            return next;
          },
        }
      : {}),
  } as ImageProvider;
  const repo = {
    resolveCost: (id: string, micros: number | null) => {
      resolved.set(id, micros);
      return true;
    },
    listPendingCosts: (): PendingCost[] => [],
  };
  const providers = registryOf([provider]);
  const sync = createCostSync({ repo, lookupFor: (id) => providers.get(id)?.lookupCost });
  return { sync, calls, resolved, repo };
}

const entry = (over: Partial<PendingCost> = {}): PendingCost => ({
  id: "G1",
  provider: "vercel",
  costRef: "gen_1",
  answeredAt: Date.now(), // the fake clock — «just answered»
  ...over,
});

describe("cost resolver", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: T0 });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("schedules ≤ 8 lookups from 5 s, doubling to at most 60 s, inside the 10-minute deadline", () => {
    expect(lookupDelays()).toEqual([5_000, 10_000, 20_000, 40_000, 60_000, 60_000, 60_000, 60_000]);
    expect(lookupDelays().reduce((a, b) => a + b, 0)).toBeLessThan(COST_DEADLINE_MS);
  });

  it("resolves to the known price once the provider reports it", async () => {
    const { sync, calls, resolved } = setup([{ status: "not-yet" }, { status: "known", costUsd: 0.067 }]);
    sync.track(entry());
    await vi.advanceTimersByTimeAsync(4_999);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toEqual(["5000:gen_1", "15000:gen_1"]);
    expect(resolved.get("G1")).toBe(67_000);
    await vi.advanceTimersByTimeAsync(COST_DEADLINE_MS);
    expect(calls).toHaveLength(2); // stops after resolving
  });

  it("gives up as unavailable after the last attempt, and on an unusable answer or a thrown lookup", async () => {
    const a = setup([]);
    a.sync.track(entry());
    await vi.advanceTimersByTimeAsync(COST_DEADLINE_MS + 30_000);
    expect(a.calls).toHaveLength(8);
    expect(a.resolved.get("G1")).toBeNull();

    expect(a.calls.at(-1)).toBe(`${COST_DEADLINE_MS}:gen_1`); // the last lookup waits for the 10-minute deadline (AC-05)

    const late = setup([...Array(7).fill({ status: "not-yet" }), { status: "known", costUsd: 0.02 }]);
    late.sync.track(entry({ id: "G9" }));
    await vi.advanceTimersByTimeAsync(COST_DEADLINE_MS);
    expect(late.resolved.get("G9")).toBe(20_000); // a price reported just before the deadline is kept

    const b = setup([{ status: "unavailable" }]);
    b.sync.track(entry({ id: "G2" }));
    await vi.advanceTimersByTimeAsync(5_000);
    expect(b.resolved.get("G2")).toBeNull();

    const c = setup([new Error("boom"), { status: "known", costUsd: 0.01 }]);
    c.sync.track(entry({ id: "G3" }));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(c.resolved.get("G3")).toBe(10_000); // a thrown lookup counts as «not yet»
  });

  it("makes a cost unavailable at once without a reference or a provider that can look it up", async () => {
    const a = setup([]);
    a.sync.track(entry({ costRef: null }));
    expect(a.resolved.get("G1")).toBeNull();
    const b = setup([], false);
    b.sync.track(entry());
    expect(b.resolved.get("G1")).toBeNull();
  });

  it("on boot keeps looking up young pending costs and gives overdue ones one last try", async () => {
    const { sync, calls, resolved, repo } = setup([{ status: "not-yet" }, { status: "not-yet" }]);
    repo.listPendingCosts = () => [
      entry({ id: "YOUNG", costRef: "gen_y", answeredAt: T0 - 60_000 }),
      entry({ id: "OLD", costRef: "gen_o", answeredAt: T0 - COST_DEADLINE_MS - 1 }),
      entry({ id: "NOREF", costRef: null, answeredAt: T0 - 1_000 }),
    ];
    sync.resume();
    expect(resolved.get("NOREF")).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect([...calls].sort()).toEqual(["0:gen_o", "0:gen_y"]); // overdue: final lookup now; young: first lookup is already due
    expect(resolved.get("OLD")).toBeNull();
    expect(resolved.has("YOUNG")).toBe(false);
    await vi.advanceTimersByTimeAsync(COST_DEADLINE_MS);
    expect(resolved.get("YOUNG")).toBeNull(); // deadline reached → unavailable, never pending forever
  });

  it("forget() cancels one generation's lookups and leaves the others", async () => {
    const { sync, calls, resolved } = setup([]);
    sync.track(entry({ id: "GONE", costRef: "gen_gone" }));
    sync.track(entry({ id: "KEEP", costRef: "gen_keep" }));
    sync.forget("GONE");
    await vi.advanceTimersByTimeAsync(COST_DEADLINE_MS + 1_000);
    expect(calls.some((c) => c.endsWith("gen_gone"))).toBe(false);
    expect(resolved.has("GONE")).toBe(false);
    expect(calls.some((c) => c.endsWith("gen_keep"))).toBe(true);
  });

  it("stop() cancels every scheduled lookup", async () => {
    const { sync, calls } = setup([]);
    sync.track(entry());
    sync.stop();
    await vi.advanceTimersByTimeAsync(COST_DEADLINE_MS);
    expect(calls).toEqual([]);
  });

  it("runs a second, independent instance over another repo and lookup (recordings, ADR-0043)", async () => {
    const resolved = new Map<string, number | null>();
    const lookups: string[] = [];
    const sync = createCostSync({
      repo: {
        resolveCost: (id, micros) => {
          resolved.set(id, micros);
          return true;
        },
        listPendingCosts: () => [],
      },
      lookupFor: (provider) =>
        provider === "openrouter"
          ? async (ref) => {
              lookups.push(ref);
              return { status: "known", costUsd: 0.00016 };
            }
          : undefined,
    });
    sync.track({ id: "R1", provider: "openrouter", costRef: "gen-tts-1", answeredAt: Date.now() });
    sync.track({ id: "R2", provider: "elsewhere", costRef: "x", answeredAt: Date.now() });
    expect(resolved.get("R2")).toBeNull(); // no lookup for that provider → unavailable at once
    await vi.advanceTimersByTimeAsync(5_000);
    expect(lookups).toEqual(["gen-tts-1"]);
    expect(resolved.get("R1")).toBe(160);
    sync.stop();
  });
});
