import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  supabase,
} from "@/integrations/supabase/client";
import { normalizeUserErrorMessage } from "@/lib/error-messages";

async function getOptionalInvokeHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    ...(session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}),
  };
}

async function invokeEdgeJson<T>(functionName: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const headers = await getOptionalInvokeHeaders();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let payload: Record<string, unknown> | null = null;

  try {
    payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.detail === "string"
        ? payload.detail
        : typeof payload?.error === "string"
        ? payload.error
        : rawText || `HTTP_${response.status}`;
    throw new Error(normalizeUserErrorMessage(detail, fallback));
  }

  if (!payload) {
    throw new Error(fallback);
  }

  return payload as T;
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
  const data = await invokeEdgeJson<DetailPlanResponse>(
    "detail-plan",
    params,
    "详情页策划失败，请稍后重试。",
  );

  if (!data?.planOptions?.length) {
    throw new Error("详情页策划没有返回有效结果，请稍后重试。");
  }

  if (data.meta) {
    console.info("detail-plan meta:", data.meta);
  }

  return data;
}

export async function optimizeProductInfo(params: OptimizeProductInfoParams): Promise<string> {
  const data = await invokeEdgeJson<{ optimizedText?: string; meta?: Record<string, unknown> }>(
    "optimize-product-info",
    params,
    "产品信息优化失败，请稍后重试。",
  );

  if (!data?.optimizedText || typeof data.optimizedText !== "string") {
    throw new Error("产品信息优化没有返回有效结果，请稍后重试。");
  }

  if (data.meta) {
    console.info("optimize-product-info meta:", data.meta);
  }

  return data.optimizedText;
}
