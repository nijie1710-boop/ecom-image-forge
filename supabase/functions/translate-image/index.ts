import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

function extractImageResult(parsed: any): string {
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];

    for (const part of parts) {
      if (part?.inlineData?.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }

      if (typeof part?.text === "string" && part.text.trim()) {
        try {
          const maybeJson = JSON.parse(part.text);
          if (typeof maybeJson?.image_url === "string" && maybeJson.image_url) {
            return maybeJson.image_url;
          }
        } catch {
          if (part.text.startsWith("data:") || part.text.startsWith("http")) {
            return part.text;
          }
        }
      }
    }
  }

  return "";
}

async function callModel(
  apiKey: string,
  model: string,
  parts: unknown[],
  options?: { expectImage?: boolean },
) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: options?.expectImage
          ? {
              responseModalities: ["text", "image"],
              maxOutputTokens: 512,
            }
          : undefined,
        safetySettings: options?.expectImage
          ? [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
            ]
          : undefined,
      }),
    },
  );

  const rawText = await response.text();
  let parsed: any = {};
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = {};
  }

  return { response, parsed, rawText };
}

async function callReplaceModel(apiKey: string, mimeType: string, imageBase64: string, instruction: string) {
  const models = [
    "gemini-2.5-flash-image",
    "gemini-3-pro-image-preview",
    "gemini-3.1-flash-image-preview",
  ];

  let lastFailure = "";

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await callModel(
        apiKey,
        model,
        [
          { text: instruction },
          { inlineData: { mimeType, data: imageBase64 } },
        ],
        { expectImage: true },
      );

      if (result.response.ok) {
        const imageResult = extractImageResult(result.parsed);
        if (imageResult) {
          return { ...result, model, imageResult };
        }

        const responsePreview =
          JSON.stringify(result.parsed).slice(0, 300) || result.rawText.slice(0, 300);
        lastFailure = `${model}:200:EMPTY_IMAGE_RESULT:${responsePreview}`;
        if (attempt < 1) {
          await sleep(900);
          continue;
        }
        break;
      }

      lastFailure = `${model}:${result.response.status}:${result.rawText.slice(0, 300)}`;
      if (attempt < 1 && [408, 429, 500, 502, 503, 504].includes(result.response.status)) {
        await sleep(900);
        continue;
      }
      break;
    }
  }

  return {
    response: new Response(null, { status: 500 }),
    parsed: {},
    rawText: lastFailure,
    model: models[models.length - 1],
    imageResult: "",
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const body = await req.json().catch(() => null);
    if (!body) return jsonResponse({ error: "INVALID_JSON" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!supabaseUrl || !supabaseServiceKey) return jsonResponse({ error: "SUPABASE_ENV_MISSING" }, 500);
    if (!geminiApiKey) return jsonResponse({ error: "GEMINI_API_KEY_MISSING" }, 500);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) return jsonResponse({ error: "UNAUTHORIZED" }, 401);

    const { imageUrl, step, translations = [], targetLanguage = "en" } = body as {
      imageUrl?: string;
      step?: string;
      translations?: TranslationItem[];
      targetLanguage?: string;
    };

    if (!imageUrl) return jsonResponse({ error: "IMAGE_REQUIRED" }, 400);

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
        "align must be one of left, center, right.",
        "textColor and backgroundColor should be helpful estimates when visible.",
        "Keep translated text concise for image layout.",
        "If there is no useful text, return [] only.",
      ].join("\n");

      const { response, parsed } = await callModel(geminiApiKey, "gemini-2.5-flash", [
        { text: instruction },
        { inlineData: { mimeType, data: imageBase64 } },
      ]);

      if (!response.ok) {
        return jsonResponse({ error: "OCR_UPSTREAM_FAILED", status: response.status }, 500);
      }

      const content = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return jsonResponse({ translations: parseJsonArray(content) });
    }

    if (step === "replace") {
      if (!Array.isArray(translations) || !translations.length) {
        return jsonResponse({ error: "TRANSLATIONS_REQUIRED" }, 400);
      }

      const replacementInstructions = translations
        .map(
          (item, index) =>
            `${index + 1}. Replace "${item.original}" with "${item.translated}" at ${item.position}`,
        )
        .join("\n");

      const instruction = [
        "Edit this image by replacing text only.",
        `Target language: ${targetLanguageLabel}.`,
        replacementInstructions,
        "Keep the original layout, background, product, spacing, font weight, and styling as close as possible.",
        "Do not redesign the poster. Do not change the product. Only replace text.",
      ].join("\n");

      const { response, parsed, rawText, model, imageResult } = await callReplaceModel(
        geminiApiKey,
        mimeType,
        imageBase64,
        instruction,
      );

      if (!response.ok) {
        return jsonResponse(
          {
            error: "REPLACE_UPSTREAM_FAILED",
            status: response.status,
            model,
            detail: rawText.slice(0, 500),
          },
          500,
        );
      }

      if (!imageResult) {
        return jsonResponse(
          {
            error: "EMPTY_IMAGE_RESULT",
            detail: JSON.stringify(parsed).slice(0, 500),
          },
          500,
        );
      }

      let finalImageUrl = imageResult;
      if (imageResult.startsWith("data:")) {
        try {
          const base64Part = imageResult.split(",")[1];
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
          console.error("upload translated image failed", error);
        }
      }

      return jsonResponse({ imageUrl: finalImageUrl });
    }

    return jsonResponse({ error: "UNKNOWN_STEP" }, 400);
  } catch (error) {
    console.error("translate-image error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "UNKNOWN_ERROR" },
      500,
    );
  }
});
