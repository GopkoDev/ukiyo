import type { QueryClient } from "@tanstack/react-query";
import type { Recording } from "../../../../shared/speech";
import { RECORDINGS_KEY } from "../queryKeys";

type Page = { items: Recording[]; nextCursor: string | null };
type Pages = { pages: Page[]; pageParams: unknown[] };
type Group = { count: number; items: Recording[] } & Record<string, unknown>;
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

/**
 * Updates (or removes) one recording in every cached recordings view by data shape — gallery pages, the Speech
 * page's recent list, model groups (counts follow a removal; an empty group goes) — and its own detail entry.
 * No page is re-read (audio-gallery §8, the image precedent ADR-0034).
 */
export function patchRecordings(qc: QueryClient, id: string, patch: Partial<Recording> | "remove") {
  for (const [key, data] of qc.getQueriesData({ queryKey: RECORDINGS_KEY })) {
    if (isPages(data)) {
      qc.setQueryData(key, { ...data, pages: data.pages.map((p) => ({ ...p, items: apply(p.items, id, patch) })) });
    } else if (isGroups(data)) {
      const models = data.models
        .map((g) => {
          const items = apply(g.items, id, patch);
          return { ...g, items, count: patch === "remove" && items.length < g.items.length ? g.count - 1 : g.count };
        })
        .filter((g) => g.count > 0);
      qc.setQueryData(key, { ...data, models });
    } else if (isPage(data)) {
      qc.setQueryData(key, { ...data, items: apply(data.items, id, patch) });
    }
  }
  if (patch === "remove") qc.removeQueries({ queryKey: ["recording", id] });
  else qc.setQueryData<Recording>(["recording", id], (old) => (old ? { ...old, ...patch } : old));
}
