import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function coerceImageInput(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "value" in value &&
    typeof (value as { value?: unknown }).value === "string"
  ) {
    return (value as { value: string }).value;
  }
  return "";
}

async function callGemini(
  apiKey: string,
  mimeType: string,
  base64Data: string,
  promptText: string,
) {
  const candidateModels = ["gemini-2.5-flash", "gemini-2.0-flash"];
  let lastError = "Unknown Gemini error";

  for (const model of candidateModels) {
    const apiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
          temperature: 0.2,
          topP: 0.8,
          maxOutputTokens: 1600,
          responseMimeType: "application/json",
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      }),
    });

    const rawText = await apiResponse.text();
    if (apiResponse.ok) {
      return rawText;
    }

    let errorDetail = rawText.substring(0, 300);
    try {
      const errJson = JSON.parse(rawText);
      errorDetail = errJson.error?.message || errJson.error?.details || errorDetail;
    } catch {
      // ignore
    }

    console.error(`Gemini API error on ${model}:`, apiResponse.status, errorDetail);
    lastError = `${model}: ${errorDetail}`;
  }

  throw new Error(`AI 服务暂时不可用: ${lastError}`);
}

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
    const imageBase64 = coerceImageInput(body.imageBase64);

    if (!imageBase64 || imageBase64.length < 100) {
      return new Response(JSON.stringify({ error: "请上传有效的产品图片" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    let mimeType = "image/jpeg";
    let base64Data = imageBase64;
    if (imageBase64.includes(",")) {
      const parts = imageBase64.split(",");
      base64Data = parts[1] || parts[0];
      const mimeMatch = parts[0].match(/data:([^;]+)/);
      if (mimeMatch) mimeType = mimeMatch[1];
    }

    const promptText = [
      "You are a senior e-commerce art director.",
      "Identify the original uploaded product only.",
      "If the image is a screenshot of an editor, webpage, or dashboard, the true product reference is the small uploaded product thumbnail in the left input panel.",
      "Never use the large generated result images on the right side as the product reference.",
      "Ignore all UI text, generated outputs, buttons, panels, labels, and layout chrome.",
      "The image may already contain lifestyle background, poster text, stickers, badges, props, or marketing layout. Ignore those distractions.",
      "Then output exactly 3 Chinese scene suggestions for photographing the SAME product.",
      "Each suggestion must be practical for e-commerce and must preserve the same product category, shape, material, and printed design.",
      "Return JSON only.",
      '{"product_summary":"中文总结主商品类别和关键特征","visible_text":"图片里可见的文字，没有则写 NONE","suggestions":[{"scene":"场景标题1","description":"完整中文场景提示词1"},{"scene":"场景标题2","description":"完整中文场景提示词2"},{"scene":"场景标题3","description":"完整中文场景提示词3"}]}',
    ].join(" ");

    const rawText = await callGemini(geminiApiKey, mimeType, base64Data, promptText);

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

    let analysis: {
      product_summary?: string;
      visible_text?: string;
      suggestions?: Array<{ scene?: string; description?: string }>;
    } = {
      product_summary: "",
      visible_text: "NONE",
      suggestions: [],
    };

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      analysis = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch (parseErr) {
      console.error("Parse error:", parseErr, "text:", text.substring(0, 300));
      analysis = {
        product_summary: "产品识别失败",
        visible_text: "NONE",
        suggestions: [
          {
            scene: "白底主图",
            description:
              "纯白背景，完整展示同一件产品，专业电商棚拍光线，突出材质、颜色和产品主体，不添加无关道具。",
          },
          {
            scene: "生活化陈列",
            description:
              "围绕同一件产品搭建简洁真实的生活化陈列场景，保留产品原有形态与材质，使用自然柔和光线，突出商品本体。",
          },
          {
            scene: "细节卖点展示",
            description:
              "聚焦同一件产品的材质、纹理、图案和做工细节，使用近景或局部构图，突出卖点但不改变商品本体。",
          },
        ],
      };
    }

    const visibleText = String(analysis.visible_text || "NONE");
    const screenshotKeywords = ["AI电商图片生成", "生成结果", "图片类型", "文字语言", "场景描述", "换一批"];
    const matchedUiKeywords = screenshotKeywords.filter((keyword) => visibleText.includes(keyword));
    if (matchedUiKeywords.length >= 2) {
      return new Response(JSON.stringify({
        error: "检测到你上传的更像是页面截图，请直接上传原始商品图，不要上传带有界面和生成结果的截图。",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
