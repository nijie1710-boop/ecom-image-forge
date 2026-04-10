import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  callGeminiImageWithFallback,
  callGeminiTextWithFallback,
  errorResponse,
  jsonResponse,
  requireEnv,
  type ImageModelInput,
} from "../_shared/gemini.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type TranslationItem = {
  original: string;
  translated: string;
  position: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  align?: "left" | "center" | "right";
  textColor?: string;
  backgroundColor?: string;
};

const TARGET_LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  zh: "Simplified Chinese",
  zh_tw: "Traditional Chinese",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  ar: "Arabic",
  th: "Thai",
  vi: "Vietnamese",
};

function stripDataPrefix(imageUrl: string) {
  return imageUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
}

function detectMimeType(imageUrl: string) {
  const match = imageUrl.match(/^data:([^;]+);base64,/i);
  return match?.[1] || "image/jpeg";
}

function safeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function parseJsonArray(text: string): TranslationItem[] {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.original && item?.translated)
      .map((item) => ({
        original: String(item.original).trim(),
        translated: String(item.translated).trim(),
        position: String(item.position || "unknown").trim(),
        x: safeNumber(item.x),
        y: safeNumber(item.y),
        width: safeNumber(item.width),
        height: safeNumber(item.height),
        align:
          item.align === "left" || item.align === "center" || item.align === "right"
            ? item.align
            : undefined,
        textColor: item.textColor ? String(item.textColor).trim() : undefined,
        backgroundColor: item.backgroundColor ? String(item.backgroundColor).trim() : undefined,
      }));
  } catch {
    return [];
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "UNAUTHORIZED", message: "User must be logged in" }, 401, corsHeaders);
    }

    const supabaseUrl = requireEnv("SUPABASE_URL", Deno.env.get("SUPABASE_URL"));
    const supabaseServiceKey = requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const geminiApiKey = requireEnv("GEMINI_API_KEY", Deno.env.get("GEMINI_API_KEY"));

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "UNAUTHORIZED", message: "Supabase auth validation failed" }, 401, corsHeaders);
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return jsonResponse({ error: "INVALID_JSON", message: "Request body must be valid JSON" }, 400, corsHeaders);
    }

    const { imageUrl, step, translations = [], targetLanguage = "en", preferredModel } = body as {
      imageUrl?: string;
      step?: string;
      translations?: TranslationItem[];
      targetLanguage?: string;
      preferredModel?: string;
    };

    if (!imageUrl) {
      return jsonResponse({ error: "IMAGE_REQUIRED", message: "Image is required" }, 400, corsHeaders);
    }

    const imageBase64 = stripDataPrefix(imageUrl);
    const mimeType = detectMimeType(imageUrl);
    const targetLanguageLabel = TARGET_LANGUAGE_LABELS[targetLanguage] || TARGET_LANGUAGE_LABELS.en;

    if (step === "ocr") {
      const instruction = [
        "You are an OCR and translation planner for marketing images.",
        "Detect all visible text blocks that should be translated.",
        `Translate them into ${targetLanguageLabel}.`,
        "Return only a JSON array.",
        '[{"original":"source text","translated":"target text","position":"short position description","x":12.5,"y":8.3,"width":40.0,"height":10.0,"align":"center","textColor":"#ffffff","backgroundColor":"#000000"}]',
        "x, y, width, height must be estimated percentages based on the full image canvas, using a 0-100 scale.",
        "If there is no useful text, return [] only.",
      ].join("\n");

      const { text, meta } = await callGeminiTextWithFallback({
        apiKey: geminiApiKey,
        functionName: "translate-image-ocr",
        parts: [
          { text: instruction },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      });

      return jsonResponse({ translations: parseJsonArray(text), meta }, 200, corsHeaders);
    }

    if (step === "replace") {
      if (!Array.isArray(translations) || !translations.length) {
        return jsonResponse(
          { error: "TRANSLATIONS_REQUIRED", message: "At least one translation item is required" },
          400,
          corsHeaders,
        );
      }

      const replacementInstructions = translations
        .map(
          (item, index) =>
            `${index + 1}. Replace "${item.original}" with "${item.translated}" at ${item.position}`,
        )
        .join("\n");

      const instruction = [
        "You are a high-fidelity marketing poster editor.",
        "Edit this image by replacing text only.",
        `Target language: ${targetLanguageLabel}.`,
        replacementInstructions,
        "Keep the original poster composition, product, shadows, lighting, spacing, icon placement, and typography hierarchy as close as possible.",
        "Preserve the original background texture and color transitions.",
        "Do not redesign the poster. Do not move the product. Do not add new layout blocks.",
        "Do not add phone UI chrome, screenshot frame, browser frame, or unrelated decorative interface elements.",
        "The final result must look like the original image was directly rewritten in the target language, not pasted over.",
      ].join("\n");

      const { imageUrl: translatedImageUrl, meta } = await callGeminiImageWithFallback({
        apiKey: geminiApiKey,
        functionName: "translate-image-replace",
        selectedModel: String(preferredModel || "gemini-3.1-flash-image-preview") as ImageModelInput,
        parts: [
          { text: instruction },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
      });

      let finalImageUrl = translatedImageUrl;
      if (translatedImageUrl.startsWith("data:")) {
        try {
          const base64Part = translatedImageUrl.split(",")[1];
          const binaryStr = atob(base64Part);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i += 1) {
            bytes[i] = binaryStr.charCodeAt(i);
          }
          const fileName = `translated/${Date.now()}-${crypto.randomUUID()}.png`;
          const uploadResp = await fetch(
            `${supabaseUrl}/storage/v1/object/generated-images/${fileName}`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${supabaseServiceKey}`,
                "Content-Type": "image/png",
              },
              body: bytes,
            },
          );

          if (uploadResp.ok) {
            finalImageUrl = `${supabaseUrl}/storage/v1/object/public/generated-images/${fileName}`;
          }
        } catch (error) {
          console.error("translate-image upload translated image failed", error);
        }
      }

      return jsonResponse(
        {
          imageUrl: finalImageUrl,
          meta,
        },
        200,
        corsHeaders,
      );
    }

    return jsonResponse({ error: "UNKNOWN_STEP", message: "Unknown translate-image step" }, 400, corsHeaders);
  } catch (error) {
    console.error("translate-image error:", error);
    return errorResponse(error, corsHeaders);
  }
});
