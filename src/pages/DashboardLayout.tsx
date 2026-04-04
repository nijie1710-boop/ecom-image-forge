import { Link, Outlet, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { cn } from "@/lib/utils";
import {
  creationNavItems,
  matchDashboardNavItem,
  sidebarSections,
  topLevelNavItems,
} from "@/lib/dashboard-nav";
import logo from "@/assets/logo.png";

const allNavItems = sidebarSections.flatMap((section) => section.items);

const DashboardLayout = () => {
  const location = useLocation();
  const currentItem =
    matchDashboardNavItem(location.pathname, allNavItems) ||
    matchDashboardNavItem(location.pathname, topLevelNavItems);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />

        <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
          <header className="sticky top-0 z-40 border-b border-border bg-background/94 backdrop-blur-xl">
            <div className="flex h-14 items-center justify-between px-3 sm:h-16 sm:px-4 md:px-6">
              <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                <SidebarTrigger className="md:flex" />
                <Link to="/dashboard" className="flex min-w-0 items-center gap-2 sm:gap-3">
                  <img src={logo} alt="PicSpark AI" className="h-7 w-7 object-contain sm:h-8 sm:w-8" />
                  <div className="min-w-0">
                    <div
                      className="truncate text-sm font-bold"
                      style={{
                        background:
                          "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(280, 70%, 55%) 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      PicSpark AI
                    </div>
                    <div className="hidden truncate text-xs text-muted-foreground md:block">
                      {currentItem?.description || "电商创作工作台"}
                    </div>
                  </div>
                </Link>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <ThemeSwitcher />
                <LanguageSwitcher />
              </div>
            </div>

            <div className="border-t border-border/60 bg-card/40 px-3 py-2.5 sm:px-4 md:px-6 md:py-3">
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:text-xs">
                    当前模块
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                      {currentItem?.label || "工作台"}
                    </span>
                    <span className="hidden text-muted-foreground md:inline">
                      {currentItem?.description || "查看概览与最近任务"}
                    </span>
                  </div>
                </div>

                <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:justify-end">
                  {creationNavItems.map((item) => {
                    const active = location.pathname.startsWith(item.path);
                    const Icon = item.icon;

                    return (
                      <Link
                        key={item.path}
                        to={item.path}
                        className={cn(
                          "group flex min-w-[92px] shrink-0 items-center gap-2 rounded-2xl border px-2.5 py-2 text-xs transition-all sm:min-w-[132px] sm:px-3 sm:py-2.5 sm:text-sm",
                          active
                            ? "border-primary/30 bg-primary/10 text-primary shadow-sm"
                            : "border-border bg-background/80 text-muted-foreground hover:border-primary/20 hover:bg-card hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-xl transition-colors sm:h-8 sm:w-8",
                            active
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground group-hover:text-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{item.shortLabel || item.label}</span>
                          <span className="hidden truncate text-[11px] opacity-75 sm:block">
                            {item.description}
                          </span>
                        </span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>
          </header>

          <main className="flex-1 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.05),_transparent_36%)]">
            <div className="min-h-full px-0 md:px-1">
              <Outlet />
            </div>
          </main>

          <BottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
