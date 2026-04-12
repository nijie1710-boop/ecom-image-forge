import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callGeminiImageWithFallback,
  errorResponse,
  FunctionError,
  jsonResponse,
  requireEnv,
  resolveImageModelSelection,
  type ImageModelInput,
} from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SupportedResolution = "0.5k" | "1k" | "2k" | "4k";

function parseDataUrl(url: string): { mimeType: string; base64: string } | null {
  if (!url.startsWith("data:")) return null;
  const match = url.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

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

function coerceImageList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => coerceImageInput(item)).filter(Boolean);
}

async function resolveImageToBase64(source: string): Promise<{ mimeType: string; base64: string } | null> {
  const parsed = parseDataUrl(source);
  if (parsed) return parsed;

  try {
    const response = await fetch(source);
    if (!response.ok) {
      console.error("generate-image fetch image failed:", response.status, source);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }

    return {
      mimeType: response.headers.get("Content-Type") || "image/jpeg",
      base64: btoa(binary),
    };
  } catch (error) {
    console.error("generate-image fetch image error:", error);
    return null;
  }
}

function normalizeImageType(value: string | undefined): "main" | "detail" {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("detail") || normalized.includes("详情")) {
    return "detail";
  }
  return "main";
}

function normalizeTextLanguage(value: string | undefined): string {
  return (value || "zh").toLowerCase();
}

function normalizeModelMode(value: string | undefined): "none" | "with_model" {
  return value === "with_model" ? "with_model" : "none";
}

function normalizeModel(value: unknown): ImageModelInput {
  return String(value || "gemini-2.5-flash-image") as ImageModelInput;
}

function normalizeResolution(value: string | undefined): SupportedResolution {
  const normalized = (value || "").toLowerCase();
  if (normalized === "0.5k" || normalized === "1k" || normalized === "2k" || normalized === "4k") {
    return normalized;
  }
  return "2k";
}

function normalizeAspectRatio(value: string | undefined): string {
  const normalized = String(value || "1:1").trim();
  return /^\d+:\d+$/.test(normalized) ? normalized : "1:1";
}

function normalizeDebugContext(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  return {
    source: typeof input.source === "string" ? input.source : undefined,
    screenNumber: Number.isFinite(Number(input.screenNumber)) ? Number(input.screenNumber) : undefined,
    promptLength: Number.isFinite(Number(input.promptLength)) ? Number(input.promptLength) : undefined,
    referenceGalleryCount: Number.isFinite(Number(input.referenceGalleryCount))
      ? Number(input.referenceGalleryCount)
      : undefined,
    hasStyleReference: Boolean(input.hasStyleReference),
    hasModelReference: Boolean(input.hasModelReference),
  };
}

function truncatePromptForModel(prompt: string, source: unknown): string {
  const normalizedSource = String(source || "");
  const limit = normalizedSource === "detail" ? 2600 : 4200;
  return prompt.length > limit ? prompt.slice(0, limit) : prompt;
}

function buildAspectRatioInstruction(ratio: string): string {
  const map: Record<string, string> = {
    "1:1": "square",
    "2:3": "portrait",
    "3:2": "landscape",
    "3:4": "portrait",
    "4:3": "landscape",
    "4:5": "portrait",
    "5:4": "landscape",
    "9:16": "portrait",
    "16:9": "landscape",
    "21:9": "ultra-wide landscape",
  };
  return `ASPECT RATIO LOCK: The final image canvas must be exactly ${ratio} (${map[ratio] || "custom"}). Do not output any other canvas proportion.`;
}

function buildTextInstruction(language: string): string {
  const languageMap: Record<string, string> = {
    zh: "Simplified Chinese",
    en: "English",
    ja: "Japanese",
    ko: "Korean",
    de: "German",
    fr: "French",
    es: "Spanish",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    ar: "Arabic",
    th: "Thai",
    vi: "Vietnamese",
  };

  if (language === "pure") {
    return [
      "TEXT POLICY: Do not add any new scene text, poster text, labels, slogans, captions, watermarks, or decorative typography.",
      "Preserve any existing logo, printed words, numbers, or graphics that are already part of the physical product exactly as-is.",
      "Do not erase, translate, rewrite, or redesign product print.",
    ].join(". ");
  }

  const targetLanguage = languageMap[language] || "Simplified Chinese";
  const fontGuidance = language === "zh"
    ? "Use a clean, modern, highly legible Chinese sans-serif font style inspired by free commercial fonts such as Source Han Sans SC, Alibaba PuHuiTi, or HarmonyOS Sans SC. Do not use calligraphy, handwriting, decorative novelty fonts, gibberish, or malformed Chinese glyphs."
    : language === "en"
    ? "Use clean, modern, highly legible Latin sans-serif typography with correct English spelling. Do not generate Chinese, Japanese, Korean, pinyin, pseudo-CJK glyphs, malformed letters, or unreadable filler text."
    : "Use a clean, modern, highly legible sans-serif font style. Do not use decorative novelty fonts, gibberish, malformed glyphs, or unreadable pseudo-text.";
  return [
    `TEXT POLICY: Any newly introduced scene text must be only in ${targetLanguage}.`,
    "Do not mix multiple languages in newly added scene text.",
    language === "en"
      ? "If the prompt, product notes, or visible-text notes contain Chinese/CJK text, treat them as product context only. Translate the meaning into short English if text is needed, or omit it. Never copy CJK notes into newly generated poster text."
      : "",
    fontGuidance,
    "All newly generated text must use correct spelling, correct glyphs, and readable layout hierarchy.",
    "Preserve any existing logo, printed words, numbers, or graphics that are already part of the physical product exactly as-is.",
    "Do not translate or redesign text that is physically printed on the product.",
  ].filter(Boolean).join(". ");
}

function buildResolutionInstruction(resolution: SupportedResolution): string {
  const mapping: Record<SupportedResolution, string> = {
    "0.5k": "QUALITY TARGET: fast draft quality, acceptable structure, lighter detail density.",
    "1k": "QUALITY TARGET: standard balanced quality for quick commercial drafts.",
    "2k": "QUALITY TARGET: high detail e-commerce quality with clear texture, edges, and print fidelity.",
    "4k": "QUALITY TARGET: ultra-detailed premium render with maximum texture fidelity, crisp edges, and refined lighting.",
  };
  return mapping[resolution];
}

function extractPromptSections(prompt: string) {
  const take = (label: string) => {
    const regex = new RegExp(`${label}[：:]\\s*([\\s\\S]*?)(?=\\n(?:风格名称|视觉风格|场景关键词|产品信息|产品卖点|画面要求)[：:]|$)`);
    const match = prompt.match(regex);
    return match?.[1]?.trim() || "";
  };

  return {
    styleName: take("风格名称"),
    visualStyle: take("视觉风格"),
    sceneKeywords: take("场景关键词"),
    productInfo: take("产品信息"),
    sellingPoints: take("产品卖点"),
    composition: take("画面要求"),
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse(
        { error: "UNAUTHORIZED", message: "User must be logged in before generating images" },
        401,
        corsHeaders,
      );
    }

    const supabaseUrl = requireEnv("SUPABASE_URL", Deno.env.get("SUPABASE_URL"));
    const supabaseServiceKey = requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const geminiApiKey = requireEnv("GEMINI_API_KEY", Deno.env.get("GEMINI_API_KEY"));

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
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

    const body = await req.json();
    const {
      prompt,
      imageBase64,
      aspectRatio,
      referenceImageUrl,
      referenceStyleUrl,
      referenceGallery,
      styleReferenceText,
      modelMode,
      modelImage,
      imageType,
      textLanguage,
      model,
      resolution,
      debugContext,
    } = body;
    const normalizedDebugContext = normalizeDebugContext(debugContext);

    const productSource = coerceImageInput(imageBase64) || coerceImageInput(referenceImageUrl);
    const productImage = productSource ? await resolveImageToBase64(productSource) : null;
    if (!productImage) {
      return jsonResponse(
        { error: "PRODUCT_IMAGE_REQUIRED", message: "Primary product image is required" },
        400,
        corsHeaders,
      );
    }

    const modelSource = coerceImageInput(modelImage);
    const modelReferenceImage = modelSource ? await resolveImageToBase64(modelSource) : null;
    const galleryLimit = modelReferenceImage ? 1 : 2;
    const gallerySources = coerceImageList(referenceGallery).slice(0, galleryLimit);
    const galleryImages = (
      await Promise.all(gallerySources.map((item) => resolveImageToBase64(item)))
    ).filter(Boolean) as Array<{ mimeType: string; base64: string }>;
    const styleSource = coerceImageInput(referenceStyleUrl);
    const styleImage = styleSource ? await resolveImageToBase64(styleSource) : null;

    const normalizedImageType = normalizeImageType(imageType);
    const normalizedTextLanguage = normalizeTextLanguage(textLanguage);
    const normalizedModel = normalizeModel(model);
    const normalizedResolution = normalizeResolution(resolution);
    const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
    const normalizedModelMode = normalizeModelMode(modelMode);
    const modelSelection = resolveImageModelSelection(normalizedModel);

    const absoluteRules = [
      "=== ABSOLUTE RULES ===",
      "This is a product-preserving image generation task, not a redesign.",
      "The first image contains the exact product that must remain the same product in the output.",
      "Ignore browser chrome, editor UI, phone status bar, webpage containers, and poster frames if they are not part of the physical product.",
      "Never replace the product with another category.",
      "Copy the exact silhouette, structure, proportions, color palette, material appearance, and surface texture.",
      "Preserve logos, printed artwork, letters, graphics, seams, collar shape, sleeves, hems, ports, buttons, zippers, stitching, and distinctive details exactly as they appear on the original product.",
      "The only acceptable changes are lighting, shadows, background, composition, camera distance, and supporting scene elements.",
      "If the product category changes, the result is a total failure.",
      "If the printed artwork or logo changes, the result is a total failure.",
      "If the product proportions or material appearance changes, the result is a total failure.",
    ].join(". ");

    const roleInstructions = [
      "ROLE ASSIGNMENT:",
      "Image 1 is the primary product reference and must be preserved exactly.",
      galleryImages.length
        ? `Images 2 to ${galleryImages.length + 1} are additional product angle references of the same item. Use them to lock structure, ports, seams, print, texture, and color consistency.`
        : "There are no additional product-angle references. Re-photograph the same product in a better e-commerce setup.",
      normalizedModelMode === "with_model" && modelReferenceImage
        ? "One reference image is a model/person reference. A visible human model is mandatory in the final image. Use it to guide pose, hand placement, body presence, and natural wearing context. Do not let the model hide the product."
        : "There is no dedicated model reference image. Only add a natural human presence or hands when the screen plan clearly benefits from wearing effect, size reference, or real usage context.",
      styleImage
        ? "One reference image is style reference only for lighting, atmosphere, composition rhythm, and color mood. Do not copy the style image's product."
        : "",
      "If the source image is a poster, banner, lifestyle shot, or already contains scene props, extract the core product and rebuild a clean product-focused composition around it.",
    ]
      .filter(Boolean)
      .join(". ");

    const promptText = truncatePromptForModel(String(prompt || ""), normalizedDebugContext.source);
    const promptSections = extractPromptSections(promptText);
    const promptSuggestsHuman =
      /建议人物出镜|需要人物|真人模特|上身|手持|手部|使用动作|生活场景/i.test(promptText);
    const hasExplicitScene = Boolean(
      promptSections.sceneKeywords ||
        promptSections.composition ||
        /咖啡|办公室|办公桌|客厅|卧室|阳台|海边|沙滩|花园|户外|书店|餐厅|工作室|桌面|自然光|场景|背景|室内|室外/i.test(promptText),
    );

    const sceneExecutionInstruction = [
      "SCENE EXECUTION RULES:",
      "The USER REQUEST is the primary creative directive for the scene, background, atmosphere, props, and styling.",
      "If the USER REQUEST specifies a location or environment such as cafe, office, beach, garden, bedroom, studio, desktop, or outdoor setting, that scene must be clearly visible in the final image.",
      "Do not ignore the requested scene and fall back to an empty white background unless the USER REQUEST explicitly asks for white background or pure studio background.",
      "Keep the product as the visual hero, but the requested scene must still be obvious and readable.",
      "Main image means hero-product composition, not mandatory white background.",
    ].join(". ");

    const typeInstruction = normalizedImageType === "detail"
      ? [
        "SHOT TYPE: detail image.",
        "Use a realistic merchandising or lifestyle setup that highlights product usage, fabric, craftsmanship, and selling points while keeping the same product fully recognizable.",
        "Follow the requested scene closely and use composition that helps communicate usage and detail.",
      ].join(". ")
      : [
        "SHOT TYPE: main image.",
        "Use hero-product composition with the product as the clear focal point.",
        "If the USER REQUEST includes a concrete scene, render that scene clearly while keeping the layout clean and commercially usable.",
        "Only use white background or neutral studio background when the USER REQUEST explicitly asks for it or when no scene is provided at all.",
      ].join(". ");

    const modelPresenceInstruction =
      normalizedModelMode === "with_model"
        ? [
            "MODEL PRESENCE:",
            modelReferenceImage
              ? "A real human model must appear in the composition. The output is invalid if there is no visible person. Follow the model reference naturally while keeping the product fully visible."
              : "A real human model must appear in the composition, but the product must remain the primary hero.",
            "Do not crop the product awkwardly and do not let hair, hands, or clothing cover the key selling points.",
            "If this is a wearable product, show the product being naturally worn by the model instead of floating alone.",
            "If this is a handheld or personal-use product, allow the model to hold or interact with it naturally.",
          ].join(". ")
        : [
            "MODEL PRESENCE:",
            promptSuggestsHuman
              ? "The current screen plan suggests that a visible person or hands can help explain the product. Add a natural human presence only as supporting context, and keep the product as the primary visual hero."
              : "Prefer pure product composition. Do not add a human model, hands, or mannequin unless the screen plan clearly calls for wearing effect, hand-held usage, or human scale reference.",
          ].join(". ");

    const sceneLockInstruction = hasExplicitScene
      ? [
        "SCENE LOCK:",
        "A concrete scene is explicitly requested.",
        "White background, empty studio background, or plain cutout output is forbidden unless the prompt explicitly says white background.",
        "The final image must visibly include the requested environment and scene mood.",
      ].join(". ")
      : "";

    const finalLanguageLock = normalizedTextLanguage === "en"
      ? [
          "FINAL TEXT LANGUAGE LOCK:",
          "Newly generated poster or scene text must be English only.",
          "Do not generate Chinese/CJK characters anywhere except text already physically printed on the product reference.",
          "If uncertain about text, use fewer English words rather than inventing non-English or pseudo text.",
        ].join(". ")
      : "";

    const structuredPromptInstruction = [
      promptSections.styleName ? `STYLE NAME: ${promptSections.styleName}.` : "",
      promptSections.visualStyle ? `VISUAL STYLE: ${promptSections.visualStyle}.` : "",
      promptSections.sceneKeywords ? `REQUIRED SCENE KEYWORDS: ${promptSections.sceneKeywords}.` : "",
      promptSections.productInfo ? `PRODUCT INFO FROM USER: ${promptSections.productInfo}.` : "",
      promptSections.sellingPoints ? `SELLING POINTS: ${promptSections.sellingPoints}.` : "",
      promptSections.composition ? `REQUIRED COMPOSITION: ${promptSections.composition}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const systemInstruction = [
      absoluteRules,
      roleInstructions,
      sceneExecutionInstruction,
      typeInstruction,
      buildTextInstruction(normalizedTextLanguage),
      buildResolutionInstruction(normalizedResolution),
      buildAspectRatioInstruction(normalizedAspectRatio),
      `MODEL TARGET: Prefer visual behavior suitable for ${modelSelection.label}.`,
      modelPresenceInstruction,
      styleReferenceText ? `STYLE NOTES FROM USER: ${String(styleReferenceText).trim()}.` : "",
      structuredPromptInstruction,
      sceneLockInstruction,
      `USER REQUEST RAW: ${promptText}`,
      finalLanguageLock,
    ]
      .filter(Boolean)
      .join(". ");

    const parts: Array<Record<string, unknown>> = [
      { text: systemInstruction },
      { text: "REFERENCE IMAGE 1: PRIMARY PRODUCT. Preserve this exact product." },
      {
        inlineData: {
          mimeType: productImage.mimeType,
          data: productImage.base64,
        },
      },
    ];

    galleryImages.forEach((image, index) => {
      parts.push({
        text: `REFERENCE IMAGE ${index + 2}: ADDITIONAL PRODUCT ANGLE. Use only to lock product details and consistency.`,
      });
      parts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.base64,
        },
      });
    });

    if (modelReferenceImage) {
      parts.push({
        text: "MODEL REFERENCE IMAGE: Use this only for body presence, pose, and interaction. Do not let it replace the product.",
      });
      parts.push({
        inlineData: {
          mimeType: modelReferenceImage.mimeType,
          data: modelReferenceImage.base64,
        },
      });
    }

    if (styleImage) {
      parts.push({
        text: "STYLE REFERENCE IMAGE: Use only for mood, lighting, and composition rhythm. Do not copy its product.",
      });
      parts.push({
        inlineData: {
          mimeType: styleImage.mimeType,
          data: styleImage.base64,
        },
      });
    }

    console.info("generate-image request meta:", {
      userId: user.id,
      debugContext: normalizedDebugContext,
      imageType: normalizedImageType,
      textLanguage: normalizedTextLanguage,
      modelRequested: modelSelection.requestedModel,
      modelSelection: normalizedModel,
      resolution: normalizedResolution,
      aspectRatio: normalizedAspectRatio,
      modelMode: normalizedModelMode,
      promptLength: promptText.length,
      galleryCount: galleryImages.length,
      hasModelReference: Boolean(modelReferenceImage),
      hasStyleReference: Boolean(styleImage),
    });

    const { imageUrl, meta } = await callGeminiImageWithFallback({
      apiKey: geminiApiKey,
      functionName: normalizedDebugContext.screenNumber
        ? `generate-image:detail-screen-${normalizedDebugContext.screenNumber}`
        : "generate-image",
      selectedModel: normalizedModel,
      parts,
      resolution: normalizedResolution,
    });

    return jsonResponse(
      {
        images: [imageUrl],
        meta: {
          ...meta,
          debugContext: normalizedDebugContext,
          modelSelection: normalizedModel,
          modelLabel: modelSelection.label,
          aspectRatio: normalizedAspectRatio,
        },
      },
      200,
      corsHeaders,
    );
  } catch (error) {
    if (error instanceof FunctionError) {
      console.error("generate-image function error:", {
        code: error.code,
        status: error.status,
        detail: error.detail,
        meta: error.meta,
      });
    } else {
      console.error("generate-image unexpected error:", error);
    }
    return errorResponse(error, corsHeaders);
  }
});
