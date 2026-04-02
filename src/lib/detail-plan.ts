import { supabase } from "@/integrations/supabase/client";

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

export async function generateDetailPlan(
  params: DetailPlanParams,
): Promise<DetailPlanResponse> {
  const { data, error } = await supabase.functions.invoke("detail-plan", {
    body: params,
  });

  if (error) {
    throw new Error(error.message || "详情页策划失败");
  }

  if (!data) {
    throw new Error("详情页策划未返回结果");
  }

  return data as DetailPlanResponse;
}

export async function optimizeProductInfo(
  params: OptimizeProductInfoParams,
): Promise<string> {
  const { data, error } = await supabase.functions.invoke("optimize-product-info", {
    body: params,
  });

  if (error) {
    throw new Error(error.message || "产品信息优化失败");
  }

  const optimized = data?.optimizedText;
  if (!optimized || typeof optimized !== "string") {
    throw new Error("产品信息优化未返回有效结果");
  }

  return optimized;
}
