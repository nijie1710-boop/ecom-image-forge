import { useLocation, Link } from "react-router-dom";
import { LayoutDashboard, Wand2, Languages, Image, User } from "lucide-react";

const navItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "首页", end: true },
  { path: "/dashboard/generate", icon: Wand2, label: "生成", isCenter: true },
  { path: "/dashboard/translate", icon: Languages, label: "翻译" },
  { path: "/dashboard/images", icon: Image, label: "图片" },
  { path: "/dashboard/account", icon: User, label: "我的" },
];

export function BottomNav() {
  const location = useLocation();

  const isActive = (path: string, end?: boolean) => {
    if (end) return location.pathname === path;
    return location.pathname.startsWith(path);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 md:hidden z-50">
      {/* Frosted glass background */}
      <div className="bg-card/90 backdrop-blur-xl border-t border-border/60 safe-area-bottom">
        <div className="flex items-end justify-around h-16 px-2">
          {navItems.map((item) => {
            const active = isActive(item.path, item.end);
            const Icon = item.icon;

            if (item.isCenter) {
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className="relative -top-3 flex flex-col items-center"
                >
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform active:scale-95 ${
                      active
                        ? 'bg-primary shadow-primary/30'
                        : 'bg-primary/90 shadow-primary/20'
                    }`}
                  >
                    <Icon className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <span className={`text-[10px] mt-1 font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                    {item.label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className="flex flex-col items-center justify-center flex-1 py-2 group"
              >
                <div className={`p-1.5 rounded-xl transition-colors ${active ? 'bg-primary/10' : ''}`}>
                  <Icon className={`h-5 w-5 transition-colors ${active ? 'text-primary' : 'text-muted-foreground group-active:text-foreground'}`} />
                </div>
                <span className={`text-[10px] mt-0.5 font-medium ${active ? 'text-primary' : 'text-muted-foreground'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
