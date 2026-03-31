import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SceneSuggestion {
  scene: string;
  description: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DISABLE_AUTH = Deno.env.get("DISABLE_AUTH") === "true";
    const authHeader = req.headers.get("Authorization");

    if (!DISABLE_AUTH && authHeader) {
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

    const { imageBase64, imageType } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "请上传产品图片" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    // 解析图片数据
    let mimeType = "image/jpeg";
    let base64Data = imageBase64;

    if (imageBase64.includes(",")) {
      const parts = imageBase64.split(",");
      const metaPart = parts[0];
      base64Data = parts[1];
      // 从 mimeType 提取
      const mimeMatch = metaPart.match(/data:([^;]+)/);
      if (mimeMatch) mimeType = mimeMatch[1];
    }

    console.error("suggest-scenes: mimeType=", mimeType, "base64 length=", base64Data.length);

    // 构建 prompt - 简洁清晰
    const systemPrompt = `You are an expert e-commerce product analyst. Analyze the product image and generate exactly 3 scene suggestions for e-commerce product photography.

Output a JSON array with exactly 3 items. Each item has:
- "scene": short Chinese name (under 15 characters)
- "description": Chinese scene description (50-80 characters)

Requirements:
- Scenes must match the product type, color, material, and style
- Each scene should have a different mood/direction (minimal, lifestyle, professional, etc.)
- Be specific to this product, not generic templates

Return ONLY the JSON array, no markdown or other text.

Example format:
[{"scene":"现代简约","description":"纯白棚拍，专业灯光，产品居中展示"},{"scene":"生活场景","description":"温馨家居环境，自然光，产品融入生活"},{"scene":"创意展示","description":"艺术布景，戏剧性灯光，突出设计感"}]`;

    const parts: any[] = [
      { text: systemPrompt },
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ];

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    console.error("suggest-scenes: calling Gemini API...");

    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.8,
          topP: 0.9,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      }),
    });

    const rawText = await apiResponse.text();
    console.error("suggest-scenes: API status:", apiResponse.status);

    if (!apiResponse.ok) {
      console.error("Gemini API error:", rawText.substring(0, 300));
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
      console.error("suggest-scenes: no text in response:", JSON.stringify(apiData).substring(0, 200));
      throw new Error("AI 未能生成场景建议，请尝试更换产品图片");
    }

    console.error("suggest-scenes: AI response text:", text.substring(0, 200));

    // 解析 JSON
    let suggestions: SceneSuggestion[];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        suggestions = JSON.parse(text);
      }

      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        throw new Error("格式错误");
      }

      suggestions = suggestions.slice(0, 3).map((s: any) => ({
        scene: String(s.scene || s.name || "场景"),
        description: String(s.description || s.desc || s.detail || ""),
      }));
    } catch (parseErr: any) {
      console.error("suggest-scenes: parse error:", parseErr.message, "text:", text.substring(0, 200));
      // 返回默认场景作为 fallback
      suggestions = [
        { scene: "现代简约风", description: "纯白背景，极简构图，专业电商棚拍，展示产品全貌" },
        { scene: "生活场景图", description: "温馨室内环境，自然光线，展现产品使用氛围和真实感" },
        { scene: "创意展示图", description: "艺术感强的展示方式，戏剧性灯光，突出产品设计感" },
      ];
    }

    console.error("suggest-scenes: returning", suggestions.length, "suggestions");

    return new Response(JSON.stringify({ suggestions }), {
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
