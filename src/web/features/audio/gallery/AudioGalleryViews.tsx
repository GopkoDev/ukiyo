import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { recordingModelsOptions } from "./queries";
import { showAudioView, useAudioGalleryView } from "./useAudioGalleryView";

/** SCR-02 — the audio view switch (All / By model) and the model choice, models by their newest recording. */
export function AudioGalleryViews() {
  const view = useAudioGalleryView();
  const [open, setOpen] = useState(false);
  const models = useQuery({ ...recordingModelsOptions, enabled: open || view.kind === "model" });
  const chosen = view.kind === "model" ? models.data?.models.find((g) => g.model === view.model) : undefined;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={view.kind === "all" ? "secondary" : "outline"}
        size="sm"
        aria-pressed={view.kind === "all"}
        onClick={() => showAudioView({ kind: "all" })}
      >
        All
      </Button>
      <Button
        variant={view.kind === "models" ? "secondary" : "outline"}
        size="sm"
        aria-pressed={view.kind === "models"}
        onClick={() => showAudioView({ kind: "models" })}
      >
        By model
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant={view.kind === "model" ? "secondary" : "outline"} size="sm">
            {view.kind === "model" ? `Model: ${chosen?.modelName ?? view.model}` : "Choose a model"}
            <ChevronDown aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex max-h-96 w-96 max-w-[90vw] flex-col gap-1 overflow-y-auto p-2">
          {models.isError && (
            <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-2">
              <p className="text-sm">{models.data ? "These may be out of date." : "Couldn't load your models."}</p>
              <Button variant="outline" size="sm" onClick={() => models.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {models.data
            ? models.data.models.map((g) => (
                <Button
                  key={g.model}
                  variant="ghost"
                  className="h-auto justify-between gap-3 py-2 text-left"
                  onClick={() => {
                    setOpen(false);
                    showAudioView({ kind: "model", model: g.model });
                  }}
                >
                  <span className="flex min-w-0 flex-col items-start">
                    <span className="max-w-full truncate">{g.modelName}</span>
                    <span className="max-w-full truncate text-muted-foreground text-xs">{g.model}</span>
                  </span>
                  <Badge variant="secondary">{g.count}</Badge>
                </Button>
              ))
            : !models.isError && <p className="p-2 text-muted-foreground text-sm">Loading models…</p>}
        </PopoverContent>
      </Popover>
    </div>
  );
}
