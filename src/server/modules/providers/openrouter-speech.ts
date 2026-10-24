import { z } from "zod";
import type { CreditsResponse, SpeechModel } from "../../../shared/speech";
import {
  displayName,
  formatFor,
  makerOf,
  maxCharsFor,
  priceFrom,
  sortByMaker,
  specFor,
  voiceModeFor,
  wireOf,
} from "../../../shared/speech-models";
import { type CostLookup, ProviderError } from "./port";
import type { SpeechInput, SpeechProvider, SpeechResult } from "./speech-port";

const BASE = "https://openrouter.ai/api/v1";

// Tolerant shapes: unknown keys pass through, so additive API changes don't break parsing.
const Catalog = z.looseObject({
  data: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string().optional(),
      context_length: z.number().nullish(),
      pricing: z.looseObject({ prompt: z.string().optional(), completion: z.string().optional() }).optional(),
      supported_voices: z.array(z.string()).nullish(),
    }),
  ),
});
const Credits = z.looseObject({ data: z.looseObject({ total_credits: z.number(), total_usage: z.number() }) });
const Lookup = z.looseObject({ data: z.looseObject({ total_cost: z.unknown() }) });
const ErrorBody = z.looseObject({
  error: z.looseObject({
    message: z.string(),
    metadata: z.looseObject({ reasons: z.array(z.string()).optional() }).nullish(),
  }),
});

/** OpenRouter's `/audio/speech` behind the speech port (ADR-0039): plain fetch, the key stays in this closure. */
export function createOpenRouterSpeech(opts: { apiKey: string | undefined; fetch: typeof fetch }): SpeechProvider {
  const fail = (status: number | null, message: string) => new ProviderError("openrouter", status, message);

  async function call(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<Response> {
    const { auth = true, ...rest } = init;
    if (auth && !opts.apiKey) throw fail(null, "OpenRouter is not configured");
    const headers = new Headers(rest.headers);
    if (auth) headers.set("authorization", `Bearer ${opts.apiKey}`);
    let res: Response;
    try {
      res = await opts.fetch(`${BASE}${path}`, { ...rest, headers });
    } catch (err) {
      if (rest.signal?.aborted) throw fail(null, "The provider did not answer in time");
      throw fail(null, `Couldn't reach OpenRouter: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!res.ok) {
      const parsed = ErrorBody.safeParse(await res.json().catch(() => null));
      const reasons = parsed.success ? parsed.data.error.metadata?.reasons : undefined;
      const message = parsed.success ? parsed.data.error.message : `OpenRouter answered with status ${res.status}`;
      throw fail(res.status, reasons?.length ? `${message} (${reasons.join(", ")})` : message);
    }
    return res;
  }

  /** Request body per family (ADR-0040): only the accepted settings, ElevenLabs voice settings in provider options. */
  function bodyFor(input: SpeechInput) {
    const { model, settings } = input;
    const accepted = new Set(specFor(model.id).controls.map((c) => c.key));
    const has = (k: keyof typeof settings) => accepted.has(k) && settings[k] !== undefined;
    const body: Record<string, unknown> = {
      model: model.id,
      input: input.text,
      ...(input.voice ? { voice: input.voice } : {}),
      response_format: formatFor(model.id),
      ...(has("speed") ? { speed: settings.speed } : {}),
      ...(has("instructions") ? { instructions: settings.instructions } : {}),
    };
    if (wireOf(model.id) === "elevenlabs") {
      const voiceSettings = {
        ...(has("stability") ? { stability: settings.stability } : {}),
        ...(has("similarity") ? { similarity_boost: settings.similarity } : {}),
        ...(has("style") ? { style: settings.style } : {}),
        ...(has("speakerBoost") ? { use_speaker_boost: settings.speakerBoost } : {}),
      };
      if (Object.keys(voiceSettings).length)
        body.provider = { options: { elevenlabs: { voice_settings: voiceSettings } } };
    }
    return body;
  }

  return {
    id: "openrouter",
    name: "OpenRouter",
    configured: Boolean(opts.apiKey),

    async listModels(signal) {
      const res = await call("/models?output_modalities=speech", { auth: false, signal });
      const parsed = Catalog.safeParse(await res.json().catch(() => null));
      if (!parsed.success) throw fail(res.status, "OpenRouter returned an unexpected speech model list");
      const models: SpeechModel[] = parsed.data.data.map((m) => {
        const voices = m.supported_voices ?? [];
        const limit = maxCharsFor(m.id, m.context_length);
        return {
          id: m.id,
          name: displayName(m.name, m.id),
          maker: makerOf(m.id),
          maxChars: limit.maxChars,
          maxCharsSource: limit.source,
          voiceMode: voiceModeFor(m.id, voices),
          voices,
          price: priceFrom(m.pricing, m.id),
          controls: specFor(m.id).controls,
        };
      });
      return sortByMaker(models);
    },

    async speak(input, signal): Promise<SpeechResult> {
      const res = await call("/audio/speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(bodyFor(input)),
        signal,
      });
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await res.arrayBuffer());
      } catch {
        throw fail(res.status, signal.aborted ? "The provider did not answer in time" : "The audio could not be read");
      }
      if (bytes.length === 0) throw fail(res.status, "The provider returned no audio");
      return {
        bytes,
        mediaType: res.headers.get("content-type")?.replace(/\s+/g, "") || "audio/mpeg",
        costUsd: null, // the speech answer is raw audio — it never states a price
        costRef: res.headers.get("x-generation-id"),
      };
    },

    async credits(signal): Promise<CreditsResponse> {
      try {
        const { data } = Credits.parse(await (await call("/credits", { signal })).json());
        return { remainingUsd: data.total_credits - data.total_usage };
      } catch (err) {
        if (err instanceof ProviderError && err.upstreamStatus === null && !opts.apiKey) throw err;
        return null;
      }
    },

    /** One price lookup (ADR-0043). Not found yet, throttling, server or network trouble → try again later. */
    async lookupCost(costRef, signal): Promise<CostLookup> {
      if (!opts.apiKey) return { status: "unavailable" };
      let body: unknown;
      try {
        body = await (await call(`/generation?id=${encodeURIComponent(costRef)}`, { signal })).json();
      } catch (err) {
        const status = err instanceof ProviderError ? err.upstreamStatus : null;
        const retry = status === null || status === 404 || status === 408 || status === 429 || status >= 500;
        return retry ? { status: "not-yet" } : { status: "unavailable" };
      }
      const usd = Lookup.safeParse(body).data?.data.total_cost;
      if (typeof usd !== "number" || !Number.isFinite(usd) || usd < 0) return { status: "unavailable" };
      return { status: "known", costUsd: usd };
    },
  };
}
