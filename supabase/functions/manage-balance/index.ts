// Supabase Edge Function: manage-balance
// 积分余额管理 - 支持查询余额、充值扣费操作
//
// 权限规则：
// - get / history：登录用户只能操作自己的数据
// - deduct：登录用户只能扣自己的余额（生成图片时调用）
// - recharge：仅管理员可操作（查询 user_roles 表，role=admin）
//
// 管理员判断：查 user_roles 表，user_id=当前用户.id AND role='admin'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BalanceRequest {
  userId?: string; // 已废弃，前端不应传此字段，否则会被忽略
  action: "get" | "recharge" | "deduct" | "history";
  amount?: number;
  operationType?: string;
  description?: string;
  paymentMethod?: string;
  notes?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 安全检查：拒绝空 Authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "未授权：缺少有效的 Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 验证用户 token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "未授权：用户验证失败" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { action, amount, operationType, description, paymentMethod, notes } = await req.json() as BalanceRequest;

    // ⚠️ 安全核心：所有操作强制使用登录用户的真实 ID，前端传来的 userId 完全忽略
    const targetUserId = user.id;

    // 管理员判断：查 user_roles 表，user_id=当前用户.id AND role='admin'
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleData;

    switch (action) {
      case "get": {
        // 权限：登录用户只能查自己的余额
        const { data, error } = await supabase.rpc("get_user_balance", { p_user_id: targetUserId });
        if (error) throw error;
        return new Response(JSON.stringify({ balance: data[0] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "deduct": {
        // 权限：登录用户只能扣自己的余额（图片生成时由系统自动调用）
        if (!amount || amount <= 0) {
          return new Response(JSON.stringify({ error: "扣费金额必须大于0" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const { data, error } = await supabase.rpc("deduct_balance", {
          p_user_id: targetUserId,
          p_amount: amount,
          p_operation_type: operationType || "generate_image",
          p_description: description,
        });
        if (error) throw error;
        return new Response(JSON.stringify({ result: data[0] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "history": {
        // 权限：登录用户只能查自己的历史记录
        const [recharges, consumptions] = await Promise.all([
          supabase
            .from("recharge_records")
            .select("*")
            .eq("user_id", targetUserId)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("consumption_records")
            .select("*")
            .eq("user_id", targetUserId)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);
        return new Response(JSON.stringify({
          recharges: recharges.data || [],
          consumptions: consumptions.data || [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "recharge": {
        // 权限：仅管理员可操作（查询 user_roles 表判断）
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "权限不足：充值操作仅管理员可用" }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!amount || amount <= 0) {
          return new Response(JSON.stringify({ error: "充值金额必须大于0" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // 管理员可为任意用户充值（此时 targetUserId 仍为自己，实际管理员应传 targetUserId 参数）
        // TODO: 管理员充值时前端应传 userId 参数，这里暂时只能给自己充值
        const { data, error } = await supabase.rpc("add_balance", {
          p_user_id: targetUserId,
          p_amount: amount,
          p_payment_method: paymentMethod,
          p_notes: notes,
        });
        if (error) throw error;
        return new Response(JSON.stringify({ result: data[0] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        return new Response(JSON.stringify({ error: "未知操作" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
