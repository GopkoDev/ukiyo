import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { RECORDINGS_KEY } from "./queryKeys";

/** SCR-06 — delete a recording and its file for good, after a confirmation (spec AC-16). */
export function DeleteRecording({ recording }: { recording: Recording }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const del = useMutation({
    mutationFn: () => api.deleteRecording(recording.id),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: RECORDINGS_KEY });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "NOT_FOUND") {
        setOpen(false); // already gone — drop it quietly
        qc.invalidateQueries({ queryKey: RECORDINGS_KEY });
      }
    },
  });
  const failed = del.isError && !(del.error instanceof ApiError && del.error.code === "NOT_FOUND");
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (del.isPending) return;
        if (next) del.reset();
        setOpen(next);
      }}
    >
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          del.reset();
          setOpen(true);
        }}
        aria-label="Delete recording"
      >
        <Trash2 aria-hidden />
      </Button>
      <DialogContent showCloseButton={!del.isPending}>
        <DialogHeader>
          <DialogTitle>Delete this recording?</DialogTitle>
          <DialogDescription>
            <q className="block break-words">{excerpt(recording.text, 80)}</q>
            Its audio file is deleted too. This can't be undone.
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
