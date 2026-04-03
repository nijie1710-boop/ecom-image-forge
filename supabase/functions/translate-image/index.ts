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
};

const TARGET_LANGUAGE_LABELS: Record<string, string> = {
  en: "English",
  zh: "简体中文",
  zh_tw: "繁體中文",
  ja: "日本語",
  ko: "한국어",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  ru: "Русский",
  ar: "العربية",
  th: "ไทย",
  vi: "Tiếng Việt",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripDataPrefix(imageUrl: string) {
  if (!imageUrl.startsWith("data:")) return imageUrl;
  return imageUrl.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "");
}

function parseTranslationsFromContent(content: string): TranslationItem[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item?.original && item?.translated)
      .map((item) => ({
        original: String(item.original).trim(),
        translated: String(item.translated).trim(),
        position: String(item.position || "unknown").trim(),
      }));
  } catch {
    return [];
  }
}

async function callGemini({
  apiKey,
  imageBase64,
  instruction,
}: {
  apiKey: string;
  imageBase64: string;
  instruction: string;
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: instruction },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: imageBase64,
                },
              },
            ],
          },
        ],
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

  return { response, rawText, parsed };
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
    if (!body) {
      return jsonResponse({ error: "INVALID_JSON" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: "SUPABASE_ENV_MISSING" }, 500);
    }

    if (!geminiApiKey) {
      return jsonResponse({ error: "GEMINI_API_KEY_MISSING" }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    const {
      imageUrl,
      step,
      translations = [],
      targetLanguage = "en",
    } = body as {
      imageUrl?: string;
      step?: string;
      translations?: TranslationItem[];
      targetLanguage?: string;
    };

    if (!imageUrl) {
      return jsonResponse({ error: "IMAGE_REQUIRED" }, 400);
    }

    const imageBase64 = stripDataPrefix(imageUrl);
    const targetLanguageLabel =
      TARGET_LANGUAGE_LABELS[targetLanguage] || TARGET_LANGUAGE_LABELS.en;

    if (step === "ocr") {
      const instruction = [
        "You are an expert OCR and translation planner for marketing images.",
        "Read all visible text blocks that should be translated in this image.",
        `Translate them into ${targetLanguageLabel}.`,
        "Return only a JSON array in this format:",
        '[{"original":"source text","translated":"target text","position":"short position description"}]',
        "Keep the translated text concise and suitable for image layout.",
        "If there is no useful text, return [] only.",
      ].join("\n");

      const { response, parsed } = await callGemini({
        apiKey: geminiApiKey,
        imageBase64,
        instruction,
      });

      if (!response.ok) {
        return jsonResponse(
          {
            error: "OCR_UPSTREAM_FAILED",
            status: response.status,
          },
          500,
        );
      }

      const content = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const nextTranslations = parseTranslationsFromContent(content);
      return jsonResponse({ translations: nextTranslations });
    }

    if (step === "replace") {
      if (!Array.isArray(translations) || !translations.length) {
        return jsonResponse({ error: "TRANSLATIONS_REQUIRED" }, 400);
      }

      const cost = 1;
      const { data: balanceData } = await supabase.rpc("get_user_balance", {
        p_user_id: user.id,
      });
      const currentBalance = balanceData?.[0]?.balance ?? 0;

      if (currentBalance < cost) {
        return jsonResponse(
          {
            error: "INSUFFICIENT_BALANCE",
            message: `余额不足，图文翻译需要 ${cost} 积分，当前仅剩 ${currentBalance} 积分。`,
          },
          402,
        );
      }

      const { data: deductResult, error: deductError } = await supabase.rpc(
        "deduct_balance",
        {
          p_user_id: user.id,
          p_amount: cost,
          p_operation_type: "translate_image",
          p_description: `图文翻译 -> ${targetLanguageLabel}`,
        },
      );

      if (deductError || !deductResult?.[0]?.success) {
        return jsonResponse({ error: "BALANCE_DEDUCT_FAILED" }, 500);
      }

      const replacementInstructions = translations
        .map(
          (item, index) =>
            `${index + 1}. Replace "${item.original}" with "${item.translated}" at ${item.position}`,
        )
        .join("\n");

      const instruction = [
        "Edit this marketing image by replacing text only.",
        `Target language: ${targetLanguageLabel}.`,
        replacementInstructions,
        "Keep the exact original layout, color palette, font weight, spacing, stroke, shadows, and placement as much as possible.",
        "Only replace text. Do not redraw the product or the background.",
      ].join("\n");

      const { response, parsed } = await callGemini({
        apiKey: geminiApiKey,
        imageBase64,
        instruction,
      });

      if (!response.ok) {
        await supabase.rpc("add_balance", {
          p_user_id: user.id,
          p_amount: cost,
          p_payment_method: "refund",
          p_notes: "图文翻译失败退款",
        });
        return jsonResponse(
          {
            error: "REPLACE_UPSTREAM_FAILED",
            status: response.status,
          },
          500,
        );
      }

      const part = parsed?.candidates?.[0]?.content?.parts?.[0];
      let imageResult = "";

      if (part?.inlineData?.data) {
        imageResult = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      } else if (part?.text) {
        try {
          imageResult = JSON.parse(part.text).image_url || "";
        } catch {
          imageResult = part.text;
        }
      }

      if (!imageResult) {
        await supabase.rpc("add_balance", {
          p_user_id: user.id,
          p_amount: cost,
          p_payment_method: "refund",
          p_notes: "图文翻译失败退款",
        });
        return jsonResponse({ error: "EMPTY_IMAGE_RESULT" }, 500);
      }

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
            imageResult = `${supabaseUrl}/storage/v1/object/public/generated-images/${fileName}`;
          }
        } catch (error) {
          console.error("upload translated image failed", error);
        }
      }

      return jsonResponse({ imageUrl: imageResult });
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
