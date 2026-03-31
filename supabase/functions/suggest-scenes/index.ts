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

    const body = await req.json();
    console.error("suggest-scenes: received body keys:", Object.keys(body).join(', '));
    console.error("suggest-scenes: imageBase64 present:", !!body.imageBase64, "length:", body.imageBase64?.length || 0);

    const { imageBase64 } = body;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    if (!imageBase64 || imageBase64.length < 100) {
      console.error("suggest-scenes: imageBase64 too short or empty, length:", imageBase64?.length || 0);
      return new Response(JSON.stringify({ error: "请上传产品图片或图片太小" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 解析 base64
    let mimeType = "image/jpeg";
    let base64Data = "";
    if (imageBase64.includes(",")) {
      const parts = imageBase64.split(",");
      base64Data = parts[1] || parts[0];
      const mimeMatch = parts[0].match(/data:([^;]+)/);
      if (mimeMatch) mimeType = mimeMatch[1];
    } else {
      base64Data = imageBase64;
    }

    console.error("suggest-scenes: parsed base64 length:", base64Data.length, "mime:", mimeType);

    const promptText = `You are an expert e-commerce product photographer and scene designer.

Analyze the product image and generate exactly 2 diverse scene suggestions for this product in Chinese.

Output ONLY a valid JSON array with exactly 2 items like this (no markdown, no code blocks):
[{"scene":"场景名称1","description":"详细场景描述1"},{"scene":"场景名称2","description":"详细场景描述2"}]

Requirements:
- Each scene must be specific to this product's type, color, material, and style
- Each scene should have a different mood/direction
- Be practical for e-commerce product photography`;

    const parts: any[] = [
      { text: promptText },
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ];

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;

    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.8,
          topP: 0.9,
          maxOutputTokens: 1024,
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

    let suggestions: any[];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        suggestions = JSON.parse(jsonMatch[0]);
      } else {
        suggestions = JSON.parse(text);
      }
    } catch {
      suggestions = [
        { scene: "现代简约风", description: "纯白背景，专业棚拍，展示产品全貌和细节" },
        { scene: "生活场景图", description: "温馨室内环境，自然光线，融入真实生活场景" },
      ];
    }

    suggestions = suggestions.slice(0, 2).map((s: any) => ({
      scene: String(s.scene || "场景"),
      description: String(s.description || ""),
    }));

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
