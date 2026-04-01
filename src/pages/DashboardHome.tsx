import { useTranslation } from "react-i18next";
import {
  Wand2,
  Image,
  Upload,
  Sparkles,
  FileText,
  ArrowRight,
  Zap,
  LayoutPanelTop,
} from "lucide-react";
import { Link } from "react-router-dom";
import demoLifestyle from "@/assets/demo-lifestyle-1.jpg";
import demoBuyer from "@/assets/demo-buyer-1.jpg";
import demoPremium from "@/assets/demo-premium-1.jpg";
import demoOffice from "@/assets/demo-office-1.jpg";

const steps = [
  { icon: Upload, title: "上传商品图", desc: "上传产品图或补充设计需求" },
  { icon: Sparkles, title: "AI 生成方案", desc: "生成主图、场景图或详情页策划" },
  { icon: FileText, title: "输出结果", desc: "导出图片、文案和长图结构方案" },
];

const quickActions = [
  {
    icon: Wand2,
    title: "AI 生图",
    desc: "上传商品，快速生成主图和场景图",
    path: "/dashboard/generate",
    color: "from-primary to-purple-500",
  },
  {
    icon: LayoutPanelTop,
    title: "AI 详情页",
    desc: "先做整版策划，再逐屏生成长图详情页",
    path: "/dashboard/detail-design",
    color: "from-fuchsia-500 to-rose-500",
  },
  {
    icon: Image,
    title: "我的图片库",
    desc: "查看和管理已经生成的图片结果",
    path: "/dashboard/images",
    color: "from-amber-500 to-orange-500",
  },
];

const galleryItems = [
  { src: demoLifestyle, label: "生活场景" },
  { src: demoBuyer, label: "买家秀" },
  { src: demoPremium, label: "品牌质感" },
  { src: demoOffice, label: "办公场景" },
];

const DashboardHome = () => {
  useTranslation();

  return (
    <div className="mx-auto max-w-7xl">
      <div className="px-4 pb-4 pt-6 md:px-8 md:pb-6 md:pt-10">
        <div className="mx-auto max-w-2xl text-center md:mx-0 md:text-left">
          <h1
            className="mb-2 text-3xl font-bold md:text-4xl lg:text-5xl"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(280, 70%, 55%) 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            PicSpark AI
          </h1>
          <p className="text-sm text-muted-foreground md:text-base">
            上传商品图，AI 快速生成电商图片、详情页策划和营销文案。
          </p>
        </div>
      </div>

      <div className="mb-6 px-4 md:px-8">
        <Link to="/dashboard/generate" className="block">
          <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-purple-600 p-5 text-primary-foreground transition-shadow hover:shadow-xl hover:shadow-primary/20 md:p-8">
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <h2 className="mb-1 text-lg font-bold md:text-2xl">开始 AI 创作</h2>
                <p className="text-sm text-primary-foreground/70 md:text-base">
                  用单图生成商品图，或直接进入新的 AI 详情页策划模块
                </p>
              </div>
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20 transition-transform group-hover:scale-110 md:h-14 md:w-14">
                <ArrowRight className="h-6 w-6" />
              </div>
            </div>
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/5" />
            <div className="absolute -bottom-10 -right-4 h-24 w-24 rounded-full bg-white/5" />
          </div>
        </Link>
      </div>

      <div className="mb-6 px-4 md:px-8">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.path} to={action.path}>
                <div className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md">
                  <div
                    className={`h-11 w-11 flex-shrink-0 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center transition-transform group-hover:scale-105`}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{action.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{action.desc}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mb-6 px-4 md:px-8">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Zap className="h-4 w-4 text-primary" />
          使用步骤
        </h3>
        <div className="flex flex-col gap-2.5">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="flex items-center gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium leading-tight text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
                {index < steps.length - 1 && (
                  <ArrowRight className="ml-auto hidden h-3 w-3 text-muted-foreground/40 md:block" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-8 md:px-8">
        <h3 className="mb-3 text-sm font-semibold text-foreground">示例展示</h3>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          {galleryItems.map((item, index) => (
            <div key={index} className="group relative overflow-hidden rounded-xl">
              <img
                src={item.src}
                alt={item.label}
                className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2.5">
                <span className="text-xs font-medium text-white">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardHome;
