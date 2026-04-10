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

type SceneSuggestion = {
  scene: string;
  description: string;
};

function coerceImageInput(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "value" in value &&
    typeof (value as { value?: unknown }).value === "string"
  ) {
    return (value as { value: string }).value;
  }
  return "";
}

function normalizeImageType(value: unknown): "main" | "detail" {
  const text = String(value || "").toLowerCase();
  if (text.includes("detail") || text.includes("详情")) {
    return "detail";
  }
  return "main";
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
    console.warn("suggest-scenes optional auth check failed", error);
  }
}

function safeString(value: unknown, fallback = "") {
  const text = String(value ?? fallback).trim();
  return text || fallback;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await tryOptionalAuth(req);

    const body = await req.json();
    const imageBase64 = coerceImageInput(body.imageBase64);
    const imageType = normalizeImageType(body.imageType);

    if (!imageBase64 || imageBase64.length < 100) {
      return jsonResponse(
        { error: "PRODUCT_IMAGE_REQUIRED", message: "A valid product image is required" },
        400,
        corsHeaders,
      );
    }

    const geminiApiKey = requireEnv("GEMINI_API_KEY", Deno.env.get("GEMINI_API_KEY"));

    const shotGoal = imageType === "detail"
      ? "You are generating detail-image suggestions for an e-commerce product detail page."
      : "You are generating main-image suggestions for an e-commerce product listing cover image.";

    const promptText = [
      "You are a senior e-commerce product analyst and art director.",
      shotGoal,
      "Identify the original sellable product only.",
      "If the uploaded image is a webpage screenshot, editor screenshot, poster, banner, or a composite image, focus only on the actual product object the user uploaded.",
      "Ignore UI text, buttons, generated results, browser chrome, labels, and layout elements.",
      "Recognize the real product category, shape, color palette, material, surface texture, printed design, and target use scene.",
      "Then produce exactly 3 Chinese scene plans for photographing the same product.",
      "The 3 plans must be clearly different from each other, not repetitive template sentences.",
      "Return JSON only with this schema:",
      '{"product_summary":"中文总结商品类别和关键特征","visible_text":"图片内可见文字，没有就写 NONE","suggestions":[{"scene":"方案名称","description":"完整中文方案正文，分段写出风格名称、视觉风格、场景关键词、产品信息、产品卖点、画面要求"},{"scene":"方案名称","description":"完整中文方案正文，分段写出风格名称、视觉风格、场景关键词、产品信息、产品卖点、画面要求"},{"scene":"方案名称","description":"完整中文方案正文，分段写出风格名称、视觉风格、场景关键词、产品信息、产品卖点、画面要求"}]}',
    ].join(" ");

    const { text, meta } = await callGeminiTextWithFallback({
      apiKey: geminiApiKey,
      functionName: "suggest-scenes",
      parts: [
        { text: promptText },
        { inlineData: { mimeType: getMimeType(imageBase64), data: getBase64Data(imageBase64) } },
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.8,
        maxOutputTokens: 1800,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let parsed: {
      product_summary?: string;
      visible_text?: string;
      suggestions?: Array<{ scene?: string; description?: string }>;
    } = {};

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (error) {
      console.warn("suggest-scenes parse failed:", error);
      throw new Error("SUGGEST_SCENES_PARSE_FAILED");
    }

    const suggestions = (parsed.suggestions || [])
      .slice(0, 3)
      .map((item) => ({
        scene: safeString(item.scene, "场景方案"),
        description: safeString(item.description),
      }))
      .filter((item) => item.description.length > 0);

    if (suggestions.length < 3) {
      throw new Error("SUGGEST_SCENES_EMPTY_RESULT");
    }

    return jsonResponse(
      {
        product_summary: safeString(parsed.product_summary, "该商品"),
        visible_text: safeString(parsed.visible_text, "NONE"),
        suggestions: suggestions.slice(0, 3) as SceneSuggestion[],
        meta,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    console.error("suggest-scenes error:", error);
    return errorResponse(error, corsHeaders);
  }
});
