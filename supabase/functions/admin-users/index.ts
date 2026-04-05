import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-email",
};

const ADMIN_EMAIL_ALLOWLIST = ["nijie1710@gmail.com"];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function mapTaskType(operationType: string | null) {
  switch (operationType) {
    case "generate_image":
      return "AI 生图";
    case "generate_copy":
      return "AI 详情页";
    case "translate_image":
      return "图文翻译";
    case "manual_adjustment":
      return "手动调整";
    default:
      return "其他任务";
  }
}

function mapTaskStatus(operationType: string | null, amount: number | null, description: string | null) {
  if (operationType === "manual_adjustment" && (description || "").includes("退款")) {
    return "已退款";
  }
  if ((amount || 0) < 0) {
    return "已消耗";
  }
  if ((amount || 0) > 0) {
    return "已补充";
  }
  return "已记录";
}

async function isAdmin(supabase: ReturnType<typeof createClient>, userId: string, email?: string | null) {
  const normalizedEmail = email?.toLowerCase();
  if (normalizedEmail && ADMIN_EMAIL_ALLOWLIST.includes(normalizedEmail)) {
    return true;
  }

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    console.error("load admin role failed:", error);
    return false;
  }

  return Boolean(data);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "后台服务配置缺失，请检查 Supabase 环境变量。" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const authHeader = req.headers.get("Authorization") || "";
    const adminEmailHeader = (req.headers.get("x-admin-email") || "").trim().toLowerCase();
    const token = authHeader.replace("Bearer ", "").trim();

    let currentUser: { id: string; email?: string | null } | null = null;

    if (token) {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser(token);

      if (!authError && user) {
        currentUser = { id: user.id, email: user.email };
      }
    }

    let admin = false;
    if (currentUser) {
      admin = await isAdmin(supabase, currentUser.id, currentUser.email);
    } else if (adminEmailHeader && ADMIN_EMAIL_ALLOWLIST.includes(adminEmailHeader)) {
      admin = true;
    }

    if (!admin) {
      return json({ error: "当前账号没有管理员权限，请重新登录后再试。" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const userId = typeof body.userId === "string" ? body.userId : "";
    const amount = typeof body.amount === "number" ? body.amount : Number(body.amount || 0);
    const notes = typeof body.notes === "string" ? body.notes : "";

    switch (action) {
      case "list_users": {
        const { data: balances, error: balancesError } = await supabase
          .from("user_balances")
          .select("*")
          .order("created_at", { ascending: false });

        if (balancesError) throw balancesError;

        const {
          data: { users: authUsers },
          error: authUsersError,
        } = await supabase.auth.admin.listUsers();

        if (authUsersError) throw authUsersError;

        const userMap = new Map(authUsers.map((item) => [item.id, item]));
        const results = (balances || []).map((balance: any) => {
          const authUser = userMap.get(balance.user_id);
          return {
            ...balance,
            email: authUser?.email || "未知用户",
            created_at_auth: authUser?.created_at || null,
          };
        });

        for (const authUser of authUsers) {
          if (!results.find((item: any) => item.user_id === authUser.id)) {
            results.push({
              id: null,
              user_id: authUser.id,
              balance: 0,
              total_recharged: 0,
              total_consumed: 0,
              created_at: authUser.created_at,
              updated_at: null,
              email: authUser.email || "未知用户",
              created_at_auth: authUser.created_at,
            });
          }
        }

        return json({ users: results });
      }

      case "list_tasks": {
        const { data: records, error: recordsError } = await supabase
          .from("consumption_records")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);

        if (recordsError) throw recordsError;

        const {
          data: { users: authUsers },
          error: authUsersError,
        } = await supabase.auth.admin.listUsers();

        if (authUsersError) throw authUsersError;

        const userMap = new Map(authUsers.map((item) => [item.id, item]));
        const tasks = (records || []).map((record: any) => {
          const authUser = userMap.get(record.user_id);
          return {
            id: record.id,
            user_id: record.user_id,
            email: authUser?.email || "未知用户",
            amount: Number(record.amount || 0),
            credits: Math.abs(Number(record.amount || 0)),
            operation_type: record.operation_type || "unknown",
            task_type: mapTaskType(record.operation_type),
            status: mapTaskStatus(record.operation_type, Number(record.amount || 0), record.description || ""),
            description: record.description || "",
            created_at: record.created_at,
            related_record_id: record.related_record_id || null,
          };
        });

        return json({ tasks });
      }

      case "list_images": {
        const { data: images, error: imagesError } = await supabase
          .from("generated_images")
          .select("id,user_id,image_url,prompt,image_type,style,scene,aspect_ratio,status,created_at")
          .order("created_at", { ascending: false })
          .limit(200);

        if (imagesError) throw imagesError;

        const {
          data: { users: authUsers },
          error: authUsersError,
        } = await supabase.auth.admin.listUsers();

        if (authUsersError) throw authUsersError;

        const userMap = new Map(authUsers.map((item) => [item.id, item]));
        const results = (images || []).map((image: any) => {
          const authUser = userMap.get(image.user_id);
          return {
            ...image,
            email: authUser?.email || "未知用户",
          };
        });

        return json({ images: results });
      }

      case "delete_image": {
        if (!userId) {
          return json({ error: "缺少图片 ID。" }, 400);
        }

        const { error: deleteError } = await supabase.from("generated_images").delete().eq("id", userId);
        if (deleteError) throw deleteError;

        return json({ success: true });
      }

      case "add_credits": {
        if (!userId || !amount || amount <= 0) {
          return json({ error: "充值参数不正确。" }, 400);
        }

        const { data, error: rpcError } = await supabase.rpc("add_balance", {
          p_user_id: userId,
          p_amount: amount,
          p_payment_method: "admin_manual",
          p_notes: notes || "管理员手动补充积分",
        });

        if (rpcError) throw rpcError;

        return json({ result: Array.isArray(data) ? data[0] : data });
      }

      default:
        return json({ error: "未知后台操作。" }, 400);
    }
  } catch (error) {
    console.error("admin-users failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "管理员请求失败，请稍后重试。",
      },
      500,
    );
  }
});
