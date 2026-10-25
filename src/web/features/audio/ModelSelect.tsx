import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ModelPreference } from "../../../shared/models";
import type { SpeechModel } from "../../../shared/speech";
import { arrangeSpeechModels } from "./speechArrange";
import { priceText } from "./speechCost";

const group = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

/** «10 000 chars», or «5 000 chars · limit not published» for the default limit (spec AC-09). */
export const limitText = (m: Pick<SpeechModel, "maxChars" | "maxCharsSource">) =>
  `${group(m.maxChars)} chars${m.maxCharsSource === "default" ? " · limit not published" : ""}`;

/**
 * SCR-02 — every speech model in a popover list grouped by maker (ElevenLabs first), price + limit per row (AC-07);
 * the Owner's favorites first and hidden models left out (models-page-audio AC-03, AC-04).
 */
export function ModelSelect(props: {
  id: string;
  models: SpeechModel[] | undefined;
  /** Speech-model preferences; `null` / absent = unreadable or none → the plain list. */
  prefs?: ModelPreference[] | null;
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = props.models?.find((m) => m.id === props.value);
  const arranged = arrangeSpeechModels(props.models ?? [], props.prefs, props.value);
  const groups = [
    ...(arranged.favorites.length > 0
      ? [{ label: "Favorites", models: arranged.favorites.map((model) => ({ model, hidden: false })) }]
      : []),
    ...arranged.makers.map((g) => ({ label: g.maker, models: g.models })),
  ];
  const option = ({ model: m, hidden }: { model: SpeechModel; hidden: boolean }) => (
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
      <span className="flex items-center gap-2 truncate font-medium">
        {m.name}
        {hidden && <Badge variant="outline">Hidden</Badge>}
      </span>
      <span className="text-muted-foreground text-xs">
        {priceText(m.price)} · {limitText(m)}
      </span>
    </button>
  );
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
          {groups.map((g) => (
            <fieldset key={g.label} aria-label={g.label} className="m-0 min-w-0 border-0 p-0 py-1">
              <legend className="px-2 py-1 font-medium text-muted-foreground text-xs">{g.label}</legend>
              {g.models.map(option)}
            </fieldset>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
