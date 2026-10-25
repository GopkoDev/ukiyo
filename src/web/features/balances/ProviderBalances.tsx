import { Coins } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ProviderId } from "../../../shared/providers";
import { balanceText, useProviderBalance, useProviders } from "./balances";

function Line({ id, name }: { id: ProviderId; name: string }) {
  const q = useProviderBalance(id);
  const text = balanceText(q);
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="truncate">{name}</span>
      {text === "—" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span role="img" className="tabular-nums" aria-label={`${name}: balance unavailable`}>
              —
            </span>
          </TooltipTrigger>
          <TooltipContent>Balance unavailable</TooltipContent>
        </Tooltip>
      ) : (
        <span className="tabular-nums">{text}</span>
      )}
    </li>
  );
}

/** SCR-04 — each configured provider's remaining credit in the navigation bar, on every page (spec AC-11, AC-12). */
export function ProviderBalances() {
  const providers = useProviders();
  const configured = providers.data?.providers.filter((p) => p.configured) ?? [];
  if (configured.length === 0) return null;
  return (
    <section
      aria-label="Provider balances"
      className="px-2 text-sidebar-foreground/80 text-xs group-data-[collapsible=icon]:hidden"
    >
      <h3 className="mb-1 flex items-center gap-1.5 font-medium text-sidebar-foreground/70">
        <Coins className="size-3.5" aria-hidden />
        Balance
      </h3>
      <ul className="flex flex-col gap-0.5">
        {configured.map((p) => (
          <Line key={p.id} id={p.id} name={p.name} />
        ))}
      </ul>
    </section>
  );
}
