import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const PricingPage = () => {
  const { t } = useTranslation();
  const plans = t("pricing.plans", { returnObjects: true }) as Array<{ name: string; price: string; features: string[]; cta: string }>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="font-display text-2xl font-bold text-foreground mb-2">{t("pricing.sectionTitle")}</h1>
        <p className="text-muted-foreground text-sm">{t("pricing.sectionSubtitle")}</p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {plans.map((plan, idx) => {
          const highlight = idx === 1;
          return (
            <div key={idx} className={`rounded-xl p-6 border ${highlight ? "border-primary bg-card shadow-xl shadow-primary/10 ring-2 ring-primary/20" : "border-border bg-card"}`}>
              {highlight && <div className="text-xs font-semibold text-primary mb-4 uppercase tracking-wider">{t("pricing.mostPopular")}</div>}
              <h3 className="font-display text-xl font-bold text-card-foreground">{plan.name}</h3>
              <div className="mt-2 mb-6">
                <span className="font-display text-4xl font-extrabold text-card-foreground">{plan.price}</span>
                <span className="text-muted-foreground text-sm">{t("pricing.period")}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {plan.features.map((f, fi) => (
                  <li key={fi} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-success flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button variant={highlight ? "hero" : "outline"} className="w-full">{plan.cta}</Button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PricingPage;
