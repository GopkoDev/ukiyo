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
export type VoiceControl = keyof VoiceSettings;

export type SpeechModel = {
  id: string;
  name: string;
  /** Characters per request the model accepts. */
  maxChars: number;
  /** The voice settings the model supports — an absent control is not sent. */
  controls: readonly VoiceControl[];
  /** Fixed stops for stability (Eleven v3 takes only Creative / Natural / Robust). */
  stabilitySteps?: readonly number[];
};

/** ElevenLabs text-to-speech models (the only audio provider). */
export const SPEECH_MODELS: readonly SpeechModel[] = [
  {
    id: "eleven_multilingual_v2",
    name: "Eleven Multilingual v2",
    maxChars: 10_000,
    controls: ["speed", "stability", "similarity", "style", "speakerBoost"],
  },
  {
    id: "eleven_v3",
    name: "Eleven v3",
    maxChars: 5_000,
    controls: ["stability"],
    stabilitySteps: [0, 0.5, 1],
  },
  {
    id: "eleven_flash_v2_5",
    name: "Eleven Flash v2.5",
    maxChars: 40_000,
    controls: ["speed", "stability", "similarity", "speakerBoost"],
  },
  {
    id: "eleven_turbo_v2_5",
    name: "Eleven Turbo v2.5",
    maxChars: 40_000,
    controls: ["speed", "stability", "similarity", "speakerBoost"],
  },
];

export const DEFAULT_VOICE_SETTINGS: Required<VoiceSettings> = {
  speed: 1,
  stability: 0.5,
  similarity: 0.75,
  style: 0,
  speakerBoost: true,
};

export const speechModel = (id: string) => SPEECH_MODELS.find((m) => m.id === id);

/** Only the settings the model supports, defaults filled in. */
export function settingsFor(model: SpeechModel, settings: VoiceSettings): VoiceSettings {
  return Object.fromEntries(model.controls.map((k) => [k, settings[k] ?? DEFAULT_VOICE_SETTINGS[k]]));
}

export const Voice = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string().nullable(),
  description: z.string().nullable(),
});
export type Voice = z.infer<typeof Voice>;

export const VoicesResponse = z.object({ voices: z.array(Voice) });
export type VoicesResponse = z.infer<typeof VoicesResponse>;

export const CreditsResponse = z.object({ used: z.number().int(), limit: z.number().int() }).nullable();
export type CreditsResponse = z.infer<typeof CreditsResponse>;

export const StartSpeechRequest = z.object({
  text: z.string().trim().min(1, { error: "Enter some text" }).max(40_000),
  model: z.string().min(1).max(100),
  voiceId: z.string().min(1).max(100),
  voiceName: z.string().min(1).max(200),
  settings: VoiceSettings.default({}),
});
export type StartSpeechRequest = z.input<typeof StartSpeechRequest>;

export const AudioGeneration = z.object({
  id: z.string(),
  createdAt: z.string(),
  model: z.string(),
  voiceId: z.string(),
  voiceName: z.string(),
  text: z.string(),
  settings: VoiceSettings,
  mediaType: z.string(),
  characters: z.number().int().nullable(),
  /** Where the browser fetches the audio. */
  url: z.string(),
});
export type AudioGeneration = z.infer<typeof AudioGeneration>;

export const AudioGenerationsResponse = z.object({ items: z.array(AudioGeneration) });
export type AudioGenerationsResponse = z.infer<typeof AudioGenerationsResponse>;
