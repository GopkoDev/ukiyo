import type { CostStatus, Recording } from "../../../shared/speech";
import type { RecordingRecord } from "./recordings-repo";

const toMicros = (usd: number) => Math.round(usd * 1_000_000);

/** A stated price is known; a reference means the price is looked up later; neither is unavailable (ADR-0043). */
export function costFromResult(
  costUsd: number | null,
  costRef: string | null,
): { costMicros: number | null; costStatus: CostStatus; costRef: string | null } {
  if (costUsd !== null && Number.isFinite(costUsd) && costUsd >= 0)
    return { costMicros: toMicros(costUsd), costStatus: "known", costRef };
  return costRef
    ? { costMicros: null, costStatus: "pending", costRef }
    : { costMicros: null, costStatus: "unavailable", costRef: null };
}

export const recordingFileUrl = (id: string) => `/api/audio/recordings/${encodeURIComponent(id)}/file`;

/** The browser's view of a recording: no file path, no provider reference. Name: stored → catalog → id (AC-15). */
export function toRecordingDto(r: RecordingRecord, catalogName: string | undefined): Recording {
  return {
    id: r.id,
    createdAt: r.createdAt,
    provider: r.provider,
    model: r.model,
    modelName: r.modelName ?? catalogName ?? r.model,
    voice: r.voice,
    text: r.text,
    settings: r.settings,
    mediaType: r.mediaType,
    characters: r.characters,
    costMicros: r.costMicros,
    costStatus: r.costStatus,
    estimateMicros: r.estimateMicros,
    durationMs: r.durationMs,
    url: recordingFileUrl(r.id),
  };
}

/** «5000» → «5 000», the way the Speech page writes limits. */
export const groupDigits = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");
