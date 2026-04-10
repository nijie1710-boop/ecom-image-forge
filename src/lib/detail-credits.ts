/**
 * 详情页统一计费模块
 *
 * 所有详情页相关的积分计算都集中在这里，前端展示和实际扣费共用同一套规则。
 * 修改价格时只改这一个文件即可。
 */

import type { GenerationModel, OutputResolution } from "@/lib/ai-generator";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// 价格表 —— model + resolution => 单屏积分
// ---------------------------------------------------------------------------

/** 详情页逐屏生成：按 (model, resolution) 查单屏积分 */
const DETAIL_SCREEN_COST_TABLE: Record<string, Record<string, number>> = {
  // Nano Banana (gemini-2.5-flash-image)
  "gemini-2.5-flash-image": {
    "0.5k": 7,
    "1k": 7,
    "2k": 7,
    "4k": 7,
  },
  // Nano Banana 2 (gemini-3.1-flash-image-preview)
  "gemini-3.1-flash-image-preview": {
    "0.5k": 7,
    "1k": 9,
    "2k": 14,
    "4k": 18,
  },
  // Nano Banana Pro (nano-banana-pro-preview)
  "nano-banana-pro-preview": {
    "0.5k": 14,
    "1k": 14,
    "2k": 16,
    "4k": 30,
  },
};

/** 详情页方案策划固定积分 */
const DETAIL_PLAN_COST = 1;

// ---------------------------------------------------------------------------
// 公共查询函数
// ---------------------------------------------------------------------------

/** 方案策划固定消耗 */
export function getDetailPlanCost(): number {
  return DETAIL_PLAN_COST;
}

/** 根据模型 + 分辨率获取单屏积分 */
export function getDetailScreenCost(
  model: GenerationModel,
  resolution: OutputResolution,
): number {
  const modelTable = DETAIL_SCREEN_COST_TABLE[model];
  if (!modelTable) return 7; // 兜底
  return modelTable[resolution] ?? 7;
}

/** 批量生成总积分 = 单屏积分 × 选中屏数 */
export function getDetailTotalCost(
  model: GenerationModel,
  resolution: OutputResolution,
  selectedScreenCount: number,
): number {
  if (selectedScreenCount <= 0) return 0;
  return getDetailScreenCost(model, resolution) * selectedScreenCount;
}

// ---------------------------------------------------------------------------
// 积分扣费 —— 统一调用 manage-balance edge function
// ---------------------------------------------------------------------------

interface DeductResult {
  success: boolean;
  newBalance?: number;
  error?: string;
}

/**
 * 通用扣费函数。
 * @param amount      要扣的积分数
 * @param description 消费描述（会记录到 consumption_records）
 * @param operationType 消费类型标识
 */
export async function deductCredits(
  amount: number,
  operationType: string,
  description: string,
): Promise<DeductResult> {
  try {
    const { data, error } = await supabase.functions.invoke("manage-balance", {
      body: { action: "deduct", amount, operationType, description },
    });

    if (error) {
      // edge function 层面报错
      const msg =
        typeof error === "object" && "message" in error
          ? (error as { message: string }).message
          : String(error);
      return { success: false, error: msg };
    }

    const result = data?.result;
    if (!result?.success) {
      return {
        success: false,
        error: result?.error || "积分不足或扣费失败，请充值后重试",
      };
    }

    return { success: true, newBalance: result.new_balance };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "扣费请求异常",
    };
  }
}

// ---------------------------------------------------------------------------
// 余额查询
// ---------------------------------------------------------------------------

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
