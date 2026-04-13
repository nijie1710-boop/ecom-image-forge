import { useLocation } from "react-router-dom";
import { Shield, Sparkles } from "lucide-react";

import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { matchDashboardNavItem, sidebarSections } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png";

const allNavItems = sidebarSections.flatMap((section) => section.items);

const PicsparkLogo = () => (
  <div className="h-9 w-9 flex-shrink-0 rounded-2xl bg-primary/10 p-1.5">
    <img src={logo} alt="PicSpark AI" className="h-full w-full object-contain" />
  </div>
);

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { isAdmin } = useAuth();
  const currentItem = matchDashboardNavItem(location.pathname, allNavItems);
  const CurrentIcon = currentItem?.icon;

  return (
    <Sidebar collapsible="icon" variant="inset" className="border-r-0">
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border/70 px-4">
        <PicsparkLogo />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-semibold text-sidebar-foreground">PicSpark AI</div>
            <div className="truncate text-xs text-sidebar-foreground/65">电商创作工作台</div>
          </div>
        )}
      </div>

      <SidebarContent className="gap-4 px-2 py-3">
        {!collapsed && currentItem && (
          <div className="rounded-2xl border border-sidebar-border/70 bg-sidebar-accent/40 p-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-primary">
                {CurrentIcon ? <CurrentIcon className="h-4 w-4" /> : null}
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-sidebar-foreground">{currentItem.label}</div>
                <div className="mt-1 text-xs leading-5 text-sidebar-foreground/70">{currentItem.description}</div>
              </div>
            </div>
          </div>
        )}

        {sidebarSections.map((section, sectionIndex) => (
          <div key={section.title}>
            <SidebarGroup className="p-0">
              <SidebarGroupLabel className="px-3 text-[11px] uppercase tracking-[0.18em] text-sidebar-foreground/50">
                {section.title}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-1.5">
                  {section.items.map((item) => {
                    const active = item.end ? location.pathname === item.path : location.pathname.startsWith(item.path);
                    const Icon = item.icon;

                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton asChild isActive={active} className="h-auto rounded-2xl p-0">
                          <NavLink
                            to={item.path}
                            end={item.end}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 transition-all",
                              active
                                ? "bg-primary/10 text-primary shadow-sm"
                                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                            )}
                            activeClassName=""
                          >
                            <span
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                active ? "bg-primary/15 text-primary" : "bg-sidebar-accent/70 text-sidebar-foreground/60",
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            {!collapsed && (
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{item.label}</span>
                                {item.description ? (
                                  <span className="block truncate text-xs text-sidebar-foreground/55">{item.description}</span>
                                ) : null}
                              </span>
                            )}
                          </NavLink>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            {sectionIndex < sidebarSections.length - 1 ? <SidebarSeparator className="my-2" /> : null}
          </div>
        ))}

        {isAdmin ? (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-2">
            <SidebarMenu className="gap-1.5">
              <SidebarMenuItem>
                <SidebarMenuButton asChild className="h-auto rounded-2xl p-0">
                  <NavLink
                    to="/admin"
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-primary transition hover:bg-primary/10"
                    activeClassName=""
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                      <Shield className="h-4 w-4" />
                    </span>
                    {!collapsed && (
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">管理后台</span>
                        <span className="block truncate text-xs text-sidebar-foreground/60">仅管理员可见</span>
                      </span>
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        ) : null}

        {!collapsed ? (
          <div className="mt-auto rounded-2xl border border-primary/15 bg-primary/5 p-3">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <div className="text-sm font-medium text-sidebar-foreground">创作建议</div>
                <div className="mt-1 text-xs leading-5 text-sidebar-foreground/65">
                  快速出几张独立商品图用 AI 主图；做整套详情长图再进入 AI 详情图。
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </SidebarContent>
    </Sidebar>
  );
}

export default AppSidebar;
