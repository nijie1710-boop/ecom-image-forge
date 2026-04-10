import type { GenerationModel, OutputResolution } from "@/lib/ai-generator";
import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  supabase,
} from "@/integrations/supabase/client";
import { normalizeUserErrorMessage } from "@/lib/error-messages";

const DETAIL_SCREEN_COST_TABLE: Record<string, Record<string, number>> = {
  "gemini-2.5-flash-image": {
    "0.5k": 7,
    "1k": 7,
    "2k": 7,
    "4k": 7,
  },
  "gemini-3.1-flash-image-preview": {
    "0.5k": 7,
    "1k": 9,
    "2k": 14,
    "4k": 18,
  },
  "nano-banana-pro-preview": {
    "0.5k": 14,
    "1k": 14,
    "2k": 16,
    "4k": 30,
  },
};

const DETAIL_PLAN_COST = 1;

const GENERATE_IMAGE_COST_TABLE: Record<string, Record<string, number>> = {
  "gemini-2.5-flash-image": {
    "0.5k": 5,
    "1k": 5,
    "2k": 5,
    "4k": 5,
  },
  "gemini-3.1-flash-image-preview": {
    "0.5k": 5,
    "1k": 7,
    "2k": 9,
    "4k": 14,
  },
  "nano-banana-pro-preview": {
    "0.5k": 9,
    "1k": 12,
    "2k": 14,
    "4k": 24,
  },
};

export function getDetailPlanCost(): number {
  return DETAIL_PLAN_COST;
}

export function getDetailScreenCost(
  model: GenerationModel,
  resolution: OutputResolution,
): number {
  const modelTable = DETAIL_SCREEN_COST_TABLE[model];
  if (!modelTable) return 7;
  return modelTable[resolution] ?? 7;
}

export function getDetailTotalCost(
  model: GenerationModel,
  resolution: OutputResolution,
  selectedScreenCount: number,
): number {
  if (selectedScreenCount <= 0) return 0;
  return getDetailScreenCost(model, resolution) * selectedScreenCount;
}

export function getGenerateImageUnitCost(
  model: GenerationModel,
  resolution: OutputResolution,
): number {
  const modelTable = GENERATE_IMAGE_COST_TABLE[model];
  if (!modelTable) return 5;
  return modelTable[resolution] ?? 5;
}

export function getGenerateImageTotalCost(
  model: GenerationModel,
  resolution: OutputResolution,
  count: number,
): number {
  if (count <= 0) return 0;
  return getGenerateImageUnitCost(model, resolution) * count;
}

interface DeductResult {
  success: boolean;
  newBalance?: number;
  error?: string;
}

async function getAuthHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error(normalizeUserErrorMessage("UNAUTHORIZED", "未登录，请先登录"));
  }

  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${session.access_token}`,
  };
}

export async function deductCredits(
  amount: number,
  operationType: string,
  description: string,
): Promise<DeductResult> {
  try {
    const headers = await getAuthHeaders();
    const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-balance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({
        action: "deduct",
        amount,
        operationType,
        description,
      }),
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
        typeof payload?.error === "string"
          ? payload.error
          : typeof payload?.message === "string"
          ? payload.message
          : typeof payload?.detail === "string"
          ? payload.detail
          : rawText || `HTTP_${response.status}`;
      return {
        success: false,
        error: normalizeUserErrorMessage(detail, "积分扣费失败，请稍后重试"),
      };
    }

    const result =
      payload?.result && typeof payload.result === "object"
        ? (payload.result as Record<string, unknown>)
        : null;

    if (!result?.success) {
      return {
        success: false,
        error: normalizeUserErrorMessage(
          result?.error || payload?.error || "积分不足或扣费失败，请充值后重试",
          "积分不足或扣费失败，请充值后重试",
        ),
      };
    }

    return {
      success: true,
      newBalance: Number(result.new_balance ?? 0),
    };
  } catch (error) {
    return {
      success: false,
      error: normalizeUserErrorMessage(error, "扣费请求异常"),
    };
  }
}

export async function getUserBalance(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("user_balances")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("getUserBalance failed:", error);
    return 0;
  }
  return Number(data?.balance ?? 0);
}
