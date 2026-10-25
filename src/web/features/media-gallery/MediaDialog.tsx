import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { excerpt } from "@/lib/format";
import { DialogBusyContext, DialogDeleteContext, DialogEscapeContext, type EscapeHandler } from "./DialogBusy";
import { bringCardIntoView } from "./gridPlace";
import { anchoredAtEnd, neighbours } from "./neighbours";

/** Text fields keep their arrow keys; so do media players (seeking — audio-gallery AC-09). */
const keepsArrows = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    t.getAttribute("contenteditable") === "true" ||
    /^(INPUT|TEXTAREA|SELECT|AUDIO|VIDEO)$/.test(t.tagName));

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function Step({
  label,
  icon,
  tip,
  unavailable,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  tip: string;
  unavailable: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-disabled={unavailable || disabled}
            onClick={() => !unavailable && onClick()}
          >
            {label === "Newer" && icon}
            {label}
            {label === "Older" && icon}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

type Page<T> = { items: T[]; nextCursor: string | null };

export type MediaDialogProps<T extends { id: string }> = {
  /** The item shown. */
  id: string;
  /** «generation» / «recording» — used in every label and notice. */
  noun: string;
  /** The grid's list query (the same cache entry the grid reads), the order the dialog steps through. */
  list: UseInfiniteQueryResult<InfiniteData<Page<T>>>;
  /** Shows another item in place (the address is replaced; the history entry stays one dialog visit). */
  go: (id: string) => void;
  /** The heading text (the caller's prompt / text), excerpted here; the noun when absent. */
  title: string | undefined;
  /** The attribute grid cards carry their id in, for close-to-place and focus return. */
  cardAttr: string;
  /** «By model» keeps its scroll on close. */
  keepsScroll: boolean;
  /** Same two columns as the body, with a message in the metadata column. */
  placeholder: (children: ReactNode) => ReactNode;
  /** Preload the loaded neighbours' main media (images); none by default. */
  preloadUrlOf?: (item: T) => string | undefined;
  /** What a delete changes outside the dialog (per medium caches and notices). */
  onDeleted: {
    /** Remove the card from every view first. */
    removeCard: (id: string) => void;
    /** Re-read the views; `pageFailed` = keep the order's own list error. */
    refresh: (pageFailed: boolean) => void;
    /** The grid says «… deleted.» after the dialog closes. */
    showGridNotice: () => void;
    /** Drop the deleted item's caches. */
    cleanup: (id: string) => void;
  };
  className?: string;
  children: ReactNode;
};

/**
 * One item in a dialog over its grid, stepping through the grid's loaded order (generation-detail-modal; shared
 * with the audio gallery — ADR-0049). The list state is shared through the TanStack cache: `list` is the grid's own
 * infinite query; its `fetchNextPage` is only called here when stepping past the end. The busy context the body
 * reports through (and a delete in progress) disables stepping.
 */
export function MediaDialog<T extends { id: string }>(props: MediaDialogProps<T>) {
  const { id, noun, list: grid } = props;
  const items = grid.data?.pages.flatMap((p) => p.items) ?? [];
  // A refresh can push the shown, last loaded item off the tail of the list: keep it at the end of the order
  // (it was in the order, more pages exist, it is older than everything loaded). A lineage hop never was in it.
  const anchorFor = useRef<string | null>(null);
  let nav = neighbours(items, id);
  if (!nav.inOrder && anchorFor.current === id && grid.hasNextPage) nav = anchoredAtEnd(items, id) ?? nav;
  if (nav.inOrder) anchorFor.current = id;
  const refreshing = grid.isFetching; // read during render so a refresh re-renders the dialog
  const [reported, setReported] = useState(0);
  const setBusy = useCallback((b: boolean) => setReported((n) => Math.max(0, n + (b ? 1 : -1))), []);
  const escapeHandler = useRef<EscapeHandler | null>(null);
  const setEscape = useCallback((h: EscapeHandler | null) => {
    escapeHandler.current = h;
  }, []);
  const [deleting, setDeleting] = useState(false);
  const busy = reported > 0 || deleting;
  const [loadingNext, setLoadingNext] = useState(false);
  const [queued, setQueued] = useState<string | null>(null);
  const [nextFailed, setNextFailed] = useState(false);
  const idRef = useRef(id);
  idRef.current = id;
  const mounted = useRef(true);
  // Every close path goes back at most once per visit (a double Esc, an overlay click after Esc, a delete finishing).
  const closingRef = useRef(false);
  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    window.history.back();
  };
  const closeRef = useRef<HTMLButtonElement>(null);

  // A failure belongs to the item it happened on.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset when the shown item changes
  useEffect(() => setNextFailed(false), [id]);

  // The last item of the grid the dialog showed: where the grid scrolls to on close (sad §8).
  const lastGridId = useRef<string | null>(null);
  const keepsScroll = useRef(false);
  keepsScroll.current = props.keepsScroll;
  const cardAttr = useRef(props.cardAttr);
  cardAttr.current = props.cardAttr;
  if (nav.inOrder) lastGridId.current = id;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (lastGridId.current && !keepsScroll.current) bringCardIntoView(lastGridId.current, cardAttr.current);
    };
  }, []);

  // Preload the loaded neighbours only (never a page load for a preload).
  const preloadOf = props.preloadUrlOf;
  const newerUrl = preloadOf && items.find((g) => g.id === nav.newer);
  const olderUrl = preloadOf && items.find((g) => g.id === nav.older);
  const newerSrc = newerUrl ? preloadOf?.(newerUrl) : undefined;
  const olderSrc = olderUrl ? preloadOf?.(olderUrl) : undefined;
  useEffect(() => {
    for (const url of [newerSrc, olderSrc]) if (url) new Image().src = url;
  }, [newerSrc, olderSrc]);

  const go = props.go;
  const stepNewer = () => {
    if (!busy && nav.newer) go(nav.newer);
  };
  const stepOlder = async () => {
    if (queued === id) return;
    await olderStep();
  };
  const olderStep = async () => {
    if (busy || loadingNext) return;
    if (nav.older) return go(nav.older);
    if (!nav.inOrder || !grid.hasNextPage) return;
    if (refreshing) return setQueued(id); // the list is being refreshed: step once it has settled
    const from = id;
    setLoadingNext(true);
    setNextFailed(false);
    const r = await grid.fetchNextPage();
    if (!mounted.current) return;
    setLoadingNext(false);
    if (r.isError || !r.data) return setNextFailed(true);
    const next = r.data.pages.flatMap((p) => p.items).find((g) => g.id < from)?.id;
    if (next && idRef.current === from) go(next);
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the refresh settles, with this render's state
  useEffect(() => {
    if (queued === null || refreshing) return;
    setQueued(null);
    if (queued === idRef.current) void olderStep();
  }, [queued, refreshing]);

  // After a delete: choose from the order as it was before it, show the neighbour in place (address replaced), or
  // close onto the grid with the notice handed over. The deleted card leaves the grid either way.
  const [deletedNotice, setDeletedNotice] = useState<string | null>(null);
  useEffect(() => setDeletedNotice((n) => (n === id ? n : null)), [id]);
  const afterDelete = async (deletedId: string) => {
    setDeleting(true);
    const before = nav;
    const loadNext = !before.older && before.inOrder && before.atEnd && grid.hasNextPage;
    // The card leaves the grid first: a failed page load afterwards then keeps its own error on the grid.
    props.onDeleted.removeCard(deletedId);
    let target = before.older;
    let pageFailed = false;
    if (loadNext) {
      const r = await grid.fetchNextPage();
      if (r.isError || !r.data) pageFailed = true;
      else target = r.data.pages.flatMap((p) => p.items).find((g) => g.id < deletedId)?.id ?? null;
    }
    if (!pageFailed) target ??= before.newer;
    props.onDeleted.refresh(pageFailed);
    if (!mounted.current || closingRef.current) {
      props.onDeleted.showGridNotice(); // closed meanwhile: the grid says so, and no second Back
    } else if (target) {
      setDeletedNotice(target);
      setDeleting(false);
      go(target);
    } else {
      props.onDeleted.showGridNotice();
      close();
    }
    props.onDeleted.cleanup(deletedId);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || keepsArrows(e.target)) return;
    if (e.key === "ArrowLeft") stepNewer();
    else if (e.key === "ArrowRight") void stepOlder();
  };

  const waitingForNext = loadingNext || queued === id || (nav.atEnd && !!grid.hasNextPage && refreshing);
  const olderUnavailable = !nav.older && !(grid.hasNextPage && nav.inOrder);
  const title = deleting ? undefined : props.title;
  const Noun = capital(noun);

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className={props.className ?? "flex h-[90vh] flex-col gap-0 p-0 sm:max-w-6xl"}
        onKeyDown={onKeyDown}
        onEscapeKeyDown={(e) => {
          if (escapeHandler.current?.()) e.preventDefault();
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          closeRef.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          // Back to the grid card last shown, not to <body>; the scroll is the grid's own business (bringCardIntoView).
          const card = lastGridId.current
            ? document.querySelector<HTMLElement>(`[${cardAttr.current}="${CSS.escape(lastGridId.current)}"]`)
            : null;
          const target = card?.matches("a, button") ? card : card?.querySelector<HTMLElement>("a, button");
          if (!target) return;
          e.preventDefault();
          target.focus({ preventScroll: true });
        }}
      >
        <TooltipProvider>
          <header className="flex shrink-0 items-center gap-2 border-b px-6 py-3">
            <DialogTitle className="min-w-0 flex-1 truncate">{title ? excerpt(title) : Noun}</DialogTitle>
            <DialogDescription className="sr-only">One {noun} of the gallery</DialogDescription>
            {nav.inOrder ? (
              <>
                <Step
                  label="Newer"
                  icon={<ChevronLeft />}
                  tip={
                    busy ? "Save or cancel your changes first" : nav.newer ? `Newer ${noun} (←)` : `No newer ${noun}`
                  }
                  unavailable={!nav.newer}
                  disabled={busy}
                  onClick={stepNewer}
                />
                <Step
                  label="Older"
                  icon={waitingForNext ? <Loader2 className="animate-spin" /> : <ChevronRight />}
                  tip={
                    busy
                      ? "Save or cancel your changes first"
                      : olderUnavailable
                        ? `No older ${noun}`
                        : `Older ${noun} (→)`
                  }
                  unavailable={olderUnavailable || loadingNext || queued === id}
                  disabled={busy}
                  onClick={() => void stepOlder()}
                />
              </>
            ) : grid.isPending ? null : (
              <span className="text-muted-foreground text-sm">Not in the gallery's current order</span>
            )}
            <DialogClose asChild>
              <Button ref={closeRef} variant="ghost" size="icon" aria-label="Close">
                <X />
              </Button>
            </DialogClose>
          </header>
          {deletedNotice === id && (
            <p role="status" className="shrink-0 border-b bg-muted px-6 py-2 text-sm">
              {Noun} deleted.
            </p>
          )}
          {nextFailed && (
            <p className="flex shrink-0 items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-6 py-2 text-sm">
              Couldn't load the next one.
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void stepOlder()}>
                Try again
              </Button>
            </p>
          )}
          <DialogBusyContext.Provider value={setBusy}>
            <DialogEscapeContext.Provider value={setEscape}>
              <DialogDeleteContext.Provider value={afterDelete}>
                <div className="min-h-0 flex-1 overflow-y-auto p-6 lg:overflow-hidden">
                  {deleting ? props.placeholder(`${Noun} deleted.`) : props.children}
                </div>
              </DialogDeleteContext.Provider>
            </DialogEscapeContext.Provider>
          </DialogBusyContext.Provider>
        </TooltipProvider>
      </DialogContent>
    </Dialog>
  );
}
