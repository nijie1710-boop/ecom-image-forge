import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function buildDescription(
  title: string,
  visual: string,
  keywords: string,
  summary: string,
  sellingPoints: string,
  composition: string,
): string {
  return [
    `风格名称：${title}`,
    "",
    "视觉风格：",
    visual,
    "",
    `场景关键词：${keywords}`,
    "",
    "产品信息：",
    summary,
    "",
    "产品卖点：",
    sellingPoints,
    "",
    "画面要求：",
    composition,
  ].join("\n");
}

function buildFallbackSuggestions(imageType: "main" | "detail", productSummary: string): SceneSuggestion[] {
  const summary = productSummary || "该商品";

  if (imageType === "detail") {
    return [
      {
        scene: "细节卖点特写",
        description: buildDescription(
          "细节卖点特写",
          "真实自然的近景细节展示，强调材质、纹理、做工和图案信息。",
          "近景、细节、质感、纹理、卖点",
          summary,
          "突出商品本身的面料、印花、边缘处理、结构细节和核心卖点。",
          "保持同一商品不变，只加强局部构图和打光，避免无关道具抢戏。",
        ),
      },
      {
        scene: "生活使用场景",
        description: buildDescription(
          "生活使用场景",
          "自然生活化场景，营造真实使用感，突出商品和人群需求的关系。",
          "生活化、真实、场景化、卖点展示",
          summary,
          "通过环境和道具衬托商品用途，但商品本体必须完整可辨认。",
          "只改变背景、光线和陈列方式，不改变商品类别、颜色、图案和主体结构。",
        ),
      },
      {
        scene: "信息承载详情图",
        description: buildDescription(
          "信息承载详情图",
          "适合详情页的展示画面，重点明确、画面干净、便于承载后续卖点说明。",
          "详情页、说明感、结构清晰、重点明确",
          summary,
          "强调核心细节和使用价值，让用户一眼理解商品亮点。",
          "构图要稳定，主体比例准确，方便后续添加卖点说明或做图文组合。",
        ),
      },
    ];
  }

  return [
    {
      scene: "白底专业主图",
      description: buildDescription(
        "白底专业主图",
        "干净的专业棚拍白底风格，主体清晰、商品完整、适合电商首图展示。",
        "白底、主图、棚拍、干净、清晰",
        summary,
        "完整展示商品主体、颜色、材质和图案，突出标准化电商展示效果。",
        "商品居中，画面简洁，背景纯净，避免复杂道具和过强情绪化场景。",
      ),
    },
    {
      scene: "轻场景高级感主图",
      description: buildDescription(
        "轻场景高级感主图",
        "在简洁场景中保留高级感，通过柔和光线和少量道具提升质感。",
        "高级感、轻场景、柔光、质感",
        summary,
        "保留同一商品的所有关键视觉特征，只增强氛围和画面质感。",
        "背景可以有轻微层次，但不能喧宾夺主，商品必须仍是画面绝对主体。",
      ),
    },
    {
      scene: "品牌陈列展示",
      description: buildDescription(
        "品牌陈列展示",
        "类似品牌海报的商品陈列画面，重点突出商品本身与视觉统一性。",
        "陈列、品牌感、统一、视觉主次",
        summary,
        "突出商品的造型、图案和识别度，同时让画面更适合电商展示和传播。",
        "允许少量辅助道具和背景层次，但商品不能被替换、变形或改成其他品类。",
      ),
    },
  ];
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
    const { data } = await supabase.auth.getUser(token);
    if (!data.user) {
      console.warn("suggest-scenes: auth token invalid, continue anonymously");
    }
  } catch (error) {
    console.warn("suggest-scenes: optional auth check failed", error);
  }
}

async function callGemini(apiKey: string, mimeType: string, base64Data: string, promptText: string) {
  const models = ["gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-2.0-flash"];
  let lastError = "Unknown Gemini error";

  for (const model of models) {
    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: promptText },
              { inlineData: { mimeType, data: base64Data } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 1800,
          responseMimeType: "application/json",
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
        const text = parsed?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => typeof part.text === "string")?.text;
        if (text) {
          return text;
        }
      } catch {
        // fall through to next model
      }
      lastError = `${model}: empty candidate text`;
      continue;
    }

    let detail = rawText.slice(0, 300);
    try {
      const parsed = JSON.parse(rawText);
      detail = parsed?.error?.message || detail;
    } catch {
      // ignore
    }
    console.error(`suggest-scenes Gemini error on ${model}:`, response.status, detail);
    lastError = `${model}: ${detail}`;
  }

  throw new Error(lastError);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const fallbackImageType = "main";
  let imageType: "main" | "detail" = fallbackImageType;

  try {
    await tryOptionalAuth(req);

    const body = await req.json();
    const imageBase64 = coerceImageInput(body.imageBase64);
    imageType = normalizeImageType(body.imageType);

    if (!imageBase64 || imageBase64.length < 100) {
      return new Response(JSON.stringify({ error: "请上传有效的产品图片" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const mimeType = getMimeType(imageBase64);
    const base64Data = getBase64Data(imageBase64);

    if (!geminiApiKey) {
      const fallback = buildFallbackSuggestions(imageType, "该商品");
      return new Response(JSON.stringify({
        product_summary: "未识别到具体商品，已返回兜底方案",
        visible_text: "NONE",
        suggestions: fallback,
        warning: "GEMINI_API_KEY not configured",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const shotGoal = imageType === "detail"
      ? "You are generating detail-image suggestions for an e-commerce product detail page."
      : "You are generating main-image suggestions for an e-commerce product listing cover image.";

    const promptText = [
      "You are a senior e-commerce product analyst and art director.",
      shotGoal,
      "Identify the original sellable product only.",
      "If the uploaded image is a webpage screenshot, editor screenshot, poster, banner, or a composite image, focus only on the product thumbnail or the actual product object the user uploaded.",
      "Ignore UI text, buttons, generated results, browser chrome, labels, and layout elements.",
      "Ignore existing decorative background, props, stickers, badges, poster titles, and marketing overlays if they are not part of the physical product.",
      "Recognize the real product category, shape, color palette, material, surface texture, printed design, and target use scene.",
      "Then produce exactly 3 Chinese scene plans for photographing the SAME product.",
      "Each plan must be practical for e-commerce use and must preserve the same product category, same product structure, same printed pattern, and same material feel.",
      "The 3 plans must be clearly different from each other, not repetitive template sentences.",
      "Return JSON only with this schema:",
      '{"product_summary":"中文总结商品类别和关键特征","visible_text":"图片内可见文字，没有就写NONE","suggestions":[{"scene":"方案名称","description":"完整中文方案正文，分段写出风格名称、视觉风格、场景关键词、产品信息、产品卖点、画面要求"},{"scene":"方案名称","description":"完整中文方案正文，分段写出风格名称、视觉风格、场景关键词、产品信息、产品卖点、画面要求"},{"scene":"方案名称","description":"完整中文方案正文，分段写出风格名称、视觉风格、场景关键词、产品信息、产品卖点、画面要求"}]}',
    ].join(" ");

    const candidateText = await callGemini(geminiApiKey, mimeType, base64Data, promptText);

    let parsed: {
      product_summary?: string;
      visible_text?: string;
      suggestions?: Array<{ scene?: string; description?: string }>;
    } = {};

    try {
      const jsonMatch = candidateText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : candidateText);
    } catch (error) {
      console.warn("suggest-scenes: parse failed, falling back", error);
    }

    const productSummary = String(parsed.product_summary || "该商品");
    const visibleText = String(parsed.visible_text || "NONE");
    const suggestions = (parsed.suggestions || [])
      .slice(0, 3)
      .map((item) => ({
        scene: String(item.scene || "场景方案"),
        description: String(item.description || ""),
      }))
      .filter((item) => item.description.trim().length > 0);

    const finalSuggestions = suggestions.length >= 3
      ? suggestions
      : buildFallbackSuggestions(imageType, productSummary);

    return new Response(JSON.stringify({
      product_summary: productSummary,
      visible_text: visibleText,
      suggestions: finalSuggestions,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("suggest-scenes error:", error);
    const fallback = buildFallbackSuggestions(imageType, "该商品");
    return new Response(JSON.stringify({
      product_summary: "商品识别暂时不稳定，已返回兜底方案",
      visible_text: "NONE",
      suggestions: fallback,
      warning: error instanceof Error ? error.message : "unknown error",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
