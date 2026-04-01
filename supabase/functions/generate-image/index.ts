import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SupportedModel =
  | "gemini-3.1-flash-image-preview"
  | "nano-banana-pro-preview"
  | "gemini-2.5-flash-image";

type SupportedResolution = "0.5k" | "1k" | "2k" | "4k";

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

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

async function resolveImageToBase64(
  source: string,
): Promise<{ mimeType: string; base64: string } | null> {
  const parsed = parseDataUrl(source);
  if (parsed) return parsed;

  try {
    const response = await fetch(source);
    if (!response.ok) {
      console.error("fetch image failed:", response.status, source);
      return null;
    }

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return {
      mimeType: response.headers.get("Content-Type") || "image/jpeg",
      base64: btoa(binary),
    };
  } catch (error) {
    console.error("fetch image error:", error);
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

function normalizeModel(value: string | undefined): SupportedModel {
  const normalized = (value || "").toLowerCase();
  if (normalized.includes("3.1") || normalized.includes("banana 2")) {
    return "gemini-3.1-flash-image-preview";
  }
  if (normalized.includes("2.5") || normalized.includes("nano banana")) {
    return "gemini-2.5-flash-image";
  }
  return "nano-banana-pro-preview";
}

function normalizeResolution(value: string | undefined): SupportedResolution {
  const normalized = (value || "").toLowerCase();
  if (normalized === "0.5k" || normalized === "1k" || normalized === "2k" || normalized === "4k") {
    return normalized;
  }
  return "2k";
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
  return [
    `TEXT POLICY: Any newly introduced scene text must be only in ${targetLanguage}.`,
    "Do not mix multiple languages in newly added scene text.",
    "Preserve any existing logo, printed words, numbers, or graphics that are already part of the physical product exactly as-is.",
    "Do not translate or redesign text that is physically printed on the product.",
  ].join(". ");
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

function buildModelFallbacks(model: SupportedModel): string[] {
  if (model === "gemini-3.1-flash-image-preview") {
    return ["gemini-3.1-flash-image-preview", "nano-banana-pro-preview", "gemini-2.5-flash-image"];
  }
  if (model === "gemini-2.5-flash-image") {
    return ["gemini-2.5-flash-image", "nano-banana-pro-preview", "gemini-3.1-flash-image-preview"];
  }
  return ["gemini-3-pro-image-preview", "nano-banana-pro-preview", "gemini-2.5-flash-image"];
}

async function callImageModel(
  apiKey: string,
  model: SupportedModel,
  parts: Array<Record<string, unknown>>,
): Promise<{ imageUrl: string; modelUsed: string }> {
  const fallbacks = buildModelFallbacks(model);
  let lastError = "Unknown model error";

  for (const modelName of fallbacks) {
    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["text", "image"],
          maxOutputTokens: 1024,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    });

    const rawResponse = await response.text();
    console.error("generate-image model response:", modelName, response.status, rawResponse.substring(0, 280));

    if (!response.ok) {
      let detail = rawResponse.substring(0, 240);
      try {
        const parsed = JSON.parse(rawResponse);
        detail = parsed?.error?.message || detail;
      } catch {
        // ignore
      }
      lastError = `${modelName}: ${detail}`;
      continue;
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawResponse);
    } catch {
      lastError = `${modelName}: invalid JSON response`;
      continue;
    }

    const candidates = (data as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ inlineData?: { mimeType: string; data: string } }>;
        };
      }>;
    }).candidates;
    const partsOut = candidates?.[0]?.content?.parts || [];
    const imagePart = partsOut.find((part) => part.inlineData?.data);

    if (imagePart?.inlineData?.data) {
      return {
        imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
        modelUsed: modelName,
      };
    }

    lastError = `${modelName}: no image returned`;
  }

  throw new Error(lastError);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const payload = parseJwtPayload(token);
      if (payload) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser(token);

        if (!authError && user) {
          userId = user.id;
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const {
      prompt,
      imageBase64,
      referenceImageUrl,
      referenceStyleUrl,
      imageType,
      textLanguage,
      model,
      resolution,
    } = await req.json();

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const productSource = coerceImageInput(imageBase64) || coerceImageInput(referenceImageUrl);
    const productImage = productSource ? await resolveImageToBase64(productSource) : null;
    const styleSource = coerceImageInput(referenceStyleUrl);
    const styleImage = styleSource ? await resolveImageToBase64(styleSource) : null;

    const normalizedImageType = normalizeImageType(imageType);
    const normalizedTextLanguage = normalizeTextLanguage(textLanguage);
    const normalizedModel = normalizeModel(model);
    const normalizedResolution = normalizeResolution(resolution);

    const absoluteRules = [
      "=== ABSOLUTE RULES ===",
      "This is a product-preserving image generation task, not a redesign.",
      "The first image contains the exact product that must remain the same product in the output.",
      "The reference image may already include props, background, scenery, text overlays, or decorative layout. Ignore those distractions and preserve only the main sellable product.",
      "Never replace the product with another category. A garment must stay a garment. A speaker must stay a speaker. A bag must stay a bag. A phone case must stay a phone case.",
      "Copy the exact silhouette, structure, proportions, color palette, material appearance, and surface texture.",
      "Preserve logos, printed artwork, letters, graphics, seams, collar shape, sleeves, hems, ports, buttons, zippers, stitching, and distinctive details exactly as they appear on the original product.",
      "The only acceptable changes are lighting, shadows, background, composition, camera distance, and supporting scene elements.",
      "If the product category changes, the result is a total failure.",
      "If the printed artwork or logo changes, the result is a total failure.",
      "If the product proportions or material appearance changes, the result is a total failure.",
    ].join(". ");

    const roleInstruction = styleImage
      ? [
        "ROLE ASSIGNMENT:",
        "Image 1 is the product to preserve exactly.",
        "Image 2 is style reference only for lighting, atmosphere, and color mood.",
        "Apply only the scene mood from Image 2 while keeping Image 1's product unchanged.",
      ].join(". ")
      : [
        "ROLE ASSIGNMENT:",
        "Image 1 is the only product reference and must be preserved exactly.",
        "Re-photograph the same product in a better e-commerce setup.",
        "If the source image is a poster, banner, lifestyle shot, or already contains scene props, extract the core product and rebuild a clean product-focused composition around it.",
      ].join(". ");

    const promptSections = extractPromptSections(String(prompt || ""));
    const hasExplicitScene = Boolean(
      promptSections.sceneKeywords ||
        promptSections.composition ||
        /咖啡馆|办公室|办公桌|客厅|卧室|阳台|海边|沙滩|花园|户外|书店|餐厅|工作室|桌面|自然光|场景|背景|室内|室外/i.test(
          String(prompt || ""),
        ),
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

    const textInstruction = buildTextInstruction(normalizedTextLanguage);
    const resolutionInstruction = buildResolutionInstruction(normalizedResolution);
    const modelInstruction = `MODEL TARGET: Prefer visual behavior suitable for ${normalizedModel}.`;
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
    const sceneLockInstruction = hasExplicitScene
      ? [
        "SCENE LOCK:",
        "A concrete scene is explicitly requested.",
        "White background, empty studio background, or plain cutout output is forbidden unless the prompt explicitly says white background.",
        "The final image must visibly include the requested environment and scene mood.",
      ].join(". ")
      : "";
    const userRequest = `USER REQUEST RAW: ${prompt || ""}`;

    const systemInstruction = [
      absoluteRules,
      roleInstruction,
      sceneExecutionInstruction,
      typeInstruction,
      textInstruction,
      resolutionInstruction,
      modelInstruction,
      structuredPromptInstruction,
      sceneLockInstruction,
      userRequest,
    ].join(". ");

    const parts: Array<Record<string, unknown>> = [{ text: systemInstruction }];
    if (productImage) {
      parts.push({
        inlineData: {
          mimeType: productImage.mimeType,
          data: productImage.base64,
        },
      });
    }
    if (styleImage) {
      parts.push({
        inlineData: {
          mimeType: styleImage.mimeType,
          data: styleImage.base64,
        },
      });
    }

    console.error("generate-image request:", {
      hasProduct: !!productImage,
      hasStyle: !!styleImage,
      imageType: normalizedImageType,
      textLanguage: normalizedTextLanguage,
      model: normalizedModel,
      resolution: normalizedResolution,
      parts: parts.length,
    });

    const { imageUrl, modelUsed } = await callImageModel(geminiApiKey, normalizedModel, parts);

    return new Response(JSON.stringify({
      images: [imageUrl],
      meta: {
        modelRequested: normalizedModel,
        modelUsed,
        resolution: normalizedResolution,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-image error:", error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
