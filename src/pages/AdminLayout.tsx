import { Link, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, ListChecks, Shield, Users } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cn } from "@/lib/utils";

const adminNav = [
  {
    path: "/admin",
    end: true,
    label: "后台总览",
    description: "查看核心指标、快捷入口和当前后台状态",
    icon: LayoutDashboard,
  },
  {
    path: "/admin/users",
    label: "用户与积分",
    description: "查看用户余额、充值情况并进行手动补充",
    icon: Users,
  },
  {
    path: "/admin/tasks",
    label: "任务管理",
    description: "查看最近任务、消耗记录和后台处理状态",
    icon: ListChecks,
  },
];

const AdminLayout = () => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.07),_transparent_34%)]">
      <header className="sticky top-0 z-30 border-b border-border bg-background/94 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-4 md:px-6">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Shield className="h-3.5 w-3.5" />
              管理后台
            </div>
            <div className="mt-1 text-lg font-semibold text-foreground">PicSpark 管理控制台</div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/dashboard"
              className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground"
            >
              返回工作台
            </Link>
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1480px] gap-6 px-4 py-6 md:px-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-3xl border border-border bg-card p-4 shadow-sm">
            <div className="mb-4 text-sm font-semibold text-foreground">后台导航</div>
            <div className="space-y-2">
              {adminNav.map((item) => {
                const active = item.end ? location.pathname === item.path : location.pathname.startsWith(item.path);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border px-3 py-3 transition",
                      active
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:border-primary/20 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl",
                        active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="mt-1 block text-xs leading-5 opacity-80">{item.description}</span>
                    </span>
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl bg-muted/60 p-3 text-xs leading-5 text-muted-foreground">
              这里只对管理员开放。第一版后台优先承载用户、积分和日常运营入口，后面再逐步补任务管理、图片审核和系统配置。
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
