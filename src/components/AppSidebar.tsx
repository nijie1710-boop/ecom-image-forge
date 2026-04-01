import {
  LayoutDashboard,
  Wand2,
  Languages,
  FolderOpen,
  CreditCard,
  User,
  LayoutPanelTop,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import logo from "@/assets/logo.png";

const navItems = [
  { path: "/dashboard", icon: LayoutDashboard, label: "仪表盘", end: true },
  { path: "/dashboard/generate", icon: Wand2, label: "生成图片" },
  { path: "/dashboard/detail-design", icon: LayoutPanelTop, label: "AI 详情页" },
  { path: "/dashboard/translate", icon: Languages, label: "图片翻译" },
  { path: "/dashboard/images", icon: FolderOpen, label: "我的图片" },
  { path: "/dashboard/pricing", icon: CreditCard, label: "价格" },
  { path: "/dashboard/account", icon: User, label: "账户" },
];

const PicsparkLogo = () => (
  <div className="h-8 w-8 flex-shrink-0">
    <img src={logo} alt="Picspark AI" className="h-full w-full object-contain" />
  </div>
);

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <div className="flex h-16 items-center gap-2 border-b border-border px-4">
        <PicsparkLogo />
        {!collapsed && <span className="font-display font-bold text-foreground">Picspark AI</span>}
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.path}
                        end={item.end}
                        className="hover:bg-sidebar-accent"
                        activeClassName="bg-sidebar-accent font-medium text-primary"
                      >
                        <Icon className="mr-2 h-4 w-4 flex-shrink-0" />
                        {!collapsed && <span>{item.label}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
