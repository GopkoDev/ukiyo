/**
 * One recording plays at a time in the tab (audio-gallery ADR-0050): starting any media element pauses every other
 * playing one (pausing keeps its position), and a route change pauses everything — the HTML `hidden` attribute of a
 * kept-mounted page does not. Installed once by the app frame; works for every native player, old and new.
 */
const players = (doc: Document) => doc.querySelectorAll<HTMLMediaElement>("audio, video");

export function pauseAll(doc: Document = document, except?: EventTarget | null) {
  for (const el of players(doc)) if (el !== except && !el.paused) el.pause();
}

export function installPlayback(doc: Document = document): () => void {
  const onPlay = (e: Event) => pauseAll(doc, e.target);
  doc.addEventListener("play", onPlay, true); // `play` doesn't bubble: listen in the capture phase
  return () => doc.removeEventListener("play", onPlay, true);
}
