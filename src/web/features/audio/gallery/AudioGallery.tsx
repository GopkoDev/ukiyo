import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isDialogVisit, Link, replace, useRoute } from "@/lib/router";
import { usePagingSentinel } from "../../media-gallery/usePagingSentinel";
import { AudioByModel } from "./AudioByModel";
import { AudioGalleryViews } from "./AudioGalleryViews";
import { type AudioListView, audioViewKey } from "./audioGalleryView";
import { audioListOptions, recordingModelsOptions } from "./queries";
import { RecordingCard } from "./RecordingCard";
import { SPEECH_PATH } from "./reuse";
import { audioNotice, audioScroll, showAudioView, useAudioGalleryView } from "./useAudioGalleryView";

/** The Audio → Gallery section page (SCR-02 / SCR-03). */
export function AudioGalleryPage() {
  return (
    <section aria-label="Audio gallery" className="flex flex-col gap-4">
      <h2 className="font-semibold">Gallery</h2>
      <AudioGalleryViews />
      <AudioGallery />
    </section>
  );
}

/** The gallery's body for the view in the address: a grid (All or one model) or «By model». */
export function AudioGallery() {
  const view = useAudioGalleryView();
  if (view.kind === "models") return <AudioByModel />;
  return <Grid key={JSON.stringify(audioViewKey(view))} view={view} />;
}

const plural = (n: number) => `${n} recording${n === 1 ? "" : "s"}`;

/** SCR-02 — newest-first grid of recordings (all or one model) with on-demand paging. */
function Grid({ view }: { view: AudioListView }) {
  const one = view.kind === "model" ? view : undefined;
  const models = useQuery({ ...recordingModelsOptions, enabled: one !== undefined });
  // A one-off notice after a deletion from the recording page; the flag is dropped from the address right away.
  const [justDeleted, setJustDeleted] = useState(() => new URLSearchParams(window.location.search).has("deleted"));
  useEffect(() => {
    if (justDeleted) replace(window.location.pathname + window.location.search.replace(/[?&]deleted=1/, ""));
  }, [justDeleted]);
  const handedOver = audioNotice.useShown(); // the dialog closed after a delete
  useEffect(() => audioNotice.clear, []);
  const q = useInfiniteQuery(audioListOptions(view));
  const paused = isDialogVisit(useRoute());
  useEffect(() => {
    if (!paused) return;
    setJustDeleted(false);
    audioNotice.clear();
  }, [paused]);
  const ready = q.data !== undefined;
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = q;
  audioScroll.useSaved(JSON.stringify(audioViewKey(view)), ready);
  const { sentinelRef } = usePagingSentinel({
    ready,
    paused,
    hasNextPage,
    isFetching: q.isFetching,
    isFetchNextPageError,
    fetchNextPage,
  });

  if (q.isPending) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (q.isError && !q.data)
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
        <p className="text-sm">Couldn't load the gallery</p>
        <Button variant="outline" size="sm" onClick={() => q.refetch()}>
          Retry
        </Button>
      </div>
    );

  const items = q.data.pages.flatMap((p) => p.items);
  const notice = (justDeleted || handedOver) && <p className="text-muted-foreground text-sm">Recording deleted.</p>;
  const group = one ? models.data?.models.find((g) => g.model === one.model) : undefined;
  const name = group?.modelName ?? items[0]?.modelName ?? one?.model;
  if (items.length === 0 && one)
    return (
      <div className="flex flex-col items-start gap-3">
        {notice}
        <p className="text-muted-foreground">No recordings with {name}.</p>
        <Button onClick={() => showAudioView({ kind: "all" })}>Show all recordings</Button>
      </div>
    );
  if (items.length === 0)
    return (
      <div className="flex flex-col items-start gap-3">
        {notice}
        <p className="text-muted-foreground">No recordings yet.</p>
        <Button asChild>
          <Link to={SPEECH_PATH}>Go to Speech</Link>
        </Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-4">
      {notice}
      {one && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">{group ? `${name} · ${plural(group.count)}` : name}</h3>
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => showAudioView({ kind: "all" })}>
            Show all recordings
          </Button>
        </div>
      )}
      {q.isError && !isFetchNextPageError && (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          These cards may be out of date.
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => q.refetch()}>
            Refresh
          </Button>
        </p>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {items.map((r) => (
          <RecordingCard key={r.id} r={r} views={{ grid: view, order: view }} />
        ))}
      </div>
      {isFetchNextPageError && (
        <div className="flex items-center gap-3 self-center text-sm">
          <p className="text-destructive">Couldn't load more.</p>
          <Button variant="outline" size="sm" disabled={q.isFetching} onClick={() => fetchNextPage()}>
            Try again
          </Button>
        </div>
      )}
      {hasNextPage ? (
        <>
          <div ref={sentinelRef} data-testid="audio-gallery-sentinel" aria-hidden className="h-px" />
          {!isFetchNextPageError && (
            <div className="flex items-center justify-center gap-3">
              {isFetchingNextPage && (
                <span className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Loading more…
                </span>
              )}
              <Button variant="outline" disabled={q.isFetching} onClick={() => fetchNextPage()}>
                Load more
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="text-center text-muted-foreground text-sm">That's everything</p>
      )}
    </div>
  );
}
