import type { VoiceSettings } from "../../../../shared/speech";

const NUM: { key: keyof VoiceSettings; label: string }[] = [
  { key: "speed", label: "speed" },
  { key: "stability", label: "stability" },
  { key: "similarity", label: "similarity" },
  { key: "style", label: "style" },
];

/** One short label per recorded setting, defaults included (audio-gallery AC-01): «speed 1.1», «speaker boost». */
export function settingsLabels(s: VoiceSettings): string[] {
  const out: string[] = [];
  for (const { key, label } of NUM) {
    const v = s[key];
    if (typeof v === "number") out.push(`${label} ${Number(v.toFixed(2))}`);
  }
  if (s.speakerBoost !== undefined) out.push(s.speakerBoost ? "speaker boost" : "speaker boost off");
  if (s.instructions) out.push("instructions");
  return out;
}
