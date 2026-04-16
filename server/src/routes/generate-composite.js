/**
 * generate-composite.js
 *
 * Composite generation flow:
 * 1. Remove background from product image
 * 2. Generate scene background with Gemini (no product)
 * 3. Composite product onto scene
 * 4. Save result and return URL
 */
import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { callGeminiImageWithFallback, resolveImageModelSelection, FunctionError } from "../utils/gemini.js";
import { removeProductBackground, createShadowLayer } from "../utils/composite.js";
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

function aspectRatioDimensions(ratio, baseSize = 1024) {
  const [w, h] = ratio.split(":").map(Number);
  if (!w || !h) return { width: baseSize, height: baseSize };
  if (w >= h) {
    return { width: baseSize, height: Math.round(baseSize * (h / w)) };
  }
  return { width: Math.round(baseSize * (w / h)), height: baseSize };
}

function buildScenePrompt(userPrompt, aspectRatio, textLanguage) {
  const langMap = { zh: "Simplified Chinese", en: "English", ja: "Japanese", ko: "Korean" };
  const targetLanguage = langMap[textLanguage] || "Simplified Chinese";
  const { width, height } = aspectRatioDimensions(aspectRatio);
  const orientation = width > height ? "landscape" : width < height ? "portrait" : "square";

  return [
    "=== BACKGROUND SCENE GENERATION ===",
    "Generate ONLY a background scene image. Do NOT include any product, item, or object as the main subject.",
    "The scene must have a clear, open focal area in the center where a product will be digitally composited later.",
    `Canvas: ${aspectRatio} (${orientation}, ${width}x${height} target).`,
    "",
    "COMPOSITION RULES:",
    "- Leave the center ~40% of the image relatively clean and uncluttered.",
    "- Background elements (props, surfaces, environment) should frame the empty center area.",
    "- Use natural, professional e-commerce photography lighting.",
    "- The surface/table/background should look realistic and high-quality.",
    "- Do NOT place any product, box, phone, bag, or main object in the scene.",
    "- Small decorative props at the edges are acceptable (flowers, leaves, fabric, small accessories).",
    "",
    textLanguage !== "pure"
      ? `Any text in the scene must be in ${targetLanguage}.`
      : "Do not include any text in the scene.",
    "",
    `SCENE DESCRIPTION: ${userPrompt}`,
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
    const userPrompt = String(body.prompt || "Clean white surface with soft natural lighting, suitable for e-commerce product photography");
    const normalizedModel = String(body.model || "gemini-3.1-flash-image-preview");

    console.info("generate-composite: starting", {
      userId: req.user.id,
      aspectRatio: normalizedAspectRatio,
      model: normalizedModel,
      promptLength: userPrompt.length,
    });

    // Step 1: Remove background from product
    console.info("generate-composite: step 1 - removing background");
    let transparentProduct;
    try {
      transparentProduct = await removeProductBackground(productBuffer);
    } catch (err) {
      console.error("generate-composite: background removal failed:", err.message);
      return res.status(500).json({
        error: "BG_REMOVAL_FAILED",
        message: "商品抠图失败，请上传背景更简单的商品图重试。",
        detail: err.message,
      });
    }

    // Step 2: Generate scene background with Gemini
    console.info("generate-composite: step 2 - generating scene background");
    const scenePrompt = buildScenePrompt(userPrompt, normalizedAspectRatio, normalizedTextLanguage);

    // Optionally include product image as reference (so Gemini knows what kind of scene to create)
    const productRef = await resolveImageToBase64(productSource);
    const sceneParts = [
      { text: scenePrompt },
    ];

    // Include product as a hint for scene style (but instruct NOT to include the product itself)
    if (productRef) {
      sceneParts.push(
        { text: "PRODUCT REFERENCE (for context only - do NOT include this product in the scene, just use it to understand what kind of product will be placed here):" },
        { inlineData: { mimeType: productRef.mimeType, data: productRef.base64 } },
      );
    }

    let sceneImageUrl;
    try {
      const sceneResult = await callGeminiImageWithFallback({
        apiKey: geminiApiKey,
        functionName: "generate-composite-scene",
        selectedModel: normalizedModel,
        parts: sceneParts,
      });
      sceneImageUrl = sceneResult.imageUrl;
    } catch (err) {
      if (err instanceof FunctionError) {
        return res.status(err.status).json({
          error: err.code,
          message: "场景背景生成失败：" + err.message,
          detail: err.detail,
          meta: err.meta,
        });
      }
      throw err;
    }

    // Convert scene data URL to buffer
    const sceneMatch = sceneImageUrl.match(/^data:([^;]+);base64,(.+)$/i);
    if (!sceneMatch) {
      return res.status(500).json({ error: "SCENE_GENERATION_FAILED", message: "场景背景生成结果无效" });
    }
    let sceneBgBuffer = Buffer.from(sceneMatch[2], "base64");

    // Resize scene to target dimensions
    const { width: targetW, height: targetH } = aspectRatioDimensions(normalizedAspectRatio);
    sceneBgBuffer = await sharp(sceneBgBuffer)
      .resize(targetW, targetH, { fit: "cover" })
      .jpeg({ quality: 95 })
      .toBuffer();

    // Step 3: Composite product onto scene
    console.info("generate-composite: step 3 - compositing");

    // Get product dimensions for shadow
    const productMeta = await sharp(transparentProduct).metadata();
    const productWidth = productMeta.width || 512;
    const productHeight = productMeta.height || 512;
    const scaleX = (targetW * 0.70) / productWidth;
    const scaleY = (targetH * 0.70) / productHeight;
    const scale = Math.min(scaleX, scaleY);
    const newWidth = Math.round(productWidth * scale);
    const newHeight = Math.round(productHeight * scale);
    const pLeft = Math.round((targetW - newWidth) / 2);
    const pTop = Math.round((targetH - newHeight) / 2);

    // Add shadow layer
    const shadowSvg = await createShadowLayer(targetW, targetH, {
      left: pLeft,
      top: pTop,
      width: newWidth,
      height: newHeight,
    });

    // Composite: scene → shadow → product
    const resizedProduct = await sharp(transparentProduct)
      .resize(newWidth, newHeight, { fit: "inside", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    const compositeResult = await sharp(sceneBgBuffer)
      .composite([
        { input: shadowSvg, left: 0, top: 0, blend: "over" },
        { input: resizedProduct, left: Math.max(0, pLeft), top: Math.max(0, pTop), blend: "over" },
      ])
      .jpeg({ quality: 92 })
      .toBuffer();

    // Step 4: Return as data URL (consistent with generate-image endpoint)
    const compositeDataUrl = `data:image/jpeg;base64,${compositeResult.toString("base64")}`;

    console.info("generate-composite: done", {
      userId: req.user.id,
      outputSize: compositeResult.length,
    });

    res.json({
      images: [compositeDataUrl],
      meta: {
        mode: "composite",
        aspectRatio: normalizedAspectRatio,
        productSize: { width: newWidth, height: newHeight },
        sceneSize: { width: targetW, height: targetH },
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
