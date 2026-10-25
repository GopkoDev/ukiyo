import { formatRelative, formatUsdSig } from "@/lib/format";
import type { PresetStats } from "../../../../shared/voice-presets";

/**
 * A preset's total: the sum of its known costs, with what is missing named — «$0.42 + 1 pending · 2 without a price»;
 * «—» for the sum when nothing is known yet, alone only without recordings. Never an unknown cost as $0 (AC-12).
 */
export function presetCostText(s: PresetStats): string {
  if (s.recordings === 0) return "—";
  let text = s.knownCostMicros === null ? "—" : formatUsdSig(s.knownCostMicros / 1_000_000);
  if (s.pending > 0) text += ` + ${s.pending} pending`;
  if (s.unavailable > 0) text += ` · ${s.unavailable} without a price`;
  return text;
}

export const presetCountText = (n: number) => (n === 0 ? "No recordings yet" : `${n} recording${n === 1 ? "" : "s"}`);

/** «Last used 2 h ago» — when its newest existing recording was made; «Never used» without one (AC-11). */
export const presetLastUsedText = (s: PresetStats) =>
  s.lastUsedAt ? `Last used ${formatRelative(s.lastUsedAt)}` : "Never used";
