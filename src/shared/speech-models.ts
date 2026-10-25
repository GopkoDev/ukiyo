/**
 * What each speech model accepts (ADR-0040). OpenRouter's catalog publishes voices, prices and sometimes a limit,
 * but no parameters for speech models — so known families are described here, matched by id prefix with per-id
 * overrides. Any other model is offered with voice + text only.
 */

export type ControlKey = "speed" | "stability" | "similarity" | "style" | "speakerBoost" | "instructions";

/** One control the Speech page renders and the request may carry. */
export type Control = {
  key: ControlKey;
  kind: "slider" | "steps" | "switch" | "text";
  label: string;
  min?: number;
  max?: number;
  step?: number;
  steps?: number[];
  stepLabels?: string[];
  default: number | boolean | string;
  lowLabel?: string;
  highLabel?: string;
  maxLength?: number;
};

export type OutputFormat = "mp3" | "pcm";
/** How the adapter maps settings onto the wire: ElevenLabs voice settings go in `provider.options`. */
export type Wire = "elevenlabs" | "standard";
export type OutputLabel = "per second of audio" | "per token";

export type FamilySpec = {
  controls: Control[];
  maxChars?: number;
  format: OutputFormat;
  voice?: "required" | "optional";
  wire: Wire;
  outputLabel?: OutputLabel;
};

export const INSTRUCTIONS_MAX = 1000;
export const DEFAULT_MAX_CHARS = 5000;

const slider = (
  key: ControlKey,
  label: string,
  min: number,
  max: number,
  step: number,
  def: number,
  low: string,
  high: string,
): Control => ({ key, kind: "slider", label, min, max, step, default: def, lowLabel: low, highLabel: high });

const C = {
  elSpeed: slider("speed", "Speed", 0.7, 1.2, 0.01, 1, "Slower", "Faster"),
  stability: slider("stability", "Stability", 0, 1, 0.01, 0.5, "More variable", "More stable"),
  stabilitySteps: {
    key: "stability",
    kind: "steps",
    label: "Stability",
    steps: [0, 0.5, 1],
    stepLabels: ["Creative", "Natural", "Robust"],
    default: 0.5,
    lowLabel: "Creative",
    highLabel: "Robust",
  } satisfies Control,
  similarity: slider("similarity", "Similarity", 0, 1, 0.01, 0.75, "Low", "High"),
  style: slider("style", "Style Exaggeration", 0, 1, 0.01, 0, "None", "Exaggerated"),
  speakerBoost: { key: "speakerBoost", kind: "switch", label: "Speaker Boost", default: true } satisfies Control,
  instructions: {
    key: "instructions",
    kind: "text",
    label: "Delivery instructions",
    default: "",
    maxLength: INSTRUCTIONS_MAX,
  } satisfies Control,
  openAiSpeed: slider("speed", "Speed", 0.25, 4, 0.05, 1, "Slower", "Faster"),
  seedSpeed: slider("speed", "Speed", 0.5, 2, 0.05, 1, "Slower", "Faster"),
};

const EL = (controls: Control[], maxChars: number): Partial<FamilySpec> => ({ controls, maxChars });

/** Families by id prefix — the longest matching prefix wins. */
const FAMILIES: Record<string, FamilySpec> = {
  "elevenlabs/": { controls: [C.stability, C.similarity], format: "mp3", wire: "elevenlabs" },
  "openai/": { controls: [C.openAiSpeed], maxChars: 4096, format: "mp3", wire: "standard" },
  "openai/gpt-4o-mini-tts": {
    controls: [C.openAiSpeed, C.instructions],
    maxChars: 4096,
    format: "mp3",
    wire: "standard",
  },
  "google/gemini-": { controls: [C.instructions], format: "pcm", wire: "standard", outputLabel: "per token" },
  "fish-audio/": { controls: [C.instructions], format: "mp3", voice: "optional", wire: "standard" },
  "heygen/": { controls: [], format: "pcm", wire: "standard" },
  "minimax/": { controls: [], format: "mp3", wire: "standard" },
  "mistralai/voxtral": { controls: [], format: "mp3", wire: "standard" },
  "bytedance-seed/": {
    controls: [C.seedSpeed],
    maxChars: 3000,
    format: "mp3",
    voice: "optional",
    wire: "standard",
    outputLabel: "per second of audio",
  },
};

/** Exact ids — ElevenLabs limits and controls per its model docs (and OpenRouter: speed on Multilingual v2 / Flash). */
const OVERRIDES: Record<string, Partial<FamilySpec>> = {
  "elevenlabs/eleven-v4": EL([C.stability, C.similarity], 10_000),
  "elevenlabs/eleven-v4-turbo": EL([C.stability, C.similarity], 10_000),
  "elevenlabs/eleven-v3": EL([C.stabilitySteps, C.similarity, C.style], 5000),
  "elevenlabs/eleven-v3-conversational": EL([C.stabilitySteps, C.similarity, C.style], 5000),
  "elevenlabs/eleven-multilingual-v2": EL([C.elSpeed, C.stability, C.similarity, C.style, C.speakerBoost], 10_000),
  "elevenlabs/eleven-flash-v2.5": EL([C.elSpeed, C.stability, C.similarity, C.speakerBoost], 40_000),
  "elevenlabs/eleven-flash-v2": EL([C.elSpeed, C.stability, C.similarity, C.speakerBoost], 30_000),
  "elevenlabs/eleven-turbo-v2.5": EL([C.stability, C.similarity, C.speakerBoost], 40_000),
  "elevenlabs/eleven-turbo-v2": EL([C.stability, C.similarity, C.speakerBoost], 30_000),
};

const FALLBACK: FamilySpec = { controls: [], format: "mp3", wire: "standard" };

/** Makers by the id's author segment; ElevenLabs is listed first, the rest alphabetically. */
const MAKERS: Record<string, string> = {
  elevenlabs: "ElevenLabs",
  openai: "OpenAI",
  google: "Google",
  microsoft: "Microsoft",
  "fish-audio": "Fish Audio",
  heygen: "HeyGen",
  minimax: "MiniMax",
  mistralai: "Mistral",
  deepgram: "Deepgram",
  qwen: "Qwen",
  "x-ai": "xAI",
  "bytedance-seed": "ByteDance",
  canopylabs: "Canopy Labs",
  sesame: "Sesame",
  hexgrad: "Hexgrad",
};
const FIRST_MAKER = "ElevenLabs";

export function specFor(id: string): FamilySpec {
  const prefix = Object.keys(FAMILIES)
    .filter((p) => id.startsWith(p))
    .sort((a, b) => b.length - a.length)[0];
  const family = prefix ? FAMILIES[prefix] : undefined;
  return { ...FALLBACK, ...family, ...OVERRIDES[id] };
}

export const controlsFor = (id: string): Control[] => specFor(id).controls;
export const formatFor = (id: string): OutputFormat => specFor(id).format;
export const wireOf = (id: string): Wire => specFor(id).wire;
export const outputLabelFor = (id: string): OutputLabel => specFor(id).outputLabel ?? "per token";

export function makerOf(id: string): string {
  const author = id.split("/")[0] ?? id;
  return MAKERS[author] ?? author.charAt(0).toUpperCase() + author.slice(1);
}

/** Limit precedence (spec AC-09): what Ukiyo knows about the family, then the catalog's stated limit, then 5 000. */
export function maxCharsFor(
  id: string,
  catalogLimit: number | null | undefined,
): { maxChars: number; source: "family" | "catalog" | "default" } {
  const known = specFor(id).maxChars;
  if (known) return { maxChars: known, source: "family" };
  if (catalogLimit && catalogLimit > 0) return { maxChars: catalogLimit, source: "catalog" };
  return { maxChars: DEFAULT_MAX_CHARS, source: "default" };
}

/** A model without listed voices takes the provider's default voice or a typed name. */
export function voiceModeFor(id: string, voices: readonly string[]): "required" | "optional" {
  return specFor(id).voice ?? (voices.length > 0 ? "required" : "optional");
}

export type SpeechPrice =
  | { unit: "per-character"; usdPerChar: number }
  | { unit: "per-output"; outputLabel: OutputLabel }
  | { unit: "free" }
  | { unit: "unknown" };

const usd = (v: string | undefined) => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The catalog's `pricing`: a completion price means billed by output (per second / per token); else per character. */
export function priceFrom(pricing: { prompt?: string; completion?: string } | undefined, id: string): SpeechPrice {
  const prompt = usd(pricing?.prompt);
  const completion = usd(pricing?.completion);
  if (completion !== null && completion > 0) return { unit: "per-output", outputLabel: outputLabelFor(id) };
  if (prompt === null) return { unit: "unknown" };
  return prompt === 0 ? { unit: "free" } : { unit: "per-character", usdPerChar: prompt };
}

/** «ElevenLabs: Eleven v4» → «Eleven v4»; no catalog name → the id. */
export function displayName(catalogName: string | undefined, id: string): string {
  if (!catalogName) return id;
  const at = catalogName.indexOf(": ");
  return at > 0 ? catalogName.slice(at + 2) : catalogName;
}

/** ElevenLabs first, then makers alphabetically; within a maker the catalog order is kept (stable sort). */
export function sortByMaker<M extends { maker: string }>(models: readonly M[]): M[] {
  const rank = (m: string) => (m === FIRST_MAKER ? "" : m.toLowerCase());
  return [...models].sort((a, b) => rank(a.maker).localeCompare(rank(b.maker)));
}
