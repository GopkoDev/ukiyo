import { useEffect, useRef, useState } from "react";
import { isOwnScroll } from "./gridPlace";

export const SENTINEL_MARGIN = "600px";

/**
 * A grid's on-demand paging (gallery-grid, shared by the image and audio galleries — ADR-0049): an observed sentinel
 * asks for the next page while a request is allowed — data ready, not paused (a dialog over the grid), armed, more
 * pages, nothing in flight, the last page not failed. While paused it disarms; after that it is re-armed only by the
 * Owner's own scroll, never by the scroll that brought the last shown card into view.
 */
export function usePagingSentinel(q: {
  ready: boolean;
  paused: boolean;
  hasNextPage: boolean;
  isFetching: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => unknown;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(true);
  const { ready, paused, hasNextPage, isFetching, isFetchNextPageError, fetchNextPage } = q;
  useEffect(() => {
    if (paused) setArmed(false);
  }, [paused]);
  useEffect(() => {
    if (paused || armed) return;
    const onScroll = () => {
      if (isOwnScroll()) setArmed(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [paused, armed]);
  const canLoadMore = ready && !paused && armed && hasNextPage && !isFetching && !isFetchNextPageError;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!canLoadMore || !el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fetchNextPage();
      },
      { rootMargin: SENTINEL_MARGIN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [canLoadMore, fetchNextPage]);
  return { sentinelRef };
}
