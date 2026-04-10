import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callGeminiTextWithFallback,
  errorResponse,
  jsonResponse,
  requireEnv,
} from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizeImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (
        item &&
        typeof item === "object" &&
        "value" in item &&
        typeof (item as { value?: unknown }).value === "string"
      ) {
        return (item as { value: string }).value;
      }
      return "";
    })
    .filter((item) => item.length > 100)
    .slice(0, 4);
}

function getMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  return match?.[1] || "image/jpeg";
}

function getBase64Data(dataUrl: string): string {
  if (dataUrl.includes(",")) {
    return dataUrl.split(",")[1] || "";
  }
  return dataUrl;
}

function safeString(value: unknown, fallback = ""): string {
  const text = String(value ?? fallback).trim();
  return text || fallback;
}

async function tryOptionalAuth(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return;
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    await supabase.auth.getUser(token);
  } catch (error) {
    console.warn("optimize-product-info optional auth check failed", error);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await tryOptionalAuth(req);

    const body = await req.json();
    const productImages = normalizeImages(body.productImages);
    const productInfo = safeString(body.productInfo);
    const targetPlatform = safeString(body.targetPlatform, "淘宝/天猫");

    if (!productImages.length && !productInfo) {
      return jsonResponse(
        {
          error: "PRODUCT_INFO_OR_IMAGE_REQUIRED",
          message: "At least one product image or product info text is required",
        },
        400,
        corsHeaders,
      );
    }

    const geminiApiKey = requireEnv("GEMINI_API_KEY", Deno.env.get("GEMINI_API_KEY"));

    const promptText = [
      "你是一名电商详情页策划助理，请把用户给的商品信息优化成更适合详情页策划和后贴文案的结构化中文说明。",
      `目标平台：${targetPlatform}。`,
      productInfo ? `用户已经填写的信息：${productInfo}` : "用户没有填写太多文字，请优先依据商品图补全基础信息。",
      "请先识别商品类型、材质、颜色、结构、图案、可见文字、适用人群和典型卖点。",
      "然后输出一段简洁但信息密度高的中文文本，方便直接回填到表单。",
      "输出格式固定为以下 6 行，不要使用 markdown：",
      "产品名称：...",
      "核心卖点：...",
      "材质/工艺：...",
      "规格/尺寸：...",
      "适用人群/场景：...",
      "详情页重点：...",
      "要求：内容真实、短句化、适合电商，不要编造无法从图片中确认的精确参数。",
    ].join("\n");

    const { text, meta } = await callGeminiTextWithFallback({
      apiKey: geminiApiKey,
      functionName: "optimize-product-info",
      parts: [
        { text: promptText },
        ...productImages.map((image) => ({
          inlineData: {
            mimeType: getMimeType(image),
            data: getBase64Data(image),
          },
        })),
      ],
      generationConfig: {
        temperature: 0.25,
        topP: 0.85,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    return jsonResponse(
      {
        optimizedText: text.trim(),
        meta,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    console.error("optimize-product-info error:", error);
    return errorResponse(error, corsHeaders);
  }
});
