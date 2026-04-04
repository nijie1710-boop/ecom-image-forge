import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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
    return "已完成";
  }
  if ((amount || 0) > 0) {
    return "已补发";
  }
  return "已记录";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "未授权" }, 401);
    }

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return json({ error: "无管理员权限" }, 403);
    }

    const { action, userId, amount, notes } = await req.json();

    switch (action) {
      case "list_users": {
        const { data: balances, error } = await supabase
          .from("user_balances")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;

        const {
          data: { users: authUsers },
          error: usersError,
        } = await supabase.auth.admin.listUsers();
        if (usersError) throw usersError;

        const userMap = new Map(authUsers.map((item) => [item.id, item]));
        const result = (balances || []).map((balance) => {
          const authUser = userMap.get(balance.user_id);
          return {
            ...balance,
            email: authUser?.email || "未知",
            created_at_auth: authUser?.created_at,
          };
        });

        for (const authUser of authUsers) {
          if (!balances?.find((balance) => balance.user_id === authUser.id)) {
            result.push({
              user_id: authUser.id,
              balance: 0,
              total_recharged: 0,
              total_consumed: 0,
              email: authUser.email || "未知",
              created_at: authUser.created_at,
              created_at_auth: authUser.created_at,
              id: null,
              updated_at: null,
            });
          }
        }

        return json({ users: result });
      }

      case "list_tasks": {
        const { data: records, error } = await supabase
          .from("consumption_records")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;

        const {
          data: { users: authUsers },
          error: usersError,
        } = await supabase.auth.admin.listUsers();
        if (usersError) throw usersError;

        const userMap = new Map(authUsers.map((item) => [item.id, item]));
        const tasks = (records || []).map((record: any) => {
          const authUser = userMap.get(record.user_id);
          return {
            id: record.id,
            user_id: record.user_id,
            email: authUser?.email || "未知",
            amount: Number(record.amount || 0),
            credits: Math.abs(Number(record.amount || 0)),
            operation_type: record.operation_type || "unknown",
            task_type: mapTaskType(record.operation_type),
            status: mapTaskStatus(record.operation_type, Number(record.amount || 0), record.description),
            description: record.description || "",
            created_at: record.created_at,
            related_record_id: record.related_record_id || null,
          };
        });

        return json({ tasks });
      }

      case "list_images": {
        const { data: images, error } = await supabase
          .from("generated_images")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;

        const {
          data: { users: authUsers },
          error: usersError,
        } = await supabase.auth.admin.listUsers();
        if (usersError) throw usersError;

        const userMap = new Map(authUsers.map((item) => [item.id, item]));
        const result = (images || []).map((image: any) => {
          const authUser = userMap.get(image.user_id);
          return {
            ...image,
            email: authUser?.email || "未知",
          };
        });

        return json({ images: result });
      }

      case "delete_image": {
        if (!userId) {
          return json({ error: "缺少图片 ID" }, 400);
        }

        const { error } = await supabase.from("generated_images").delete().eq("id", userId);
        if (error) throw error;

        return json({ success: true });
      }

      case "add_credits": {
        if (!userId || !amount || amount <= 0) {
          return json({ error: "参数错误" }, 400);
        }

        const { data, error } = await supabase.rpc("add_balance", {
          p_user_id: userId,
          p_amount: amount,
          p_payment_method: "admin_manual",
          p_notes: notes || "管理员手动充值",
        });
        if (error) throw error;

        return json({ result: data[0] });
      }

      default:
        return json({ error: "未知操作" }, 400);
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "管理员请求失败" }, 500);
  }
});
