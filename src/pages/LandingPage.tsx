import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Upload,
  Wand2,
  Download,
  Zap,
  Check,
  Menu,
  X,
  Globe,
  LayoutPanelTop,
  ArrowRight,
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useState } from "react";
import heroShowcase from "@/assets/hero-showcase.jpg";
import demoProduct from "@/assets/demo-product-1.jpg";
import demoLifestyle from "@/assets/demo-lifestyle-1.jpg";
import demoBuyer from "@/assets/demo-buyer-1.jpg";
import demoPremium from "@/assets/demo-premium-1.jpg";
import demoOffice from "@/assets/demo-office-1.jpg";
import logo from "@/assets/logo.png";

const galleryImages = [demoProduct, demoLifestyle, demoBuyer, demoPremium, demoOffice];

const featureIconMap = [
  { icon: Sparkles, color: "bg-primary/10 text-primary" },
  { icon: LayoutPanelTop, color: "bg-accent/10 text-accent" },
  { icon: Globe, color: "bg-orange-500/10 text-orange-500" },
];

const stepIcons = [Upload, Wand2, Download];

const LandingPage = () => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const brandName = t("brand.name", "PicSpark AI");

  const featureItems = t("features.items", { returnObjects: true }) as Array<{
    title: string;
    desc: string;
    highlights: string[];
  }>;
  const galleryLabels = t("gallery.labels", { returnObjects: true }) as string[];
  const plans = t("pricing.plans", { returnObjects: true }) as Array<{
    name: string;
    price: string;
    credits: string;
    features: string[];
    cta: string;
    badge: string;
  }>;
  const steps = t("howItWorks.steps", { returnObjects: true }) as Array<{
    title: string;
    desc: string;
  }>;
  const platformList = t("platforms.list", { returnObjects: true }) as string[];
  const statsItems = t("stats.items", { returnObjects: true }) as Array<{
    value: string;
    label: string;
  }>;

  const navLinks = [
    { href: "#features", label: t("nav.features") },
    { href: "#how-it-works", label: t("nav.howItWorks") },
    { href: "#gallery", label: t("nav.gallery") },
    { href: "#pricing", label: t("nav.pricing") },
  ];

  return (
    <div className="min-h-screen font-body">
      {/* Nav */}
      <nav className="fixed top-0 z-50 w-full border-b border-foreground/10 bg-hero/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-14 items-center justify-between px-4 md:h-16 md:px-6">
          <div className="flex items-center gap-2">
            <img src={logo} alt="PicSpark AI" className="h-7 w-7 object-contain" />
            <span className="font-display text-base font-bold text-hero-foreground md:text-lg">{brandName}</span>
          </div>

          <div className="hidden items-center gap-8 text-sm text-hero-foreground/70 md:flex">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-hero-foreground">
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="hero" />
            <Link to="/dashboard" className="hidden md:block">
              <Button variant="hero" size="sm">{t("nav.openStudio")}</Button>
            </Link>
            <button onClick={() => setMenuOpen(!menuOpen)} className="p-2 text-hero-foreground md:hidden">
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="space-y-2 border-t border-foreground/10 bg-hero/95 px-4 pb-4 backdrop-blur-xl md:hidden">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm text-hero-foreground/80 transition-colors hover:text-hero-foreground"
              >
                {link.label}
              </a>
            ))}
            <Link to="/dashboard" className="block pt-2">
              <Button variant="hero" size="sm" className="w-full">{t("nav.openStudio")}</Button>
            </Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden bg-hero pt-14 md:pt-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(239_84%_67%/0.15),transparent_70%)]" />
        <div className="container relative z-10 mx-auto px-4 pb-8 pt-16 md:px-6 md:pb-12 md:pt-24">
          <div className="mx-auto mb-8 max-w-3xl text-center md:mb-12">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary md:mb-6">
              <Zap className="h-3.5 w-3.5" />
              {t("hero.badge")}
            </div>
            <h1 className="font-display mb-4 text-3xl font-extrabold leading-tight text-hero-foreground md:mb-6 md:text-5xl lg:text-6xl">
              {t("hero.title1")}
              <br />
              <span className="text-primary">{t("hero.title2")}</span>
            </h1>
            <p className="mx-auto mb-6 max-w-2xl px-2 text-base text-hero-foreground/60 md:mb-8 md:text-lg">
              {t("hero.subtitle")}
            </p>
            <div className="flex flex-col justify-center gap-3 px-4 sm:flex-row sm:px-0">
              <Link to="/dashboard">
                <Button variant="hero" size="lg" className="w-full px-8 text-base sm:w-auto">
                  {t("hero.cta")}
                  <Sparkles className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              <a href="#gallery">
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full border-hero-foreground/30 bg-transparent text-base text-hero-foreground hover:bg-hero-foreground/10 hover:text-hero-foreground sm:w-auto"
                >
                  {t("hero.viewGallery")}
                </Button>
              </a>
            </div>
          </div>
          <div className="mx-auto max-w-5xl">
            <img
              src={heroShowcase}
              alt="AI generated e-commerce product images showcase"
              className="w-full rounded-t-2xl shadow-2xl shadow-primary/10"
              loading="lazy"
            />
          </div>
        </div>
      </section>

      {/* Platform logos */}
      <section className="border-b border-border bg-muted/30 py-8 md:py-10">
        <div className="container mx-auto px-4 md:px-6">
          <p className="mb-5 text-center text-sm font-medium text-muted-foreground md:mb-6">{t("platforms.title")}</p>
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4">
            {platformList.map((name) => (
              <span
                key={name}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground/70 md:px-4 md:py-2 md:text-sm"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="bg-background py-10 md:py-14">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
            {statsItems.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="font-display text-3xl font-extrabold text-primary md:text-4xl">{stat.value}</div>
                <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-10 text-center md:mb-16">
            <h2 className="font-display mb-3 text-2xl font-bold text-foreground md:mb-4 md:text-4xl">
              {t("features.sectionTitle")}
            </h2>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground md:text-base">
              {t("features.sectionSubtitle")}
            </p>
          </div>
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3 md:gap-6">
            {featureItems.map((f, i) => {
              const { icon: Icon, color } = featureIconMap[i] || featureIconMap[0];
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-lg hover:shadow-primary/5 md:p-6"
                >
                  <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-display mb-2 text-lg font-bold text-card-foreground">{f.title}</h3>
                  <p className="mb-4 text-sm leading-6 text-muted-foreground">{f.desc}</p>
                  <ul className="space-y-2">
                    {f.highlights?.map((h, hi) => (
                      <li key={hi} className="flex items-center gap-2 text-sm text-foreground/80">
                        <Check className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-10 text-center md:mb-16">
            <h2 className="font-display mb-3 text-2xl font-bold text-foreground md:mb-4 md:text-4xl">
              {t("howItWorks.sectionTitle")}
            </h2>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground md:text-base">
              {t("howItWorks.sectionSubtitle")}
            </p>
          </div>
          <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3 md:gap-8">
            {steps.map((step, i) => {
              const Icon = stepIcons[i];
              return (
                <div key={i} className="relative text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-7 w-7" />
                  </div>
                  <div className="mb-1 text-xs font-bold uppercase tracking-wider text-primary">
                    Step {i + 1}
                  </div>
                  <h3 className="font-display mb-2 text-lg font-bold text-foreground">{step.title}</h3>
                  <p className="text-sm leading-6 text-muted-foreground">{step.desc}</p>
                  {i < steps.length - 1 && (
                    <ArrowRight className="absolute right-0 top-8 hidden h-5 w-5 translate-x-1/2 text-muted-foreground/30 md:block" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section id="gallery" className="bg-muted/50 py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-10 text-center md:mb-16">
            <h2 className="font-display mb-3 text-2xl font-bold text-foreground md:mb-4 md:text-4xl">
              {t("gallery.sectionTitle")}
            </h2>
            <p className="mx-auto max-w-xl text-sm text-muted-foreground md:text-base">
              {t("gallery.sectionSubtitle")}
            </p>
          </div>
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-5">
            {galleryImages.map((src, i) => (
              <div key={i} className="group relative overflow-hidden rounded-xl">
                <img
                  src={src}
                  alt={galleryLabels[i]}
                  className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 md:p-3">
                  <span className="text-xs font-medium text-white">{galleryLabels[i]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="bg-background py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="mb-10 text-center md:mb-16">
            <h2 className="font-display mb-3 text-2xl font-bold text-foreground md:mb-4 md:text-4xl">
              {t("pricing.sectionTitle")}
            </h2>
            <p className="text-sm text-muted-foreground md:text-base">{t("pricing.sectionSubtitle")}</p>
          </div>
          <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-4">
            {plans.map((plan, idx) => {
              const highlight = idx === 1;
              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-5 md:p-6 ${
                    highlight
                      ? "border-primary bg-card shadow-xl shadow-primary/10 ring-2 ring-primary/20"
                      : "border-border bg-card"
                  }`}
                >
                  {plan.badge && (
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-primary">
                      {plan.badge}
                    </div>
                  )}
                  <h3 className="font-display text-lg font-bold text-card-foreground">{plan.name}</h3>
                  <div className="mb-1 mt-2">
                    <span className="font-display text-3xl font-extrabold text-card-foreground">{plan.price}</span>
                  </div>
                  <div className="mb-5 text-sm text-muted-foreground">
                    {plan.credits} {t("pricing.creditUnit")}
                  </div>
                  <ul className="mb-6 space-y-2.5">
                    {plan.features.map((f, fi) => (
                      <li key={fi} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 flex-shrink-0 text-accent" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link to="/dashboard/recharge">
                    <Button variant={highlight ? "hero" : "outline"} className="w-full">
                      {plan.cta}
                    </Button>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-hero py-16 md:py-20">
        <div className="container mx-auto px-4 text-center md:px-6">
          <h2 className="font-display mb-4 text-2xl font-bold text-hero-foreground md:text-4xl">
            {t("cta.title")}
          </h2>
          <p className="mx-auto mb-6 max-w-lg text-hero-foreground/60 md:mb-8">
            {t("cta.subtitle")}
          </p>
          <Link to="/dashboard">
            <Button variant="hero" size="lg" className="px-10 text-base">
              {t("cta.button")}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-foreground/10 bg-hero py-10 md:py-12">
        <div className="container mx-auto px-4 text-center md:px-6">
          <div className="mb-3 flex items-center justify-center gap-2">
            <img src={logo} alt="PicSpark AI" className="h-7 w-7 object-contain" />
            <span className="font-display font-bold text-hero-foreground">{brandName}</span>
          </div>
          <p className="mb-4 text-sm text-hero-foreground/50">{t("footer.slogan")}</p>
          <div className="mb-3 flex items-center justify-center gap-4">
            <Link to="/terms" className="text-sm text-hero-foreground/50 transition-colors hover:text-hero-foreground/80">
              {t("footer.terms")}
            </Link>
            <span className="text-hero-foreground/20">|</span>
            <Link to="/privacy" className="text-sm text-hero-foreground/50 transition-colors hover:text-hero-foreground/80">
              {t("footer.privacy")}
            </Link>
          </div>
          <p className="text-sm text-hero-foreground/40">{t("footer.rights")}</p>
          <p className="mt-2 text-xs text-hero-foreground/40">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-hero-foreground/70"
            >
              闽ICP备2026009301号-3
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
