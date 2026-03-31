import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.error("=== translate-image request ===");
  console.error("method:", req.method);
  console.error("content-type:", req.headers.get("content-type"));
  console.error("url:", req.url);

  let body: any;
  try {
    const rawBody = await req.text();
    console.error("rawBody length:", rawBody.length);
    console.error("rawBody start:", rawBody.substring(0, 100));
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error("JSON parse failed:", e);
      return new Response(JSON.stringify({ error: "JSON解析失败：" + (e instanceof Error ? e.message : String(e)), raw: rawBody.substring(0, 200) }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("req.text() failed:", e);
    return new Response(JSON.stringify({ error: "读取请求体失败：" + (e instanceof Error ? e.message : String(e)) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  console.error("body parsed OK, keys:", Object.keys(body || {}));

  try {
    // ========== 用户认证 ==========
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "未授权，请先登录" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "认证失败，请重新登录" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageUrl, step, translations } = body;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      throw new Error("AI 服务未配置，请联系管理员");
    }

    console.error("step:", step, "imageUrl type:", typeof imageUrl, "imageUrl len:", imageUrl ? imageUrl.length : 0);

    if (step === "ocr") {
      if (!imageUrl) {
        return new Response(JSON.stringify({ error: "未提供图片" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let base64Data = imageUrl;
      if (imageUrl.startsWith("data:")) {
        base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");
      }

      const apiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: `You are an expert OCR. Find all Chinese text in this image. Return JSON array: [{"original":"原文","translated":"译文","position":"位置"}]` },
                { inlineData: { mimeType: "image/jpeg", data: base64Data } },
              ]
            }],
          }),
        }
      );

      const rawText = await apiResp.text();
      console.error("Gemini OCR status:", apiResp.status, "body:", rawText.substring(0, 300));

      if (!apiResp.ok) {
        return new Response(JSON.stringify({ error: "OCR服务不可用(" + apiResp.status + ")" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let apiData: any;
      try { apiData = JSON.parse(rawText); } catch { apiData = {}; }
      const content = apiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";

      let parsed = [];
      try {
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      } catch { parsed = []; }

      return new Response(JSON.stringify({ translations: parsed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (step === "replace") {
      if (!translations || translations.length === 0) throw new Error("No translations provided");

      const cost = 1;
      const { data: balanceData } = await supabase.rpc("get_user_balance", { p_user_id: user.id });
      const currentBalance = balanceData?.[0]?.balance ?? 0;
      if (currentBalance < cost) {
        return new Response(JSON.stringify({ error: `余额不足，需要${cost}积分，当前${currentBalance}积分`, code: "INSUFFICIENT_BALANCE" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: deductResult, error: deductError } = await supabase.rpc("deduct_balance", { p_user_id: user.id, p_amount: cost, p_operation_type: "translate_image", p_description: "图片翻译" });
      if (deductError || !deductResult?.[0]?.success) {
        return new Response(JSON.stringify({ error: "扣费失败" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let base64Data = imageUrl || "";
      if (imageUrl?.startsWith("data:")) base64Data = imageUrl.replace(/^data:image\/\w+;base64,/, "");

      const replacementInstructions = translations.map((t: any, i: number) => `${i + 1}. Replace "${t.original}" with "${t.translated}" at ${t.position}`).join("\n");

      const apiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: `Edit this image. Replace ALL Chinese text with English.\n${replacementInstructions}\nKeep exact same style, font, color, position. Only change text.` },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } },
            ]}],
          }),
        }
      );

      const rawText = await apiResp.text();
      console.error("Gemini replace status:", apiResp.status, "body:", rawText.substring(0, 500));

      let resultImageUrl = "";
      let generationFailed = false;
      let failureReason = "";

      if (!apiResp.ok) {
        generationFailed = true;
        failureReason = "图片生成失败(" + apiResp.status + ")";
      } else {
        let apiData: any;
        try { apiData = JSON.parse(rawText); } catch { apiData = {}; }
        const part = apiData?.candidates?.[0]?.content?.parts?.[0];
        if (part?.inlineData) {
          resultImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        } else if (part?.text) {
          try { resultImageUrl = JSON.parse(part.text).image_url || ""; } catch { resultImageUrl = part.text; }
        }
        if (!resultImageUrl) { generationFailed = true; failureReason = "AI未返回图片"; }
      }

      if (!generationFailed && resultImageUrl?.startsWith("data:")) {
        try {
          const base64Part = resultImageUrl.split(",")[1];
          const binaryStr = atob(base64Part);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const fileName = `translated/${Date.now()}.png`;
          const uploadResp = await fetch(`${supabaseUrl}/storage/v1/object/generated-images/${fileName}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${supabaseServiceKey}`, "Content-Type": "image/png" },
            body: bytes,
          });
          if (uploadResp.ok) resultImageUrl = `${supabaseUrl}/storage/v1/object/public/generated-images/${fileName}`;
        } catch (e) { console.error("Upload error:", e); }
      }

      if (generationFailed) {
        await supabase.rpc("add_balance", { p_user_id: user.id, p_amount: cost, p_payment_method: "refund", p_notes: "翻译失败退款" });
        return new Response(JSON.stringify({ error: failureReason }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ imageUrl: resultImageUrl }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "未知步骤: " + step }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    console.error("translate-image error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
