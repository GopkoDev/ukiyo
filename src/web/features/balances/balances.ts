import { type QueryClient, type UseQueryResult, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { BalanceResponse, ProviderId } from "../../../shared/providers";

/** Every provider balance query sits under this root; one entry per provider (ADR-0055). */
export const BALANCES_KEY = ["provider-balances"] as const;
export const balanceKey = (provider: ProviderId) => [...BALANCES_KEY, provider] as const;
export const BALANCE_REFRESH_MS = 5 * 60_000;

/** The providers list (id, name, configured) — the same cache entry as the Generate and Models pages. */
export function useProviders() {
  return useQuery({ queryKey: ["providers"], queryFn: api.providers });
}

/**
 * One provider's remaining credit, shared by the navigation bar and the Speech page: read every 5 minutes while the
 * tab is visible and again on returning to it; `refreshBalances` re-reads it after a spend.
 */
export function useProviderBalance(provider: ProviderId, enabled = true) {
  return useQuery({
    queryKey: balanceKey(provider),
    queryFn: () => api.providerBalance(provider),
    enabled,
    staleTime: 60_000, // a second reader mounting doesn't read again
    refetchInterval: BALANCE_REFRESH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    retry: false,
  });
}

/** «$12.34», «…» before the first answer, «—» when the last read failed or the provider gave no figure. */
export function balanceText(
  q: Pick<UseQueryResult<BalanceResponse>, "isPending" | "isError" | "data" | "errorUpdatedAt" | "dataUpdatedAt">,
): string {
  // The last read failed — also while a new read runs after a first failure (the query is «pending» again, review R2).
  if (q.isError || q.errorUpdatedAt > q.dataUpdatedAt) return "—";
  if (q.isPending || !q.data) return "…";
  return q.data.remainingUsd === null ? "—" : `$${q.data.remainingUsd.toFixed(2)}`;
}

const dirty = new WeakMap<QueryClient, Set<string>>();

/** Watches the cache once per client: a balance marked dirty during a read is read once more when that read ends. */
function dirtySet(qc: QueryClient): Set<string> {
  let set = dirty.get(qc);
  if (set) return set;
  const marks = new Set<string>();
  set = marks;
  dirty.set(qc, marks);
  qc.getQueryCache().subscribe((event) => {
    const q = event.query;
    if (!marks.has(q.queryHash) || q.state.fetchStatus !== "idle") return;
    marks.delete(q.queryHash);
    void qc.refetchQueries({ queryKey: q.queryKey, exact: true });
  });
  return marks;
}

/**
 * Re-reads every shown balance after a spend (a finished generation or recording, spec AC-13). A read already in
 * flight started before the spend, so it is followed by exactly one more read; triggers meanwhile merge into it.
 */
export function refreshBalances(qc: QueryClient) {
  const marks = dirtySet(qc);
  for (const q of qc.getQueryCache().findAll({ queryKey: BALANCES_KEY })) {
    if (q.state.fetchStatus === "fetching") marks.add(q.queryHash);
    else void qc.refetchQueries({ queryKey: q.queryKey, exact: true });
  }
}
