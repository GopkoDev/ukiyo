import { z } from "zod";
import {
  type CreditsResponse,
  FALLBACK_SPEC,
  SPEECH_MODEL_PREFIX,
  SPEECH_MODEL_SPECS,
  type SpeechModel,
  type VoiceSettings,
} from "../../../shared/audio";
import { AppError } from "../../lib/errors";

const BASE = "https://openrouter.ai/api/v1";

// Tolerant shapes: unknown keys pass through, so additive API changes don't break parsing.
const Catalog = z.looseObject({
  data: z.array(
    z.looseObject({
      id: z.string(),
      name: z.string().optional(),
      pricing: z.looseObject({ prompt: z.string().optional() }).optional(),
      supported_voices: z.array(z.string()).nullish(),
    }),
  ),
});
const Credits = z.looseObject({ data: z.looseObject({ total_credits: z.number(), total_usage: z.number() }) });
const ErrorBody = z.looseObject({ error: z.looseObject({ message: z.string() }) });

export type SpeechResult = { bytes: Uint8Array; mediaType: string; generationId: string | null };

const order = Object.keys(SPEECH_MODEL_SPECS);
const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);

/** ElevenLabs text-to-speech through OpenRouter's `/audio/speech` (plain fetch, no SDK). The key stays on the server. */
export function createOpenRouterSpeech(
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 180_000,
) {
  const fail = (status: number | null, message: string) =>
    new AppError("PROVIDER_ERROR", message, 502, { provider: "openrouter", upstreamStatus: status });

  function requireKey(): string {
    if (!apiKey)
      throw new AppError("PROVIDER_NOT_CONFIGURED", "OpenRouter is not configured — set OPENROUTER_API_KEY", 409, {
        provider: "openrouter",
      });
    return apiKey;
  }

  async function call(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
    const headers = auth ? { ...init.headers, authorization: `Bearer ${requireKey()}` } : init.headers;
    let res: Response;
    try {
      res = await fetchImpl(`${BASE}${path}`, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      throw fail(null, timedOut ? "The provider did not answer in time" : "Couldn't reach OpenRouter");
    }
    if (!res.ok) {
      const body = ErrorBody.safeParse(await res.json().catch(() => null));
      throw fail(res.status, body.success ? body.data.error.message : `OpenRouter answered ${res.status}`);
    }
    return res;
  }

  return {
    /** The ElevenLabs speech models OpenRouter offers now, with their published per-character price and voices. */
    async models(): Promise<SpeechModel[]> {
      const body = Catalog.parse(await (await call("/models?output_modalities=speech", {}, false)).json());
      return body.data
        .filter((m) => m.id.startsWith(SPEECH_MODEL_PREFIX))
        .map((m) => {
          const spec = SPEECH_MODEL_SPECS[m.id] ?? FALLBACK_SPEC;
          const price = Number(m.pricing?.prompt);
          return {
            id: m.id,
            name: (m.name ?? m.id).replace(/^ElevenLabs:\s*/, ""),
            maxChars: spec.maxChars,
            controls: [...spec.controls],
            ...(spec.stabilitySteps ? { stabilitySteps: [...spec.stabilitySteps] } : {}),
            pricePerChar: Number.isFinite(price) && price >= 0 ? price : null,
            voices: m.supported_voices ?? [],
          };
        })
        .sort((a, b) => rank(a.id) - rank(b.id));
    },

    /** Remaining OpenRouter balance; `null` when the key may not read it. */
    async credits(): Promise<CreditsResponse> {
      try {
        const { data } = Credits.parse(await (await call("/credits")).json());
        return { remainingUsd: data.total_credits - data.total_usage };
      } catch (err) {
        if (err instanceof AppError && err.code === "PROVIDER_NOT_CONFIGURED") throw err;
        return null;
      }
    },

    async speak(input: {
      text: string;
      model: SpeechModel;
      voice: string;
      settings: VoiceSettings;
    }): Promise<SpeechResult> {
      const { speed, stability, similarity, style, speakerBoost } = input.settings;
      const res = await call("/audio/speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: input.model.id,
          input: input.text,
          voice: input.voice,
          response_format: "mp3",
          ...(speed !== undefined ? { speed } : {}),
          provider: {
            options: {
              elevenlabs: {
                voice_settings: {
                  stability,
                  similarity_boost: similarity,
                  style,
                  use_speaker_boost: speakerBoost,
                },
              },
            },
          },
        }),
      });
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0) throw fail(res.status, "The provider returned no audio");
      return {
        bytes,
        mediaType: res.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
        generationId: res.headers.get("x-generation-id"),
      };
    },
  };
}

export type OpenRouterSpeech = ReturnType<typeof createOpenRouterSpeech>;
