import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** SCR-05 — asked before a reused recording overwrites unsent text that differs from it (spec AC-15). */
export function ReplaceTextDialog(props: { open: boolean; onKeep: () => void; onReplace: () => void }) {
  return (
    <Dialog open={props.open} onOpenChange={(next) => !next && props.onKeep()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Replace your text?</DialogTitle>
          <DialogDescription>
            The form holds unsent text. Replace it with this recording's text and settings?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={props.onKeep} autoFocus>
            Keep mine
          </Button>
          <Button onClick={props.onReplace}>Replace</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
