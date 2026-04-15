import { Router } from "express";
import { optionalAuth } from "../middleware/auth.js";
import { callGeminiTextWithFallback } from "../utils/gemini.js";

const router = Router();

function getMimeType(dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  return match ? match[1] : "image/jpeg";
}

function getBase64Data(dataUrl) {
  const parts = dataUrl.split(",");
  return parts.length > 1 ? parts[1] : dataUrl;
}

// POST /api/evaluate-image
router.post("/", optionalAuth, async (req, res) => {
  try {
    const { imageUrl, imageType, aspectRatio } = req.body;

    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
    }

    // Build image part - support both data URL and remote URL
    let imagePart;
    if (imageUrl.startsWith("data:")) {
      imagePart = {
        inlineData: {
          mimeType: getMimeType(imageUrl),
          data: getBase64Data(imageUrl),
        },
      };
    } else {
      // For remote URLs, fetch and convert to base64
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        return res.status(400).json({ error: "Failed to fetch image" });
      }
      const buffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      imagePart = {
        inlineData: {
          mimeType: contentType,
          data: base64,
        },
      };
    }

    const contextInfo = [
      imageType ? `图片类型: ${imageType}` : "",
      aspectRatio ? `当前比例: ${aspectRatio}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt = `你是一个专业的电商图片质量评估专家。请分析这张电商商品图片，给出评分和使用建议。

${contextInfo}

请严格按照以下 JSON 格式返回，不要添加任何其他文字：
{
  "score": <1-10的评分，保留1位小数>,
  "rating": "<优秀|良好|一般|需改进>",
  "usageSuggestion": "<最适合的用途，例如：适合做主图、适合做详情第N屏、适合做场景图、适合做买家秀等>",
  "strengths": ["<优点1>", "<优点2>"],
  "improvements": ["<改进建议1>", "<改进建议2>"]
}

评分标准：
- 构图与排版 (1-10)
- 色彩与光线 (1-10)
- 商品展示清晰度 (1-10)
- 电商吸引力 (1-10)
综合以上四项取平均分。`;

    const parts = [
      { text: systemPrompt },
      imagePart,
    ];

    const result = await callGeminiTextWithFallback({
      apiKey,
      functionName: "evaluate-image",
      parts,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3,
        maxOutputTokens: 512,
      },
    });

    let evaluation;
    try {
      const cleaned = result.text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      evaluation = JSON.parse(cleaned);
    } catch {
      console.error("evaluate-image: failed to parse response:", result.text);
      return res.status(500).json({ error: "AI 返回格式异常，请重试" });
    }

    return res.json({
      evaluation,
      meta: result.meta,
    });
  } catch (err) {
    console.error("evaluate-image error:", err);
    return res.status(500).json({
      error: err.message || "图片评估失败",
    });
  }
});

export default router;
