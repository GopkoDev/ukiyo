import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, api } from "@/lib/api";
import { excerpt } from "@/lib/format";
import type { Recording } from "../../../shared/speech";
import { DialogDeleteContext, useReportDialogBusy } from "../media-gallery/DialogBusy";
import { patchRecordings } from "./gallery/patchRecordings";
import { RECORDINGS_KEY } from "./queryKeys";

/**
 * SCR-06 (text-to-speech) / SCR-07 (audio-gallery) — delete a recording, its file, tags and comment for good, after a
 * confirmation. Inside the gallery dialog the dialog moves to a neighbour afterwards; elsewhere `onDeleted` runs.
 */
export function DeleteRecording({
  recording,
  onDeleted,
  variant = "icon",
}: {
  recording: Recording;
  onDeleted?: (id: string) => void;
  /** `icon` in the recent list, a labelled `button` on the detail. */
  variant?: "icon" | "button";
}) {
  const qc = useQueryClient();
  const afterDeleteInDialog = useContext(DialogDeleteContext);
  const [open, setOpen] = useState(false);
  useReportDialogBusy(open);
  const done = () => {
    patchRecordings(qc, recording.id, "remove"); // gone from every view at once (AC-11, AC-18)
    qc.invalidateQueries({ queryKey: RECORDINGS_KEY });
    onDeleted?.(recording.id);
  };
  const del = useMutation({
    mutationFn: () => api.deleteRecording(recording.id),
    onSuccess: async () => {
      setOpen(false);
      if (afterDeleteInDialog) {
        await afterDeleteInDialog(recording.id);
        onDeleted?.(recording.id);
        return;
      }
      done();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "NOT_FOUND") {
        setOpen(false); // already gone — drop it quietly
        done();
      }
    },
  });
  const failed = del.isError && !(del.error instanceof ApiError && del.error.code === "NOT_FOUND");
  const label = `Delete recording «${excerpt(recording.text, 40)}»`;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (del.isPending) return;
        if (next) del.reset();
        setOpen(next);
      }}
    >
      {variant === "icon" ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            del.reset();
            setOpen(true);
          }}
          aria-label={label}
        >
          <Trash2 aria-hidden />
        </Button>
      ) : (
        <Button
          variant="outline"
          className="text-destructive"
          onClick={() => {
            del.reset();
            setOpen(true);
          }}
        >
          <Trash2 aria-hidden /> Delete
        </Button>
      )}
      <DialogContent showCloseButton={!del.isPending}>
        <DialogHeader>
          <DialogTitle>Delete this recording?</DialogTitle>
          <DialogDescription>
            <q className="block break-words">{excerpt(recording.text, 80)}</q>
            Its audio file, tags and comment are deleted too. This can't be undone.
          </DialogDescription>
        </DialogHeader>
        {failed && <p className="text-destructive text-sm">Couldn't delete this recording — try again</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={del.isPending} autoFocus>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => del.mutate()} disabled={del.isPending}>
            {del.isPending && <Loader2 className="animate-spin" />}
            {del.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
