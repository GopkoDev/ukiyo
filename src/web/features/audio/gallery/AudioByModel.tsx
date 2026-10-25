import { useQuery } from "@tanstack/react-query";
import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/lib/router";
import type { RecordingModelGroup } from "../../../../shared/speech";
import { AUDIO_GALLERY_PATH, audioViewKey, audioViewSearch } from "./audioGalleryView";
import { recordingModelsOptions } from "./queries";
import { RecordingCard } from "./RecordingCard";
import { SPEECH_PATH } from "./reuse";
import { audioNotice, audioScroll } from "./useAudioGalleryView";

const plural = (n: number) => `${n} recording${n === 1 ? "" : "s"}`;

/** SCR-03 — one section per speech model, newest model first: its count and its four latest cards. */
export function AudioByModel() {
  const q = useQuery(recordingModelsOptions);
  const deleted = audioNotice.useShown(); // the dialog closed onto «By model» after a delete
  useEffect(() => audioNotice.clear, []);
  audioScroll.useSaved(JSON.stringify(audioViewKey({ kind: "models" })), q.data !== undefined);
  if (q.isPending) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (q.isError && !q.data)
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <p className="text-sm">Couldn't load the models.</p>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          Try again
        </Button>
      </div>
    );
  if (q.data.models.length === 0)
    return (
      <div className="flex flex-col items-start gap-3">
        {deleted && <p className="text-muted-foreground text-sm">Recording deleted.</p>}
        <p className="text-muted-foreground">No recordings yet.</p>
        <Button asChild>
          <Link to={SPEECH_PATH}>Go to Speech</Link>
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col gap-8">
      {deleted && <p className="text-muted-foreground text-sm">Recording deleted.</p>}
      {q.isError && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <p className="text-sm">These may be out of date.</p>
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {q.data.models.map((g) => (
        <ModelSection key={g.model} g={g} />
      ))}
    </div>
  );
}

function ModelSection({ g }: { g: RecordingModelGroup }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h3 id={id} className="truncate font-medium">
            {g.modelName}
          </h3>
          <p className="text-muted-foreground text-sm">{plural(g.count)}</p>
        </div>
        <Button asChild variant="link" size="sm" className="h-auto p-0">
          <Link to={`${AUDIO_GALLERY_PATH}${audioViewSearch({ kind: "model", model: g.model })}`}>
            Show all {g.count}
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {g.items.slice(0, 4).map((r) => (
          <RecordingCard
            key={r.id}
            r={r}
            views={{ grid: { kind: "models" }, order: { kind: "model", model: g.model } }}
          />
        ))}
      </div>
    </section>
  );
}
