import type { CostLookup } from "../providers/port";
import { toCost } from "./domain";
import type { GenerationsRepo, PendingCost } from "./repo";

/** A pending cost becomes «unavailable» if the provider hasn't reported it this long after its answer (spec AC-05). */
export const COST_DEADLINE_MS = 10 * 60 * 1000;
const FIRST_DELAY_MS = 5_000;
const MAX_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 8;
const LOOKUP_TIMEOUT_MS = 30_000;

/** Gaps between lookups: 5 s, doubling, capped at 60 s, 8 attempts (spec §6). */
export function lookupDelays(): number[] {
  return Array.from({ length: MAX_ATTEMPTS }, (_, i) => Math.min(FIRST_DELAY_MS * 2 ** i, MAX_DELAY_MS));
}

export type Timers = { set(fn: () => void, ms: number): unknown; clear(handle: unknown): void };

const realTimers: Timers = {
  set: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.(); // background lookups never keep the process alive
    return t;
  },
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type CostLookupFn = (costRef: string, signal: AbortSignal) => Promise<CostLookup>;

export type CostSyncDeps = {
  repo: Pick<GenerationsRepo, "resolveCost" | "listPendingCosts">;
  /** The provider's deferred-price lookup, or `undefined` when it has none (its costs settle as unavailable). */
  lookupFor: (provider: string) => CostLookupFn | undefined;
  now?: () => number;
  timers?: Timers;
};

/**
 * Resolves `pending` costs in the background (ADR-0013): bounded lookups through the provider's optional
 * `lookupCost`, ending in `known` or `unavailable`; on boot it resumes from the DB. Provider-agnostic, and
 * repo-agnostic: images and recordings each run an instance over their own repo (ADR-0043).
 */
export function createCostSync(deps: CostSyncDeps) {
  const now = deps.now ?? Date.now;
  const timers = deps.timers ?? realTimers;
  const scheduled = new Map<string, unknown>();

  const finish = (id: string, micros: number | null) => {
    scheduled.delete(id);
    deps.repo.resolveCost(id, micros);
  };

  /** One lookup; `true` when the cost was settled (known or unavailable). */
  async function lookOnce(entry: PendingCost): Promise<boolean> {
    const lookup = deps.lookupFor(entry.provider);
    if (!lookup || !entry.costRef) {
      finish(entry.id, null);
      return true;
    }
    let result: Awaited<ReturnType<typeof lookup>>;
    try {
      result = await lookup(entry.costRef, AbortSignal.timeout(LOOKUP_TIMEOUT_MS));
    } catch {
      result = { status: "not-yet" }; // a failing lookup is retried within the limits
    }
    if (result.status === "known") {
      finish(entry.id, toCost(result.costUsd).costMicros);
      return true;
    }
    if (result.status === "unavailable") {
      finish(entry.id, null);
      return true;
    }
    return false;
  }

  /** Lookup times relative to the answer; times already past collapse into one immediate lookup. */
  function plan(entry: PendingCost): number[] {
    const deadline = entry.answeredAt + COST_DEADLINE_MS;
    let at = entry.answeredAt;
    const times = lookupDelays().map((d) => {
      at += d;
      return Math.min(at, deadline);
    });
    // The backoff alone ends at ~5¼ min; the last lookup waits for the deadline so a price reported
    // up to 10 minutes after the answer is still caught (spec AC-05).
    times[times.length - 1] = deadline;
    const t = now();
    const future = times.filter((x) => x > t);
    return future.length < times.length ? [t, ...future] : future;
  }

  function schedule(entry: PendingCost, times: number[]) {
    const [next, ...rest] = times;
    if (next === undefined) return finish(entry.id, null); // attempts used up → unavailable, never pending forever
    const handle = timers.set(
      () => {
        lookOnce(entry)
          .then((settled) => {
            if (!settled && scheduled.has(entry.id)) schedule(entry, rest);
          })
          .catch((err) => console.error(`cost-sync: lookup for ${entry.id} failed`, err));
      },
      Math.max(0, next - now()),
    );
    scheduled.set(entry.id, handle);
  }

  /** Start resolving a freshly saved pending cost. */
  function track(entry: PendingCost): void {
    if (entry.costRef && deps.lookupFor(entry.provider)) schedule(entry, plan(entry));
    else finish(entry.id, null);
  }

  return {
    track,

    /** Boot: young pending costs continue; overdue ones get one last lookup, then «unavailable». */
    resume(): void {
      for (const entry of deps.repo.listPendingCosts()) {
        if (!entry.costRef) finish(entry.id, null);
        else if (now() >= entry.answeredAt + COST_DEADLINE_MS) schedule(entry, [now()]);
        else track(entry);
      }
    },

    /** Cancels a generation's scheduled lookup — it was deleted (curate-gallery AC-10). */
    forget(id: string): void {
      const handle = scheduled.get(id);
      if (handle !== undefined) timers.clear(handle);
      scheduled.delete(id);
    },

    stop(): void {
      for (const handle of scheduled.values()) timers.clear(handle);
      scheduled.clear();
    },
  };
}

export type CostSync = ReturnType<typeof createCostSync>;
