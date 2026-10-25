import { RECORDINGS_KEY } from "../queryKeys";

/** Which slice of the recordings the audio gallery shows; it lives in the address (`?model=` / `?view=models`). */
export type AudioGalleryView = { kind: "all" } | { kind: "model"; model: string } | { kind: "models" };
/** A view with a paged list behind it («By model» has none: its read is the model groups); a preset's recordings too. */
export type AudioListView = Exclude<AudioGalleryView, { kind: "models" }> | { kind: "preset"; presetId: string };

export const AUDIO_GALLERY_PATH = "/audio/gallery";

export function parseAudioView(search: string): AudioGalleryView {
  const p = new URLSearchParams(search);
  const model = p.get("model");
  if (model) return { kind: "model", model };
  if (p.get("view") === "models") return { kind: "models" };
  return { kind: "all" };
}

export function audioViewSearch(view: AudioGalleryView): string {
  if (view.kind === "all") return "";
  if (view.kind === "models") return "?view=models";
  return `?${new URLSearchParams({ model: view.model }).toString()}`;
}

export function audioViewKey(view: AudioGalleryView | AudioListView): readonly string[] {
  if (view.kind === "preset") return [...RECORDINGS_KEY, "list", "preset", view.presetId];
  if (view.kind === "all") return [...RECORDINGS_KEY, "list", "all"];
  if (view.kind === "models") return [...RECORDINGS_KEY, "models"];
  return [...RECORDINGS_KEY, "list", "model", view.model];
}

function viewFromState(v: unknown): AudioGalleryView | AudioListView | undefined {
  const o = v as { kind?: unknown; model?: unknown; presetId?: unknown } | null | undefined;
  if (o?.kind === "preset" && typeof o.presetId === "string") return { kind: "preset", presetId: o.presetId };
  if (o?.kind === "all" || o?.kind === "models") return { kind: o.kind };
  if (o?.kind === "model" && typeof o.model === "string") return { kind: "model", model: o.model };
  return undefined;
}

/** The views a dialog visit carries in its history state: the grid behind it and the list it steps through. */
export function audioDialogViews(state: unknown): {
  grid?: AudioGalleryView | AudioListView;
  order?: AudioGalleryView | AudioListView;
} {
  const s = state as { grid?: unknown; order?: unknown } | null | undefined;
  return { grid: viewFromState(s?.grid), order: viewFromState(s?.order) };
}
