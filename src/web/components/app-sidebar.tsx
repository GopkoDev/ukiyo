import { useQuery } from "@tanstack/react-query";
import { Waves } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { api } from "@/lib/api";
import { Link } from "@/lib/router";
import { groupOf, SECTION_GROUPS, type Section } from "@/sections";

/** SCR-04 — the kit's `sidebar-08` block trimmed to Ukiyo: brand, one group per section group (Image, Audio), footer (ADR-0022, ADR-0046). */
export function AppSidebar({ sections, current }: { sections: readonly Section[]; current: Section | undefined }) {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health });
  const label = health.isPending ? "checking…" : health.isSuccess ? "server ok" : "server unreachable";
  const { isMobile, setOpenMobile } = useSidebar();
  // On a narrow window the sidebar is a sheet: choosing an entry closes it.
  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/" onClick={close}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Waves className="size-4" aria-hidden />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Ukiyo</span>
                  <span className="truncate text-sidebar-foreground/70 text-xs" aria-hidden>
                    浮世 · the floating world
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Sections">
          {SECTION_GROUPS.map((group) => {
            const entries = sections.filter((s) => groupOf(s) === group.id);
            if (entries.length === 0) return null;
            return (
              <SidebarGroup key={group.id} role="group" aria-label={group.label}>
                <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
                <SidebarMenu>
                  {entries.map((s) => {
                    const Icon = s.icon;
                    const Indicator = s.indicator;
                    const isCurrent = s === current;
                    return (
                      <SidebarMenuItem key={s.id} className="relative">
                        <SidebarMenuButton asChild isActive={isCurrent} tooltip={s.label}>
                          <Link
                            to={s.path}
                            aria-current={isCurrent ? "page" : undefined}
                            aria-label={s.accessibleName}
                            onClick={close}
                          >
                            <Icon aria-hidden />
                            <span>{s.label}</span>
                            {Indicator && (
                              // Collapsed to the icon rail, the indicator sits on the icon's corner instead of after the label.
                              <span className="ml-auto flex items-center group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:top-0.5 group-data-[collapsible=icon]:right-0.5 group-data-[collapsible=icon]:[&_svg]:size-3">
                                <Indicator />
                              </span>
                            )}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroup>
            );
          })}
        </nav>
      </SidebarContent>
      <SidebarFooter className="flex-row flex-wrap items-center group-data-[collapsible=icon]:flex-col">
        <ModeToggle />
        <Badge
          variant={health.isError ? "destructive" : "secondary"}
          className="mx-2 group-data-[collapsible=icon]:hidden"
        >
          {label}
        </Badge>
      </SidebarFooter>
    </Sidebar>
  );
}
