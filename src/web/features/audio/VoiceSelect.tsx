import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { SpeechModel } from "../../../shared/speech";

const FILTER_FROM = 20;
const DOTS = ["bg-emerald-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-teal-500"];

/** A stable colour per voice, so the same voice always gets the same dot. */
export function voiceDot(voice: string | null) {
  if (voice === null) return "bg-muted-foreground";
  let h = 0;
  for (const ch of voice) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return DOTS[Math.abs(h) % DOTS.length];
}

/** «george» → «George»; ids like «en-US-Harper:MAI-Voice-2» stay as they are; `null` → «Provider default». */
export const voiceLabel = (v: string | null) =>
  v === null ? "Provider default" : /^[a-z]+$/.test(v) ? v.charAt(0).toUpperCase() + v.slice(1) : v;

/**
 * SCR-02 — the model's own voices (filterable above 20), or — for a model that lists none — the provider's default
 * voice or a typed voice name (spec AC-07, AC-09).
 */
export function VoiceSelect(props: {
  id: string;
  model: SpeechModel | undefined;
  value: string | null;
  onChange: (voice: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const voices = props.model?.voices ?? [];
  if (props.model && voices.length === 0)
    return (
      <Input
        id={props.id}
        aria-label="Type a voice name"
        placeholder="Provider default"
        value={props.value ?? ""}
        maxLength={100}
        onChange={(e) => props.onChange(e.target.value.trim() ? e.target.value : null)}
      />
    );
  const shown = filter ? voices.filter((v) => v.toLowerCase().includes(filter.toLowerCase())) : voices;
  const optional = props.model?.voiceMode === "optional";
  const choose = (v: string | null) => {
    props.onChange(v);
    setOpen(false);
    setFilter("");
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={props.id} variant="outline" className="w-full justify-between font-normal" disabled={!props.model}>
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn("size-2.5 shrink-0 rounded-full", voiceDot(props.value))} aria-hidden />
            <span className="truncate">{props.model ? voiceLabel(props.value) : "Loading voices…"}</span>
          </span>
          <ChevronDownIcon className="opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-1">
        {voices.length > FILTER_FROM && (
          <Input
            aria-label="Filter voices"
            placeholder="Filter voices…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-1 h-8"
          />
        )}
        <div role="listbox" aria-label="Voices" className="max-h-[50vh] overflow-y-auto">
          {optional && <VoiceOption voice={null} selected={props.value === null} onChoose={() => choose(null)} />}
          {shown.map((v) => (
            <VoiceOption key={v} voice={v} selected={v === props.value} onChoose={() => choose(v)} />
          ))}
          {shown.length === 0 && <p className="px-2 py-1.5 text-muted-foreground text-xs">No voice matches.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function VoiceOption(props: { voice: string | null; selected: boolean; onChoose: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={props.selected}
      onClick={props.onChoose}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
        props.selected && "bg-accent",
      )}
    >
      <span className={cn("size-2.5 shrink-0 rounded-full", voiceDot(props.voice))} aria-hidden />
      <span className="truncate">{voiceLabel(props.voice)}</span>
    </button>
  );
}
