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

    if (!DISABLE_AUTH) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const { imageBase64, imageType } = await req.json();

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // 解析图片 base64
    let mimeType = "image/jpeg";
    let base64Data = "";
    let hasImage = false;

    if (imageBase64) {
      hasImage = true;
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

    // 构建 prompt
    let promptText = "";
    if (hasImage) {
      promptText = `You are an expert e-commerce product photographer and scene designer.

If an image is provided, analyze it carefully and identify:
1. What product is shown
2. Key visual features, colors, materials, style
3. Any visible text or branding

Then generate exactly 3 diverse scene suggestions for this product in Chinese.

If no image is provided (or image analysis fails), generate 3 general e-commerce scene suggestions for any product.

Output ONLY a valid JSON array with exactly 3 items like this (no markdown, no code blocks):
[{"scene":"场景名称","description":"详细场景描述"},{"scene":"场景名称2","description":"详细场景描述2"},{"scene":"场景名称3","description":"详细场景描述3"}]`;
    } else {
      promptText = `You are an expert e-commerce product photographer. Generate exactly 3 diverse scene suggestions for e-commerce product photography in Chinese.

Output ONLY a valid JSON array like this (no markdown, no code blocks):
[{"scene":"现代简约","description":"纯白背景专业棚拍展示产品全貌"},{"scene":"生活场景","description":"温馨室内环境自然光线融入生活"},{"scene":"创意展示","description":"艺术感布景戏剧性灯光突出设计"}]`;
    }

    // 构建请求 parts
    const parts: any[] = [{ text: promptText }];
    if (hasImage) {
      parts.push({
        inlineData: {
          mimeType,
          data: base64Data,
        },
      });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

    console.error("suggest-scenes: hasImage=", hasImage, "base64 length=", base64Data.length);

    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.8,
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
      throw new Error(`AI 服务暂时不可用 (${apiResponse.status})`);
    }

    let apiData;
    try {
      apiData = JSON.parse(rawText);
    } catch {
      throw new Error("AI 返回格式错误，请稍后重试");
    }

    const text = apiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("AI 未能生成场景建议");
    }

    console.error("suggest-scenes: AI response:", text.substring(0, 200));

    // 解析 JSON
    let suggestions: any[];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        suggestions = JSON.parse(text);
      }
    } catch {
      // 解析失败，使用默认场景
      suggestions = [
        { scene: "现代简约风", description: "纯白背景，专业棚拍，展示产品全貌和细节" },
        { scene: "生活场景图", description: "温馨室内环境，自然光线，融入真实生活场景" },
        { scene: "创意展示图", description: "艺术感布景，戏剧性灯光，突出产品设计感" },
      ];
    }

    suggestions = suggestions.slice(0, 3).map((s: any) => ({
      scene: String(s.scene || "场景"),
      description: String(s.description || ""),
    }));

    return new Response(JSON.stringify({
      suggestions,
      note: hasImage ? "基于产品图片分析生成" : "基于通用场景生成",
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
