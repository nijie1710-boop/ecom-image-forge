import { supabase } from "@/integrations/supabase/client";

export type DetailPlanScreen = {
  screen: number;
  title: string;
  goal: string;
  visualDirection: string;
  copyPoints: string[];
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
