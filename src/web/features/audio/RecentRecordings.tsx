import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { excerpt, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Recording } from "../../../shared/speech";
import { CostLabel } from "./CostLabel";
import { DeleteRecording } from "./DeleteRecording";
import { RECENT_RECORDINGS_KEY } from "./queryKeys";
import { ReplaceTextDialog } from "./ReplaceTextDialog";
import { voiceDot, voiceLabel } from "./VoiceSelect";

export const RECENT_LIMIT = 10;
const PENDING_REFRESH_MS = 10_000;

/**
 * SCR-04 — the ten latest recordings, newest first: reuse, play, download, delete. While any cost is pending the
 * list refreshes every 10 s until it settles (spec AC-13, AC-15).
 */
export function RecentRecordings(props: { draftText: string; onReuse: (r: Recording) => void }) {
  const recent = useQuery({
    queryKey: RECENT_RECORDINGS_KEY,
    queryFn: () => api.recordings(undefined, RECENT_LIMIT),
    refetchInterval: (q) => (q.state.data?.items.some((r) => r.costStatus === "pending") ? PENDING_REFRESH_MS : false),
  });
  const [asking, setAsking] = useState<Recording | null>(null);

  const reuse = (r: Recording) => {
    const unsent = props.draftText.trim();
    if (unsent && props.draftText !== r.text) setAsking(r);
    else props.onReuse(r);
  };

  if (recent.isPending) return <p className="text-muted-foreground text-xs">Loading…</p>;
  if (recent.isError)
    return (
      <p className="text-destructive text-xs">
        Couldn't load your recordings —{" "}
        <Button variant="ghost" size="sm" onClick={() => recent.refetch()}>
          Try again
        </Button>
      </p>
    );
  if (recent.data.items.length === 0) return <p className="text-muted-foreground text-xs">No speech generated yet.</p>;
  return (
    <>
      <ul className="max-h-[70vh] space-y-3 overflow-y-auto">
        {recent.data.items.map((r) => (
          <li key={r.id} className="space-y-2 rounded-lg border p-3">
            <button
              type="button"
              className="block w-full text-left"
              onClick={() => reuse(r)}
              aria-label={`Reuse «${excerpt(r.text, 40)}»`}
            >
              <span className="line-clamp-2">{excerpt(r.text, 140)}</span>
            </button>
            <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
              <span className={cn("size-2 rounded-full", voiceDot(r.voice))} aria-hidden />
              {voiceLabel(r.voice)} · {r.modelName} · {formatRelative(r.createdAt)} ·
              <CostLabel {...r} />
            </span>
            {/* biome-ignore lint/a11y/useMediaCaption: generated speech has no caption track */}
            <audio controls preload="none" src={r.url} className="h-8 w-full" />
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" asChild>
                <a href={`${r.url}?download=1`} download aria-label={`Download «${excerpt(r.text, 40)}»`}>
                  <Download />
                  Download
                </a>
              </Button>
              <DeleteRecording recording={r} />
            </div>
          </li>
        ))}
      </ul>
      <ReplaceTextDialog
        open={asking !== null}
        onKeep={() => setAsking(null)}
        onReplace={() => {
          if (asking) props.onReuse(asking);
          setAsking(null);
        }}
      />
    </>
  );
}
