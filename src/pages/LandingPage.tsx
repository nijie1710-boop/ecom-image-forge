import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sparkles, Upload, Wand2, Download, Image, Layers, Camera, Zap, Check, Crown, Menu, X } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useState } from "react";
import heroShowcase from "@/assets/hero-showcase.jpg";
import demoProduct from "@/assets/demo-product-1.jpg";
import demoLifestyle from "@/assets/demo-lifestyle-1.jpg";
import demoBuyer from "@/assets/demo-buyer-1.jpg";
import demoPremium from "@/assets/demo-premium-1.jpg";
import demoOffice from "@/assets/demo-office-1.jpg";
import logo from "@/assets/logo.png";

const featureIcons = [Upload, Wand2, Zap, Layers, Camera, Sparkles, Download, Crown];
const galleryImages = [demoProduct, demoLifestyle, demoBuyer, demoPremium, demoOffice];

const LandingPage = () => {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const brandName = t("brand.name", "Picspark AI");
  const featureItems = t("features.items", { returnObjects: true }) as Array<{ title: string; desc: string }>;
  const galleryLabels = t("gallery.labels", { returnObjects: true }) as string[];
  const plans = t("pricing.plans", { returnObjects: true }) as Array<{ name: string; price: string; features: string[]; cta: string }>;

  const navLinks = [
    { href: "#features", label: t("nav.features") },
    { href: "#gallery", label: t("nav.gallery") },
    { href: "#pricing", label: t("nav.pricing") },
  ];

  return (
    <div className="min-h-screen font-body">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-hero/80 backdrop-blur-xl border-b border-foreground/10">
        <div className="container mx-auto flex items-center justify-between h-14 md:h-16 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <img src={logo} alt="PicSpark AI" className="w-7 h-7 object-contain" />
            <span className="font-display font-bold text-base md:text-lg text-hero-foreground">{brandName}</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8 text-sm text-hero-foreground/70">
            {navLinks.map((link) => (
              <a key={link.href} href={link.href} className="hover:text-hero-foreground transition-colors">{link.label}</a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <LanguageSwitcher variant="hero" />
            <Link to="/dashboard" className="hidden md:block">
              <Button variant="hero" size="sm">{t("nav.openStudio")}</Button>
            </Link>
            {/* Mobile menu toggle */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-hero-foreground"
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="md:hidden bg-hero/95 backdrop-blur-xl border-t border-foreground/10 pb-4 px-4 space-y-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block py-2.5 text-sm text-hero-foreground/80 hover:text-hero-foreground transition-colors"
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
      <section className="relative bg-hero pt-14 md:pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(239_84%_67%/0.15),transparent_70%)]" />
        <div className="container mx-auto px-4 md:px-6 pt-16 md:pt-24 pb-8 md:pb-12 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-8 md:mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-4 md:mb-6">
              <Zap className="h-3.5 w-3.5" />
              {t("hero.badge")}
            </div>
            <h1 className="font-display text-3xl md:text-5xl lg:text-6xl font-extrabold text-hero-foreground leading-tight mb-4 md:mb-6">
              {t("hero.title1")}{" "}
              <span className="text-primary">{t("hero.title2")}</span>
            </h1>
            <p className="text-base md:text-lg text-hero-foreground/60 max-w-2xl mx-auto mb-6 md:mb-8 px-2">
              {t("hero.subtitle")}
            </p>
            <div className="flex gap-3 justify-center flex-col sm:flex-row px-4 sm:px-0">
              <Link to="/dashboard">
                <Button variant="hero" size="lg" className="text-base px-8 w-full sm:w-auto">
                  {t("hero.cta")}
                  <Sparkles className="h-4 w-4 ml-1" />
                </Button>
              </Link>
              <a href="#gallery">
                <Button variant="outline" size="lg" className="text-base border-hero-foreground/20 text-hero-foreground hover:bg-hero-foreground/10 w-full sm:w-auto">
                  {t("hero.viewGallery")}
                </Button>
              </a>
            </div>
          </div>
          <div className="max-w-5xl mx-auto">
            <img src={heroShowcase} alt="AI generated e-commerce product images showcase" className="w-full rounded-t-2xl shadow-2xl shadow-primary/10" loading="lazy" />
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="font-display text-2xl md:text-4xl font-bold text-foreground mb-3 md:mb-4">{t("features.sectionTitle")}</h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">{t("features.sectionSubtitle")}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 max-w-5xl mx-auto">
            {featureItems.map((f, i) => {
              const Icon = featureIcons[i];
              return (
                <div key={i} className="bg-card border border-border rounded-xl p-4 md:p-6 hover:shadow-lg hover:shadow-primary/5 transition-shadow">
                  <div className="h-9 w-9 md:h-10 md:w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 md:mb-4">
                    <Icon className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold text-card-foreground text-sm md:text-base mb-1 md:mb-2">{f.title}</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">{f.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Gallery */}
      <section id="gallery" className="py-16 md:py-24 bg-muted/50">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="font-display text-2xl md:text-4xl font-bold text-foreground mb-3 md:mb-4">{t("gallery.sectionTitle")}</h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm md:text-base">{t("gallery.sectionSubtitle")}</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 max-w-5xl mx-auto">
            {galleryImages.map((src, i) => (
              <div key={i} className="group relative overflow-hidden rounded-xl">
                <img src={src} alt={galleryLabels[i]} className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 md:p-3">
                  <span className="text-xs font-medium text-white">{galleryLabels[i]}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-16 md:py-24 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center mb-10 md:mb-16">
            <h2 className="font-display text-2xl md:text-4xl font-bold text-foreground mb-3 md:mb-4">{t("pricing.sectionTitle")}</h2>
            <p className="text-muted-foreground text-sm md:text-base">{t("pricing.sectionSubtitle")}</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
            {plans.map((plan, idx) => {
              const highlight = idx === 1;
              return (
                <div key={idx} className={`rounded-xl p-5 md:p-6 border ${highlight ? "border-primary bg-card shadow-xl shadow-primary/10 ring-2 ring-primary/20" : "border-border bg-card"}`}>
                  {highlight && <div className="text-xs font-semibold text-primary mb-3 md:mb-4 uppercase tracking-wider">{t("pricing.mostPopular")}</div>}
                  <h3 className="font-display text-lg md:text-xl font-bold text-card-foreground">{plan.name}</h3>
                  <div className="mt-2 mb-5 md:mb-6">
                    <span className="font-display text-3xl md:text-4xl font-extrabold text-card-foreground">{plan.price}</span>
                    <span className="text-muted-foreground text-sm">{t("pricing.period")}</span>
                  </div>
                  <ul className="space-y-2.5 md:space-y-3 mb-6 md:mb-8">
                    {plan.features.map((f, fi) => (
                      <li key={fi} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Check className="h-4 w-4 text-accent flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link to="/dashboard">
                    <Button variant={highlight ? "hero" : "outline"} className="w-full">{plan.cta}</Button>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-hero py-10 md:py-12 border-t border-foreground/10">
        <div className="container mx-auto px-4 md:px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <img src={logo} alt="PicSpark AI" className="w-7 h-7 object-contain" />
            <span className="font-display font-bold text-hero-foreground">{brandName}</span>
          </div>
          <div className="flex items-center justify-center gap-4 mb-3">
            <Link to="/terms" className="text-sm text-hero-foreground/50 hover:text-hero-foreground/80 transition-colors">
              用户协议
            </Link>
            <span className="text-hero-foreground/20">|</span>
            <Link to="/privacy" className="text-sm text-hero-foreground/50 hover:text-hero-foreground/80 transition-colors">
              隐私政策
            </Link>
          </div>
          <p className="text-sm text-hero-foreground/40">{t("footer.rights")}</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
