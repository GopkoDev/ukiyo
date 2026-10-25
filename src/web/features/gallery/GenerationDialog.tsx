import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { dialogState, replace } from "@/lib/router";
import { MediaDialog } from "../media-gallery/MediaDialog";
import { GALLERY_QUERY_KEY, galleryQueryOptionsFor } from "./Gallery";
import { Detail, useGeneration } from "./GenerationDetail";
import { showGalleryNotice } from "./galleryNotice";
import { viewKey } from "./galleryView";
import { patchSummaries } from "./summaryPatch";
import { useOrderView } from "./useGalleryView";

/**
 * SCR-09 — one generation in a dialog over the grid, stepping through the grid's loaded order. The stepping engine
 * is shared with the audio gallery (`MediaDialog`, ADR-0049); this supplies the image list, address and caches.
 */
export function GenerationDialog({ id }: { id: string }) {
  const { grid: behind, order } = useOrderView();
  const grid = useInfiniteQuery(galleryQueryOptionsFor(order));
  const detail = useGeneration(id);
  const qc = useQueryClient();
  const items = grid.data?.pages.flatMap((p) => p.items) ?? [];

  let body: ReactNode;
  if (detail.isPending) body = <Placeholder>Loading…</Placeholder>;
  else if (detail.isError && detail.error instanceof ApiError && detail.error.status === 404)
    body = <Placeholder>This generation no longer exists.</Placeholder>;
  else if (detail.isError)
    body = (
      <Placeholder>
        <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <p className="text-sm">Couldn't load this generation</p>
          <Button variant="outline" size="sm" onClick={() => detail.refetch()}>
            Try again
          </Button>
        </div>
      </Placeholder>
    );
  else body = <Detail key={id} g={detail.data} layout="dialog" />;

  return (
    <MediaDialog
      id={id}
      noun="generation"
      list={grid}
      go={(to) => replace(`/generations/${to}`, dialogState({ grid: behind, order }))}
      title={items.find((g) => g.id === id)?.prompt ?? detail.data?.prompt}
      cardAttr="data-generation-id"
      keepsScroll={behind.kind === "models"} // «By model» keeps its scroll on close (sad §4)
      placeholder={(c) => <Placeholder>{c}</Placeholder>}
      preloadUrlOf={(g) => g.thumbnail.url} // the first output of the loaded neighbours only
      onDeleted={{
        removeCard: (deletedId) => patchSummaries(qc, deletedId, "remove"),
        refresh: (pageFailed) => {
          // Every view re-reads (the models read and the other lists included); only the order's own list keeps
          // the error its failed page left on the grid, as a refetch would clear it.
          const orderKey = JSON.stringify(viewKey(order));
          qc.invalidateQueries({
            queryKey: GALLERY_QUERY_KEY,
            predicate: (q) => !pageFailed || JSON.stringify(q.queryKey) !== orderKey,
          });
        },
        showGridNotice: showGalleryNotice,
        cleanup: (deletedId) => {
          qc.removeQueries({ queryKey: ["generation", deletedId] });
          qc.invalidateQueries({ queryKey: ["generation-job"] }); // the panel's latest result may be this one
        },
      }}
    >
      {body}
    </MediaDialog>
  );
}

/** Loading / error / gone: the same two columns, the message in the metadata one. */
function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="aspect-[4/3] rounded-lg bg-muted" />
      <div className="text-muted-foreground text-sm">{children}</div>
    </div>
  );
}
