import type { RequestedParams } from "../../../shared/generations";
import type { ModelPrice } from "../../../shared/pricing";
import type { ImageModel, ProviderId } from "../../../shared/providers";
import type { SniffedImage } from "./image-sniff";

/** An input image the Owner attached, already validated (usable picture, size limit). */
export type InputImageData = { bytes: Uint8Array; mediaType: string };

export type GenerateInput = { model: string; prompt: string; params: RequestedParams; inputs?: InputImageData[] };

/** A decoded, validated («usable») output image. */
export type ProviderImage = SniffedImage & { bytes: Uint8Array };

/**
 * The normalized result every adapter returns (ADR-0004). The raw exchange is already redacted
 * (ADR-0008): no credentials, and each image payload replaced by `{ "$image": <position> }`.
 */
export type GenerationResult = {
  images: ProviderImage[];
  /** Price in USD as the provider stated it; `null` when the answer carried none. */
  costUsd: number | null;
  /**
   * The provider's reference for looking up the price later (ADR-0013), when the answer carried no price.
   * Absent / `null` for providers that always state the price or never report it.
   */
  costRef?: string | null;
  /** Parameters the provider reports it applied; `null` = not reported. */
  acceptedParams: Record<string, unknown> | null;
  rawRequest: unknown;
  rawResponse: unknown;
};

export class ProviderError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly upstreamStatus: number | null,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

/** Outcome of one later price lookup (ADR-0013). */
export type CostLookup = { status: "known"; costUsd: number } | { status: "not-yet" } | { status: "unavailable" };

export interface ImageProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly configured: boolean;
  listModels(signal?: AbortSignal): Promise<ImageModel[]>;
  /** Throws `ProviderError` on refusal, failure, timeout (signal aborted) or zero usable images. */
  generate(input: GenerateInput, signal: AbortSignal): Promise<GenerationResult>;
  /** Optional: look up a deferred price by the result's `costRef`. Adapters without it never yield `pending`. */
  lookupCost?(costRef: string, signal: AbortSignal): Promise<CostLookup>;
  /**
   * Optional: the model's published price, from a public source (no key — ADR-0020). Adapters without it
   * mean «price unknown». Throws `ProviderError` when the price can't be loaded.
   */
  priceOf?(modelId: string, signal?: AbortSignal): Promise<ModelPrice>;
  /**
   * Optional: the account's remaining credit in USD as the provider reports it (ADR-0055). Throws `ProviderError`
   * when it can't be read or isn't a finite number. Adapters without it have no balance («—»).
   */
  balance?(signal: AbortSignal): Promise<number>;
}
