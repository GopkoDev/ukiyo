import { type AnchorHTMLAttributes, type MouseEvent, useSyncExternalStore } from "react";
import type { GalleryView } from "@/features/gallery/galleryView";

// History API only (ADR-0009). A generation's address is the detail route, a recording's the recording route
// (audio-gallery ADR-0048); every other path is a page path that the section registry matches (ADR-0022). The
// server falls back to index.html for all of them.
type RouteBase =
  | { name: "detail"; id: string }
  | { name: "recording"; id: string }
  | { name: "page"; pathname: string; search: string };
/** The route kinds that show one item (a section's detail page or dialog). */
export type DetailRouteName = "detail" | "recording";
export const isDetailRoute = (r: Route): r is Route & { name: DetailRouteName; id: string } =>
  r.name === "detail" || r.name === "recording";
export type Route = RouteBase & { state?: unknown };

/** Random per module load: a reload or a new tab gets a new id, so a kept history state reads as a direct visit (ADR-0033). */
export const APP_LOAD: string = Math.random().toString(36).slice(2) + Date.now().toString(36);

/** The gallery whose grid opened the dialog, per detail route kind. */
const DIALOG_OF: Record<DetailRouteName, string> = { detail: "gallery", recording: "audio-gallery" };

/** The history state the grid pushes when it opens a generation as a dialog over itself. */
export function dialogState(views: { grid: GalleryView; order: GalleryView }) {
  return { dialog: "gallery", load: APP_LOAD, ...views } as const;
}

/** The same for any gallery: its id and the views it carries (audio-gallery ADR-0048). */
export function mediaDialogState<V>(gallery: string, views: { grid: V; order: V }) {
  return { dialog: gallery, load: APP_LOAD, ...views } as const;
}

/** A detail route reached from this load's own grid: show the grid with the dialog, not the full page. */
export function isDialogVisit(route: Route): boolean {
  const s = route.state as { dialog?: unknown; load?: unknown } | null | undefined;
  return isDetailRoute(route) && s?.dialog === DIALOG_OF[route.name] && s.load === APP_LOAD;
}

const NAV_EVENT = "gen-img:navigate";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAV_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAV_EVENT, onChange);
  };
}

export function parseRoute(pathname: string, search = ""): RouteBase {
  const m = /^\/generations\/([^/]+)\/?$/.exec(pathname);
  if (m?.[1]) return { name: "detail", id: decodeURIComponent(m[1]) };
  const r = /^\/audio\/recordings\/([^/]+)\/?$/.exec(pathname);
  if (r?.[1]) return { name: "recording", id: decodeURIComponent(r[1]) };
  return { name: "page", pathname, search };
}

export function useRoute(): Route {
  // One string snapshot, so the store compares by value.
  const address = useSyncExternalStore(subscribe, () => window.location.pathname + window.location.search);
  const at = address.indexOf("?");
  const route = at < 0 ? parseRoute(address) : parseRoute(address.slice(0, at), address.slice(at));
  // Read at render time; every history change here or via popstate re-renders subscribers through the address snapshot
  // or NAV_EVENT, and the state only changes together with one of them.
  return { ...route, state: window.history.state };
}

export function navigate(path: string, state: unknown = null) {
  window.history.pushState(state, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
}

/** Swaps the address without a history entry — e.g. dropping a carried flag once applied (ADR-0023). */
export function replace(path: string, state: unknown = null) {
  window.history.replaceState(state, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function Link({ to, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={handle} {...props} />;
}
