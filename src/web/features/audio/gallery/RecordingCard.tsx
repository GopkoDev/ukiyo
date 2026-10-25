import { MessageSquare, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { excerpt, formatDuration, formatRelative } from "@/lib/format";
import { Link, mediaDialogState, navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import type { Recording } from "../../../../shared/speech";
import { CostLabel } from "../CostLabel";
import { voiceDot, voiceLabel } from "../VoiceSelect";
import type { AudioGalleryView, AudioListView } from "./audioGalleryView";
import { useRecordingPendingCost } from "./queries";
import { reuseRecording } from "./reuse";
import { settingsLabels } from "./settingsLabels";

const ALL: AudioGalleryView = { kind: "all" };

/** Mounted for pending cards only: refreshes that card's cost on its own. */
function PendingCostWatcher({ r }: { r: Recording }) {
  useRecordingPendingCost(r);
  return null;
}

export const recordingPath = (id: string) => `/audio/recordings/${encodeURIComponent(id)}`;

/** SCR-02 card — player, cost, text, model, voice, settings and tags; the text opens the recording (dialog). */
export function RecordingCard({
  r,
  views = { grid: ALL, order: ALL },
  gallery = "audio-gallery",
}: {
  r: Recording;
  views?: { grid: AudioGalleryView | AudioListView; order: AudioGalleryView | AudioListView };
  /** Whose grid the card sits in: the dialog opens over it (voice-presets ADR-0059). */
  gallery?: "audio-gallery" | "voices";
}) {
  const [broken, setBroken] = useState(false);
  const labels = settingsLabels(r.settings);
  return (
    <Card data-recording-id={r.id} className="gap-3 px-3 py-3 transition-colors hover:bg-accent/40">
      <Link
        to={recordingPath(r.id)}
        onClick={(e) => {
          // A plain click opens the dialog over the grid; modified clicks keep the link's own behaviour.
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          navigate(recordingPath(r.id), mediaDialogState(gallery, views));
        }}
        className="flex flex-col gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-1.5 font-medium">
            <span className={cn("size-2.5 shrink-0 rounded-full", voiceDot(r.voice))} aria-hidden />
            <span className="truncate">{voiceLabel(r.voice)}</span>
          </span>
          <span className="shrink-0 text-muted-foreground text-xs">{formatRelative(r.createdAt)}</span>
        </span>
        <span className="line-clamp-2 text-sm">{r.text}</span>
      </Link>
      {broken ? (
        <p className="text-muted-foreground text-sm">Audio unavailable</p>
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: generated speech has no caption track
        <audio
          controls
          preload="none"
          src={r.url}
          onError={() => setBroken(true)}
          className="h-8 w-full"
          aria-label={`Play «${excerpt(r.text, 40)}»`}
        />
      )}
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <Badge variant={r.costStatus === "known" ? "secondary" : "outline"}>
          <span className="sr-only">Cost </span>
          <CostLabel {...r} />
        </Badge>
        {r.durationMs !== null && (
          <Badge variant="outline">
            <span className="sr-only">Duration </span>
            {formatDuration(r.durationMs)}
          </Badge>
        )}
        <Badge variant="secondary" className="max-w-full truncate">
          {r.modelName}
        </Badge>
      </div>
      {labels.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Settings">
          {labels.map((l) => (
            <li key={l}>
              <Badge variant="outline" className="font-normal">
                {l}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {r.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="outline" className="max-w-full truncate">
              {tag}
            </Badge>
          ))}
          {r.tags.length > 3 && <Badge variant="outline">+{r.tags.length - 3}</Badge>}
          {r.comment && (
            <MessageSquare aria-label="Has a comment" role="img" className="size-4 text-muted-foreground" />
          )}
        </span>
        <Button variant="ghost" size="sm" onClick={() => reuseRecording(r.id, "card")}>
          <RotateCcw aria-hidden /> Reuse
        </Button>
      </div>
      {r.costStatus === "pending" && <PendingCostWatcher r={r} />}
    </Card>
  );
}
