import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  return Math.min(Math.max(Math.round(parsed), 3), 8);
}

function normalizeScreenIdeas(value: unknown, screenCount: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, screenCount)
    .map((item) => String(item ?? "").trim())
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

function overlayBodyFromCopyPoints(copyPoints: string[]): string[] {
  return copyPoints.slice(0, 3).map((item) => item.trim()).filter(Boolean);
}

function buildFallbackPlan(
  planName: string,
  summary: string,
  screenCount: number,
  tone: string,
): DetailPlanOption {
  const screens = Array.from({ length: screenCount }, (_, index) => {
    const screen = index + 1;

    if (screen === 1) {
      const copyPoints = ["产品名称", "一句核心卖点", "主视觉氛围"];
      return {
        screen,
        title: "首屏主视觉",
        goal: "让用户一眼认出商品和整体调性",
        visualDirection: "用清晰主商品图建立第一印象，背景风格贴合整版主题，预留安全留白放标题与副文案。",
        copyPoints,
        overlayTitle: "一眼看懂主打卖点",
        overlayBodyLines: overlayBodyFromCopyPoints(copyPoints),
      };
    }

    if (screen === screenCount) {
      const copyPoints = ["价值总结", "信任背书", "购买引导"];
      return {
        screen,
        title: "收尾转化屏",
        goal: "总结价值并推动下单决策",
        visualDirection: "保持整体视觉统一，强化信任感与购买理由，适合做收尾转化。",
        copyPoints,
        overlayTitle: "为什么值得入手",
        overlayBodyLines: overlayBodyFromCopyPoints(copyPoints),
      };
    }

    const copyPoints = ["材质/做工", "功能亮点", "使用场景"];
    return {
      screen,
      title: `卖点展示屏 ${screen - 1}`,
      goal: "拆解商品的关键卖点与使用感受",
      visualDirection: "围绕商品本体做局部放大、材质细节、场景化陈列或功能点强调，兼顾文案留白。",
      copyPoints,
      overlayTitle: "细节亮点一屏讲清",
      overlayBodyLines: overlayBodyFromCopyPoints(copyPoints),
    };
  });

  return {
    planName,
    tone,
    audience: "电商详情页浏览用户",
    summary,
    designSpec: {
      mainColors: ["奶白", "浅金", "石墨灰"],
      accentColors: ["品牌主色", "点缀高亮色"],
      typography: "标题层级清晰，正文短句化，适合后贴真实文字",
      layoutTone: "信息层级清楚，留白充足，适合详情页长图阅读",
      imageStyle: "商品主体清晰、细节可辨识、统一电商质感",
      languageGuidelines: "短句化、卖点前置、避免空泛口号，适配后期文字叠加",
    },
    screens,
  };
}

function fallbackPlans(productSummary: string, screenCount: number): DetailPlanOption[] {
  return [
    buildFallbackPlan(
      "高级质感详情页",
      `围绕 ${productSummary} 做高级感、礼赠感和材质细节呈现，适合偏品牌调性的详情页。`,
      screenCount,
      "高级、克制、轻奢",
    ),
    buildFallbackPlan(
      "生活场景详情页",
      `围绕 ${productSummary} 做真实生活场景表达，强调使用氛围、实用卖点和代入感。`,
      screenCount,
      "自然、真实、场景化",
    ),
    buildFallbackPlan(
      "卖点拆解详情页",
      `围绕 ${productSummary} 做更强的信息表达，适合平台型电商详情页，突出卖点拆解与购买理由。`,
      screenCount,
      "清晰、信息化、强转化",
    ),
  ];
}

async function callGemini(
  apiKey: string,
  images: string[],
  promptText: string,
): Promise<string> {
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
          temperature: 0.35,
          topP: 0.85,
          maxOutputTokens: 4096,
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
        const text = parsed?.candidates?.[0]?.content?.parts?.find((part: { text?: string }) =>
          typeof part.text === "string"
        )?.text;
        if (text) {
          return text;
        }
      } catch {
        // continue
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
    console.error(`detail-plan Gemini error on ${model}:`, response.status, detail);
    lastError = `${model}: ${detail}`;
  }

  throw new Error(lastError);
}

function normalizePlanOption(
  value: unknown,
  index: number,
  screenCount: number,
  productSummary: string,
): DetailPlanOption {
  const option = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const designSpecRaw = option.designSpec && typeof option.designSpec === "object"
    ? option.designSpec as Record<string, unknown>
    : {};
  const screensRaw = Array.isArray(option.screens) ? option.screens : [];

  const fallback = fallbackPlans(productSummary, screenCount)[index] ||
    buildFallbackPlan(`方案 ${index + 1}`, `围绕 ${productSummary} 做详情页长图规划。`, screenCount, "清晰、统一");

  const screens = screensRaw
    .slice(0, screenCount)
    .map((screen, screenIndex) => {
      const current = screen && typeof screen === "object" ? screen as Record<string, unknown> : {};
      const fallbackScreen = fallback.screens[screenIndex];
      const copyPoints = safeStringArray(
        current.copyPoints,
        fallbackScreen?.copyPoints || ["核心标题", "卖点短句", "辅助说明"],
      );

      return {
        screen: Number(current.screen) || screenIndex + 1,
        title: safeString(current.title, fallbackScreen?.title || `内容屏 ${screenIndex + 1}`),
        goal: safeString(current.goal, fallbackScreen?.goal || "突出当前屏的关键卖点"),
        visualDirection: safeString(
          current.visualDirection,
          fallbackScreen?.visualDirection || "保持商品主体清晰，围绕卖点组织画面，并预留文字留白。",
        ),
        copyPoints,
        overlayTitle: safeString(
          current.overlayTitle,
          fallbackScreen?.overlayTitle || copyPoints[0] || `第 ${screenIndex + 1} 屏重点`,
        ),
        overlayBodyLines: safeStringArray(
          current.overlayBodyLines,
          fallbackScreen?.overlayBodyLines || overlayBodyFromCopyPoints(copyPoints),
        ).slice(0, 4),
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
      return new Response(JSON.stringify({ error: "请至少上传 1 张商品图" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const fallbackProductSummary = "该商品";

    if (!geminiApiKey) {
      return new Response(JSON.stringify({
        productSummary: "未配置 Gemini，已返回兜底详情页方案",
        visibleText: "NONE",
        planOptions: fallbackPlans(fallbackProductSummary, screenCount),
        warning: "GEMINI_API_KEY not configured",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const promptText = [
      "You are a senior e-commerce detail-page strategist, visual planner, and copy planner.",
      "Analyze the uploaded product images and produce exactly 3 different detail-page plans.",
      `Target platform: ${targetPlatform}.`,
      `Target language for overlay copy: ${targetLanguage}.`,
      `Requested screen count: ${screenCount}.`,
      productInfo
        ? `User notes and selling points: ${productInfo}.`
        : "No extra notes were provided by the user.",
      screenIdeas.some(Boolean)
        ? `User screen ideas: ${screenIdeas
            .map((idea, index) => `screen ${index + 1}: ${idea || "none"}`)
            .join(" | ")}.`
        : "No manual per-screen ideas were provided.",
      "Focus on the actual sellable product only.",
      "If the uploaded image is a screenshot or collage, ignore UI chrome, browser frame, editor panels, and generated examples that are not part of the physical product.",
      "You must identify product category, material, color palette, shape, pattern, visible text, and practical selling points.",
      "For each screen, provide both visual planning and short overlay copy that is suitable for post-production text overlay.",
      "overlayTitle must be short, strong, readable, and suitable as a real poster title.",
      "overlayBodyLines must contain 2 to 4 short lines, each line concise and commercially useful. Avoid fake slogans and avoid generic filler.",
      "The result must be practical for Chinese e-commerce detail-page design and must stay tightly related to the actual product.",
      "Return JSON only with this schema:",
      '{"productSummary":"中文商品总结","visibleText":"商品上可见文字，没有则写NONE","planOptions":[{"planName":"方案名","tone":"整体调性","audience":"目标人群","summary":"整版总结","designSpec":{"mainColors":["主色1","主色2"],"accentColors":["辅助色1","辅助色2"],"typography":"字体建议","layoutTone":"版式风格","imageStyle":"画面风格","languageGuidelines":"文案规范"},"screens":[{"screen":1,"title":"分屏标题","goal":"该屏目标","visualDirection":"该屏视觉方向","copyPoints":["文案点1","文案点2","文案点3"],"overlayTitle":"后贴标题","overlayBodyLines":["后贴正文1","后贴正文2","后贴正文3"]}]}]}',
    ].join(" ");

    const candidateText = await callGemini(geminiApiKey, productImages, promptText);

    let parsed: {
      productSummary?: string;
      visibleText?: string;
      planOptions?: unknown[];
    } = {};

    try {
      const jsonMatch = candidateText.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : candidateText);
    } catch (error) {
      console.warn("detail-plan parse failed, using fallback", error);
    }

    const productSummary = safeString(parsed.productSummary, fallbackProductSummary);
    const visibleText = safeString(parsed.visibleText, "NONE");
    const rawPlanOptions = Array.isArray(parsed.planOptions) ? parsed.planOptions.slice(0, 3) : [];
    const planOptions = rawPlanOptions.length
      ? rawPlanOptions.map((option, index) =>
          normalizePlanOption(option, index, screenCount, productSummary)
        )
      : fallbackPlans(productSummary, screenCount);

    return new Response(JSON.stringify({
      productSummary,
      visibleText,
      planOptions,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("detail-plan error:", error);
    return new Response(JSON.stringify({
      productSummary: "详情页策划暂时不稳定，已返回兜底方案",
      visibleText: "NONE",
      planOptions: fallbackPlans("该商品", 4),
      warning: error instanceof Error ? error.message : "unknown error",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
