import {
  ArrowRight,
  FileText,
  FolderOpen,
  Image,
  LayoutPanelTop,
  Sparkles,
  Upload,
  Wand2,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import demoLifestyle from "@/assets/demo-lifestyle-1.jpg";
import demoBuyer from "@/assets/demo-buyer-1.jpg";
import demoPremium from "@/assets/demo-premium-1.jpg";
import demoOffice from "@/assets/demo-office-1.jpg";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceShell";
import { WorkspaceSection } from "@/components/workspace/WorkspaceBlocks";

const steps = [
  {
    icon: Upload,
    title: "上传商品图",
    desc: "上传产品图或补充商品卖点，准备开始 AI 创作。",
  },
  {
    icon: Sparkles,
    title: "AI 生成方案",
    desc: "生成主图、场景图、详情页方案或图文翻译结果。",
  },
  {
    icon: FileText,
    title: "输出结果",
    desc: "下载图片、查看长图结构，或继续进入图片编辑与图片库管理。",
  },
];

const quickActions = [
  {
    icon: Wand2,
    title: "AI 生图",
    desc: "上传商品图，快速生成主图、详情图和场景图。",
    path: "/dashboard/generate",
    color: "from-primary to-purple-500",
  },
  {
    icon: LayoutPanelTop,
    title: "AI 详情页",
    desc: "先做整版策划，再逐屏生成整套电商详情页长图。",
    path: "/dashboard/detail-design",
    color: "from-fuchsia-500 to-rose-500",
  },
  {
    icon: Image,
    title: "图文翻译",
    desc: "识别图片文字并生成多语言版本，适合出海和跨境素材。",
    path: "/dashboard/translate",
    color: "from-cyan-500 to-sky-500",
  },
  {
    icon: FolderOpen,
    title: "图片库",
    desc: "查看、收藏、下载和管理已经生成过的图片结果。",
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
  return (
    <div className="mx-auto max-w-[1480px] space-y-4 px-3 py-4 sm:space-y-5 sm:px-4 sm:py-5 md:space-y-6 md:px-6 md:py-6">
      <WorkspaceHeader
        icon={Zap}
        badge="工作台首页"
        title="开始今天的电商创作"
        description="从 AI 生图、AI 详情页、图文翻译和图片库快速进入，把商品图生成、方案策划和结果管理放在一个工作台里完成。"
        steps={["上传素材", "生成方案", "下载或继续编辑"]}
      />

      <section className="grid gap-4 lg:gap-5 xl:grid-cols-[1.25fr_0.95fr] xl:gap-6">
        <Link to="/dashboard/generate" className="block">
          <div className="group relative overflow-hidden rounded-[28px] bg-gradient-to-br from-primary via-primary/90 to-purple-600 p-5 text-primary-foreground shadow-sm transition-shadow hover:shadow-xl hover:shadow-primary/20 sm:p-6 md:p-8">
            <div className="relative z-10 flex flex-col gap-4 sm:gap-5 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium sm:text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  推荐从这里开始
                </div>
                <h2 className="mt-4 text-xl font-bold sm:text-2xl md:text-3xl">开始 AI 创作</h2>
                <p className="mt-2 text-sm leading-6 text-primary-foreground/80 md:text-base">
                  用一张商品图快速生成电商主图和场景图，或者继续进入 AI 详情页做整套长图方案。
                </p>
              </div>
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-white/20 transition-transform group-hover:scale-110 sm:h-14 sm:w-14">
                <ArrowRight className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
            </div>
            <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/5 sm:h-36 sm:w-36" />
            <div className="absolute -bottom-12 -right-3 h-24 w-24 rounded-full bg-white/5 sm:h-28 sm:w-28" />
          </div>
        </Link>

        <WorkspaceSection
          title="使用步骤"
          description="先上传，再生成，最后把结果导出到图片库或继续编辑。"
        >
          <div className="space-y-3">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.title}
                  className="flex items-start gap-3 rounded-2xl border border-border bg-background p-3.5 sm:p-4"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 sm:h-10 sm:w-10">
                    <Icon className="h-4 w-4 text-primary sm:h-[18px] sm:w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">
                      {index + 1}. {step.title}
                    </div>
                    <div className="mt-1 text-sm leading-6 text-muted-foreground">{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </WorkspaceSection>
      </section>

      <WorkspaceSection
        title="快速入口"
        description="3 个核心 AI 创作页面和图片库都可以从这里直接进入。"
      >
        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2 2xl:grid-cols-4">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.path} to={action.path}>
                <div className="group flex h-full items-start gap-3 rounded-[24px] border border-border bg-background p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md sm:gap-4 sm:p-5">
                  <div
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${action.color} transition-transform group-hover:scale-105 sm:h-12 sm:w-12`}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground sm:text-base">{action.title}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{action.desc}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        title="示例展示"
        description="快速看看工作台当前更适合生成的常见风格和应用场景。"
      >
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4">
          {galleryItems.map((item) => (
            <div key={item.label} className="group relative overflow-hidden rounded-[24px]">
              <img
                src={item.src}
                alt={item.label}
                className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                <span className="text-sm font-medium text-white">{item.label}</span>
              </div>
            </div>
          ))}
        </div>
      </WorkspaceSection>
    </div>
  );
};

export default DashboardHome;
