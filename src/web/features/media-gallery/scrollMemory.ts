import { useEffect, useLayoutEffect } from "react";

/** Keeps the position current while the view is on screen and restores it once the view's data is ready. */
function useSavedIn(saved: Map<string, number>, key: string, ready: boolean) {
  useEffect(() => {
    const onScroll = () => {
      saved.set(key, window.scrollY);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [saved, key]);
  useLayoutEffect(() => {
    if (!ready) return;
    const y = saved.get(key) ?? 0;
    if (y > 0 || window.scrollY > 0) window.scrollTo(0, y);
  }, [saved, ready, key]);
}

/**
 * Where the Owner left each view of a grid (by a key), kept for the page's lifetime; a view never shown starts at 0.
 * One memory per gallery (the image gallery keeps its own, `gallery/scrollMemory.ts`).
 */
export function createScrollMemory() {
  const saved = new Map<string, number>();
  return {
    reset: () => saved.clear(),
    useSaved: (key: string, ready: boolean) => useSavedIn(saved, key, ready),
  };
}
