import { z } from "zod";

/** Voice settings a text-to-speech request may carry; each model accepts only the ones its `controls` list. */
export const VoiceSettings = z.object({
  speed: z.number().min(0.7).max(1.2).optional(),
  stability: z.number().min(0).max(1).optional(),
  similarity: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  speakerBoost: z.boolean().optional(),
});
export type VoiceSettings = z.infer<typeof VoiceSettings>;
export const VoiceControl = z.enum(["speed", "stability", "similarity", "style", "speakerBoost"]);
export type VoiceControl = z.infer<typeof VoiceControl>;

/** What a model accepts — ElevenLabs model docs + OpenRouter's speech API (speed only on Multilingual v2 and Flash). */
type ModelSpec = { maxChars: number; controls: readonly VoiceControl[]; stabilitySteps?: readonly number[] };

const V4: ModelSpec = { maxChars: 10_000, controls: ["stability", "similarity"] };
const V3: ModelSpec = { maxChars: 5_000, controls: ["stability", "similarity", "style"], stabilitySteps: [0, 0.5, 1] };
const FLASH = (maxChars: number): ModelSpec => ({
  maxChars,
  controls: ["speed", "stability", "similarity", "speakerBoost"],
});
const TURBO = (maxChars: number): ModelSpec => ({ maxChars, controls: ["stability", "similarity", "speakerBoost"] });

/** ElevenLabs text-to-speech models on OpenRouter, in display order. A catalog model missing here gets `FALLBACK_SPEC`. */
export const SPEECH_MODEL_SPECS: Readonly<Record<string, ModelSpec>> = {
  "elevenlabs/eleven-v4": V4,
  "elevenlabs/eleven-v4-turbo": V4,
  "elevenlabs/eleven-v3": V3,
  "elevenlabs/eleven-v3-conversational": V3,
  "elevenlabs/eleven-multilingual-v2": {
    maxChars: 10_000,
    controls: ["speed", "stability", "similarity", "style", "speakerBoost"],
  },
  "elevenlabs/eleven-flash-v2.5": FLASH(40_000),
  "elevenlabs/eleven-flash-v2": FLASH(30_000),
  "elevenlabs/eleven-turbo-v2.5": TURBO(40_000),
  "elevenlabs/eleven-turbo-v2": TURBO(30_000),
};
export const FALLBACK_SPEC: ModelSpec = { maxChars: 5_000, controls: ["stability", "similarity"] };
export const SPEECH_MODEL_PREFIX = "elevenlabs/";

export const SpeechModel = z.object({
  id: z.string(),
  name: z.string(),
  maxChars: z.number().int().positive(),
  controls: z.array(VoiceControl),
  stabilitySteps: z.array(z.number()).optional(),
  /** USD per input character (OpenRouter passes ElevenLabs' price through); `null` = not published. */
  pricePerChar: z.number().nonnegative().nullable(),
  voices: z.array(z.string()),
});
export type SpeechModel = z.infer<typeof SpeechModel>;

export const SpeechModelsResponse = z.object({ models: z.array(SpeechModel) });
export type SpeechModelsResponse = z.infer<typeof SpeechModelsResponse>;

export const DEFAULT_VOICE_SETTINGS: Required<VoiceSettings> = {
  speed: 1,
  stability: 0.5,
  similarity: 0.75,
  style: 0,
  speakerBoost: true,
};

/** Only the settings the model supports, defaults filled in. */
export function settingsFor(model: Pick<SpeechModel, "controls">, settings: VoiceSettings): VoiceSettings {
  return Object.fromEntries(model.controls.map((k) => [k, settings[k] ?? DEFAULT_VOICE_SETTINGS[k]]));
}

/** Billed characters: Unicode code points, audio tags included. */
export const billedChars = (text: string) => [...text].length;

export const CreditsResponse = z.object({ remainingUsd: z.number() }).nullable();
export type CreditsResponse = z.infer<typeof CreditsResponse>;

export const StartSpeechRequest = z.object({
  text: z.string().trim().min(1, { error: "Enter some text" }).max(40_000),
  model: z.string().min(1).max(100),
  voice: z.string().min(1).max(100),
  settings: VoiceSettings.default({}),
});
export type StartSpeechRequest = z.input<typeof StartSpeechRequest>;

export const AudioGeneration = z.object({
  id: z.string(),
  createdAt: z.string(),
  model: z.string(),
  voice: z.string(),
  text: z.string(),
  settings: VoiceSettings,
  mediaType: z.string(),
  characters: z.number().int(),
  /** Characters × the catalog price at generation time, in micro-USD; `null` when no price was published. */
  costMicros: z.number().int().nullable(),
  /** Where the browser fetches the audio. */
  url: z.string(),
});
export type AudioGeneration = z.infer<typeof AudioGeneration>;

export const AudioGenerationsResponse = z.object({ items: z.array(AudioGeneration) });
export type AudioGenerationsResponse = z.infer<typeof AudioGenerationsResponse>;
