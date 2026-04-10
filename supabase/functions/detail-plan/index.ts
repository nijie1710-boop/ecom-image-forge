import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callGeminiTextWithFallback,
  errorResponse,
  FunctionError,
  jsonResponse,
  requireEnv,
} from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DetailPlanScreen = {
  screen: number;
  title: string;
  goal: string;
  visualDirection: string;
  copyPoints: string[];
  overlayTitle: string;
  overlayBodyLines: string[];
  humanModelSuggested: boolean;
  humanModelReason: string;
};

type DetailPlanOption = {
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
    .slice(0, 5);
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
    console.warn("detail-plan optional auth check failed", error);
  }
}

function clampScreenCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 4;
  return Math.min(Math.max(Math.round(parsed), 1), 8);
}

function normalizeScreenIdeas(value: unknown, screenCount: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, screenCount)
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .map((item) => item.slice(0, 220));
}

function safeString(value: unknown, fallback = ""): string {
  const text = String(value ?? fallback).trim();
  return text || fallback;
}

function safeStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.map((item) => safeString(item)).filter(Boolean);
  return items.length ? items : fallback;
}

function overlayBodyFromCopyPoints(copyPoints: string[]) {
  return copyPoints.slice(0, 3).map((item) => item.trim()).filter(Boolean);
}

function buildFallbackPlan(planName: string, summary: string, screenCount: number, tone: string): DetailPlanOption {
  const screens = Array.from({ length: screenCount }, (_, index) => {
    const screen = index + 1;
    const isFirst = screen === 1;
    const isLast = screen === screenCount;
    const copyPoints = isFirst
      ? ["核心卖点", "品牌感", "一眼识别商品"]
      : isLast
      ? ["购买理由", "信任感", "转化引导"]
      : ["材质细节", "使用场景", "功能亮点"];

    return {
      screen,
      title: isFirst ? "首屏主视觉" : isLast ? "收尾转化屏" : `卖点展示屏 ${screen - 1}`,
      goal: isFirst
        ? "建立第一印象，让用户快速识别商品与调性"
        : isLast
        ? "总结价值并推动下单决策"
        : "拆解当前分屏要表达的卖点与使用感受",
      visualDirection: isFirst
        ? "用清晰商品图建立第一印象，画面高级、主体突出、留有适度文案安全区。"
        : isLast
        ? "保持整版统一感，突出信任感与购买理由，适合详情页结尾转化。"
        : "围绕商品本体、局部细节、使用场景或功能点组织画面。",
      copyPoints,
      overlayTitle: isFirst ? "一眼看懂主打卖点" : isLast ? "为什么值得入手" : "细节亮点一屏讲清",
      overlayBodyLines: overlayBodyFromCopyPoints(copyPoints),
      humanModelSuggested: false,
      humanModelReason: isFirst
        ? "首屏优先保证商品清晰完整。"
        : isLast
        ? "结尾屏更适合用商品与信息做总结。"
        : "卖点细节屏优先突出商品本体与结构。",
    };
  });

  return {
    planName,
    tone,
    audience: "电商详情页浏览用户",
    summary,
    designSpec: {
      mainColors: ["奶白", "浅金", "石墨灰"],
      accentColors: ["品牌主色", "高亮辅助色"],
      typography: "标题层级清晰，正文短句化，适合后贴真实文案",
      layoutTone: "信息层级清楚，留白充足，适合详情页长图阅读",
      imageStyle: "商品主体清晰，细节可辨识，保持统一电商质感",
      languageGuidelines: "短句化，卖点前置，避免空泛口号",
    },
    screens,
  };
}

function fallbackPlans(productSummary: string, screenCount: number): DetailPlanOption[] {
  return [
    buildFallbackPlan(
      "高级质感详情页",
      `围绕 ${productSummary} 做高级感与材质细节呈现，适合偏品牌调性的详情页。`,
      screenCount,
      "高级、克制、轻奢",
    ),
    buildFallbackPlan(
      "生活场景详情页",
      `围绕 ${productSummary} 做真实生活场景表达，强调使用氛围、代入感与实用卖点。`,
      screenCount,
      "自然、真实、场景化",
    ),
    buildFallbackPlan(
      "卖点拆解详情页",
      `围绕 ${productSummary} 做更强的信息表达，适合平台型电商详情页。`,
      screenCount,
      "清晰、信息化、强转化",
    ),
  ];
}

function normalizePlanOption(value: unknown, index: number, screenCount: number, productSummary: string): DetailPlanOption {
  const option = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const designSpecRaw =
    option.designSpec && typeof option.designSpec === "object"
      ? (option.designSpec as Record<string, unknown>)
      : {};
  const screensRaw = Array.isArray(option.screens) ? option.screens : [];
  const fallback = fallbackPlans(productSummary, screenCount)[index];

  const screens = screensRaw.slice(0, screenCount).map((screen, screenIndex) => {
    const current = screen && typeof screen === "object" ? (screen as Record<string, unknown>) : {};
    const fallbackScreen = fallback.screens[screenIndex];
    const copyPoints = safeStringArray(current.copyPoints, fallbackScreen.copyPoints);

    return {
      screen: Number(current.screen) || screenIndex + 1,
      title: safeString(current.title, fallbackScreen.title),
      goal: safeString(current.goal, fallbackScreen.goal),
      visualDirection: safeString(current.visualDirection, fallbackScreen.visualDirection),
      copyPoints,
      overlayTitle: safeString(current.overlayTitle, fallbackScreen.overlayTitle),
      overlayBodyLines: safeStringArray(
        current.overlayBodyLines,
        overlayBodyFromCopyPoints(copyPoints),
      ).slice(0, 4),
      humanModelSuggested: Boolean(current.humanModelSuggested ?? fallbackScreen.humanModelSuggested),
      humanModelReason: safeString(current.humanModelReason, fallbackScreen.humanModelReason),
    };
  });

  while (screens.length < screenCount) {
    const extra = fallback.screens[screens.length] || fallback.screens[fallback.screens.length - 1];
    screens.push({ ...extra, screen: screens.length + 1 });
  }

  return {
    planName: safeString(option.planName, fallback.planName),
    tone: safeString(option.tone, fallback.tone),
    audience: safeString(option.audience, fallback.audience),
    summary: safeString(option.summary, fallback.summary),
    designSpec: {
      mainColors: safeStringArray(designSpecRaw.mainColors, fallback.designSpec.mainColors),
      accentColors: safeStringArray(designSpecRaw.accentColors, fallback.designSpec.accentColors),
      typography: safeString(designSpecRaw.typography, fallback.designSpec.typography),
      layoutTone: safeString(designSpecRaw.layoutTone, fallback.designSpec.layoutTone),
      imageStyle: safeString(designSpecRaw.imageStyle, fallback.designSpec.imageStyle),
      languageGuidelines: safeString(
        designSpecRaw.languageGuidelines,
        fallback.designSpec.languageGuidelines,
      ),
    },
    screens,
  };
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
    const targetLanguage = safeString(body.targetLanguage, "zh");
    const screenCount = clampScreenCount(body.screenCount);
    const screenIdeas = normalizeScreenIdeas(body.screenIdeas, screenCount);

    if (!productImages.length) {
      return jsonResponse(
        { error: "PRODUCT_IMAGE_REQUIRED", message: "At least one product image is required" },
        400,
        corsHeaders,
      );
    }

    const geminiApiKey = requireEnv("GEMINI_API_KEY", Deno.env.get("GEMINI_API_KEY"));

    const promptText = [
      "You are a senior e-commerce detail-page strategist, visual planner, and copy planner.",
      "Analyze the uploaded product images and produce exactly 3 distinctly different detail-page plans.",
      "The 3 plans must differ in tone, target audience, visual style, and copy strategy.",
      "Plan 1 should feel premium and brand-led.",
      "Plan 2 should feel real-life, warm, and scenario-driven.",
      "Plan 3 should feel rational, feature-focused, and conversion-oriented.",
      `Target platform: ${targetPlatform}.`,
      `Target language for copy: ${targetLanguage}.`,
      `Requested screen count per plan: ${screenCount}.`,
      productInfo ? `User notes: ${productInfo}.` : "No extra user notes were provided.",
      screenIdeas.length
        ? `User screen ideas: ${screenIdeas
            .map((idea, ideaIndex) => `screen ${ideaIndex + 1}: ${idea}`)
            .join(" | ")}.`
        : "No manual per-screen ideas were provided.",
      "Focus on the actual sellable product only.",
      "Ignore browser frame, editor chrome, UI panel, example mockups, or demo screenshots if they are not part of the real product.",
      "For each plan, provide exact screen structure and short usable copy.",
      "Return JSON only with this schema:",
      '{"productSummary":"中文商品总结","visibleText":"图片中可见文字，没有则写 NONE","planOptions":[{"planName":"方案名","tone":"整体调性","audience":"目标人群","summary":"整版总结","designSpec":{"mainColors":["主色 1","主色 2"],"accentColors":["辅助色 1","辅助色 2"],"typography":"字体建议","layoutTone":"版式风格","imageStyle":"画面风格","languageGuidelines":"文案规范"},"screens":[{"screen":1,"title":"分屏标题","goal":"该屏目标","visualDirection":"该屏视觉方向","copyPoints":["文案点 1","文案点 2","文案点 3"],"overlayTitle":"短标题","overlayBodyLines":["短句 1","短句 2","短句 3"],"humanModelSuggested":false,"humanModelReason":"是否需要人物的简短理由"}]}]}',
    ].join(" ");

    const { text, meta } = await callGeminiTextWithFallback({
      apiKey: geminiApiKey,
      functionName: "detail-plan",
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
        temperature: 0.75,
        topP: 0.92,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingBudget: 0 },
      },
    });

    let parsed: {
      productSummary?: string;
      visibleText?: string;
      planOptions?: unknown[];
    } = {};

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (error) {
      console.warn("detail-plan parse failed:", error);
      throw new FunctionError("DETAIL_PLAN_PARSE_FAILED", 502, "Failed to parse detail plan JSON");
    }

    const productSummary = safeString(parsed.productSummary, "该商品");
    const visibleText = safeString(parsed.visibleText, "NONE");
    const rawPlanOptions = Array.isArray(parsed.planOptions) ? parsed.planOptions.slice(0, 3) : [];
    if (!rawPlanOptions.length) {
      throw new FunctionError("DETAIL_PLAN_EMPTY_RESULT", 502, "Detail plan returned no plan options");
    }

    const planOptions = rawPlanOptions.map((option, index) =>
      normalizePlanOption(option, index, screenCount, productSummary)
    );

    return jsonResponse(
      {
        productSummary,
        visibleText,
        planOptions,
        meta,
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    console.error("detail-plan error:", error);
    return errorResponse(error, corsHeaders);
  }
});
