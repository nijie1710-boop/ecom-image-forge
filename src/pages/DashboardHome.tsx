import {
  ArrowRight,
  FileText,
  FolderOpen,
  Image,
  LayoutPanelTop,
  Sparkles,
  Upload,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import caseVorse from "@/assets/cases/vorse-supplement.jpg";
import caseUkulele from "@/assets/cases/andrew-ukulele.jpg";
import caseTowel from "@/assets/cases/kids-bath-towel.jpg";
import caseChair from "@/assets/cases/camping-chair.jpg";
import casePajamas from "@/assets/cases/harry-pajamas.jpg";
import caseMouse from "@/assets/cases/g304-mouse.jpg";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceShell";
import { WorkspaceSection } from "@/components/workspace/WorkspaceBlocks";

const GPT_BANNER_DISMISS_KEY = "picspark.banner.gpt-image-2-launch.dismissed";
// Banner auto-hides after this date even without dismissal (避免无限期挂着的"新功能"提示).
const GPT_BANNER_HIDE_AFTER = "2026-05-31";

const GPTLaunchBanner = () => {
  const [visible, setVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    if (window.localStorage?.getItem(GPT_BANNER_DISMISS_KEY)) return false;
    if (new Date() > new Date(GPT_BANNER_HIDE_AFTER)) return false;
    return true;
  });

  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage?.setItem(GPT_BANNER_DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore storage errors
    }
    setVisible(false);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/15 bg-gradient-to-r from-violet-50 via-fuchsia-50 to-purple-50 dark:from-violet-950/40 dark:via-fuchsia-950/30 dark:to-purple-950/40">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5 pr-10 sm:flex-nowrap sm:gap-4 sm:px-5 sm:py-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/90 text-primary shadow-sm dark:bg-white/10">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1 text-sm leading-snug text-foreground">
          🆕 <span className="font-semibold text-primary">GPT Image 2</span> 已上线
          <span className="mx-1.5 text-muted-foreground">·</span>
          🔥 限时优惠 <span className="font-semibold text-primary">12 积分</span> 起
          <span className="mx-1.5 text-muted-foreground">·</span>
          <span className="hidden text-xs text-muted-foreground sm:inline">汉字渲染最强 · 失败自动退积分</span>
        </div>
        <Link
          to="/dashboard/generate"
          className="inline-flex flex-shrink-0 items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition hover:bg-primary/90 sm:text-sm"
        >
          立即体验
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="关闭公告"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-white/60 hover:text-foreground dark:hover:bg-white/10"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

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
    title: "AI 主图",
    subtitle: "快速生成主图、场景图、单张详情图",
    desc: "上传商品图后，快速生成多张电商图片结果，适合高频出图、快速试风格和挑图。",
    cta: "立即进入",
    path: "/dashboard/generate",
    color: "from-primary to-violet-600",
  },
  {
    icon: LayoutPanelTop,
    title: "AI 详情图",
    subtitle: "先策划整版结构，再逐屏生成详情页",
    desc: "先生成多套详情页方案，再按屏输出完整详情图，适合制作统一风格的商品详情长图。",
    cta: "开始制作",
    path: "/dashboard/detail-design",
    color: "from-violet-500 to-fuchsia-500",
  },
  {
    icon: Image,
    title: "图文翻译",
    subtitle: "识别图片文字并生成多语言版本",
    desc: "识别图片文字并生成多语言版本，适合出海和跨境素材。",
    cta: "立即进入",
    path: "/dashboard/translate",
    color: "from-indigo-500 to-violet-500",
  },
  {
    icon: FolderOpen,
    title: "图片库",
    subtitle: "管理和复用已生成图片",
    desc: "查看、收藏、下载和管理已经生成过的图片结果。",
    cta: "查看图片库",
    path: "/dashboard/images",
    color: "from-purple-500 to-indigo-600",
  },
];

const galleryImages = [caseVorse, caseUkulele, caseTowel, caseChair, casePajamas, caseMouse];

const DashboardHome = () => {
  return (
    <div className="space-y-4 py-1 sm:space-y-5 md:space-y-6">
      <WorkspaceHeader
        icon={Zap}
        badge="工作台首页"
        title="开始今天的电商创作"
        description="从 AI 主图、AI 详情图、图文翻译和图片库快速进入，把商品图生成、整版详情策划和结果管理放在一个工作台里完成。"
        steps={["上传素材", "生成方案", "下载或继续编辑"]}
      />

      <GPTLaunchBanner />

      <section className="grid gap-4 lg:gap-5 xl:grid-cols-[1.25fr_0.95fr] xl:gap-6">
        <Link to="/dashboard/generate" className="block">
          <div className="group relative overflow-hidden rounded-[28px] bg-gradient-to-br from-primary via-primary/90 to-purple-600 p-4 text-primary-foreground shadow-sm transition-shadow hover:shadow-xl hover:shadow-primary/20 sm:p-6 md:p-8">
            <div className="relative z-10 flex flex-col gap-4 sm:gap-5 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xl">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium sm:text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  推荐从这里开始
                </div>
                <h2 className="mt-3 text-lg font-bold sm:mt-4 sm:text-2xl md:text-3xl">先从 AI 主图快速试一版</h2>
                <p className="mt-1.5 text-sm leading-6 text-primary-foreground/80 sm:mt-2 md:text-base">
                  想快速出一张或几张商品图，先用 AI 主图试风格；需要整套详情页和长图时，再进入 AI 详情图做完整策划。
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
                    <p className="mt-0.5 text-xs font-medium text-primary">{action.subtitle}</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">{action.desc}</p>
                    <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                      {action.cta}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6">
          <div className="font-semibold text-foreground">不知道选哪个？</div>
          <div className="mt-1 text-muted-foreground">
            想快速出一张或几张商品图，选 AI 主图；想做整套详情页和长图，选 AI 详情图。
          </div>
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        title="详情页案例"
        description="所有案例为用户真实生成案例，无任何后期处理。鼠标悬停查看全图。"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-6">
          {galleryImages.map((src, i) => (
            <div
              key={i}
              tabIndex={0}
              className="group relative h-[380px] overflow-hidden rounded-xl bg-background shadow-sm outline-none focus-within:ring-2 focus-within:ring-primary md:h-[420px]"
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                style={{ transitionDuration: "8s", transitionProperty: "transform", transitionTimingFunction: "linear" }}
                className="block w-full group-hover:-translate-y-[calc(100%-380px)] group-focus-within:-translate-y-[calc(100%-380px)] md:group-hover:-translate-y-[calc(100%-420px)] md:group-focus-within:-translate-y-[calc(100%-420px)]"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pt-10 pb-3 text-center">
                <span className="text-xs font-medium tracking-wide text-white/90">
                  鼠标悬停查看全图
                </span>
              </div>
            </div>
          ))}
        </div>
      </WorkspaceSection>
    </div>
  );
};

export default DashboardHome;
