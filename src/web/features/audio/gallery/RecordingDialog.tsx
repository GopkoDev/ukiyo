import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { mediaDialogState, replace } from "@/lib/router";
import { MediaDialog } from "../../media-gallery/MediaDialog";
import { RECORDINGS_KEY } from "../queryKeys";
import { audioViewKey } from "./audioGalleryView";
import { patchRecordings } from "./patchRecordings";
import { audioListOptions, useRecording } from "./queries";
import { recordingPath } from "./RecordingCard";
import { RecordingBody } from "./RecordingDetail";
import { audioNotice, useAudioOrderView } from "./useAudioGalleryView";

/** SCR-04 — one recording in a dialog over the audio grid, stepping through its loaded order (shared engine). */
export function RecordingDialog({ id }: { id: string }) {
  const { grid: behind, order } = useAudioOrderView();
  const list = useInfiniteQuery(audioListOptions(order));
  const detail = useRecording(id);
  const qc = useQueryClient();
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  let body: ReactNode;
  if (detail.isPending) body = <Placeholder>Loading…</Placeholder>;
  else if (detail.isError && detail.error instanceof ApiError && detail.error.status === 404)
    body = <Placeholder>This recording no longer exists.</Placeholder>;
  else if (detail.isError)
    body = (
      <Placeholder>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm">Couldn't load this recording</p>
          <Button variant="outline" size="sm" onClick={() => detail.refetch()}>
            Try again
          </Button>
        </div>
      </Placeholder>
    );
  else body = <RecordingBody key={id} r={detail.data} layout="dialog" />;

  return (
    <MediaDialog
      id={id}
      noun="recording"
      list={list}
      go={(to) => replace(recordingPath(to), mediaDialogState("audio-gallery", { grid: behind, order }))}
      title={items.find((r) => r.id === id)?.text ?? detail.data?.text}
      cardAttr="data-recording-id"
      keepsScroll={behind.kind === "models"}
      placeholder={(c) => <Placeholder>{c}</Placeholder>}
      className="flex h-[90vh] flex-col gap-0 p-0 sm:max-w-5xl"
      onDeleted={{
        removeCard: (deletedId) => patchRecordings(qc, deletedId, "remove"),
        refresh: (pageFailed) => {
          const orderKey = JSON.stringify(audioViewKey(order));
          qc.invalidateQueries({
            queryKey: RECORDINGS_KEY,
            predicate: (q) => !pageFailed || JSON.stringify(q.queryKey) !== orderKey,
          });
        },
        showGridNotice: audioNotice.show,
        cleanup: (deletedId) => qc.removeQueries({ queryKey: ["recording", deletedId] }),
      }}
    >
      {body}
    </MediaDialog>
  );
}

function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="h-24 rounded-lg bg-muted" />
      <div className="text-muted-foreground text-sm">{children}</div>
    </div>
  );
}
