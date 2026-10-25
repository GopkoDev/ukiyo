import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import type { Recording } from "../../../../shared/speech";
import { NotesCard } from "../../media-gallery/NotesCard";
import { patchRecordings } from "./patchRecordings";

/** SCR-06 — the shared Notes card with the recording's own tags and comment (stored apart from images, AC-10). */
export function RecordingNotes({ r }: { r: Recording }) {
  const qc = useQueryClient();
  return (
    <NotesCard
      item={r}
      setComment={(body) => api.setRecordingComment(r.id, body)}
      addTag={(raw) => api.addRecordingTag(r.id, raw)}
      removeTag={(tag) => api.removeRecordingTag(r.id, tag)}
      onPatched={(fields) => patchRecordings(qc, r.id, fields)} // every view's card, no page read (AC-07)
      onGone={(err) => {
        if (err instanceof ApiError && err.code === "NOT_FOUND") {
          qc.invalidateQueries({ queryKey: ["recording", r.id] }); // the detail then says it no longer exists
          return true;
        }
        return false;
      }}
    />
  );
}
