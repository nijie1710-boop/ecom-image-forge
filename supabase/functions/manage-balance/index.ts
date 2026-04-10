import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type BalanceAction =
  | "get"
  | "history"
  | "deduct"
  | "recharge"
  | "get_pricing"
  | "purchase_package";

interface BalanceRequest {
  action: BalanceAction;
  userId?: string;
  amount?: number;
  operationType?: string;
  description?: string;
  paymentMethod?: string;
  notes?: string;
}

interface RechargePackage {
  id: string;
  label: string;
  price: number;
  credits: number;
  badge?: string;
  highlight?: boolean;
}

interface PricingDefaults {
  recharge_packages: RechargePackage[];
  credit_rules: {
    generation: {
      nanoBanana: number;
      nanoBanana2: number;
      nanoBananaPro: number;
    };
    detail: {
      planning: number;
      nanoBanana: number;
      nanoBanana2_05k: number;
      nanoBanana2_1k: number;
      nanoBanana2_2k: number;
      nanoBanana2_4k: number;
      nanoBananaPro_1k: number;
      nanoBananaPro_2k: number;
      nanoBananaPro_4k: number;
    };
    translation: {
      basic: number;
      refined: number;
    };
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getDefaultPricing(): PricingDefaults {
  return {
    recharge_packages: [
      { id: "starter", label: "体验包", price: 19.9, credits: 200, badge: "适合试用" },
      { id: "growth", label: "常用包", price: 49.9, credits: 520, badge: "推荐", highlight: true },
      { id: "pro", label: "进阶包", price: 99, credits: 1080, badge: "单价更省" },
      { id: "business", label: "商用包", price: 199, credits: 2280, badge: "高频创作" },
    ],
    credit_rules: {
      generation: {
        nanoBanana: 5,
        nanoBanana2: 7,
        nanoBananaPro: 12,
      },
      detail: {
        planning: 1,
        nanoBanana: 7,
        nanoBanana2_05k: 7,
        nanoBanana2_1k: 9,
        nanoBanana2_2k: 14,
        nanoBanana2_4k: 18,
        nanoBananaPro_1k: 14,
        nanoBananaPro_2k: 16,
        nanoBananaPro_4k: 30,
      },
      translation: {
        basic: 4,
        refined: 6,
      },
    },
  };
}

async function ensureBalanceRow(supabase: ReturnType<typeof createClient>, userId: string) {
  const { error } = await supabase.from("user_balances").insert({
    user_id: userId,
    balance: 0,
    total_recharged: 0,
    total_consumed: 0,
  });

  if (error && !String(error.message || "").includes("duplicate key")) {
    throw error;
  }
}

async function applyRecharge(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  credits: number,
  paymentMethod: string,
  notes?: string,
) {
  if (!credits || credits <= 0) {
    throw new Error("充值积分必须大于 0");
  }

  await ensureBalanceRow(supabase, userId);

  const now = new Date().toISOString();
  const { data: currentBalanceRow, error: currentBalanceError } = await supabase
    .from("user_balances")
    .select("balance,total_recharged")
    .eq("user_id", userId)
    .single();

  if (currentBalanceError) throw currentBalanceError;

  const nextBalance = Number(currentBalanceRow.balance || 0) + credits;
  const nextRecharged = Number(currentBalanceRow.total_recharged || 0) + credits;

  const { error: updateBalanceError } = await supabase
    .from("user_balances")
    .update({
      balance: nextBalance,
      total_recharged: nextRecharged,
      updated_at: now,
    })
    .eq("user_id", userId);

  if (updateBalanceError) throw updateBalanceError;

  const { error: rechargeInsertError } = await supabase.from("recharge_records").insert({
    user_id: userId,
    amount: credits,
    payment_method: paymentMethod,
    status: "completed",
    notes: notes || "管理员手动补充积分",
    completed_at: now,
  });

  if (rechargeInsertError) throw rechargeInsertError;

  return nextBalance;
}

async function getPricingSettings(supabase: ReturnType<typeof createClient>) {
  const defaults = getDefaultPricing();
  const { data: rows, error } = await supabase
    .from("admin_settings")
    .select("key,value")
    .in("key", ["recharge_packages", "credit_rules"]);

  if (error) throw error;

  const settings =
    rows?.reduce((acc: Record<string, unknown>, row: { key: string; value: unknown }) => {
      acc[row.key] = row.value;
      return acc;
    }, { ...defaults }) || defaults;

  return {
    packages: (settings.recharge_packages as RechargePackage[] | undefined) || defaults.recharge_packages,
    creditRules: settings.credit_rules || defaults.credit_rules,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      return json({ error: "系统配置缺失，请联系管理员" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return json({ error: "未登录，请先登录" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "未登录，请先登录" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as BalanceRequest;
    const { action, amount, operationType, description, paymentMethod, notes } = body;
    const targetUserId = body.userId || user.id;

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleData;

    switch (action) {
      case "get": {
        await ensureBalanceRow(supabase, user.id);
        const { data, error } = await supabase
          .from("user_balances")
          .select("balance,total_recharged,total_consumed")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;

        const { count: rechargeCount, error: rechargeCountError } = await supabase
          .from("recharge_records")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (rechargeCountError) throw rechargeCountError;

        const { count: consumptionCount, error: consumptionCountError } = await supabase
          .from("consumption_records")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);
        if (consumptionCountError) throw consumptionCountError;

        return json({
          balance: {
            balance: Number(data?.balance || 0),
            total_recharged: Number(data?.total_recharged || 0),
            total_consumed: Number(data?.total_consumed || 0),
            recharge_count: Number(rechargeCount || 0),
            consumption_count: Number(consumptionCount || 0),
          },
        });
      }

      case "get_pricing": {
        const pricing = await getPricingSettings(supabase);
        return json(pricing);
      }

      case "purchase_package": {
        return json(
          {
            error: "当前充值已切换为支付宝网站支付，请从充值页发起支付，支付成功后系统会自动加积分。",
          },
          410,
        );
      }

      case "deduct": {
        if (!amount || amount <= 0) {
          return json({ error: "扣费积分必须大于 0" }, 400);
        }

        const { data, error } = await supabase.rpc("deduct_balance", {
          p_user_id: user.id,
          p_amount: amount,
          p_operation_type: operationType || "generate_image",
          p_description: description,
        });

        if (error) throw error;
        return json({ result: data?.[0] });
      }

      case "history": {
        const [recharges, consumptions] = await Promise.all([
          supabase
            .from("recharge_records")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50),
          supabase
            .from("consumption_records")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(50),
        ]);

        if (recharges.error) throw recharges.error;
        if (consumptions.error) throw consumptions.error;

        return json({
          recharges: recharges.data || [],
          consumptions: consumptions.data || [],
        });
      }

      case "recharge": {
        if (!isAdmin) {
          return json({ error: "权限不足，当前账户不能手动充值。" }, 403);
        }

        if (!amount || amount <= 0) {
          return json({ error: "充值积分必须大于 0" }, 400);
        }

        const newBalance = await applyRecharge(
          supabase,
          targetUserId,
          Number(amount),
          paymentMethod || "admin_manual",
          notes || "管理员手动补充积分",
        );

        return json({ result: { new_balance: newBalance } });
      }

      default:
        return json({ error: "未知操作" }, 400);
    }
  } catch (error) {
    console.error("manage-balance failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "当前请求失败，请稍后再试",
      },
      500,
    );
  }
});
