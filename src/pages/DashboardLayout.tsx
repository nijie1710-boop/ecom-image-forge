import { Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";

import AppSidebar from "@/components/AppSidebar";
import BottomNav from "@/components/BottomNav";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { SidebarProvider } from "@/components/ui/sidebar";
import { matchDashboardNavItem, topLevelNavItems } from "@/lib/dashboard-nav";

const DashboardLayout = () => {
  const location = useLocation();
  const activeNav = matchDashboardNavItem(location.pathname, topLevelNavItems);
  const ActiveIcon = activeNav?.icon || LayoutDashboard;

  return (
    <SidebarProvider defaultOpen>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_34%)] bg-background">
        <div className="flex min-h-screen">
          <AppSidebar />

          <div className="min-w-0 flex-1 pb-20 md:pb-0">
            <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur-xl">
              <div className="mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-muted-foreground">当前模块</div>
                  <div className="mt-0.5 flex items-center gap-2 text-sm font-semibold text-foreground md:text-base">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <ActiveIcon className="h-4 w-4" />
                    </span>
                    <span className="truncate">{activeNav?.label || "工作台"}</span>
                  </div>
                  <div className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
                    {activeNav?.description || "查看概览与最近任务。"}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <ThemeSwitcher />
                  <LanguageSwitcher />
                </div>
              </div>
            </header>

            <main className="px-4 py-6 md:px-6">
              <Outlet />
            </main>
          </div>
        </div>

        <BottomNav />
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
