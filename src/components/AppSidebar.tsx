import { useTranslation } from "react-i18next";
import { Sparkles, LayoutDashboard, Wand2, FolderOpen, CreditCard, User, Languages } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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

const PicsparkLogo = () => (
  <div className="w-8 h-8 flex-shrink-0">
    <img src={logo} alt="Picspark AI" className="w-full h-full object-contain" />
  </div>
);

const navIcons = [LayoutDashboard, Wand2, Languages, FolderOpen, CreditCard, User];
const navUrls = ["/dashboard", "/dashboard/generate", "/dashboard/translate", "/dashboard/images", "/dashboard/pricing", "/dashboard/account"];
const navKeys = ["sidebar.dashboard", "sidebar.generate", "sidebar.translate", "sidebar.myImages", "sidebar.pricing", "sidebar.account"];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t } = useTranslation();

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <div className="h-16 flex items-center gap-2 px-4 border-b border-border">
        <PicsparkLogo />
        {!collapsed && <span className="font-display font-bold text-foreground">Picspark AI</span>}
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navKeys.map((key, i) => {
                const Icon = navIcons[i];
                const url = navUrls[i];
                return (
                  <SidebarMenuItem key={key}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={url}
                        end={url === "/dashboard"}
                        className="hover:bg-sidebar-accent"
                        activeClassName="bg-sidebar-accent text-primary font-medium"
                      >
                        <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
                        {!collapsed && <span>{t(key)}</span>}
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
