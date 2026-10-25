import { isDialogVisit, navigate, useRoute } from "@/lib/router";
import { createNotice } from "../../media-gallery/notice";
import { createScrollMemory } from "../../media-gallery/scrollMemory";
import {
  AUDIO_GALLERY_PATH,
  type AudioGalleryView,
  type AudioListView,
  audioDialogViews,
  audioViewSearch,
  parseAudioView,
} from "./audioGalleryView";

const ALL: AudioGalleryView = { kind: "all" };
let lastView: AudioGalleryView = ALL;

/** «Recording deleted.» handed from the dialog to the grid. */
export const audioNotice = createNotice();
export const audioScroll = createScrollMemory();

/** Test-only: forget the last view, the saved scroll positions and the notice. */
export function resetAudioGallery() {
  lastView = ALL;
  audioScroll.reset();
  audioNotice.clear();
}

export const showAudioView = (view: AudioGalleryView) => navigate(`${AUDIO_GALLERY_PATH}${audioViewSearch(view)}`);

/** The view the audio gallery shows: the address's; behind a dialog the grid it was opened from, else the last one. */
export function useAudioGalleryView(): AudioGalleryView {
  const route = useRoute();
  if (route.name === "page" && route.pathname.replace(/(.)\/$/, "$1") === AUDIO_GALLERY_PATH)
    lastView = parseAudioView(route.search);
  else if (route.name === "recording" && isDialogVisit(route))
    lastView = audioDialogViews(route.state).grid ?? lastView;
  return lastView;
}

/** The list a dialog steps through: the state's order; All when it names none or «By model» (no list). */
export function useAudioOrderView(): { grid: AudioGalleryView; order: AudioListView } {
  const route = useRoute();
  const grid = useAudioGalleryView();
  const order = audioDialogViews(route.state).order;
  return { grid, order: !order || order.kind === "models" ? { kind: "all" } : order };
}
