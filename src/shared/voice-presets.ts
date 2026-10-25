import { z } from "zod";
import { type SpeechModel, settingsFor, VoiceSettings } from "./speech";

// Voice presets (spec voice-presets): rules shared by the Speech page and the server (sad.md §4 items 2–3, ADR-0058).
export const MAX_PRESET_NAME = 60;

/** Characters as the Owner sees them: grapheme clusters, so «é» written as e + accent and emoji sequences count once. */
const graphemes = (s: string) => {
  let n = 0;
  for (const _ of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(s)) n++;
  return n;
};

/** Trimmed, 1–60 characters as seen (spec AC-02). Uniqueness is the server's check. */
export function checkPresetName(raw: string): { ok: true; name: string } | { ok: false; message: string } {
  const name = raw.normalize("NFC").trim();
  if (name.length === 0) return { ok: false, message: "Enter a name" };
  if (graphemes(name) > MAX_PRESET_NAME) return { ok: false, message: `At most ${MAX_PRESET_NAME} characters` };
  return { ok: true, name };
}

/** The key names are unique by: lower-cased in any alphabet («Диктор» = «диктор»), unlike SQLite's ASCII `lower()`. */
export const presetNameKey = (name: string) => name.normalize("NFC").trim().toLowerCase().normalize("NFC");

export const duplicateNameMessage = (name: string) => `A voice named «${name}» already exists`;

/** What a preset holds and a request sends: the speech model, the voice (`null` = provider default) and settings. */
export type PresetSetup = { model: string; voice: string | null; settings: VoiceSettings };

const canonical = (v: unknown): unknown =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .filter(([, x]) => x !== undefined)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([k, x]) => [k, canonical(x)]),
      )
    : v;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/**
 * True when `setup`, as `model` would send it, equals the preset exactly (spec AC-05, ADR-0058): same model id, same
 * voice (`null` only equals `null`), and the model's accepted settings — defaults filled, instructions trimmed — equal
 * to the preset's stored ones. A stored setting the model no longer accepts is a difference (AC-10).
 */
export function presetMatches(preset: PresetSetup, setup: PresetSetup, model: SpeechModel): boolean {
  if (preset.model !== model.id || setup.model !== model.id) return false;
  if (preset.voice !== setup.voice) return false;
  return sameJson(preset.settings, settingsFor(model.controls, setup.settings));
}

/**
 * Whether a preset can be applied now (spec AC-09): `loading` without a model list, `retired` when its model is no
 * longer offered or a model with a voice list no longer lists its voice, else `ok`.
 */
export function presetAvailability(
  preset: Pick<PresetSetup, "model" | "voice">,
  models: readonly SpeechModel[] | undefined,
): "ok" | "retired" | "loading" {
  if (!models) return "loading";
  const m = models.find((x) => x.id === preset.model);
  if (!m) return "retired";
  if (preset.voice !== null && m.voices.length > 0 && !m.voices.includes(preset.voice)) return "retired";
  return "ok";
}

export const PresetStats = z.object({
  recordings: z.number().int().nonnegative(),
  /** Sum of the known costs; `null` = no recording has a known cost (spec AC-12). */
  knownCostMicros: z.number().int().nonnegative().nullable(),
  pending: z.number().int().nonnegative(),
  unavailable: z.number().int().nonnegative(),
  /** When the newest linked recording was made; `null` = never used. */
  lastUsedAt: z.string().nullable(),
});
export type PresetStats = z.infer<typeof PresetStats>;

export const VoicePreset = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  model: z.string(),
  /** The catalog name at the last save — shown when the model is no longer offered. */
  modelName: z.string(),
  voice: z.string().nullable(),
  settings: VoiceSettings,
  createdAt: z.string(),
  updatedAt: z.string(),
  stats: PresetStats,
});
export type VoicePreset = z.infer<typeof VoicePreset>;

export const VoicePresetsResponse = z.object({ presets: z.array(VoicePreset) });
export type VoicePresetsResponse = z.infer<typeof VoicePresetsResponse>;

const SetupFields = {
  model: z.string().min(1).max(100),
  voice: z.string().min(1).max(100).nullable().default(null),
  settings: VoiceSettings.default({}),
};

export const CreatePresetRequest = z.object({ name: z.string({ error: "Enter a name" }).max(1000), ...SetupFields });
export type CreatePresetRequest = z.input<typeof CreatePresetRequest>;

/** A rename (`name`), a setup replacement (`model` + optional `voice`, `settings`), or both. */
export const UpdatePresetRequest = z
  .strictObject({
    name: z.string().max(1000).optional(),
    model: z.string().min(1).max(100).optional(),
    voice: z.string().min(1).max(100).nullable().optional(),
    settings: VoiceSettings.optional(),
  })
  .refine((b) => b.name !== undefined || b.model !== undefined, { error: "Nothing to change" })
  .refine((b) => b.model !== undefined || (b.voice === undefined && b.settings === undefined), {
    error: "A voice or settings need the model",
    path: ["model"],
  });
export type UpdatePresetRequest = z.input<typeof UpdatePresetRequest>;

/** The preset a recording is linked to, as a recording shows it. */
export const PresetRef = z.object({ id: z.string(), name: z.string() });
export type PresetRef = z.infer<typeof PresetRef>;
