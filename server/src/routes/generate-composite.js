/**
 * generate-composite.js
 *
 * Cutout composite flow (powered by Gemini native compositing):
 * 1. Remove background from product image (preserves exact product pixels as reference)
 * 2. Send transparent cutout + scene prompt to Gemini in one call.
 *    Gemini integrates the product into a new scene with natural lighting,
 *    shadows, reflections, and perspective — rather than a flat programmatic paste.
 * 3. Return the generated composite.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { callGeminiImageWithFallback, FunctionError } from "../utils/gemini.js";
import { removeProductBackground } from "../utils/composite.js";
import sharp from "sharp";

const router = Router();

function parseDataUrl(url) {
  if (!url.startsWith("data:")) return null;
  const match = url.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function coerceImageInput(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value && typeof value.value === "string") {
    return value.value;
  }
  return "";
}

async function resolveImageToBuffer(source) {
  const parsed = parseDataUrl(source);
  if (parsed) return Buffer.from(parsed.base64, "base64");

  try {
    const response = await fetch(source);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function resolveImageToBase64(source) {
  const parsed = parseDataUrl(source);
  if (parsed) return parsed;

  try {
    const response = await fetch(source);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return {
      mimeType: response.headers.get("Content-Type") || "image/jpeg",
      base64,
    };
  } catch {
    return null;
  }
}

function normalizeAspectRatio(value) {
  const n = String(value || "1:1").trim();
  return /^\d+:\d+$/.test(n) ? n : "1:1";
}

function normalizeTextLanguage(value) {
  return (value || "zh").toLowerCase();
}

function orientationFromAspect(ratio) {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h || w === h) return "square";
  return w > h ? "landscape" : "portrait";
}

/**
 * Trim the transparent PNG to its visible pixel bbox so Gemini gets
 * a tighter signal of what's "the product". Also upscale small cutouts
 * slightly to give Gemini more detail to work with.
 */
async function normalizeCutout(pngBuffer) {
  try {
    const img = sharp(pngBuffer);
    // trim() strips edge pixels matching the top-left corner (transparent for our PNG)
    const trimmed = await img.trim({ threshold: 10 }).png().toBuffer();
    const trimmedMeta = await sharp(trimmed).metadata();
    const maxDim = Math.max(trimmedMeta.width || 0, trimmedMeta.height || 0);
    // Ensure product is at least 2048px on longest edge so Gemini sees fine detail
    // (logo strokes, button edges, pattern textures). Cap at 2048 to avoid oversized payloads.
    const targetDim = 2048;
    if (maxDim > 0 && maxDim < targetDim) {
      const scale = targetDim / maxDim;
      return await sharp(trimmed)
        .resize(
          Math.round((trimmedMeta.width || 0) * scale),
          Math.round((trimmedMeta.height || 0) * scale),
          { fit: "inside", kernel: "lanczos3" },
        )
        .png()
        .toBuffer();
    }
    return trimmed;
  } catch (err) {
    console.warn("generate-composite: normalizeCutout failed, using raw cutout:", err.message);
    return pngBuffer;
  }
}

function buildCompositePrompt(userPrompt, aspectRatio, textLanguage) {
  const langMap = { zh: "Simplified Chinese", en: "English", ja: "Japanese", ko: "Korean" };
  const targetLanguage = langMap[textLanguage] || "Simplified Chinese";
  const orientation = orientationFromAspect(aspectRatio);

  return [
    "=== CUTOUT COMPOSITE TASK ===",
    "PRIMARY RULE: Product fidelity outweighs scene aesthetics. If a trade-off is needed, always choose fidelity.",
    "",
    "You are given TWO references:",
    "  - Reference 1 (PRIMARY, MUST COPY PIXEL-FOR-PIXEL): the product with background removed — transparent PNG.",
    "    Treat this as the source of truth for silhouette, proportions, logos, text, patterns, and every surface detail.",
    "  - Reference 2 (SECONDARY, color calibration only): the original product photo — use ONLY to recover colors/materials",
    "    where the cutout looks washed out. Do NOT copy background or composition from Reference 2.",
    "",
    "Your job: place Reference 1 into a new scene described below, with natural light integration.",
    "",
    "=== FORBIDDEN OPERATIONS (violating any of these is a failure) ===",
    "- Do NOT re-render, redraw, or restyle ANY logo, brand mark, serial number, or printed text on the product.",
    "- Do NOT alter the camera module shape, lens layout, button positions, ports, seams, or edge curvature.",
    "- Do NOT repaint, regenerate, or 'improve' patterns, prints, or decorative graphics on the product —",
    "  copy them from Reference 1 pixel-for-pixel, including imperfections.",
    "- Do NOT change the product's surface finish (glossy → matte, brushed → polished, etc.).",
    "- Do NOT add, remove, or modify any element ON the product (stickers, accessories, reflections baked into it, etc.).",
    "- Do NOT change product proportions, aspect ratio, or shape silhouette.",
    "- Do NOT replace the product with a 'similar looking' one — use THIS exact product, not a stylized rendition.",
    "",
    "=== REQUIRED PRODUCT PRESERVATION ===",
    "- Match Reference 1's silhouette exactly, to sub-pixel accuracy.",
    "- Match every logo, text, icon, and graphic character-for-character, in the same position, size, and font.",
    "- Match the pattern/texture/print on the product pixel-for-pixel (same motif, same colors, same placement).",
    "- Match the color temperature of the product body to Reference 2 (use it to correct any cutout artifacts).",
    "",
    "=== NATURAL SCENE INTEGRATION (only way to modify the product) ===",
    "The ONLY legitimate modifications are global lighting adjustments applied uniformly — not repainting.",
    "- Add a realistic CONTACT shadow directly beneath/behind the product (soft, diffuse, matching scene light direction).",
    "- Add ambient-occlusion darkening where the product meets surfaces.",
    "- If the scene has a glossy surface, add a subtle realistic reflection of the product.",
    "- Apply the scene's global color grading (white balance, exposure) uniformly — do NOT spot-edit the product.",
    "- Respect perspective: the product's base should sit naturally on any tilted/angled surface.",
    "- Do NOT 'paste' the product flat — integrate light, but keep the product pixels intact.",
    "",
    "=== COMPOSITION ===",
    `- Canvas: ${aspectRatio} (${orientation}).`,
    "- Place the product as the hero subject, occupying roughly 45-65% of the frame.",
    "- Use rule-of-thirds or centered hero composition appropriate for e-commerce.",
    "- Leave breathing room around the product; do NOT crop the product.",
    "",
    "=== TEXT POLICY ===",
    textLanguage === "pure"
      ? "- Do NOT add any new scene text. Preserve existing product text exactly as-is."
      : `- Any newly added scene text must be in ${targetLanguage}. Preserve existing product text exactly as-is.`,
    "",
    "=== QUALITY ===",
    "- Professional e-commerce product photography quality.",
    "- Sharp product, appropriate depth-of-field on the background.",
    "- No visible compositing artifacts (halos, color fringing, hard edges).",
    "",
    `=== SCENE DESCRIPTION ===\n${userPrompt}`,
  ].join("\n");
}

// POST /api/generate-composite
router.post("/", requireAuth, async (req, res) => {
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY_MISSING", message: "Gemini API key not configured" });
    }

    const body = req.body;
    const productSource = coerceImageInput(body.imageBase64) || coerceImageInput(body.referenceImageUrl);
    if (!productSource) {
      return res.status(400).json({ error: "PRODUCT_IMAGE_REQUIRED", message: "Primary product image is required" });
    }

    const productBuffer = await resolveImageToBuffer(productSource);
    if (!productBuffer) {
      return res.status(400).json({ error: "PRODUCT_IMAGE_REQUIRED", message: "Failed to load product image" });
    }

    const normalizedAspectRatio = normalizeAspectRatio(body.aspectRatio);
    const normalizedTextLanguage = normalizeTextLanguage(body.textLanguage);
    const userPrompt = String(
      body.prompt || "Clean white surface with soft natural lighting, suitable for e-commerce product photography",
    );
    const normalizedModel = String(body.model || "gemini-3.1-flash-image-preview");

    console.info("generate-composite: starting", {
      userId: req.user.id,
      aspectRatio: normalizedAspectRatio,
      model: normalizedModel,
      promptLength: userPrompt.length,
    });

    // Step 1: Remove background from product (transparent cutout)
    console.info("generate-composite: step 1 - removing background");
    let transparentProductRaw;
    try {
      transparentProductRaw = await removeProductBackground(productBuffer);
    } catch (err) {
      console.error("generate-composite: background removal failed:", err.message);
      return res.status(500).json({
        error: "BG_REMOVAL_FAILED",
        message: "商品抠图失败，请上传背景更简单的商品图重试。",
        detail: err.message,
      });
    }

    // Trim transparent padding and upscale so Gemini receives a detail-rich reference
    const transparentProduct = await normalizeCutout(transparentProductRaw);
    const cutoutBase64 = transparentProduct.toString("base64");

    // Also prepare the ORIGINAL product (for color/texture reference that survives cutout artifacts)
    const originalRef = await resolveImageToBase64(productSource);

    // Step 2: Single Gemini call — natural scene + product composite with integrated lighting
    console.info("generate-composite: step 2 - Gemini composite");
    const compositePrompt = buildCompositePrompt(userPrompt, normalizedAspectRatio, normalizedTextLanguage);

    // NOTE: Gemini weights the LAST image highest, so put the primary (pixel-exact cutout) last.
    // Reference 1 = cutout (authoritative), Reference 2 = original (color calibration only).
    const parts = [{ text: compositePrompt }];
    if (originalRef) {
      parts.push(
        { text: "REFERENCE 2 — ORIGINAL product photo. Use ONLY for color/material calibration. Do NOT copy its background or composition." },
        { inlineData: { mimeType: originalRef.mimeType, data: originalRef.base64 } },
      );
    }
    parts.push(
      { text: "REFERENCE 1 (PRIMARY, PIXEL-EXACT SOURCE) — product with background removed. Copy this pixel-for-pixel: silhouette, logos, text, patterns, proportions." },
      { inlineData: { mimeType: "image/png", data: cutoutBase64 } },
    );

    let imageUrl;
    let geminiMeta = {};
    try {
      const result = await callGeminiImageWithFallback({
        apiKey: geminiApiKey,
        functionName: "generate-composite",
        selectedModel: normalizedModel,
        parts,
      });
      imageUrl = result.imageUrl;
      geminiMeta = result.meta;
    } catch (err) {
      if (err instanceof FunctionError) {
        return res.status(err.status).json({
          error: err.code,
          message: "抠图合成失败：" + err.message,
          detail: err.detail,
          meta: err.meta,
        });
      }
      throw err;
    }

    console.info("generate-composite: done", {
      userId: req.user.id,
      modelUsed: geminiMeta?.modelUsed,
    });

    res.json({
      images: [imageUrl],
      meta: {
        mode: "composite",
        aspectRatio: normalizedAspectRatio,
        ...geminiMeta,
      },
    });
  } catch (err) {
    if (err instanceof FunctionError) {
      return res.status(err.status).json({
        error: err.code,
        message: err.message,
        detail: err.detail,
        meta: err.meta,
      });
    }
    console.error("generate-composite error:", err);
    res.status(500).json({ error: "COMPOSITE_FAILED", message: "抠图合成失败：" + (err.message || "Unknown error") });
  }
});

export default router;
