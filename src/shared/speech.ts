import { z } from "zod";
import { Comment, MAX_TAGS, Tag } from "./curation";
import { type Control as ControlSpec, INSTRUCTIONS_MAX, type SpeechPrice } from "./speech-models";

export const ControlKey = z.enum(["speed", "stability", "similarity", "style", "speakerBoost", "instructions"]);

/** The settings a request may carry; each model accepts only the keys its controls list (ADR-0040). */
export const VoiceSettings = z.strictObject({
  speed: z.number().min(0.25).max(4).optional(),
  stability: z.number().min(0).max(1).optional(),
  similarity: z.number().min(0).max(1).optional(),
  style: z.number().min(0).max(1).optional(),
  speakerBoost: z.boolean().optional(),
  instructions: z.string().max(INSTRUCTIONS_MAX).optional(),
});
export type VoiceSettings = z.infer<typeof VoiceSettings>;

export const Control = z.object({
  key: ControlKey,
  kind: z.enum(["slider", "steps", "switch", "text"]),
  label: z.string(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
  steps: z.array(z.number()).optional(),
  stepLabels: z.array(z.string()).optional(),
  default: z.union([z.number(), z.boolean(), z.string()]),
  lowLabel: z.string().optional(),
  highLabel: z.string().optional(),
  maxLength: z.number().int().optional(),
});

export const SpeechPriceSchema = z.discriminatedUnion("unit", [
  z.object({ unit: z.literal("per-character"), usdPerChar: z.number().nonnegative() }),
  z.object({ unit: z.literal("per-output"), outputLabel: z.enum(["per second of audio", "per token"]) }),
  z.object({ unit: z.literal("free") }),
  z.object({ unit: z.literal("unknown") }),
]);

export const SpeechModel = z.object({
  id: z.string().max(100),
  name: z.string(),
  maker: z.string(),
  maxChars: z.number().int().positive(),
  maxCharsSource: z.enum(["family", "catalog", "default"]),
  voiceMode: z.enum(["required", "optional"]),
  voices: z.array(z.string()),
  price: SpeechPriceSchema,
  controls: z.array(Control),
});
export type SpeechModel = z.infer<typeof SpeechModel>;

export const SpeechModelsResponse = z.object({ models: z.array(SpeechModel), fetchedAt: z.string() });
export type SpeechModelsResponse = z.infer<typeof SpeechModelsResponse>;

/** Longest text any family accepts (ElevenLabs Flash v2.5); the per-model limit is checked by the service. */
export const MAX_TEXT = 40_000;

/** The voice preset a recording is linked to, as a recording shows it (voice-presets ADR-0057). */
export const PresetRef = z.object({ id: z.string(), name: z.string() });
export type PresetRef = z.infer<typeof PresetRef>;

export const StartSpeechRequest = z.object({
  text: z.string().trim().min(1, { error: "Enter some text" }).max(MAX_TEXT),
  model: z.string().min(1).max(100),
  /** Absent or null = the provider's default voice (only for models that list none). */
  voice: z.string().min(1).max(100).nullable().default(null),
  settings: VoiceSettings.default({}),
  /** The applied, unchanged voice preset; linked only when the setup equals it (voice-presets ADR-0058). */
  presetId: z
    .string()
    .regex(/^[0-9A-Z]{26}$/)
    .nullable()
    .default(null),
});
export type StartSpeechRequest = z.input<typeof StartSpeechRequest>;

export const CostStatus = z.enum(["known", "pending", "unavailable"]);
export type CostStatus = z.infer<typeof CostStatus>;
export const AudioMediaType = z.enum(["audio/mpeg", "audio/wav"]);
export type AudioMediaType = z.infer<typeof AudioMediaType>;

export const Recording = z.object({
  id: z.string(),
  createdAt: z.string(),
  provider: z.string(),
  model: z.string(),
  /** The catalog name at save time, else the current catalog's, else the id — a retired model still shows a name. */
  modelName: z.string(),
  /** `null` = the provider's default voice. */
  voice: z.string().nullable(),
  text: z.string(),
  settings: VoiceSettings,
  mediaType: AudioMediaType,
  characters: z.number().int().nonnegative(),
  costMicros: z.number().int().nonnegative().nullable(),
  costStatus: CostStatus,
  /** Up-front estimate, always shown as «≈» (ADR-0043). */
  estimateMicros: z.number().int().nonnegative().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  /** Where the browser fetches the audio. */
  url: z.string(),
  /** The Owner's tags, in the order added (audio-gallery, ADR-0051). */
  tags: z.array(Tag).max(MAX_TAGS),
  /** The Owner's one comment, or none. */
  comment: Comment.nullable(),
  /** The voice preset it was made with (voice-presets AC-04), or none. */
  preset: PresetRef.nullable().default(null),
});
export type Recording = z.infer<typeof Recording>;

export const RecordingPage = z.object({ items: z.array(Recording), nextCursor: z.string().nullable() });
export type RecordingPage = z.infer<typeof RecordingPage>;

/** One speech model's recordings for the model choice and «By model» (audio-gallery, ADR-0051). */
export const RecordingModelGroup = z.object({
  provider: z.string(),
  model: z.string(),
  modelName: z.string(),
  count: z.number().int().positive(),
  latestId: z.string(),
  items: z.array(Recording),
});
export type RecordingModelGroup = z.infer<typeof RecordingModelGroup>;
export const RecordingModelGroupsResponse = z.object({ models: z.array(RecordingModelGroup) });
export type RecordingModelGroupsResponse = z.infer<typeof RecordingModelGroupsResponse>;

/** Billed characters: Unicode code points of the trimmed text, delivery tags included (spec AC-11). */
export const billedChars = (text: string): number => [...text.trim()].length;

const clamp = (v: number, min = -Infinity, max = Infinity) => Math.min(max, Math.max(min, v));
const nearest = (v: number, steps: readonly number[]) =>
  steps.reduce((best, s) => (Math.abs(s - v) < Math.abs(best - v) ? s : best), steps[0] ?? v);

/** Only the settings the model's controls accept: shared values brought into range, defaults filled (AC-08). */
export function settingsFor(controls: readonly ControlSpec[], settings: VoiceSettings): VoiceSettings {
  const out: Record<string, unknown> = {};
  for (const c of controls) {
    const raw = settings[c.key] ?? c.default;
    if (c.kind === "text") {
      const text = String(raw)
        .trim()
        .slice(0, c.maxLength ?? INSTRUCTIONS_MAX);
      if (text) out[c.key] = text;
    } else if (c.kind === "switch") out[c.key] = Boolean(raw);
    else if (c.kind === "steps") out[c.key] = nearest(Number(raw), c.steps ?? []);
    else out[c.key] = clamp(Number(raw), c.min, c.max);
  }
  return out as VoiceSettings;
}

export const defaultSettings = (controls: readonly ControlSpec[]): VoiceSettings => settingsFor(controls, {});

/** Billed characters × the per-character price, in micro-USD; 0 for a free model; `null` when it can't be estimated. */
export function estimateMicros(chars: number, price: SpeechPrice): number | null {
  if (price.unit === "free") return 0;
  if (price.unit !== "per-character") return null;
  return Math.round(chars * price.usdPerChar * 1_000_000);
}
