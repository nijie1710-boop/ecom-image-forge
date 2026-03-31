import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Google Gemini 直连
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ========== 1. 用户认证（支持 DISABLE_AUTH 绕过） ==========
    const DISABLE_AUTH = Deno.env.get("DISABLE_AUTH") === "true";
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let userId: string | null = null;

    if (!DISABLE_AUTH) {
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "未授权，请先登录" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "认证失败，请重新登录" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    } else {
      // DISABLE_AUTH 模式：从 JWT payload 直接拿 userId
      if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "");
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          userId = payload.sub || payload.user_id || null;
        } catch {}
      }
    }

    const { imageBase64, platform, language } = await req.json();
    const cost = 1; // 文案生成扣1积分

    // ========== 2. 余额预校验 ==========
    const { data: balanceData, error: balanceError } = await supabase.rpc("get_user_balance", {
      p_user_id: userId,
    });
    if (balanceError) {
      return new Response(JSON.stringify({ error: "余额查询失败" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const currentBalance = balanceData?.[0]?.balance ?? 0;
    if (currentBalance < cost) {
      return new Response(JSON.stringify({
        error: `余额不足，需要${cost}积分，当前余额${currentBalance}积分，请先充值`,
        code: "INSUFFICIENT_BALANCE",
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 预扣费
    const { data: deductResult, error: deductError } = await supabase.rpc("deduct_balance", {
      p_user_id: userId,
      p_amount: cost,
      p_operation_type: "generate_copy",
      p_description: "生成电商文案",
    });
    if (deductError || !deductResult?.[0]?.success) {
      return new Response(JSON.stringify({ error: "扣费失败，请稍后重试" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const platformPrompts: Record<string, string> = {
      '淘宝/天猫': `淘宝/天猫风格，突出"正品保证"、"限时特惠"、"包邮"。标题带【天猫】前缀。`,
      '京东': `京东风格，突出"京东自营"、"次日达"、"品质保障"。标题带【京东】前缀。`,
      '拼多多': `拼多多风格，突出"工厂价"、"百亿补贴"、"拼团优惠"。标题带【拼多多特惠】前缀。`,
      '抖音': `抖音电商风格，突出"网红同款"、"直播间秒杀"、"限时福利"。标题带【抖音爆款】前缀。`,
      '小红书': `小红书种草风格，语气亲切活泼，多用emoji。标题带emoji和感叹号。`,
      '快手': `快手电商风格，突出"老铁推荐"、"厂家直供"、"性价比之王"。标题带【快手严选】前缀。`,
    };

    const platformStyle = platformPrompts[platform] || platformPrompts['淘宝/天猫'];
    const langInstruction = language === 'en'
      ? 'Output ALL fields in English. Use professional e-commerce marketing English, not literal translation.'
      : '所有字段使用中文输出。';

    const systemPrompt = `你是专业电商产品分析师和文案专家。分析产品图片，识别产品类型、材质、颜色、设计特点，深度挖掘卖点，生成文案。
${platformStyle}
${langInstruction}

严格按以下JSON格式返回（不要包含markdown代码块标记）：
{
  "productName": "产品名称",
  "title": "标题（30字以内）",
  "desc": "描述文案（100-200字）",
  "sellingPoints": ["卖点1", "卖点2", "卖点3", "卖点4", "卖点5"],
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "targetAudience": "目标人群",
  "priceRange": "建议定价区间"
}`;

    let content = "";
    let generationFailed = false;
    let failureReason = "";

    // ========== 使用 Google Gemini ==========
    if (!GEMINI_API_KEY) {
      await supabase.rpc("add_balance", {
        p_user_id: userId, p_amount: cost, p_payment_method: "refund", p_notes: "文案生成失败：无可用AI密钥",
      });
      return new Response(JSON.stringify({ error: "AI 服务未配置，请联系管理员" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      const apiResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/nano-banana-pro-preview:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: systemPrompt },
                { inlineData: { mimeType: "image/jpeg", data: imageBase64.replace("data:image/jpeg;base64,", "").replace("data:image/png;base64,", "") } },
                { text: `分析这张产品图片，生成适合${platform}平台的电商文案。` },
              ]
            }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
      );
      if (!apiResp.ok) {
        const errText = await apiResp.text();
        console.error("Gemini API error:", apiResp.status, errText);
        generationFailed = true;
        failureReason = "AI 服务暂时不可用";
      } else {
        const apiData = await apiResp.json();
        content = apiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        if (!content) {
          generationFailed = true;
          failureReason = "AI 未返回有效内容";
        }
      }
    } catch (e: any) {
      generationFailed = true;
      failureReason = e.message || "调用 AI 失败";
    }

    // ========== 解析结果 ==========
    if (generationFailed) {
      // 退还积分
      await supabase.rpc("add_balance", {
        p_user_id: userId, p_amount: cost, p_payment_method: "refund", p_notes: `文案生成失败退款：${failureReason}`,
      });
      return new Response(JSON.stringify({ error: failureReason }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
    }

    // Fallback
    return new Response(JSON.stringify({
      productName: "产品",
      title: "优质产品推荐",
      desc: content.substring(0, 500),
      sellingPoints: ["优质产品"],
      tags: ["电商", "推荐"],
      targetAudience: "广大消费者",
      priceRange: "根据市场定价",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
