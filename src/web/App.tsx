import { useEffect, useState } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { NotFound } from "@/components/NotFound";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { isDetailRoute, isDialogVisit, Link, type Route, replace, useRoute } from "@/lib/router";
import { SECTIONS, type Section, sectionFor } from "@/sections";

/** Where the Owner is: the section, then its item («Generation», «Recording») on a detail page; «Page not found» otherwise. */
function Crumbs({ route, current }: { route: Route; current: Section | undefined }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {current && isDetailRoute(route) ? (
          <>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={current.path}>{current.label}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{current.detail?.label ?? "Item"}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : (
          <BreadcrumbItem>
            <BreadcrumbPage>{current?.label ?? "Page not found"}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** On a narrow window the sidebar is a closed sheet, so its entries' indicators show next to the menu button. */
function HeaderIndicators({ sections }: { sections: readonly Section[] }) {
  const { isMobile } = useSidebar();
  if (!isMobile) return null;
  return sections.map((s) => {
    const Indicator = s.indicator;
    return Indicator && <Indicator key={s.id} />;
  });
}

/** The app frame — the `sidebar-08` block: sidebar + inset with the current page (ADR-0022). Kept-mounted
 * sections stay rendered, hidden (ADR-0023). */
export function App({ sections = SECTIONS }: { sections?: readonly Section[] }) {
  const route = useRoute();
  const dialog = isDialogVisit(route);
  const current = sectionFor(route, sections);
  const detail = isDetailRoute(route) && current?.detail?.route === route.name ? current.detail : undefined;
  const itemId = isDetailRoute(route) ? route.id : "";

  useEffect(() => {
    document.title = current ? `${current.label} · Ukiyo` : "Page not found · Ukiyo";
  }, [current]);

  // A former address (alias) opens its section and the address bar shows the current one — no history entry (ADR-0046).
  const aliased =
    route.name === "page" && current !== undefined && current.path !== route.pathname.replace(/(.)\/$/, "$1");
  useEffect(() => {
    if (aliased && current && route.name === "page") replace(current.path + route.search);
  }, [aliased, current, route]);

  // «after-visit» sections mount on their first visit and then stay mounted (ADR-0045).
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set(current ? [current.id] : []));
  if (current && !visited.has(current.id)) setVisited(new Set([...visited, current.id]));
  const mounted = (s: Section) => s.keepMounted === true || (s.keepMounted === "after-visit" && visited.has(s.id));

  return (
    <SidebarProvider>
      <AppSidebar sections={sections} current={current} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 px-4">
          <h1 className="sr-only">Ukiyo</h1>
          <SidebarTrigger className="-ml-1" />
          <HeaderIndicators sections={sections} />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Crumbs route={route} current={current} />
        </header>
        <div className="min-w-0 flex-1 px-4 pb-6 md:px-6">
          {/* Kept-mounted pages sit at a fixed place in the tree, so showing or hiding them never remounts them. */}
          {sections.filter(mounted).map((s) => (
            <div key={s.id} hidden={s !== current || isDetailRoute(route)}>
              <s.page />
            </div>
          ))}
          {/* The section page (the grid) sits at this one place for /gallery and a dialog visit, so it never remounts. */}
          {detail && !dialog ? (
            <detail.Page id={itemId} />
          ) : !current || (isDetailRoute(route) && !detail) ? (
            <NotFound />
          ) : (
            !current.keepMounted && <current.page />
          )}
          {detail && dialog && <detail.Dialog id={itemId} />}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
