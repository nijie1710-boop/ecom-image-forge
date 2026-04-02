import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

async function callGemini(apiKey: string, images: string[], promptText: string): Promise<string> {
  const models = ["gemini-2.5-flash", "gemini-1.5-flash"];
  let lastError = "Unknown Gemini error";

  for (const model of models) {
    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const parts = [
      { text: promptText },
      ...images.map((image) => ({
        inlineData: {
          mimeType: getMimeType(image),
          data: getBase64Data(image),
        },
      })),
    ];

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.25,
          topP: 0.85,
          maxOutputTokens: 2048,
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    const rawText = await response.text();
    if (response.ok) {
      try {
        const parsed = JSON.parse(rawText);
        const text = parsed?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) =>
          typeof part.text === "string"
        )?.text;
        if (text) {
          return text.trim();
        }
      } catch {
        if (rawText.trim()) {
          return rawText.trim();
        }
      }
      lastError = `${model}: empty candidate text`;
      continue;
    }

    let detail = rawText.slice(0, 500);
    try {
      const parsed = JSON.parse(rawText);
      detail = parsed?.error?.message || detail;
    } catch {
      // ignore
    }
    lastError = `${model}: ${detail}`;
  }

  throw new Error(lastError);
}

function buildFallbackText(productInfo: string): string {
  const trimmed = productInfo.trim();
  return [
    "产品名称：请补充具体商品名",
    "核心卖点：请概括 3 个最想强调的优势",
    "材质/工艺：请补充真实材质、表面纹理和做工特点",
    "规格/尺寸：请补充尺寸、容量、重量或适配型号",
    "适用人群/场景：请说明适合谁、适合什么场景",
    `详情页重点：${trimmed || "请说明你希望画面重点保留和重点展示的信息"}`,
  ].join("\n");
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
      return new Response(JSON.stringify({ error: "请至少上传商品图或填写基础产品信息" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      return new Response(JSON.stringify({
        optimizedText: buildFallbackText(productInfo),
        warning: "GEMINI_API_KEY not configured",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const promptText = [
      "你是一名电商详情页策划助理，请把用户给的商品信息优化成更适合详情页策划和后贴文案的结构化中文说明。",
      `目标平台：${targetPlatform}。`,
      productInfo ? `用户已填写的信息：${productInfo}` : "用户还没有填写太多文字，请优先根据商品图补全基础信息。",
      "请先识别商品类型、材质、颜色、结构、图案、可见文字、适用人群和典型卖点。",
      "然后输出一段简洁但信息密度高的中文文本，方便直接回填到表单。",
      "输出格式固定为以下 6 行，不要加 markdown：",
      "产品名称：...",
      "核心卖点：...",
      "材质/工艺：...",
      "规格/尺寸：...",
      "适用人群/场景：...",
      "详情页重点：...",
      "要求：内容真实、短句化、适合电商，不要空泛，不要编造无法从图中确认的精确参数。",
    ].join("\n");

    const optimizedText = await callGemini(geminiApiKey, productImages, promptText);

    return new Response(JSON.stringify({
      optimizedText: optimizedText || buildFallbackText(productInfo),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("optimize-product-info error:", error);
    return new Response(JSON.stringify({
      optimizedText: buildFallbackText(""),
      warning: error instanceof Error ? error.message : "unknown error",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
