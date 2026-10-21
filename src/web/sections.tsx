import { AudioLines, Boxes, Images, type LucideIcon, Sparkles } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { SpeechPage } from "@/features/audio/SpeechPage";
import { Gallery } from "@/features/gallery/Gallery";
import { GalleryViews } from "@/features/gallery/GalleryViews";
import { GeneratePanel } from "@/features/generate/GeneratePanel";
import { JobIndicator } from "@/features/generate/job";
import { RecentGenerations } from "@/features/generate/RecentGenerations";
import { ModelsPage } from "@/features/models/ModelsPage";
import type { Route } from "@/lib/router";

/** One top-level area of Ukiyo (CONTEXT: Section). Adding a section = one entry here (ADR-0022). */
export type Section = {
  id: string;
  path: string;
  label: string;
  icon: LucideIcon;
  page: () => ReactNode;
  /** Stays rendered (hidden) while another page shows, so its state survives (ADR-0023). */
  keepMounted?: boolean;
  /** Shown after the label in the navigation bar, e.g. a running generation on Generate. */
  indicator?: ComponentType;
  /** Claims addresses outside its own path, e.g. Gallery owns a generation's detail page. */
  owns?: (route: Route) => boolean;
};

function GalleryPage() {
  return (
    <section aria-label="Gallery" className="flex flex-col gap-4">
      <h2 className="font-semibold">Gallery</h2>
      <GalleryViews />
      <Gallery />
    </section>
  );
}

/** Two columns from `lg` — the generate card and the recent generations (SCR-06); stacked below. */
function GeneratePage() {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)]">
      <section aria-label="Generate">
        <GeneratePanel />
      </section>
      <RecentGenerations />
    </div>
  );
}

export const SECTIONS: readonly Section[] = [
  {
    id: "generate",
    path: "/",
    label: "Generate",
    icon: Sparkles,
    page: GeneratePage,
    keepMounted: true,
    indicator: JobIndicator,
  },
  {
    id: "gallery",
    path: "/gallery",
    label: "Gallery",
    icon: Images,
    page: GalleryPage,
    owns: (route) => route.name === "detail",
  },
  { id: "speech", path: "/speech", label: "Speech", icon: AudioLines, page: SpeechPage },
  { id: "models", path: "/models", label: "Models", icon: Boxes, page: ModelsPage },
];

/** The section an address belongs to; none means «page not found». Exact paths, one trailing slash tolerated. */
export function sectionFor(route: Route, sections: readonly Section[] = SECTIONS): Section | undefined {
  return (
    sections.find((s) => s.owns?.(route)) ?? (route.name === "page" ? matchPath(route.pathname, sections) : undefined)
  );
}

function matchPath(pathname: string, sections: readonly Section[]) {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return sections.find((s) => s.path === path);
}
