import type { CostStatus, Recording, SpeechModel } from "../../../shared/speech";
import { AppError } from "../../lib/errors";
import type { RecordingCuration, RecordingRecord } from "./repo";

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

const NO_CURATION: RecordingCuration = { tags: [], comment: null };

/**
 * The browser's view of a recording: no file path, no provider reference. `modelName` is the model's one display
 * name (stored → last catalog read → id, ADR-0052); a fresh recording passes its own.
 */
export function toRecordingDto(
  r: RecordingRecord,
  displayName: string | undefined,
  curation: RecordingCuration = NO_CURATION,
): Recording {
  return {
    id: r.id,
    createdAt: r.createdAt,
    provider: r.provider,
    model: r.model,
    modelName: displayName ?? r.modelName ?? r.model,
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
    tags: curation.tags,
    comment: curation.comment,
  };
}

/** «5000» → «5 000», the way the Speech page writes limits. */
export const groupDigits = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

/** A voice the model takes: required-voice models need one of their own voices; others take any or none. */
export function checkVoice(model: SpeechModel, voice: string | null): void {
  if (voice === null && model.voiceMode === "required")
    throw new AppError("VALIDATION_ERROR", "Choose a voice", 400, { fields: { voice: "Choose a voice" } });
  if (voice !== null && model.voiceMode === "required" && !model.voices.includes(voice))
    throw new AppError("VALIDATION_ERROR", `${model.name} doesn't offer the voice «${voice}»`, 400, {
      fields: { voice: "Choose one of this model's voices" },
    });
}
