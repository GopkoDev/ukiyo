import { createContext, useContext, useEffect, useRef } from "react";

/**
 * The dialog's busy hook-point (AC-09): the detail body reports «unsaved comment / typed tag text / delete
 * confirmation open» with `useReportDialogBusy(busy)`. The dialog counts the reporters, so several can be busy
 * at once without clearing each other; while any is, stepping is unavailable. Outside a dialog it is a no-op.
 */
export const DialogBusyContext = createContext<(busy: boolean) => void>(() => {});

export function useReportDialogBusy(busy: boolean) {
  const report = useContext(DialogBusyContext);
  useEffect(() => {
    if (!busy) return;
    report(true);
    return () => report(false);
  }, [busy, report]);
}

/** Returns true when it consumed the Esc (cancelled something) so the dialog must stay open. */
export type EscapeHandler = () => boolean;

/** Lets the detail body claim Esc before the dialog closes (a comment edit cancels first). */
export const DialogEscapeContext = createContext<(handler: EscapeHandler | null) => void>(() => {});

export function useDialogEscape(handler: EscapeHandler | null) {
  const register = useContext(DialogEscapeContext);
  const ref = useRef(handler);
  ref.current = handler;
  const active = handler !== null;
  useEffect(() => {
    if (!active) return;
    register(() => ref.current?.() ?? false);
    return () => register(null);
  }, [active, register]);
}

/**
 * Set by the dialog around the detail body: after a delete succeeded, move to a neighbour (or close onto the grid).
 * Null outside a dialog — the full page navigates to the grid itself.
 */
export const DialogDeleteContext = createContext<((deletedId: string) => Promise<void>) | null>(null);
