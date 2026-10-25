export type Neighbours = {
  newer: string | null;
  older: string | null;
  atEnd: boolean;
  inOrder: boolean;
};

/** Neighbours of `id` in a newest-first list; out-of-order ids have none. */
export function neighbours(items: readonly { id: string }[], id: string): Neighbours {
  const i = items.findIndex((item) => item.id === id);
  if (i === -1) return { newer: null, older: null, atEnd: false, inOrder: false };
  return {
    newer: items[i - 1]?.id ?? null,
    older: items[i + 1]?.id ?? null,
    atEnd: i === items.length - 1,
    inOrder: true,
  };
}

/**
 * `id` was the last loaded generation and a refresh pushed it off the tail: it still sits just past the end of the
 * loaded order (newest-first ULIDs), so Older is «load the next page» and Newer is the last loaded one.
 */
export function anchoredAtEnd(items: readonly { id: string }[], id: string): Neighbours | null {
  const last = items[items.length - 1];
  return last && id < last.id ? { newer: last.id, older: null, atEnd: true, inOrder: true } : null;
}
