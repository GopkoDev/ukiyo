import { infiniteQueryOptions, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "@/lib/api";
import type { Recording, RecordingPage } from "../../../../shared/speech";
import { RECORDINGS_KEY } from "../queryKeys";
import { type AudioListView, audioViewKey } from "./audioGalleryView";
import { patchRecordings } from "./patchRecordings";

export const AUDIO_PAGE_SIZE = 24;
const PENDING_REFETCH_MS = 10_000;

/**
 * One audio grid's list (All or one model). The dialog reads the very same cache entry, so both see one list and one
 * in-flight page request; with staleTime ∞ it never refetches by itself — changes invalidate or patch it.
 */
export function audioListOptions(view: AudioListView) {
  return infiniteQueryOptions({
    queryKey: audioViewKey(view),
    queryFn: ({ pageParam }) =>
      api.recordings(pageParam, AUDIO_PAGE_SIZE, view.kind === "model" ? { model: view.model } : undefined),
    initialPageParam: undefined as string | undefined,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: "always",
    getNextPageParam: (last: RecordingPage) => last.nextCursor ?? undefined,
  });
}

/** The model choice and «By model»: one read of the groups with their four latest recordings. */
export const recordingModelsOptions = queryOptions({
  queryKey: [...RECORDINGS_KEY, "models"],
  queryFn: () => api.recordingModels(4),
  staleTime: Number.POSITIVE_INFINITY,
});

/** One recording's detail read; a pending cost is re-read every 10 s until it settles. */
export function useRecording(id: string) {
  return useQuery({
    queryKey: ["recording", id],
    queryFn: () => api.recording(id),
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: "always",
    refetchInterval: (q) => (q.state.data?.costStatus === "pending" ? PENDING_REFETCH_MS : false),
  });
}

/** Mounted for pending cards only: reads only that recording every 10 s and patches it everywhere once settled. */
export function useRecordingPendingCost(r: Recording) {
  const qc = useQueryClient();
  const pending = r.costStatus === "pending";
  const q = useQuery({
    queryKey: ["recording", r.id],
    queryFn: () => api.recording(r.id),
    enabled: pending,
    refetchInterval: pending ? PENDING_REFETCH_MS : false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const settled = q.data && q.data.costStatus !== "pending" ? q.data : undefined;
  useEffect(() => {
    if (settled) patchRecordings(qc, settled.id, { costMicros: settled.costMicros, costStatus: settled.costStatus });
  }, [qc, settled]);
}
