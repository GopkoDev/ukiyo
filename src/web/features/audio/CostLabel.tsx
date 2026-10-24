import { cn } from "@/lib/utils";
import type { CostStatus } from "../../../shared/speech";
import { costText } from "./speechCost";

const TITLE: Record<CostStatus, string | undefined> = {
  known: undefined,
  pending: "Waiting for the provider to report the cost",
  unavailable: "The provider didn't report this recording's cost; ≈ is the estimate",
};

/** SCR-03/SCR-04 — a recording's cost: the amount when known, else its status with «≈ estimate» (spec AC-13). */
export function CostLabel(props: {
  costStatus: CostStatus;
  costMicros: number | null;
  estimateMicros: number | null;
  className?: string;
}) {
  return (
    <span
      className={cn("tabular-nums", props.costStatus !== "known" && "text-muted-foreground", props.className)}
      title={TITLE[props.costStatus]}
    >
      {costText(props)}
    </span>
  );
}
