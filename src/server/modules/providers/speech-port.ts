import type { CreditsResponse, SpeechModel, VoiceSettings } from "../../../shared/speech";
import type { CostLookup } from "./port";

/** One text-to-speech request, already validated against the model (only its accepted settings, ADR-0040). */
export type SpeechInput = { model: SpeechModel; text: string; voice: string | null; settings: VoiceSettings };

/**
 * The audio exactly as the provider answered (ADR-0041 — the service makes raw PCM playable), with the price
 * when the answer stated one and the reference for looking it up later (ADR-0043).
 */
export type SpeechResult = { bytes: Uint8Array; mediaType: string; costUsd: number | null; costRef: string | null };

/** A speech provider behind its own port, next to `ImageProvider` (ADR-0039). Throws `ProviderError`. */
export interface SpeechProvider {
  readonly id: string;
  readonly name: string;
  readonly configured: boolean;
  listModels(signal?: AbortSignal): Promise<SpeechModel[]>;
  speak(input: SpeechInput, signal: AbortSignal): Promise<SpeechResult>;
  /** Remaining balance; `null` when the key may not read it. */
  credits(signal?: AbortSignal): Promise<CreditsResponse>;
  lookupCost(costRef: string, signal: AbortSignal): Promise<CostLookup>;
}

export type SpeechRegistry = { list(): SpeechProvider[]; get(id: string): SpeechProvider | undefined };

export function speechRegistryOf(providers: SpeechProvider[]): SpeechRegistry {
  const byId = new Map(providers.map((p) => [p.id, p]));
  return { list: () => [...byId.values()], get: (id) => byId.get(id) };
}
