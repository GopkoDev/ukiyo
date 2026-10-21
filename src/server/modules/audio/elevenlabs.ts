import { z } from "zod";
import type { CreditsResponse, SpeechModel, Voice, VoiceSettings } from "../../../shared/audio";
import { AppError } from "../../lib/errors";

const BASE = "https://api.elevenlabs.io";
const OUTPUT_FORMAT = "mp3_44100_128";

const VoicesBody = z.object({
  voices: z.array(
    z.object({
      voice_id: z.string(),
      name: z.string(),
      category: z.string().nullish(),
      description: z.string().nullish(),
      labels: z.record(z.string(), z.string().nullish()).nullish(),
    }),
  ),
});

const SubscriptionBody = z.object({ character_count: z.number(), character_limit: z.number() });

export type SpeechResult = { bytes: Uint8Array; mediaType: string; characters: number | null };

/** Plain-fetch ElevenLabs client (no vendor SDK). The key never leaves the server. */
export function createElevenLabs(apiKey: string | undefined, fetchImpl: typeof fetch = fetch, timeoutMs = 180_000) {
  function requireKey(): string {
    if (!apiKey)
      throw new AppError("PROVIDER_NOT_CONFIGURED", "ElevenLabs is not configured — set ELEVENLABS_API_KEY", 409, {
        provider: "elevenlabs",
      });
    return apiKey;
  }

  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const key = requireKey();
    let res: Response;
    try {
      res = await fetchImpl(`${BASE}${path}`, {
        ...init,
        headers: { ...init.headers, "xi-api-key": key },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === "TimeoutError";
      throw new AppError("PROVIDER_ERROR", timedOut ? "ElevenLabs timed out" : "Couldn't reach ElevenLabs", 502, {
        provider: "elevenlabs",
        upstreamStatus: null,
      });
    }
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      throw new AppError("PROVIDER_ERROR", upstreamMessage(body) ?? `ElevenLabs answered ${res.status}`, 502, {
        provider: "elevenlabs",
        upstreamStatus: res.status,
      });
    }
    return res;
  }

  return {
    configured: Boolean(apiKey),

    async voices(): Promise<Voice[]> {
      const body = VoicesBody.parse(await (await call("/v1/voices")).json());
      return body.voices
        .map((v) => ({
          id: v.voice_id,
          name: v.name,
          category: v.category ?? null,
          description: v.labels?.use_case ?? v.labels?.descriptive ?? v.description ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    /** Character quota of the key's subscription; `null` when the key may not read it. */
    async credits(): Promise<CreditsResponse> {
      try {
        const body = SubscriptionBody.parse(await (await call("/v1/user/subscription")).json());
        return { used: body.character_count, limit: body.character_limit };
      } catch (err) {
        if (err instanceof AppError && err.code === "PROVIDER_NOT_CONFIGURED") throw err;
        return null;
      }
    },

    async speak(input: {
      text: string;
      model: SpeechModel;
      voiceId: string;
      settings: VoiceSettings;
    }): Promise<SpeechResult> {
      const s = input.settings;
      const res = await call(`/v1/text-to-speech/${encodeURIComponent(input.voiceId)}?output_format=${OUTPUT_FORMAT}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify({
          text: input.text,
          model_id: input.model.id,
          voice_settings: {
            stability: s.stability,
            similarity_boost: s.similarity,
            style: s.style,
            use_speaker_boost: s.speakerBoost,
            speed: s.speed,
          },
        }),
      });
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length === 0)
        throw new AppError("PROVIDER_ERROR", "ElevenLabs returned no audio", 502, {
          provider: "elevenlabs",
          upstreamStatus: res.status,
        });
      const count = Number(res.headers.get("character-cost") ?? res.headers.get("x-character-count") ?? Number.NaN);
      return {
        bytes,
        mediaType: res.headers.get("content-type")?.split(";")[0] || "audio/mpeg",
        characters: Number.isFinite(count) ? count : null,
      };
    },
  };
}

export type ElevenLabs = ReturnType<typeof createElevenLabs>;

/** ElevenLabs errors come as `{ detail: { message } }` or `{ detail: "..." }`. */
function upstreamMessage(body: unknown): string | null {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  const message = (detail as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : null;
}
