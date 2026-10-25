import type { QueryClient } from "@tanstack/react-query";
import type { Recording } from "../../../../shared/speech";
import { RECORDINGS_KEY } from "../queryKeys";

type Page = { items: Recording[]; nextCursor: string | null };
type Pages = { pages: Page[]; pageParams: unknown[] };
type Group = { count: number; model?: unknown; items: Recording[] } & Record<string, unknown>;
type Groups = { models: Group[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isPages = (v: unknown): v is Pages => isRecord(v) && Array.isArray(v.pages);
const isPage = (v: unknown): v is Page => isRecord(v) && Array.isArray(v.items);
const isGroups = (v: unknown): v is Groups => isRecord(v) && Array.isArray(v.models);

function apply(items: Recording[], id: string, patch: Partial<Recording> | "remove") {
  return patch === "remove"
    ? items.filter((r) => r.id !== id)
    : items.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

/** Announces a deleted recording to state outside the query cache (the Speech page's latest result, AC-11). */
const deleted = new EventTarget();
export function onRecordingDeleted(listener: (id: string) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<string>).detail);
  deleted.addEventListener("deleted", handler);
  return () => deleted.removeEventListener("deleted", handler);
}

/**
 * Updates (or removes) one recording in every cached recordings view by data shape — gallery pages, the Speech
 * page's recent list, model groups (counts follow a removal; an empty group goes) — and its own detail entry.
 * No page is re-read (audio-gallery §8, the image precedent ADR-0034).
 */
export function patchRecordings(qc: QueryClient, id: string, patch: Partial<Recording> | "remove") {
  // The deleted recording's model, from any cached copy: its group's count drops even when the card wasn't among
  // the group's latest few (review R3).
  const model = patch === "remove" ? findCached(qc, id)?.model : undefined;
  for (const [key, data] of qc.getQueriesData({ queryKey: RECORDINGS_KEY })) {
    if (isPages(data)) {
      qc.setQueryData(key, { ...data, pages: data.pages.map((p) => ({ ...p, items: apply(p.items, id, patch) })) });
    } else if (isGroups(data)) {
      const models = data.models
        .map((g) => {
          const items = apply(g.items, id, patch);
          const removed = patch === "remove" && (items.length < g.items.length || g.model === model);
          return { ...g, items, count: removed ? g.count - 1 : g.count };
        })
        .filter((g) => g.count > 0);
      qc.setQueryData(key, { ...data, models });
    } else if (isPage(data)) {
      qc.setQueryData(key, { ...data, items: apply(data.items, id, patch) });
    }
  }
  // The detail entry itself is dropped by the caller once nothing observes it any more (review R4).
  if (patch === "remove") deleted.dispatchEvent(new CustomEvent("deleted", { detail: id }));
  else qc.setQueryData<Recording>(["recording", id], (old) => (old ? { ...old, ...patch } : old));
}

function findCached(qc: QueryClient, id: string): Recording | undefined {
  const own = qc.getQueryData<Recording>(["recording", id]);
  if (own) return own;
  for (const [, data] of qc.getQueriesData({ queryKey: RECORDINGS_KEY })) {
    const lists = isPages(data)
      ? data.pages.map((p) => p.items)
      : isGroups(data)
        ? data.models.map((g) => g.items)
        : isPage(data)
          ? [data.items]
          : [];
    for (const items of lists) {
      const hit = items.find((r) => r.id === id);
      if (hit) return hit;
    }
  }
  return undefined;
}
