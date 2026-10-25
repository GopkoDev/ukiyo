import { useSyncExternalStore } from "react";

/** A one-off notice («… deleted.») a dialog hands over to its grid when it closes after a delete. One per gallery. */
export function createNotice() {
  let shown = false;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of listeners) l();
  };
  return {
    show() {
      shown = true;
      emit();
    },
    clear() {
      if (!shown) return;
      shown = false;
      emit();
    },
    useShown(): boolean {
      return useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => shown,
      );
    },
  };
}
