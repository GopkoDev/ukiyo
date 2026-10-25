import type { CostStatus, Recording } from "../../../shared/speech";
import type { SpeechPrice } from "../../../shared/speech-models";
import { formatUsdSig } from "../../lib/format";

const micros = (m: number) => formatUsdSig(m / 1_000_000);

/**
 * The estimate next to «Generate speech» (spec AC-11, AC-12): «≈ $x» from billed characters × the per-character
 * price; «Free»; how a model is priced otherwise; «price unknown» — never «$0». `null` before anything is typed.
 */
export function estimateText(price: SpeechPrice, chars: number): string | null {
  switch (price.unit) {
    case "per-character":
      return chars > 0 ? `≈ ${formatUsdSig(chars * price.usdPerChar)}` : null;
    case "free":
      return "Free";
    case "per-output":
      return `priced ${price.outputLabel}`;
    default:
      return "price unknown";
  }
}

/** A model's price in the model list: «$0.08 / 1K chars», «Free», «priced per token», «price unknown». */
export function priceText(price: SpeechPrice): string {
  if (price.unit === "per-character") return `${formatUsdSig(price.usdPerChar * 1000)} / 1K chars`;
  return estimateText(price, 1) ?? "price unknown";
}

/** A recording's cost with its status, the estimate beside it while the real cost is unknown (spec AC-13). */
export function costText(r: Pick<Recording, "costMicros" | "estimateMicros"> & { costStatus: CostStatus }): string {
  if (r.costStatus === "known" && r.costMicros !== null) {
    // «Free» only for a published zero price (estimate 0); a paid model reported at 0 reads $0.00 (review R3)
    if (r.costMicros === 0) return r.estimateMicros === 0 ? "Free" : "$0.00";
    return micros(r.costMicros);
  }
  const estimate = r.estimateMicros !== null && r.estimateMicros > 0 ? ` · ≈ ${micros(r.estimateMicros)}` : "";
  return `cost ${r.costStatus}${estimate}`;
}
