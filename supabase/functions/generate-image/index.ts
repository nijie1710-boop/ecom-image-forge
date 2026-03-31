import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
    const decoded = atob(padded);
    return JSON.parse(decoded);
  } catch { return null; }
}

function parseDataUrl(url: string): { mimeType: string; base64: string } | null {
  if (!url.startsWith("data:")) return null;
  const match = url.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

async function resolveImageToBase64(url: string): Promise<{ mimeType: string; base64: string } | null> {
  const parsed = parseDataUrl(url);
  if (parsed) return parsed;
  try {
    const resp = await fetch(url);
    if (!resp.ok) { console.error("fetch image failed:", resp.status, "url:", url); return null; }
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) { binary += String.fromCharCode(bytes[i]); }
    const b64 = btoa(binary);
    const mimeType = resp.headers.get("Content-Type") || "image/jpeg";
    return { mimeType, base64: b64 };
  } catch (err) { console.error("fetch image error:", err, "url:", url); return null; }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") { return new Response(null, { headers: corsHeaders }); }

  try {
    // ========== JWT 验证 ==========
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "");
      const payload = parseJwtPayload(token);
      if (payload) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);
        if (!authError && user) { userId = user.id; }
      }
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { prompt, referenceImageUrl, referenceStyleUrl, aspectRatio, imageType } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    // ========== 解析图片 ==========
    const productImg = referenceImageUrl ? await resolveImageToBase64(referenceImageUrl) : null;
    const styleImg = referenceStyleUrl ? await resolveImageToBase64(referenceStyleUrl) : null;
    const hasProduct = !!productImg;
    const hasStyle = !!styleImg;
    const isSceneImage = imageType === '场景图' || imageType === '买家秀';

    // ========== 构建超级严格的 system prompt ==========
    const ABSOLUTE_RULES = [
      "=== ABSOLUTE RULE - DO NOT IGNORE ===",
      "THE OUTPUT IMAGE MUST HAVE ZERO TEXT. THIS IS NON-NEGOTIABLE.",
      "NO WATERMARK. NO LABEL. NO SLOGAN. NO BRAND NAME IN TEXT FORM.",
      "NO CHINESE CHARACTERS. NO ENGLISH WORDS. NO NUMBERS.",
      "=== PRODUCT PRESERVATION - ABSOLUTE - THIS IS YOUR PRIMARY TASK ===",
      "The first image contains the PRODUCT. You MUST reproduce this product EXACTLY in the output.",
      "PHYSICAL IDENTITY: Copy exactly - shape, 3D contour, volume, size, proportions, angle.",
      "COLOR IDENTITY: Copy exactly - every color, shade, hue, saturation, gloss level.",
      "MATERIAL IDENTITY: Copy exactly - metal = metal, plastic = plastic, leather = leather, fabric = fabric. Do NOT change material appearance.",
      "DETAIL IDENTITY: Copy exactly - logo, brand mark, buttons, zipper, stitching, seams, speaker grill, port layout, joints, hinges, screws.",
      "TEXTURE IDENTITY: Copy exactly - matte/glossy surface, brushed/polished finish, leather grain, fabric weave pattern.",
      "PERSPECTIVE: You MAY rotate the product by up to 15 degrees max. Do NOT redesign it.",
      "=== FAILURE CONDITIONS (output will be rejected if) ===",
      "IF the logo shape, size, or position changes = TOTAL FAILURE",
      "IF the material looks different (metal looks like plastic, etc.) = TOTAL FAILURE",
      "IF the product proportions/silhouette changes = TOTAL FAILURE",
      "IF any new elements appear on the product that were not in the original = TOTAL FAILURE",
      "The ONLY acceptable change is: placing the exact product into a new scene/background.",
    ].join(". ");

    let roleInstruction = "";
    if (hasProduct && hasStyle) {
      roleInstruction = [
        "ROLE ASSIGNMENT:",
        "Image 1 (first image) = THE PRODUCT TO PRESERVE. Do NOT copy this product.",
        "Image 2 (second image) = STYLE REFERENCE ONLY. Extract ONLY lighting, color tone, mood, atmosphere.",
        "YOUR TASK: Place Image 1's product INTO the scene/style of Image 2.",
        "KEEP Image 1's product COMPLETELY UNCHANGED.",
      ].join(". ");
    } else if (hasProduct) {
      roleInstruction = [
        "ROLE ASSIGNMENT:",
        "Image 1 (the only image) = THE PRODUCT TO PRESERVE EXACTLY.",
        "YOUR TASK: Re-photograph this product with better studio lighting and backdrop.",
        "KEEP THE PRODUCT 100% IDENTICAL. Only improve: lighting, shadows, backdrop.",
      ].join(". ");
    } else {
      roleInstruction = "Generate a professional e-commerce product photo with no text whatsoever.";
    }

    let typeInstruction = isSceneImage
      ? "Type: LIFESTYLE SCENE IMAGE. The product should appear naturally in a real-world scene."
      : "Type: MAIN PRODUCT SHOT. Clean white or gradient backdrop, studio lighting, product centered.";

    const userRequest = `User wants: ${prompt}`;

    const systemInstruction = [ABSOLUTE_RULES, roleInstruction, typeInstruction, userRequest].join(". ");

    // ========== 构造 Gemini parts ==========
    const parts: any[] = [{ text: systemInstruction }];
    if (productImg) { parts.push({ inlineData: { mimeType: productImg.mimeType, data: productImg.base64 } }); }
    if (styleImg) { parts.push({ inlineData: { mimeType: styleImg.mimeType, data: styleImg.base64 } }); }

    console.error("=== Gemini Request ===");
    console.error("hasProduct:", hasProduct, "hasStyle:", hasStyle, "isScene:", isSceneImage);
    console.error("parts:", parts.length, "(1=text, 2=product, 3=style)");
    console.error("prompt:", systemInstruction.substring(0, 400));

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${GEMINI_API_KEY}`;
    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["text", "image"],
          // 限制 token 让模型更专注产品保真
          maxOutputTokens: 1024,
        },
        // 加上 safety settings 避免误过滤
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ],
      }),
    });

    const rawResponse = await apiResponse.text();
    console.error("=== Gemini Response ===");
    console.error("status:", apiResponse.status, "body:", rawResponse.substring(0, 300));

    let imageUrl = "";
    let generationFailed = false;
    let failureReason = "";

    if (!apiResponse.ok) {
      generationFailed = true;
      const s = apiResponse.status;
      if (s === 429) failureReason = "请求过于频繁，请稍后重试";
      else if (s === 400) failureReason = `请求格式错误(${s})：${rawResponse.substring(0, 300)}`;
      else if (s === 403) failureReason = `权限/额度不足(${s})：${rawResponse.substring(0, 300)}`;
      else failureReason = `AI 生成失败(${s})：${rawResponse.substring(0, 300)}`;
    } else {
      let data: any;
      try { data = JSON.parse(rawResponse); }
      catch { generationFailed = true; failureReason = "AI 返回了无效 JSON：" + rawResponse.substring(0, 200); }
      if (!generationFailed) {
        const candidate = data?.candidates?.[0];
        if (candidate?.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.inlineData) { imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`; break; }
          }
        }
        if (!imageUrl) { generationFailed = true; failureReason = "AI 未返回图片：" + rawResponse.substring(0, 300); }
      }
    }

    if (generationFailed) {
      return new Response(JSON.stringify({ error: failureReason }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ images: [imageUrl] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("generate-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
