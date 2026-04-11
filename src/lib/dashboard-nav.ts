import {
  CreditCard,
  FolderOpen,
  Image,
  Languages,
  LayoutDashboard,
  LayoutPanelTop,
  User,
  Wand2,
  type LucideIcon,
} from "lucide-react";

export type DashboardNavItem = {
  path: string;
  icon: LucideIcon;
  label: string;
  shortLabel?: string;
  description?: string;
  end?: boolean;
};

export const creationNavItems: DashboardNavItem[] = [
  {
    path: "/dashboard/generate",
    icon: Wand2,
    label: "AI 主图",
    shortLabel: "主图",
    description: "快速生成主图、场景图、单张详情图。",
  },
  {
    path: "/dashboard/detail-design",
    icon: LayoutPanelTop,
    label: "AI 详情图",
    shortLabel: "详情图",
    description: "先策划整版结构，再逐屏生成详情页。",
  },
  {
    path: "/dashboard/translate",
    icon: Languages,
    label: "图文翻译",
    shortLabel: "翻译",
    description: "识别图片文字并生成多语言版本。",
  },
];

export const sidebarSections: Array<{ title: string; items: DashboardNavItem[] }> = [
  {
    title: "创作工具",
    items: [
      {
        path: "/dashboard",
        icon: LayoutDashboard,
        label: "工作台首页",
        shortLabel: "首页",
        description: "查看最近任务，快速进入常用功能。",
        end: true,
      },
      ...creationNavItems,
      {
        path: "/dashboard/images",
        icon: FolderOpen,
        label: "图片库",
        shortLabel: "图片库",
        description: "管理生成结果、收藏图与最佳图。",
      },
    ],
  },
  {
    title: "账户与设置",
    items: [
      {
        path: "/dashboard/recharge",
        icon: CreditCard,
        label: "充值中心",
        shortLabel: "充值",
        description: "查看余额、购买积分与套餐。",
      },
      {
        path: "/dashboard/account",
        icon: User,
        label: "账户中心",
        shortLabel: "账户",
        description: "管理个人资料、登录信息与偏好设置。",
      },
    ],
  },
];

export const topLevelNavItems: DashboardNavItem[] = [
  {
    path: "/dashboard",
    icon: LayoutDashboard,
    label: "首页",
    shortLabel: "首页",
    description: "总览",
    end: true,
  },
  ...creationNavItems,
  {
    path: "/dashboard/images",
    icon: Image,
    label: "图片库",
    shortLabel: "图片库",
    description: "素材管理",
  },
  {
    path: "/dashboard/recharge",
    icon: CreditCard,
    label: "充值",
    shortLabel: "充值",
    description: "额度管理",
  },
  {
    path: "/dashboard/account",
    icon: User,
    label: "账户",
    shortLabel: "账户",
    description: "个人中心",
  },
];

export function matchDashboardNavItem(pathname: string, items: DashboardNavItem[]): DashboardNavItem | undefined {
  return items.find((item) => (item.end ? pathname === item.path : pathname.startsWith(item.path)));
}
