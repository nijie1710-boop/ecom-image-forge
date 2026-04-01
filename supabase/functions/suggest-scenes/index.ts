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
    const disableAuth = Deno.env.get("DISABLE_AUTH") === "true";

    if (!disableAuth) {
      const authHeader = req.headers.get("Authorization");
      if (authHeader) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const token = authHeader.replace("Bearer ", "");
        const {
          data: { user },
        } = await supabase.auth.getUser(token);

        if (!user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const body = await req.json();
    const imageBase64 = body.imageBase64 as string | undefined;
    console.error("suggest-scenes: received body keys:", Object.keys(body).join(", "));
    console.error(
      "suggest-scenes: imageBase64 present:",
      !!imageBase64,
      "length:",
      imageBase64?.length || 0,
    );

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    if (!imageBase64 || imageBase64.length < 100) {
      return new Response(JSON.stringify({ error: "请上传有效的产品图片" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const promptText = `You are a senior e-commerce art director and product photographer.

Analyze the uploaded product image first. Then produce exactly 3 scene suggestions in Chinese for photographing THIS SAME product.

Return ONLY valid JSON with this exact shape:
{
  "product_summary": "一句中文总结，说明产品类别、材质、颜色、关键外观特征",
  "visible_text": "图片上能看到的文字，没有就写 NONE",
  "suggestions": [
    { "scene": "场景标题1", "description": "完整场景提示词1" },
    { "scene": "场景标题2", "description": "完整场景提示词2" },
    { "scene": "场景标题3", "description": "完整场景提示词3" }
  ]
}

Strict requirements:
- The suggestions must be grounded in the actual product category. Never misidentify the product.
- The product must remain the same product. Never imply replacing it with another object.
- Mention specific visual traits from the image such as color, material, print, structure, or visible graphics.
- Avoid generic empty labels like “现代简约风” unless the description includes a concrete photography setup.
- Each description must be a production-ready Chinese prompt, not a slogan.
- For apparel, prioritize apparel-friendly setups such as hanger display, flat lay, folded merchandising, torso mannequin, wardrobe scene, or detail close-up.
- For non-apparel products, adapt the scene naturally to the product category.
- Keep the 3 options meaningfully different in composition or merchandising direction.`;

    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`;

    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            { inlineData: { mimeType, data: base64Data } },
          ],
        }],
        generationConfig: {
          temperature: 0.5,
          topP: 0.8,
          maxOutputTokens: 1200,
        },
      }),
    });

    const rawText = await apiResponse.text();

    if (!apiResponse.ok) {
      let errorDetail = rawText.substring(0, 300);
      try {
        const errJson = JSON.parse(rawText);
        errorDetail = errJson.error?.message || errJson.error?.details || errorDetail;
      } catch {
        // ignore
      }
      console.error("Gemini API error:", apiResponse.status, errorDetail);
      throw new Error(`AI 服务暂时不可用 (${apiResponse.status})`);
    }

    let apiData: Record<string, unknown>;
    try {
      apiData = JSON.parse(rawText);
    } catch {
      throw new Error("AI 返回格式错误，请稍后重试");
    }

    const text = (
      apiData as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    )?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      throw new Error("AI 未能生成场景建议");
    }

    console.error("suggest-scenes: AI response:", text.substring(0, 300));

    let analysis: {
      product_summary?: string;
      visible_text?: string;
      suggestions?: Array<{ scene?: string; description?: string }>;
    } = { product_summary: "", visible_text: "NONE", suggestions: [] };

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (parseErr) {
      console.error("Parse error:", parseErr, "text:", text.substring(0, 300));
      analysis = {
        product_summary: "产品分析失败",
        visible_text: "NONE",
        suggestions: [
          {
            scene: "白底主图",
            description:
              "纯白背景，正面完整展示同一件产品，专业棚拍光线，突出颜色、版型和图案细节，不添加无关道具。",
          },
          {
            scene: "生活化陈列",
            description:
              "围绕同一件产品搭建简洁生活化陈列场景，保留产品原有颜色、材质和印花，使用柔和自然光与干净背景，强调真实电商展示感。",
          },
          {
            scene: "细节卖点展示",
            description:
              "聚焦同一件产品的材质、纹理、图案和做工细节，使用近景或半身陈列构图，突出产品卖点但不改变商品本体。",
          },
        ],
      };
    }

    const suggestions = (analysis.suggestions || []).slice(0, 3).map((item) => ({
      scene: String(item.scene || "场景建议"),
      description: String(item.description || ""),
    }));

    return new Response(JSON.stringify({
      product_summary: analysis.product_summary || "",
      visible_text: analysis.visible_text || "NONE",
      suggestions,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "未知错误";
    console.error("suggest-scenes error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
