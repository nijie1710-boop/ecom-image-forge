import { Link, useLocation } from "react-router-dom";
import { creationNavItems } from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";
import { LayoutDashboard, FolderOpen } from "lucide-react";

const navItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "首页", end: true },
  ...creationNavItems.map((item) => ({
    path: item.path,
    icon: item.icon,
    label: item.shortLabel || item.label,
  })),
  { path: "/dashboard/images", icon: FolderOpen, label: "图片库" },
];

export function BottomNav() {
  const location = useLocation();

  const isActive = (path: string, end?: boolean) => {
    if (end) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="border-t border-border/60 bg-background/95 backdrop-blur-xl safe-area-bottom">
        <div className="grid h-16 grid-cols-5 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path, item.end);

            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex items-center justify-center"
              >
                <div
                  className={cn(
                    "flex w-full flex-col items-center rounded-2xl px-1 py-2 transition-colors",
                    active ? "bg-primary/10 text-primary" : "text-muted-foreground",
                  )}
                >
                  <Icon className={cn("h-5 w-5", active ? "text-primary" : "text-muted-foreground")} />
                  <span className="mt-1 text-[10px] font-medium">{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
