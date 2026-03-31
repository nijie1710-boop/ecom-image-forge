import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DISABLE_AUTH = Deno.env.get("DISABLE_AUTH") === "true";
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!DISABLE_AUTH && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (!user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { imageUrl, imageBase64, imageType } = await req.json();

    if (!imageUrl && !imageBase64) {
      return new Response(JSON.stringify({ error: "请上传产品图片" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // 获取图片数据：优先用 URL 方式（避免 base64 大小限制）
    let mimeType = "image/jpeg";
    let base64Data = "";

    if (imageUrl) {
      // 从 URL 下载图片
      try {
        const imgResponse = await fetch(imageUrl);
        if (!imgResponse.ok) {
          throw new Error(`图片下载失败: ${imgResponse.status}`);
        }
        const arrayBuffer = await imgResponse.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        base64Data = btoa(String.fromCharCode(...uint8Array));
        mimeType = imgResponse.headers.get("content-type") || "image/jpeg";
        console.error("suggest-scenes: downloaded from URL, size:", base64Data.length);
      } catch (fetchErr: any) {
        console.error("suggest-scenes: fetch error:", fetchErr.message);
        throw new Error("图片下载失败，请检查图片链接是否有效");
      }
    } else if (imageBase64) {
      // 解析 base64
      if (imageBase64.includes(",")) {
        const parts = imageBase64.split(",");
        const metaPart = parts[0];
        base64Data = parts[1];
        const mimeMatch = metaPart.match(/data:([^;]+)/);
        if (mimeMatch) mimeType = mimeMatch[1];
      } else {
        base64Data = imageBase64;
      }
    }

    // ========== 用 Gemini 视觉理解分析产品 ==========
    const analysisPrompt = `You are an expert e-commerce product analyst with advanced visual understanding.

Please analyze the product image and provide a detailed analysis in JSON format.

Your output must be a valid JSON object with exactly this structure:
{
  "product_summary": "Brief description of what this product is, its key visual features, color, material, style, and target audience",
  "visible_text": "Any text, labels, brand names, or characters visible on the product or packaging. Write NONE if no text is visible.",
  "scene_suggestions": [
    {
      "scene": "Short scene name in Chinese (under 15 characters)",
      "description": "Detailed scene description in Chinese (60-80 characters) that describes environment, lighting, mood, and composition"
    },
    {
      "scene": "Short scene name in Chinese (under 15 characters)",
      "description": "Detailed scene description in Chinese (60-80 characters)"
    },
    {
      "scene": "Short scene name in Chinese (under 15 characters)",
      "description": "Detailed scene description in Chinese (60-80 characters)"
    }
  ]
}

Requirements for scene_suggestions:
- Each scene must be relevant to the specific product analyzed
- Each scene should have a different mood/direction (e.g., minimal, lifestyle, dramatic, natural)
- Scenes should be practical for e-commerce use
- Do NOT generate generic templates - make each suggestion specific to this product

Return ONLY the JSON object, no markdown formatting, no code blocks, no other text.`;

    const parts: any[] = [
      { text: analysisPrompt },
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ];

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 2048,
        },
      }),
    });

    const rawText = await apiResponse.text();

    if (!apiResponse.ok) {
      let errorDetail = rawText.substring(0, 300);
      try {
        const errJson = JSON.parse(rawText);
        errorDetail = errJson.error?.message || errJson.error?.details || errorDetail;
      } catch {}
      console.error("Gemini API error:", apiResponse.status, errorDetail);
      throw new Error(`AI 服务暂时不可用 (${apiResponse.status})，请稍后重试`);
    }

    let apiData;
    try {
      apiData = JSON.parse(rawText);
    } catch {
      throw new Error("AI 返回格式错误，请稍后重试");
    }

    const text = apiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("AI 未能分析产品图片，请尝试更换产品图片");
    }

    // 解析 JSON
    let analysis: any;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysis = JSON.parse(jsonMatch[0]);
      } else {
        analysis = JSON.parse(text);
      }
    } catch (parseErr: any) {
      console.error("Parse error:", parseErr.message, "text:", text.substring(0, 200));
      throw new Error("AI 分析结果格式错误，请稍后重试");
    }

    if (!analysis.scene_suggestions || !Array.isArray(analysis.scene_suggestions)) {
      analysis.scene_suggestions = [
        { scene: "现代简约风", description: "纯白背景，专业棚拍，展示产品全貌和细节" },
        { scene: "生活场景图", description: "温馨室内环境，自然光线，融入真实生活场景" },
        { scene: "创意展示图", description: "艺术感布景，戏剧性灯光，突出产品设计感" },
      ];
    }

    while (analysis.scene_suggestions.length < 3) {
      analysis.scene_suggestions.push({
        scene: `场景 ${analysis.scene_suggestions.length + 1}`,
        description: "专业电商场景，展示产品最佳状态",
      });
    }
    analysis.scene_suggestions = analysis.scene_suggestions.slice(0, 3);

    return new Response(JSON.stringify({
      product_summary: analysis.product_summary || "未能识别产品",
      visible_text: analysis.visible_text || "NONE",
      suggestions: analysis.scene_suggestions.map((s: any) => ({
        scene: String(s.scene || "场景"),
        description: String(s.description || ""),
      })),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("suggest-scenes error:", e.message);
    return new Response(JSON.stringify({
      error: e.message || "未知错误"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
