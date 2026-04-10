export const PRICING_RESOLUTIONS = ["0.5k", "1k", "2k", "4k"] as const;

export type PricingResolution = (typeof PRICING_RESOLUTIONS)[number];
export type PricingModelKey = "nanoBanana" | "nanoBanana2" | "nanoBananaPro";
export type TranslationMode = "stable" | "ai";

export interface RechargePackage {
  id: string;
  label: string;
  price: number;
  credits: number;
  badge?: string;
  highlight?: boolean;
}

export interface ResolutionPricing {
  "0.5k": number;
  "1k": number;
  "2k": number;
  "4k": number;
}

export interface CreditRules {
  generation: Record<PricingModelKey, ResolutionPricing>;
  detail: {
    planning: number;
    generationPerScreen: Record<PricingModelKey, ResolutionPricing>;
  };
  translation: {
    stable: number;
    aiRefine: Record<PricingModelKey, number>;
  };
  copy: {
    generate: number;
  };
}

export const DEFAULT_RECHARGE_PACKAGES: RechargePackage[] = [
  { id: "starter", label: "体验包", price: 19.9, credits: 200, badge: "适合试用" },
  { id: "growth", label: "常用包", price: 49.9, credits: 520, badge: "推荐", highlight: true },
  { id: "pro", label: "进阶包", price: 99, credits: 1080, badge: "更省单价" },
  { id: "business", label: "商用包", price: 199, credits: 2280, badge: "高频创作" },
];

export const DEFAULT_CREDIT_RULES: CreditRules = {
  generation: {
    nanoBanana: { "0.5k": 7, "1k": 7, "2k": 7, "4k": 7 },
    nanoBanana2: { "0.5k": 7, "1k": 9, "2k": 12, "4k": 16 },
    nanoBananaPro: { "0.5k": 12, "1k": 14, "2k": 14, "4k": 23 },
  },
  detail: {
    planning: 2,
    generationPerScreen: {
      nanoBanana: { "0.5k": 7, "1k": 7, "2k": 7, "4k": 7 },
      nanoBanana2: { "0.5k": 7, "1k": 9, "2k": 12, "4k": 16 },
      nanoBananaPro: { "0.5k": 12, "1k": 14, "2k": 14, "4k": 23 },
    },
  },
  translation: {
    stable: 3,
    aiRefine: {
      nanoBanana: 7,
      nanoBanana2: 10,
      nanoBananaPro: 16,
    },
  },
  copy: {
    generate: 1,
  },
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeResolution(value: unknown): PricingResolution {
  return PRICING_RESOLUTIONS.includes(value as PricingResolution)
    ? (value as PricingResolution)
    : "1k";
}

function normalizeResolutionPricing(value: unknown, fallback: ResolutionPricing): ResolutionPricing {
  if (typeof value === "number") {
    const numeric = asNumber(value, fallback["1k"]);
    return {
      "0.5k": numeric,
      "1k": numeric,
      "2k": numeric,
      "4k": numeric,
    };
  }

  const source = asRecord(value);
  return {
    "0.5k": asNumber(source["0.5k"], fallback["0.5k"]),
    "1k": asNumber(source["1k"], fallback["1k"]),
    "2k": asNumber(source["2k"], fallback["2k"]),
    "4k": asNumber(source["4k"], fallback["4k"]),
  };
}

export function normalizeCreditRules(value: unknown): CreditRules {
  const source = asRecord(value);
  const generationSource = asRecord(source.generation);
  const detailSource = asRecord(source.detail);
  const translationSource = asRecord(source.translation);
  const copySource = asRecord(source.copy);
  const detailGenerationSource = asRecord(detailSource.generationPerScreen || detailSource.generation);
  const translationAiSource = asRecord(translationSource.aiRefine);

  return {
    generation: {
      nanoBanana: normalizeResolutionPricing(
        generationSource.nanoBanana,
        DEFAULT_CREDIT_RULES.generation.nanoBanana,
      ),
      nanoBanana2: normalizeResolutionPricing(
        generationSource.nanoBanana2,
        DEFAULT_CREDIT_RULES.generation.nanoBanana2,
      ),
      nanoBananaPro: normalizeResolutionPricing(
        generationSource.nanoBananaPro,
        DEFAULT_CREDIT_RULES.generation.nanoBananaPro,
      ),
    },
    detail: {
      planning: asNumber(detailSource.planning, DEFAULT_CREDIT_RULES.detail.planning),
      generationPerScreen: {
        nanoBanana: normalizeResolutionPricing(
          detailGenerationSource.nanoBanana ?? detailSource.nanoBanana,
          DEFAULT_CREDIT_RULES.detail.generationPerScreen.nanoBanana,
        ),
        nanoBanana2: normalizeResolutionPricing(
          detailGenerationSource.nanoBanana2 ?? detailSource.nanoBanana2,
          DEFAULT_CREDIT_RULES.detail.generationPerScreen.nanoBanana2,
        ),
        nanoBananaPro: normalizeResolutionPricing(
          detailGenerationSource.nanoBananaPro ?? detailSource.nanoBananaPro,
          DEFAULT_CREDIT_RULES.detail.generationPerScreen.nanoBananaPro,
        ),
      },
    },
    translation: {
      stable: asNumber(
        translationSource.stable ?? translationSource.basic,
        DEFAULT_CREDIT_RULES.translation.stable,
      ),
      aiRefine: {
        nanoBanana: asNumber(
          translationAiSource.nanoBanana ?? translationSource.refined,
          DEFAULT_CREDIT_RULES.translation.aiRefine.nanoBanana,
        ),
        nanoBanana2: asNumber(
          translationAiSource.nanoBanana2 ?? translationSource.refined,
          DEFAULT_CREDIT_RULES.translation.aiRefine.nanoBanana2,
        ),
        nanoBananaPro: asNumber(
          translationAiSource.nanoBananaPro ?? translationSource.refined,
          DEFAULT_CREDIT_RULES.translation.aiRefine.nanoBananaPro,
        ),
      },
    },
    copy: {
      generate: asNumber(copySource.generate, DEFAULT_CREDIT_RULES.copy.generate),
    },
  };
}

export function mapModelToPricingKey(model: string | undefined): PricingModelKey {
  const normalized = String(model || "").toLowerCase();

  if (normalized.includes("3-pro") || normalized.includes("pro-image") || normalized.includes("pro-preview")) {
    return "nanoBananaPro";
  }
  if (normalized.includes("3.1") || normalized.includes("banana 2")) {
    return "nanoBanana2";
  }
  return "nanoBanana";
}

export function getImageCreditCost(
  rules: CreditRules,
  model: string | undefined,
  resolution: string | undefined,
): number {
  const modelKey = mapModelToPricingKey(model);
  return rules.generation[modelKey][normalizeResolution(resolution)];
}

export function getMaxImageReserveCost(
  rules: CreditRules,
  models: string[],
  resolution: string | undefined,
): number {
  return Math.max(...models.map((model) => getImageCreditCost(rules, model, resolution)));
}

export function getDetailPlanCreditCost(rules: CreditRules): number {
  return rules.detail.planning;
}

export function getTranslationCreditCost(
  rules: CreditRules,
  mode: TranslationMode,
  model: string | undefined,
): number {
  if (mode === "stable") {
    return rules.translation.stable;
  }
  return rules.translation.aiRefine[mapModelToPricingKey(model)];
}

export function getMaxTranslationReserveCost(
  rules: CreditRules,
  mode: TranslationMode,
  models: string[],
): number {
  if (mode === "stable") {
    return getTranslationCreditCost(rules, "stable", undefined);
  }
  return Math.max(...models.map((model) => getTranslationCreditCost(rules, "ai", model)));
}

export function getCopyCreditCost(rules: CreditRules): number {
  return rules.copy.generate;
}

export async function loadPricingSettings(supabase: {
  from: (table: string) => {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{ data: Array<{ key: string; value: unknown }> | null; error: Error | null }>;
    };
  };
}) {
  const { data, error } = await supabase
    .from("admin_settings")
    .select("key,value")
    .in("key", ["recharge_packages", "credit_rules"]);

  if (error) throw error;

  const rows = data || [];
  const map = new Map(rows.map((row) => [row.key, row.value]));

  return {
    packages: (map.get("recharge_packages") as RechargePackage[] | undefined) || DEFAULT_RECHARGE_PACKAGES,
    creditRules: normalizeCreditRules(map.get("credit_rules")),
  };
}
