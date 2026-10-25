import { ChevronDownIcon, Ellipsis } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ModelPreference } from "../../../../shared/models";
import type { SpeechModel } from "../../../../shared/speech";
import { presetAvailability, type VoicePreset } from "../../../../shared/voice-presets";
import { voiceLabel } from "../VoiceSelect";

export const retiredText = (p: Pick<VoicePreset, "modelName">) => `${p.modelName} is no longer offered`;

/**
 * SCR-01 — the Speech page's preset row: the applied preset («name», «name · modified» or «No voice preset»), the
 * list of presets by name to apply one in a click, Save, and a menu with Rename, Delete and Detach (spec AC-03…AC-09).
 */
export function PresetSelect(props: {
  id: string;
  presets: { data: VoicePreset[] | undefined; isError: boolean; isPending: boolean; refetch: () => void };
  models: SpeechModel[] | undefined;
  prefs: ModelPreference[] | null | undefined;
  applied: VoicePreset | undefined;
  modified: boolean;
  canSave: boolean;
  onApply: (p: VoicePreset) => void;
  onSave: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDetach: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const hidden = (model: string) => props.prefs?.some((p) => p.model === model && p.hidden) === true;
  const modelName = (p: VoicePreset) => props.models?.find((m) => m.id === p.model)?.name ?? p.modelName;
  const label = props.applied
    ? `${props.applied.name}${props.modified ? " · modified" : ""}`
    : props.presets.isPending
      ? "Loading voices…"
      : "No voice preset";
  const choose = (p: VoicePreset) => {
    const state = presetAvailability(p, props.models);
    if (state === "retired") return setNote(retiredText(p));
    if (state === "loading") return setNote("Loading models…");
    setNote(null);
    setOpen(false);
    props.onApply(p);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setNote(null);
          }}
        >
          <PopoverTrigger asChild>
            <Button
              id={props.id}
              variant="outline"
              className="min-w-0 flex-1 justify-between font-normal"
              disabled={props.presets.isPending && !props.presets.isError}
            >
              <span className="truncate">{label}</span>
              <ChevronDownIcon className="opacity-50" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="max-h-[60vh] w-(--radix-popover-trigger-width) min-w-72 overflow-y-auto p-1"
          >
            {props.presets.isError ? (
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
                <span className="text-destructive">Couldn't load your voices.</span>
                <Button variant="ghost" size="sm" onClick={() => props.presets.refetch()}>
                  Try again
                </Button>
              </div>
            ) : props.presets.data?.length === 0 ? (
              <p className="px-2 py-1.5 text-muted-foreground text-sm">
                No voice presets yet — set up a voice and press Save.
              </p>
            ) : (
              <div role="listbox" aria-label="Voice presets">
                {props.presets.data?.map((p) => {
                  const state = presetAvailability(p, props.models);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={p.id === props.applied?.id}
                      aria-disabled={state !== "ok" || undefined}
                      onClick={() => choose(p)}
                      className={cn(
                        "flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        p.id === props.applied?.id && "bg-accent",
                        state !== "ok" && "text-muted-foreground",
                      )}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <span className="truncate">{p.name}</span>
                        {state === "retired" && <Badge variant="outline">No longer offered</Badge>}
                        {state === "ok" && hidden(p.model) && <Badge variant="outline">Hidden</Badge>}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {modelName(p)} · {voiceLabel(p.voice)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {note && <p className="px-2 py-1.5 text-muted-foreground text-xs">{note}</p>}
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          disabled={!props.canSave}
          title={props.applied && !props.modified ? "Nothing to save" : undefined}
          onClick={props.onSave}
        >
          Save
        </Button>
        {props.applied && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Voice preset actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={props.onRename}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={props.onDelete}>Delete</DropdownMenuItem>
              <DropdownMenuItem onSelect={props.onDetach}>Detach</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
