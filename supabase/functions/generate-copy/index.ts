import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCopyCreditCost, loadPricingSettings } from "../_shared/credit-pricing.ts";
import {
  callGeminiTextWithFallback,
  errorResponse,
  FunctionError,
  jsonResponse,
  requireEnv,
} from "../_shared/gemini.ts";

import { corsHeaders as buildCorsHeaders, handleOptions } from "../_shared/cors.ts";

type CopyResponse = {
  productName: string;
  title: string;
  desc: string;
  sellingPoints: string[];
  tags: string[];
  targetAudience: string;
  priceRange: string;
};

function stripDataPrefix(imageUrl: string) {
  return imageUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
}

function detectMimeType(imageUrl: string) {
  const match = imageUrl.match(/^data:([^;]+);base64,/i);
  return match?.[1] || "image/jpeg";
}

function safeString(value: unknown, fallback = "") {
  const text = String(value ?? fallback).trim();
  return text || fallback;
}

function safeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => safeString(item)).filter(Boolean);
  return items.length ? items : fallback;
}

function normalizeCopyResponse(value: unknown): CopyResponse {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    productName: safeString(source.productName, "商品"),
    title: safeString(source.title, "优质商品推荐"),
    desc: safeString(source.desc, "请围绕商品卖点补充更完整的电商文案。"),
    sellingPoints: safeStringArray(source.sellingPoints, ["优质商品", "清晰卖点", "适合电商展示"]).slice(0, 5),
    tags: safeStringArray(source.tags, ["电商", "推荐"]).slice(0, 5),
    targetAudience: safeString(source.targetAudience, "电商平台购买用户"),
    priceRange: safeString(source.priceRange, "根据市场定价"),
  };
}

async function refundCredits(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  reason: string,
) {
  try {
    await supabase.rpc("add_balance", {
      p_user_id: userId,
      p_amount: amount,
      p_payment_method: "refund",
      p_notes: reason,
    });
  } catch (error) {
    console.error("generate-copy refund failed:", error);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptions(req);
  }

  const corsHeaders = buildCorsHeaders(req);

  let deducted = false;
  let deductedAmount = 0;
  let authedUserId: string | null = null;
  let supabase: ReturnType<typeof createClient> | null = null;

  try {
    const DISABLE_AUTH = Deno.env.get("DISABLE_AUTH") === "true";
    const supabaseUrl = requireEnv("SUPABASE_URL", Deno.env.get("SUPABASE_URL"));
    const supabaseServiceKey = requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const geminiApiKey = requireEnv("GEMINI_API_KEY", Deno.env.get("GEMINI_API_KEY"));

    supabase = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get("Authorization");

    if (!DISABLE_AUTH) {
      if (!authHeader?.startsWith("Bearer ")) {
        return jsonResponse(
          { error: "UNAUTHORIZED", message: "User must be logged in before generating copy" },
          401,
          corsHeaders,
        );
      }
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return jsonResponse(
          { error: "UNAUTHORIZED", message: "Supabase auth validation failed" },
          401,
          corsHeaders,
        );
      }
      authedUserId = user.id;
    } else {
      authedUserId = "disable-auth-user";
    }

    const body = await req.json();
    const imageBase64 = safeString(body.imageBase64);
    const platform = safeString(body.platform, "淘宝/天猫");
    const language = safeString(body.language, "zh");

    if (!imageBase64) {
      return jsonResponse(
        { error: "PRODUCT_IMAGE_REQUIRED", message: "Image is required for copy generation" },
        400,
        corsHeaders,
      );
    }

    const pricing = await loadPricingSettings(supabase);
    const cost = getCopyCreditCost(pricing.creditRules);
    deductedAmount = cost;

    const { data: balanceData, error: balanceError } = await supabase.rpc("get_user_balance", {
      p_user_id: authedUserId,
    });
    if (balanceError) {
      throw new FunctionError("BALANCE_LOOKUP_FAILED", 500, "Failed to query user balance");
    }

    const currentBalance = balanceData?.[0]?.balance ?? 0;
    if (currentBalance < cost) {
      return jsonResponse(
        {
          error: "INSUFFICIENT_BALANCE",
          message: `Copy generation requires ${cost} credits but current balance is ${currentBalance}`,
        },
        402,
        corsHeaders,
      );
    }

    const { data: deductResult, error: deductError } = await supabase.rpc("deduct_balance", {
      p_user_id: authedUserId,
      p_amount: cost,
      p_operation_type: "generate_copy",
      p_description: "生成电商文案",
    });
    if (deductError || !deductResult?.[0]?.success) {
      throw new FunctionError("BALANCE_DEDUCT_FAILED", 500, "Failed to deduct credits for copy generation");
    }
    deducted = true;

    const platformPrompts: Record<string, string> = {
      "淘宝/天猫": "淘宝/天猫风格，强调正品保障、限时优惠、包邮和电商转化效率。",
      "京东": "京东风格，强调自营、次日达、品质保障和理性购买理由。",
      "拼多多": "拼多多风格，强调实惠、补贴、拼团和性价比。",
      "抖音": "抖音电商风格，强调爆款、直播间氛围、限时福利和种草转化。",
      "小红书": "小红书种草风格，语气真实、亲切、有分享感。",
      "快手": "快手电商风格，强调厂家直供、老铁推荐和真实好货。",
    };

    const langInstruction = language === "en"
      ? "Output every field in English. Use natural e-commerce marketing English."
      : "所有字段使用中文输出。";

    const prompt = [
      "You are a senior e-commerce copywriter and product analyst.",
      platformPrompts[platform] || platformPrompts["淘宝/天猫"],
      langInstruction,
      "Analyze the uploaded product image carefully, identify the product category, material, color, construction, visible text, and practical selling points.",
      "Return JSON only with this schema:",
      '{"productName":"产品名称","title":"标题","desc":"描述文案","sellingPoints":["卖点1","卖点2","卖点3","卖点4","卖点5"],"tags":["标签1","标签2","标签3","标签4","标签5"],"targetAudience":"目标人群","priceRange":"建议价格区间"}',
      "Avoid fabricated specifications that cannot be reasonably inferred from the image.",
      "Keep the tone suitable for real e-commerce listing copy, not poetry.",
    ].join(" ");

    const { text, meta } = await callGeminiTextWithFallback({
      apiKey: geminiApiKey,
      functionName: "generate-copy",
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: detectMimeType(imageBase64),
            data: stripDataPrefix(imageBase64),
          },
        },
      ],
      generationConfig: {
        temperature: 0.5,
        topP: 0.9,
        maxOutputTokens: 2048,
      },
    });

    let parsed: CopyResponse;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = normalizeCopyResponse(JSON.parse(jsonMatch ? jsonMatch[0] : text));
    } catch (error) {
      console.error("generate-copy parse failed:", error);
      throw new FunctionError("COPY_PARSE_FAILED", 502, "Failed to parse structured copy response");
    }

    return jsonResponse({ ...parsed, meta }, 200, corsHeaders);
  } catch (error) {
    if (deducted && supabase && authedUserId && deductedAmount > 0) {
      await refundCredits(
        supabase,
        authedUserId,
        deductedAmount,
        `文案生成失败退款：${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
    console.error("generate-copy error:", error);
    return errorResponse(error, corsHeaders);
  }
});
