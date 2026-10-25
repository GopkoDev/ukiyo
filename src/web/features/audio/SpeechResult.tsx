import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Recording } from "../../../shared/speech";
import { CostLabel } from "./CostLabel";
import { voiceDot, voiceLabel } from "./VoiceSelect";

/** SCR-03 — the latest recording: voice, model, time, cost, download and a player (autoplays when just made). */
export function SpeechResult({ recording, autoPlay }: { recording: Recording; autoPlay: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <section aria-label="Latest recording" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          <span className={cn("size-2.5 rounded-full", voiceDot(recording.voice))} aria-hidden />
          <span>{voiceLabel(recording.voice)}</span>
          <span className="font-normal text-muted-foreground text-xs">
            {recording.modelName} · {formatRelative(recording.createdAt)} ·{" "}
          </span>
          <CostLabel {...recording} className="font-normal text-xs" />
        </span>
        <Button variant="outline" size="sm" asChild>
          <a href={`${recording.url}?download=1`} download>
            <Download />
            Download
          </a>
        </Button>
      </div>
      {broken ? (
        <p className="text-muted-foreground text-sm">Audio unavailable</p>
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: generated speech has no caption track
        <audio
          key={recording.id}
          controls
          autoPlay={autoPlay}
          src={recording.url}
          onError={() => setBroken(true)}
          className="w-full"
        />
      )}
    </section>
  );
}
