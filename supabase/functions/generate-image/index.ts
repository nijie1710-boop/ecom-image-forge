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
type FidelityCategory = "phone-case" | "printed-product" | "packaging" | "general";

type FidelityContext = {
  categoryHint?: FidelityCategory;
  preservePattern?: boolean;
  preferProductOnly?: boolean;
  suppressModelReference?: boolean;
  strictReason?: string;
  structureReferencePriority?: string[];
  preferredAngles?: string[];
  forbiddenAngles?: string[];
};

type StrictStrategy = {
  enabled: boolean;
  category: FidelityCategory;
  allowModelReference: boolean;
  allowHumanPresence: boolean;
  allowStyleReference: boolean;
  preferProductOnly: boolean;
  galleryLimit: number;
  effectiveModel: ImageModelInput;
  effectiveResolution: SupportedResolution;
  structureReferencePriority: string[];
  preferredAngles: string[];
  forbiddenAngles: string[];
  preservePattern: boolean;
  strictReason?: string;
};

const PHONE_CASE_KEYWORDS = [
  "手机壳",
  "手机套",
  "保护壳",
  "保护套",
  "phone case",
  "iphone case",
  "magsafe",
  "镜头孔",
  "camera cutout",
];

const PRINTED_PRODUCT_KEYWORDS = ["印花", "图案", "pattern", "graphic", "printed", "插画", "壳面"];
const PACKAGING_KEYWORDS = ["包装", "包装盒", "礼盒", "瓶", "袋", "box", "bottle", "pouch", "label"];

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

function normalizeFidelityMode(value: string | undefined): "normal" | "strict" {
  return value === "strict" ? "strict" : "normal";
}

function includesKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function normalizeFidelityCategory(value: unknown): FidelityCategory | undefined {
  if (
    value === "phone-case" ||
    value === "printed-product" ||
    value === "packaging" ||
    value === "general"
  ) {
    return value;
  }
  return undefined;
}

function normalizeFidelityContext(value: unknown): FidelityContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const list = (field: string) =>
    Array.isArray(input[field])
      ? input[field]
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .slice(0, 8)
      : undefined;

  return {
    categoryHint: normalizeFidelityCategory(input.categoryHint),
    preservePattern: Boolean(input.preservePattern),
    preferProductOnly: Boolean(input.preferProductOnly),
    suppressModelReference: Boolean(input.suppressModelReference),
    strictReason: typeof input.strictReason === "string" ? input.strictReason.trim() : undefined,
    structureReferencePriority: list("structureReferencePriority"),
    preferredAngles: list("preferredAngles"),
    forbiddenAngles: list("forbiddenAngles"),
  };
}

function inferFidelityCategory(
  prompt: string,
  styleReferenceText: string | undefined,
  fidelityContext: FidelityContext | undefined,
): FidelityCategory {
  if (fidelityContext?.categoryHint) return fidelityContext.categoryHint;

  const combined = `${prompt}\n${styleReferenceText || ""}`.toLowerCase();
  if (includesKeyword(combined, PHONE_CASE_KEYWORDS)) return "phone-case";
  if (includesKeyword(combined, PACKAGING_KEYWORDS)) return "packaging";
  if (includesKeyword(combined, PRINTED_PRODUCT_KEYWORDS)) return "printed-product";
  return "general";
}

function buildStrictStrategy(args: {
  fidelityMode: "normal" | "strict";
  category: FidelityCategory;
  fidelityContext?: FidelityContext;
  normalizedModel: ImageModelInput;
  normalizedResolution: SupportedResolution;
  normalizedModelMode: "none" | "with_model";
  hasModelReference: boolean;
  hasStyleReference: boolean;
}): StrictStrategy {
  const {
    fidelityMode,
    category,
    fidelityContext,
    normalizedModel,
    normalizedResolution,
    normalizedModelMode,
    hasModelReference,
    hasStyleReference,
  } = args;

  if (fidelityMode !== "strict") {
    return {
      enabled: false,
      category,
      allowModelReference: normalizedModelMode === "with_model" && hasModelReference,
      allowHumanPresence: true,
      allowStyleReference: hasStyleReference,
      preferProductOnly: false,
      galleryLimit: hasModelReference ? 1 : 2,
      effectiveModel: normalizedModel,
      effectiveResolution: normalizedResolution,
      structureReferencePriority: fidelityContext?.structureReferencePriority || ["front", "back"],
      preferredAngles: fidelityContext?.preferredAngles || ["front", "3-4"],
      forbiddenAngles: fidelityContext?.forbiddenAngles || [],
      preservePattern: Boolean(fidelityContext?.preservePattern),
      strictReason: fidelityContext?.strictReason,
    };
  }

  const preservePattern =
    Boolean(fidelityContext?.preservePattern) ||
    category === "phone-case" ||
    category === "printed-product";
  const preferProductOnly =
    category === "phone-case" ||
    Boolean(fidelityContext?.preferProductOnly) ||
    category === "printed-product" ||
    category === "packaging";
  const allowModelReference =
    normalizedModelMode === "with_model" &&
    hasModelReference &&
    !fidelityContext?.suppressModelReference &&
    category !== "phone-case";
  const allowHumanPresence = category !== "phone-case";
  const allowStyleReference = hasStyleReference;
  const galleryLimit =
    category === "phone-case"
      ? 6
      : category === "printed-product" || category === "packaging"
      ? 5
      : allowStyleReference || allowModelReference
      ? 4
      : 5;

  return {
    enabled: true,
    category,
    allowModelReference,
    allowHumanPresence,
    allowStyleReference,
    preferProductOnly,
    galleryLimit,
    effectiveModel: "gemini-3.1-flash-image-preview",
    effectiveResolution: "1k",
    structureReferencePriority:
      fidelityContext?.structureReferencePriority ||
      (category === "phone-case"
        ? ["front", "back", "side", "camera-cutout-closeup"]
        : category === "printed-product"
        ? ["front", "back", "pattern-closeup"]
        : category === "packaging"
        ? ["front", "back", "side", "label-closeup"]
        : ["front", "side", "detail-closeup"]),
    preferredAngles:
      fidelityContext?.preferredAngles ||
      (category === "phone-case"
        ? ["front", "mild-3-4", "flat-lay", "camera-closeup", "simple-desktop"]
        : category === "printed-product"
        ? ["front", "mild-3-4", "flat-lay", "pattern-closeup"]
        : category === "packaging"
        ? ["front", "mild-3-4", "desktop", "label-closeup"]
        : ["front", "mild-3-4", "clean-desktop"]),
    forbiddenAngles:
      fidelityContext?.forbiddenAngles ||
      (category === "phone-case"
        ? ["dramatic-tilt", "heavy-handheld", "model-shot", "prop-occlusion"]
        : category === "printed-product"
        ? ["extreme-perspective", "heavy-occlusion"]
        : category === "packaging"
        ? ["fisheye", "heavy-handheld", "prop-occlusion"]
        : ["extreme-perspective", "heavy-occlusion"]),
    preservePattern,
    strictReason: fidelityContext?.strictReason,
  };
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
      fidelityMode,
      fidelityContext,
      imageType,
      textLanguage,
      model,
      resolution,
      debugContext,
    } = body;
    const normalizedDebugContext = normalizeDebugContext(debugContext);
    const normalizedFidelityContext = normalizeFidelityContext(fidelityContext);

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
    const styleSource = coerceImageInput(referenceStyleUrl);
    const normalizedFidelityMode = normalizeFidelityMode(fidelityMode);
    const normalizedImageType = normalizeImageType(imageType);
    const normalizedTextLanguage = normalizeTextLanguage(textLanguage);
    const normalizedModel = normalizeModel(model);
    const normalizedResolution = normalizeResolution(resolution);
    const normalizedAspectRatio = normalizeAspectRatio(aspectRatio);
    const normalizedModelMode = normalizeModelMode(modelMode);
    const inferredCategory = inferFidelityCategory(
      String(prompt || ""),
      typeof styleReferenceText === "string" ? styleReferenceText : undefined,
      normalizedFidelityContext,
    );
    const strictStrategy = buildStrictStrategy({
      fidelityMode: normalizedFidelityMode,
      category: inferredCategory,
      fidelityContext: normalizedFidelityContext,
      normalizedModel,
      normalizedResolution,
      normalizedModelMode,
      hasModelReference: Boolean(modelReferenceImage),
      hasStyleReference: Boolean(styleSource),
    });
    const gallerySources = coerceImageList(referenceGallery).slice(0, strictStrategy.galleryLimit);
    const galleryImages = (
      await Promise.all(gallerySources.map((item) => resolveImageToBase64(item)))
    ).filter(Boolean) as Array<{ mimeType: string; base64: string }>;
    const styleImage = strictStrategy.allowStyleReference && styleSource
      ? await resolveImageToBase64(styleSource)
      : null;
    const effectiveModel = strictStrategy.effectiveModel;
    const effectiveResolution: SupportedResolution = strictStrategy.effectiveResolution;
    const effectiveModelMode =
      strictStrategy.allowModelReference && modelReferenceImage ? normalizedModelMode : "none";
    const effectiveModelReferenceImage =
      strictStrategy.allowModelReference && modelReferenceImage ? modelReferenceImage : null;
    const modelSelection = resolveImageModelSelection(effectiveModel);

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

    const strictFidelityInstruction =
      normalizedFidelityMode === "strict"
        ? [
            "=== STRICT FIDELITY MODE ===",
            "Product fidelity has higher priority than creativity, new styling, dramatic composition, or lifestyle storytelling.",
            strictStrategy.category === "phone-case"
              ? "PHONE CASE LOCK: preserve exact outer contour, width-height ratio, corner radius, camera hole count, camera hole position, lens-ring spacing, button cutouts, speaker/charging cutouts, edge thickness, raised lip, and transparent/opaque material behavior."
              : "Keep the original product silhouette, width-height ratio, structure, and visual construction details unchanged.",
            strictStrategy.category === "printed-product" || strictStrategy.preservePattern
              ? "PRINT LOCK: preserve the exact artwork layout, artwork scale, artwork position, typography placement, color blocks, line art, logos, and decorative motifs."
              : "",
            strictStrategy.category === "packaging"
              ? "PACKAGING LOCK: preserve the box/bottle/bag silhouette, label placement, cap shape, edges, folds, seams, and printed panel structure."
              : "",
            "Do not redesign the product pattern. Do not invent a similar new SKU. Do not simplify or stylize away key details.",
            "Avoid strong perspective distortion, extreme close-up cropping, warped surfaces, fisheye angles, and dramatic rotations that change the perceived product geometry.",
            "Do not let hands, props, people, shadows, or foreground objects cover camera holes, printed artwork, labels, ports, buttons, or key structure.",
            `Prefer ${strictStrategy.preferredAngles.join(", ")} views with the full product clearly readable.`,
            `Avoid ${strictStrategy.forbiddenAngles.join(", ")} compositions in strict mode.`,
            "Use light scenes and restrained props only when they do not reduce product structure visibility.",
          ].join(". ")
        : "";

    const strictExecutionStrategyInstruction =
      normalizedFidelityMode === "strict"
        ? [
            "STRICT EXECUTION STRATEGY:",
            `Requested model ${normalizedModel} is overridden to ${effectiveModel}.`,
            `Requested resolution ${normalizedResolution} is overridden to ${effectiveResolution}.`,
            `Use up to ${galleryImages.length} structure reference images before any style reference.`,
            strictStrategy.category === "phone-case"
              ? "Phone-case strict mode suppresses aggressive model-led composition and prioritizes product-only framing."
              : "",
            strictStrategy.strictReason ? `Strict reason: ${strictStrategy.strictReason}.` : "",
          ].filter(Boolean).join(" ")
        : "";

    const roleInstructions = [
      "ROLE ASSIGNMENT:",
      "Image 1 is the primary product reference and must be preserved exactly.",
      galleryImages.length
        ? `Images 2 to ${galleryImages.length + 1} are additional product angle references of the same item. Treat them as structure-lock evidence in this order of priority: ${strictStrategy.structureReferencePriority.join(", ")}. Use them to lock structure, ports, seams, print, texture, and color consistency.`
        : "There are no additional product-angle references. Re-photograph the same product in a better e-commerce setup.",
      effectiveModelMode === "with_model" && effectiveModelReferenceImage
        ? "One reference image is a model/person reference. A visible human model is mandatory in the final image. Use it to guide pose, hand placement, body presence, and natural wearing context. Do not let the model hide the product."
        : strictStrategy.allowHumanPresence
        ? "There is no dedicated model reference image. Only add a natural human presence or hands when the screen plan clearly benefits from wearing effect, size reference, or real usage context."
        : "Strict category lock is active. Default to product-only composition and do not add people or hands unless the prompt explicitly requires a tiny non-occluding usage cue.",
      styleImage
        ? "One reference image is style reference only for lighting, atmosphere, composition rhythm, and color mood. Do not copy the style image's product. Style reference has lower priority than the structure-lock references."
        : "",
      "If the source image is a poster, banner, lifestyle shot, or already contains scene props, extract the core product and rebuild a clean product-focused composition around it.",
      normalizedFidelityMode === "strict"
        ? "Strict fidelity is enabled. Treat all additional product-angle references as structural evidence. The final image must agree with the majority of product references on holes, edges, artwork, and proportions."
        : "",
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
      normalizedFidelityMode === "strict"
        ? [
            "MODEL PRESENCE:",
            effectiveModelMode === "with_model" && effectiveModelReferenceImage
              ? "A model reference is provided, but strict fidelity is enabled. Use a restrained pose and keep the product unobstructed; hands or body must not cover key holes, artwork, labels, or edges."
              : strictStrategy.allowHumanPresence
              ? "Strict fidelity is enabled. Prefer product-only or light-scene composition. Avoid adding models, hands, mannequins, or complex interactions unless absolutely necessary for the screen goal."
              : "Strict category lock is enabled. Do not add models, hands, mannequins, or body interaction by default. Keep the frame product-only unless a tiny unobstructed usage cue is absolutely required.",
            "If any human element is used, it must stay secondary and must not touch, bend, warp, squeeze, crop, or obscure the product's key structure.",
          ].join(". ")
        : effectiveModelMode === "with_model"
        ? [
            "MODEL PRESENCE:",
            effectiveModelReferenceImage
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
      strictFidelityInstruction,
      strictExecutionStrategyInstruction,
      roleInstructions,
      sceneExecutionInstruction,
      typeInstruction,
      buildTextInstruction(normalizedTextLanguage),
      buildResolutionInstruction(effectiveResolution),
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
      const structureRole =
        strictStrategy.structureReferencePriority[index] ||
        `reference-${index + 1}`;
      parts.push({
        text: normalizedFidelityMode === "strict"
          ? `REFERENCE IMAGE ${index + 2}: STRUCTURE LOCK REFERENCE (${structureRole}). This outranks any style reference. Use it to preserve the same product geometry, openings, edges, and artwork.`
          : `REFERENCE IMAGE ${index + 2}: ADDITIONAL PRODUCT ANGLE. Use only to lock product details and consistency.`,
      });
      parts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.base64,
        },
      });
    });

    if (effectiveModelReferenceImage) {
      parts.push({
        text: "MODEL REFERENCE IMAGE: Use this only for body presence, pose, and interaction. Do not let it replace the product.",
      });
      parts.push({
        inlineData: {
          mimeType: effectiveModelReferenceImage.mimeType,
          data: effectiveModelReferenceImage.base64,
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
      source: normalizedDebugContext.source,
      screenNumber: normalizedDebugContext.screenNumber,
      imageType: normalizedImageType,
      textLanguage: normalizedTextLanguage,
      modelRequested: normalizedModel,
      modelUsed: effectiveModel,
      modelSelectionRequested: modelSelection.requestedModel,
      resolutionRequested: normalizedResolution,
      resolutionUsed: effectiveResolution,
      requestedResolution: normalizedResolution,
      aspectRatio: normalizedAspectRatio,
      modelModeRequested: normalizedModelMode,
      modelModeUsed: effectiveModelMode,
      fidelityMode: normalizedFidelityMode,
      strictStrategyEnabled: strictStrategy.enabled,
      strictCategory: strictStrategy.category,
      strictReason: strictStrategy.strictReason,
      allowModelReference: strictStrategy.allowModelReference,
      allowHumanPresence: strictStrategy.allowHumanPresence,
      preferProductOnly: strictStrategy.preferProductOnly,
      promptLength: promptText.length,
      referenceGalleryCount: galleryImages.length,
      hasModelReference: Boolean(effectiveModelReferenceImage),
      hasStyleReference: Boolean(styleImage),
    });

    const { imageUrl, meta } = await callGeminiImageWithFallback({
      apiKey: geminiApiKey,
      functionName: normalizedDebugContext.screenNumber
        ? `generate-image:detail-screen-${normalizedDebugContext.screenNumber}`
        : "generate-image",
      selectedModel: effectiveModel,
      parts,
      resolution: effectiveResolution,
    });

    return jsonResponse(
      {
        images: [imageUrl],
        meta: {
          ...meta,
          debugContext: normalizedDebugContext,
          modelSelection: normalizedModel,
          effectiveModelSelection: effectiveModel,
          modelLabel: modelSelection.label,
          requestedResolution: normalizedResolution,
          effectiveResolution,
          aspectRatio: normalizedAspectRatio,
          fidelityMode: normalizedFidelityMode,
          strictCategory: strictStrategy.category,
          strictStrategyEnabled: strictStrategy.enabled,
          referenceGalleryCount: galleryImages.length,
          hasStyleReference: Boolean(styleImage),
          hasModelReference: Boolean(effectiveModelReferenceImage),
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
