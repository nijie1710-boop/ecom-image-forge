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

type DbErrorLike = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

class AppError extends Error {
  code: string;
  status: number;
  detail?: string;

  constructor(code: string, status: number, message: string, detail?: string) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
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

function jsonError(error: unknown) {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(
          "MANAGE_BALANCE_FAILED",
          500,
          "积分服务请求失败，请稍后再试。",
          error instanceof Error ? error.message : String(error),
        );

  console.error("manage-balance failed:", {
    code: appError.code,
    status: appError.status,
    message: appError.message,
    detail: appError.detail,
  });

  return json(
    {
      error: appError.code,
      message: appError.message,
      detail: appError.detail,
    },
    appError.status,
  );
}

function dbErrorDetail(error: DbErrorLike) {
  return [error.code, error.message, error.details, error.hint]
    .filter(Boolean)
    .join(" | ")
    .slice(0, 800);
}

function classifyDbError(error: DbErrorLike, context: string): AppError {
  const detail = dbErrorDetail(error);
  const text = detail.toLowerCase();

  if (
    error.code === "PGRST203" ||
    text.includes("multiple choices") ||
    text.includes("more than one function") ||
    text.includes("ambiguous")
  ) {
    return new AppError(
      "DATABASE_RPC_AMBIGUOUS",
      500,
      "积分扣费 RPC 存在多个重载版本，PostgREST 无法确定调用哪个函数，请清理旧版 deduct_balance 重载。",
      detail || context,
    );
  }

  if (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    text.includes("could not find the function") ||
    text.includes("function") && text.includes("deduct_balance")
  ) {
    return new AppError(
      "DATABASE_RPC_MISSING",
      500,
      "积分扣费 RPC 缺失或 PostgREST schema 尚未刷新，请同步 staging 数据库 migration。",
      detail || context,
    );
  }

  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    text.includes("relation") && text.includes("does not exist") ||
    text.includes("could not find the table")
  ) {
    return new AppError(
      "DATABASE_TABLE_MISSING",
      500,
      "积分服务依赖的数据表缺失，请同步 staging 数据库 migration。",
      detail || context,
    );
  }

  if (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    text.includes("column") && text.includes("does not exist") ||
    text.includes("could not find") && text.includes("column")
  ) {
    return new AppError(
      "DATABASE_COLUMN_MISSING",
      500,
      "积分服务依赖的数据列缺失，请同步 staging 数据库 migration。",
      detail || context,
    );
  }

  if (
    error.code === "42501" ||
    text.includes("permission denied") ||
    text.includes("row-level security")
  ) {
    return new AppError(
      "DATABASE_PERMISSION_DENIED",
      500,
      "积分服务数据库权限不足，请检查 service role key、RLS policy 和 RPC grant。",
      detail || context,
    );
  }

  return new AppError("DATABASE_QUERY_FAILED", 500, `积分服务数据库查询失败：${context}`, detail);
}

function throwDb(error: DbErrorLike | null | undefined, context: string) {
  if (error) throw classifyDbError(error, context);
}

function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new AppError(
      `${name}_MISSING`,
      500,
      `后端环境变量 ${name} 缺失，请检查 staging Supabase Function secrets。`,
    );
  }
  return value;
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
  const { error } = await supabase.from("user_balances").upsert(
    {
      user_id: userId,
      balance: 0,
      total_recharged: 0,
      total_consumed: 0,
    },
    { onConflict: "user_id", ignoreDuplicates: true },
  );

  throwDb(error, "ensure user_balances row");
}

async function applyRecharge(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  credits: number,
  paymentMethod: string,
  notes?: string,
) {
  if (!credits || credits <= 0) {
    throw new AppError("INVALID_AMOUNT", 400, "充值积分必须大于 0。");
  }

  await ensureBalanceRow(supabase, userId);

  const now = new Date().toISOString();
  const { data: currentBalanceRow, error: currentBalanceError } = await supabase
    .from("user_balances")
    .select("balance,total_recharged")
    .eq("user_id", userId)
    .single();

  throwDb(currentBalanceError, "read current user_balances row");

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

  throwDb(updateBalanceError, "update user_balances for recharge");

  const { error: rechargeInsertError } = await supabase.from("recharge_records").insert({
    user_id: userId,
    amount: credits,
    payment_method: paymentMethod,
    status: "completed",
    notes: notes || "管理员手动补充积分",
    completed_at: now,
  });

  throwDb(rechargeInsertError, "insert recharge_records");

  return nextBalance;
}

async function getPricingSettings(supabase: ReturnType<typeof createClient>) {
  const defaults = getDefaultPricing();
  const { data: rows, error } = await supabase
    .from("admin_settings")
    .select("key,value")
    .in("key", ["recharge_packages", "credit_rules"]);

  throwDb(error, "read admin_settings pricing");

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
    const supabaseUrl = requireEnv("SUPABASE_URL", Deno.env.get("SUPABASE_URL"));
    const supabaseServiceKey = requireEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("UNAUTHORIZED", 401, "未登录，请先登录。");
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new AppError("UNAUTHORIZED", 401, "登录状态无效，请重新登录。", authError?.message);
    }

    const body = (await req.json().catch(() => ({}))) as BalanceRequest;
    const { action, amount, operationType, description, paymentMethod, notes } = body;
    const targetUserId = body.userId || user.id;

    if (!action) {
      throw new AppError("INVALID_ACTION", 400, "缺少积分操作类型。");
    }

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    throwDb(roleError, "read user_roles admin role");
    const isAdmin = !!roleData;

    switch (action) {
      case "get": {
        await ensureBalanceRow(supabase, user.id);
        const { data, error } = await supabase
          .from("user_balances")
          .select("balance,total_recharged,total_consumed")
          .eq("user_id", user.id)
          .maybeSingle();
        throwDb(error, "read user_balances");

        const { count: rechargeCount, error: rechargeCountError } = await supabase
          .from("recharge_records")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);
        throwDb(rechargeCountError, "count recharge_records");

        const { count: consumptionCount, error: consumptionCountError } = await supabase
          .from("consumption_records")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id);
        throwDb(consumptionCountError, "count consumption_records");

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
            error: "PAYMENT_MOVED_TO_ALIPAY",
            message: "当前充值已切换为支付宝网页支付，请从充值页发起支付。",
          },
          410,
        );
      }

      case "deduct": {
        if (!amount || amount <= 0) {
          throw new AppError("INVALID_AMOUNT", 400, "扣费积分必须大于 0。");
        }

        const { data, error } = await supabase.rpc("deduct_balance", {
          p_user_id: user.id,
          p_amount: amount,
          p_operation_type: operationType || "generate_image",
          p_description: description,
        });

        throwDb(error, "call deduct_balance RPC");
        return json({ result: Array.isArray(data) ? data[0] : data });
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

        throwDb(recharges.error, "read recharge_records history");
        throwDb(consumptions.error, "read consumption_records history");

        return json({
          recharges: recharges.data || [],
          consumptions: consumptions.data || [],
        });
      }

      case "recharge": {
        if (!isAdmin) {
          throw new AppError("FORBIDDEN", 403, "权限不足，当前账号不能手动充值。");
        }

        if (!amount || amount <= 0) {
          throw new AppError("INVALID_AMOUNT", 400, "充值积分必须大于 0。");
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
        throw new AppError("INVALID_ACTION", 400, `未知积分操作：${action}`);
    }
  } catch (error) {
    return jsonError(error);
  }
});
