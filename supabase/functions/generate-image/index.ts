import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
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

async function resolveImageToBase64(
  source: string,
): Promise<{ mimeType: string; base64: string } | null> {
  const parsed = parseDataUrl(source);
  if (parsed) return parsed;

  try {
    const resp = await fetch(source);
    if (!resp.ok) {
      console.error("fetch image failed:", resp.status, "url:", source);
      return null;
    }

    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return {
      mimeType: resp.headers.get("Content-Type") || "image/jpeg",
      base64: btoa(binary),
    };
  } catch (err) {
    console.error("fetch image error:", err, "url:", source);
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
    } = await req.json();

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const productSource = imageBase64 || referenceImageUrl;
    const productImg = productSource ? await resolveImageToBase64(productSource) : null;
    const styleImg = referenceStyleUrl
      ? await resolveImageToBase64(referenceStyleUrl)
      : null;

    const normalizedImageType = normalizeImageType(imageType);
    const normalizedTextLanguage = normalizeTextLanguage(textLanguage);

    const absoluteRules = [
      "=== ABSOLUTE RULES ===",
      "This is a product-preserving image generation task, not a redesign.",
      "The first image contains the exact product that must remain the same product in the output.",
      "Never replace the product with another category. A garment must stay a garment. A speaker must stay a speaker. A bag must stay a bag.",
      "Copy the exact silhouette, structure, proportions, color palette, material appearance, and surface texture.",
      "Preserve logos, printed artwork, letters, graphics, seams, collar shape, sleeves, hems, ports, buttons, zippers, stitching, and distinctive details exactly as they appear on the original product.",
      "The only acceptable changes are lighting, shadows, background, composition, camera distance, and supporting scene elements.",
      "If the product category changes, the result is a total failure.",
      "If the printed artwork or logo changes, the result is a total failure.",
      "If the product proportions or material appearance changes, the result is a total failure.",
    ].join(". ");

    const roleInstruction = styleImg
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
      ].join(". ");

    const typeInstruction = normalizedImageType === "detail"
      ? "SHOT TYPE: detail image. Use a realistic merchandising or lifestyle setup that highlights product usage, fabric, craftsmanship, and selling points while keeping the same product fully recognizable."
      : "SHOT TYPE: main image. Use clean studio composition, centered product, professional e-commerce listing style, white or soft neutral background.";

    const textInstruction = buildTextInstruction(normalizedTextLanguage);
    const userRequest = `USER REQUEST: ${prompt || ""}`;

    const systemInstruction = [
      absoluteRules,
      roleInstruction,
      typeInstruction,
      textInstruction,
      userRequest,
    ].join(". ");

    const parts: Array<Record<string, unknown>> = [{ text: systemInstruction }];
    if (productImg) {
      parts.push({
        inlineData: {
          mimeType: productImg.mimeType,
          data: productImg.base64,
        },
      });
    }
    if (styleImg) {
      parts.push({
        inlineData: {
          mimeType: styleImg.mimeType,
          data: styleImg.base64,
        },
      });
    }

    console.error("=== Gemini Request ===");
    console.error("hasProduct:", !!productImg, "hasStyle:", !!styleImg);
    console.error("imageType:", normalizedImageType, "textLanguage:", normalizedTextLanguage);
    console.error("parts:", parts.length);
    console.error("prompt:", systemInstruction.substring(0, 500));

    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${geminiApiKey}`;

    const apiResponse = await fetch(apiUrl, {
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
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE",
          },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    });

    const rawResponse = await apiResponse.text();
    console.error("=== Gemini Response ===");
    console.error("status:", apiResponse.status, "body:", rawResponse.substring(0, 300));

    if (!apiResponse.ok) {
      const s = apiResponse.status;
      let failureReason = `AI generation failed (${s})`;
      if (s === 429) failureReason = "请求过于频繁，请稍后重试";
      if (s === 400) failureReason = `请求格式错误 (${s})`;
      if (s === 403) failureReason = `权限或额度不足 (${s})`;
      return new Response(JSON.stringify({ error: failureReason }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawResponse);
    } catch {
      return new Response(JSON.stringify({ error: "AI 返回了无效响应" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidates = (data as { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { mimeType: string; data: string } }> } }> }).candidates;
    const partsOut = candidates?.[0]?.content?.parts || [];
    const imagePart = partsOut.find((part) => part.inlineData?.data);

    if (!imagePart?.inlineData?.data) {
      return new Response(JSON.stringify({ error: "AI 未返回图片结果" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
    return new Response(JSON.stringify({ images: [imageUrl] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-image error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
