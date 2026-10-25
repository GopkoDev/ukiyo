import { useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import type { Generation } from "../../../shared/generations";
import { NotesCard } from "../media-gallery/NotesCard";
import { patchCard } from "./cardPatch";

/** SCR-02 Notes card for a generation — the shared `NotesCard` with the image curation calls and caches. */
export function Notes({ g }: { g: Generation }) {
  const qc = useQueryClient();
  const key = ["generation", g.id];
  return (
    <NotesCard
      item={g}
      setComment={(body) => api.setComment(g.id, body)}
      addTag={(raw) => api.addTag(g.id, raw)}
      removeTag={(tag) => api.removeTag(g.id, tag)}
      onPatched={(fields) => patchCard(qc, g.id, fields)}
      // A curation action on a generation deleted elsewhere: refetch the detail, which then says it no longer exists.
      onGone={(err) => {
        if (err instanceof ApiError && err.code === "NOT_FOUND") {
          qc.invalidateQueries({ queryKey: key });
          return true;
        }
        return false;
      }}
    />
  );
}
