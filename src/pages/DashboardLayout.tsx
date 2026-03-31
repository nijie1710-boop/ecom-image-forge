import { Outlet, Link, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { BottomNav } from "@/components/BottomNav";
import { LayoutDashboard, Wand2, Image, CreditCard, User } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import logo from "@/assets/logo.png";

const desktopNav = [
  { path: "/dashboard", icon: LayoutDashboard, label: "首页", end: true },
  { path: "/dashboard/generate", icon: Wand2, label: "AI 生成" },
  { path: "/dashboard/images", icon: Image, label: "图片库" },
  { path: "/dashboard/recharge", icon: CreditCard, label: "充值" },
  { path: "/dashboard/account", icon: User, label: "账户" },
];

const DashboardLayout = () => {
  const location = useLocation();

  const isActive = (path: string, end?: boolean) => {
    if (end) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 pb-16 md:pb-0">
          <header className="sticky top-0 z-40 h-14 flex items-center justify-between border-b border-border px-4 bg-card/95 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <SidebarTrigger className="hidden md:flex" />
              <Link to="/dashboard" className="flex items-center gap-2">
                <img src={logo} alt="PicSpark AI" className="w-7 h-7 object-contain" />
                <span
                  className="font-bold text-sm hidden sm:inline"
                  style={{
                    background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(280, 70%, 55%) 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  PicSpark AI
                </span>
              </Link>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {desktopNav.map((item) => {
                const active = isActive(item.path, item.end);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Right: Theme + Language + CTA */}
            <div className="flex items-center gap-1">
              <ThemeSwitcher />
              <LanguageSwitcher />
              <Link
                to="/dashboard/generate"
                className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
              >
                <Wand2 className="h-4 w-4" />
                生成
              </Link>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>

          <BottomNav />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default DashboardLayout;
