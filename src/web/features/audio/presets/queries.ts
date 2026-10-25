import { type QueryClient, queryOptions, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { VoicePreset, VoicePresetsResponse } from "../../../../shared/voice-presets";
import { createNotice } from "../../media-gallery/notice";
import { RECORDINGS_KEY } from "../queryKeys";

/** «Recording deleted.» handed from a dialog to the preset page behind it (one notice per gallery, review R2). */
export const voicesNotice = createNotice();

/** Voice presets (sad.md §4 item 11): the list and one preset; stats are read fresh on every visit (AC-12). */
export const VOICE_PRESETS_KEY = ["voice-presets"] as const;
export const VOICES_PATH = "/audio/voices";
export const presetPath = (id: string) => `${VOICES_PATH}/${encodeURIComponent(id)}`;

export const voicePresetsOptions = queryOptions({
  queryKey: [...VOICE_PRESETS_KEY, "list"],
  queryFn: api.voicePresets,
  refetchOnMount: "always",
});
export const useVoicePresets = () => useQuery(voicePresetsOptions);

export const useVoicePreset = (id: string) =>
  useQuery({
    queryKey: [...VOICE_PRESETS_KEY, "one", id],
    queryFn: () => api.voicePreset(id),
    refetchOnMount: "always",
    retry: false,
  });

/** After a recording is made or deleted: counts, totals and last use follow (AC-16). */
export const refreshPresetStats = (qc: QueryClient) => qc.invalidateQueries({ queryKey: VOICE_PRESETS_KEY });

/** A preset saved, renamed or updated: the list and its own entry take the answer; recordings re-read their names. */
export function presetChanged(qc: QueryClient, p: VoicePreset, renamed: boolean) {
  qc.setQueryData<VoicePresetsResponse>([...VOICE_PRESETS_KEY, "list"], (old) =>
    old
      ? {
          presets: [...old.presets.filter((x) => x.id !== p.id), p].sort((a, b) =>
            a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0,
          ),
        }
      : old,
  );
  qc.setQueryData([...VOICE_PRESETS_KEY, "one", p.id], p);
  if (renamed) {
    qc.invalidateQueries({ queryKey: RECORDINGS_KEY });
    qc.invalidateQueries({ queryKey: ["recording"] });
  }
}

/** A preset deleted: gone from the list; its recordings lose their link everywhere (AC-07, AC-08). */
export function presetDeleted(qc: QueryClient, id: string) {
  qc.setQueryData<VoicePresetsResponse>([...VOICE_PRESETS_KEY, "list"], (old) =>
    old ? { presets: old.presets.filter((x) => x.id !== id) } : old,
  );
  qc.removeQueries({ queryKey: [...VOICE_PRESETS_KEY, "one", id] });
  qc.invalidateQueries({ queryKey: RECORDINGS_KEY });
  qc.invalidateQueries({ queryKey: ["recording"] });
}
