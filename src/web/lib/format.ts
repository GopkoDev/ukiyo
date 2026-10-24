import type { CostStatus } from "../../shared/generations";

/** micro-USD → `$0.04` / `$0.000125`; an unknown price is shown as its status, never as `$0`. */
export function formatCost(micros: number | null, status: CostStatus): string {
  if (status !== "known" || micros === null) return status;
  const fixed = (micros / 1e6).toFixed(6).replace(/0+$/, "");
  const [whole, frac = ""] = fixed.split(".");
  return `$${whole}.${frac.padEnd(2, "0")}`;
}

/** Cost badge on a gallery card: the amount when known, otherwise «cost pending» / «cost unavailable» — never `$0`. */
export function formatCostBadge(micros: number | null, status: CostStatus): string {
  return status === "known" && micros !== null ? formatCost(micros, status) : `cost ${status}`;
}

/**
 * USD with two significant digits («$0.0012», «$0.041», «$0.72»; two decimals from $1) — speech prices and costs
 * (text-to-speech spec AC-11). A non-zero amount below $0.0001 is «< $0.0001», never «$0».
 */
export function formatUsdSig(usd: number): string {
  if (usd > 0 && usd < 0.0001) return "< $0.0001";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  const [whole, frac = ""] = String(Number(usd.toPrecision(2))).split(".");
  return `$${whole}.${frac.padEnd(2, "0")}`;
}

/** `1024×1024` (× = U+00D7). */
export function formatSize(width: number, height: number): string {
  return `${width}\u00d7${height}`;
}

/** «N images» when more than one came back, «R of Q images» when fewer than requested, otherwise null. */
export function formatCount(received: number, requested: number): string | null {
  if (received < requested) return `${received} of ${requested} images`;
  return received > 1 ? `${received} images` : null;
}

export function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const s = Math.round((now - Date.parse(iso)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return iso.slice(0, 10);
}

export function formatDateTime(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
}

/** A short label from a long text (e.g. a prompt as an image's alt text): ~80 characters, then «…». */
export function excerpt(text: string, max = 80): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
