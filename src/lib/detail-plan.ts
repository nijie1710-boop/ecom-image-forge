import { supabase } from "@/integrations/supabase/client";
import { normalizeUserErrorMessage } from "@/lib/error-messages";

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

function isMissingFunctionError(raw: unknown) {
  const text = String(raw || "").toLowerCase();
  return (
    text.includes("requested function was not found") ||
    text.includes("not_found") ||
    text.includes("404")
  );
}

export async function generateDetailPlan(
  params: DetailPlanParams,
): Promise<DetailPlanResponse> {
  const { data, error } = await supabase.functions.invoke("detail-plan", {
    body: params,
  });

  if (error) {
    throw new Error(
      normalizeUserErrorMessage(error.message, "详情页策划失败，请稍后重试。"),
    );
  }

  if (!data) {
    throw new Error("详情页策划没有返回有效结果，请稍后重试。");
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
    if (isMissingFunctionError(error.message)) {
      return (
        params.productInfo?.trim() ||
        "请基于上传商品图整理商品类型、核心卖点、材质、尺寸、适用人群和希望保留的关键信息。"
      );
    }

    throw new Error(
      normalizeUserErrorMessage(error.message, "产品信息优化失败，请稍后重试。"),
    );
  }

  const optimized = data?.optimizedText;
  if (!optimized || typeof optimized !== "string") {
    throw new Error("产品信息优化没有返回有效结果，请重新尝试。");
  }

  return optimized;
}
