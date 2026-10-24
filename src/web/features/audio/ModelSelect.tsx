import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SpeechModel } from "../../../shared/speech";
import { priceText } from "./speechCost";

const group = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

/** «10 000 chars», or «5 000 chars · limit not published» for the default limit (spec AC-09). */
export const limitText = (m: Pick<SpeechModel, "maxChars" | "maxCharsSource">) =>
  `${group(m.maxChars)} chars${m.maxCharsSource === "default" ? " · limit not published" : ""}`;

/** SCR-02 — every speech model in a popover list grouped by maker (ElevenLabs first), price + limit per row (AC-07). */
export function ModelSelect(props: {
  id: string;
  models: SpeechModel[] | undefined;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = props.models?.find((m) => m.id === props.value);
  const makers = [...new Set(props.models?.map((m) => m.maker) ?? [])];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={props.id} variant="outline" className="w-full justify-between font-normal" disabled={!props.models}>
          <span className="truncate">
            {current ? current.name : props.models ? "Choose a model" : "Loading models…"}
          </span>
          <ChevronDownIcon className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[60vh] w-(--radix-popover-trigger-width) min-w-72 overflow-y-auto p-1"
      >
        <div role="listbox" aria-label="Speech models">
          {makers.map((maker) => (
            <fieldset key={maker} aria-label={maker} className="m-0 min-w-0 border-0 p-0 py-1">
              <legend className="px-2 py-1 font-medium text-muted-foreground text-xs">{maker}</legend>
              {props.models
                ?.filter((m) => m.maker === maker)
                .map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={m.id === props.value}
                    onClick={() => {
                      props.onChange(m.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                      m.id === props.value && "bg-accent",
                    )}
                  >
                    <span className="truncate font-medium">{m.name}</span>
                    <span className="text-muted-foreground text-xs">
                      {priceText(m.price)} · {limitText(m)}
                    </span>
                  </button>
                ))}
            </fieldset>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
