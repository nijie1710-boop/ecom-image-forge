import { useTranslation } from "react-i18next";
import { Wand2, Image, Upload, Sparkles, FileText, ArrowRight, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import demoLifestyle from "@/assets/demo-lifestyle-1.jpg";
import demoBuyer from "@/assets/demo-buyer-1.jpg";
import demoPremium from "@/assets/demo-premium-1.jpg";
import demoOffice from "@/assets/demo-office-1.jpg";

const steps = [
  { icon: Upload, title: "上传图片", desc: "上传产品照片或输入描述" },
  { icon: Sparkles, title: "AI生成", desc: "选择风格场景一键生成" },
  { icon: FileText, title: "生成文案", desc: "AI 生成营销卖点与详情页" },
];

const quickActions = [
  { icon: Wand2, title: "AI 生成图片", desc: "上传产品，秒出电商图", path: "/dashboard/generate", color: "from-primary to-purple-500" },
  { icon: Image, title: "我的图片库", desc: "查看和管理生成的图片", path: "/dashboard/images", color: "from-amber-500 to-orange-500" },
];

const galleryItems = [
  { src: demoLifestyle, label: "生活场景" },
  { src: demoBuyer, label: "买家秀" },
  { src: demoPremium, label: "品牌质感" },
  { src: demoOffice, label: "办公场景" },
];

const DashboardHome = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="px-4 pt-6 pb-4 md:px-8 md:pt-10 md:pb-6">
        <div className="text-center md:text-left max-w-2xl md:mx-0 mx-auto">
          <h1
            className="font-bold text-3xl md:text-4xl lg:text-5xl mb-2"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(280, 70%, 55%) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            PicSpark AI
          </h1>
          <p className="text-muted-foreground text-sm md:text-base">
            上传产品图，AI 秒级生成专业电商图片与营销文案
          </p>
        </div>
      </div>

      {/* Main CTA */}
      <div className="px-4 md:px-8 mb-6">
        <Link to="/dashboard/generate" className="block">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary via-primary/90 to-purple-600 p-5 md:p-8 text-primary-foreground group hover:shadow-xl hover:shadow-primary/20 transition-shadow">
            <div className="relative z-10 flex items-center justify-between">
              <div>
                <h2 className="text-lg md:text-2xl font-bold mb-1">开始 AI 创作</h2>
                <p className="text-primary-foreground/70 text-sm md:text-base">上传产品图片，AI 生成专业电商主图</p>
              </div>
              <div className="h-12 w-12 md:h-14 md:w-14 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                <ArrowRight className="h-6 w-6" />
              </div>
            </div>
            {/* Decorative circles */}
            <div className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
            <div className="absolute -right-4 -bottom-10 w-24 h-24 rounded-full bg-white/5" />
          </div>
        </Link>
      </div>

      {/* Quick Actions Grid */}
      <div className="px-4 md:px-8 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link key={action.path} to={action.path}>
                <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl hover:border-primary/30 hover:shadow-md transition-all group">
                  <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm">{action.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{action.desc}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Steps Row */}
      <div className="px-4 md:px-8 mb-6">
        <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-primary" />
          使用步骤
        </h3>
        <div className="flex flex-col gap-2.5">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm leading-tight">{step.title}</p>
                  <p className="text-xs text-muted-foreground">{step.desc}</p>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground/40 ml-auto hidden md:block" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Gallery */}
      <div className="px-4 md:px-8 pb-8">
        <h3 className="font-semibold text-foreground text-sm mb-3">示例展示</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
          {galleryItems.map((item, i) => (
            <div key={i} className="relative group overflow-hidden rounded-xl">
              <img
                src={item.src}
                alt={item.label}
                className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300"
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
