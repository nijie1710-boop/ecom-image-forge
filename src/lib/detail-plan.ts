import { supabase } from "@/integrations/supabase/client";
import { normalizeUserErrorMessage } from "@/lib/error-messages";

async function extractInvokeError(error: unknown, fallback: string): Promise<string> {
  if (!error || typeof error !== "object") return fallback;
  const e = error as {
    context?: { json?: () => Promise<unknown>; text?: () => Promise<string> };
    message?: string;
  };

  if (e.context?.json) {
    try {
      const payload = (await e.context.json()) as
        | { error?: string; message?: string; detail?: string }
        | undefined;
      const msg = payload?.error || payload?.message || payload?.detail;
      if (msg) return normalizeUserErrorMessage(msg, fallback);
    } catch {
      // ignore
    }
  }

  if (e.context?.text) {
    try {
      const text = await e.context.text();
      if (text) return normalizeUserErrorMessage(text, fallback);
    } catch {
      // ignore
    }
  }

  return normalizeUserErrorMessage(e.message, fallback);
}

export type DetailPlanScreen = {
  screen: number;
  title: string;
  goal: string;
  visualDirection: string;
  copyPoints: string[];
  overlayTitle: string;
  overlayBodyLines: string[];
  humanModelSuggested?: boolean;
  humanModelReason?: string;
};

export type DetailPlanOption = {
  planName: string;
  tone: string;
  audience: string;
  summary: string;
  designSpec: {
    mainColors: string[];
    accentColors: string[];
    typography: string;
    layoutTone: string;
    imageStyle: string;
    languageGuidelines: string;
  };
  screens: DetailPlanScreen[];
};

export type DetailPlanResponse = {
  productSummary: string;
  visibleText: string;
  planOptions: DetailPlanOption[];
  meta?: {
    modelRequested: string;
    modelUsed: string;
    fallbackUsed?: boolean;
    modelsTried?: string[];
  };
};

export type DetailPlanParams = {
  productImages: string[];
  productInfo: string;
  targetPlatform: string;
  targetLanguage: string;
  screenCount: number;
  screenIdeas?: string[];
};

export type OptimizeProductInfoParams = {
  productImages: string[];
  productInfo: string;
  targetPlatform?: string;
};

export async function generateDetailPlan(params: DetailPlanParams): Promise<DetailPlanResponse> {
  const { data, error } = await supabase.functions.invoke("detail-plan", {
    body: params,
  });

  if (error) {
    throw new Error(await extractInvokeError(error, "详情页策划失败，请稍后重试。"));
  }

  if (!data) {
    throw new Error("详情页策划没有返回有效结果，请稍后重试。");
  }

  if (data?.meta) {
    console.info("detail-plan meta:", data.meta);
  }

  return data as DetailPlanResponse;
}

export async function optimizeProductInfo(params: OptimizeProductInfoParams): Promise<string> {
  const { data, error } = await supabase.functions.invoke("optimize-product-info", {
    body: params,
  });

  if (error) {
    throw new Error(await extractInvokeError(error, "产品信息优化失败，请稍后重试。"));
  }

  const optimized = data?.optimizedText;
  if (!optimized || typeof optimized !== "string") {
    throw new Error("产品信息优化没有返回有效结果，请稍后重试。");
  }

  if (data?.meta) {
    console.info("optimize-product-info meta:", data.meta);
  }

  return optimized;
}
