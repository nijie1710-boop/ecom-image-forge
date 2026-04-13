import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleOptions } from "../_shared/cors.ts";


let _currentReq: Request | undefined;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...(_currentReq ? corsHeaders(_currentReq) : {}),
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
  if ((amount || 0) < 0) return "已消耗";
  if ((amount || 0) > 0) return "已补充";
  return "已记录";
}

function getDefaultSettings() {
  return {
    generation_defaults: {
      model: "gemini-2.5-flash-image",
      aspectRatio: "3:4",
      resolution: "1k",
      imageCount: 1,
    },
    detail_defaults: {
      model: "gemini-3.1-flash-image-preview",
      aspectRatio: "3:4",
      resolution: "2k",
      screenCount: 4,
    },
    translation_defaults: {
      targetLanguage: "en",
      batchLimit: 8,
      renderMode: "stable",
    },
    feature_flags: {
      enableAdminRetry: true,
      enableDetailDesign: true,
      enableImageTranslation: true,
      enableNanoBananaPro: true,
    },
    operations: {
      lowBalanceThreshold: 3,
      imageRetentionDays: 30,
    },
    recharge_packages: [
      { id: "starter", label: "体验包", price: 19.9, credits: 200, badge: "适合试用", highlight: false },
      { id: "growth", label: "常用包", price: 49.9, credits: 520, badge: "推荐", highlight: true },
      { id: "pro", label: "进阶包", price: 99, credits: 1080, badge: "更省单价", highlight: false },
      { id: "business", label: "商用包", price: 199, credits: 2280, badge: "高频创作", highlight: false },
    ],
    credit_rules: {
      generation: {
        nanoBanana: 5,
        nanoBanana2: 7,
        nanoBananaPro: 12,
      },
      detail: {
        planning: 2,
        nanoBanana: 6,
        nanoBanana2: 8,
        nanoBananaPro: 14,
      },
      translation: {
        basic: 4,
        refined: 6,
      },
    },
  };
}

async function resolveCurrentUser(
  supabase: ReturnType<typeof createClient>,
  req: Request,
) {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return { currentUser: null, isAdmin: false };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(token);

  if (authError || !user?.id) {
    console.warn("admin-users auth validation failed:", authError);
    return { currentUser: null, isAdmin: false };
  }

  const ADMIN_EMAIL_ALLOWLIST = ["nijie1710@gmail.com"];

  const currentUser = {
    id: user.id,
    email: user.email?.toLowerCase() || null,
  };

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", currentUser.id)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    console.error("load admin role failed:", error);
    // 数据库查询失败时，用邮箱兜底
    const normalizedEmail = currentUser.email?.toLowerCase();
    return { currentUser, isAdmin: Boolean(normalizedEmail && ADMIN_EMAIL_ALLOWLIST.includes(normalizedEmail)) };
  }

  return { currentUser, isAdmin: Boolean(data) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleOptions(req);
  }

  _currentReq = req;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ error: "后台服务配置缺失，请检查 Supabase 环境变量。" }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { currentUser, isAdmin } = await resolveCurrentUser(supabase, req);

    if (!isAdmin) {
      return json({ error: "当前账号没有管理员权限，请重新登录后再试。" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const VALID_ACTIONS = [
      "list_users", "list_tasks", "list_images", "delete_image",
      "delete_images", "add_credits", "get_settings", "save_settings",
    ];
    const action = typeof body.action === "string" ? body.action : "";
    if (!VALID_ACTIONS.includes(action)) {
      return json({ error: "未知后台操作。" }, 400);
    }
    const userId = typeof body.userId === "string" ? body.userId : "";
    const imageIds = Array.isArray(body.imageIds)
      ? body.imageIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const rawAmount = typeof body.amount === "number" ? body.amount : Number(body.amount || 0);
    const amount = Number.isFinite(rawAmount) && rawAmount > 0 && rawAmount <= 999999 ? rawAmount : 0;
    const notes = typeof body.notes === "string" ? body.notes.slice(0, 500) : "";

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

        const { data: images, error: imagesError } = await supabase
          .from("generated_images")
          .select("id,user_id,image_url,prompt,image_type,style,scene,aspect_ratio,task_kind,created_at")
          .order("created_at", { ascending: false })
          .limit(500);
        if (imagesError) throw imagesError;

        const userMap = new Map(authUsers.map((item) => [item.id, item]));
        const tasks = (records || []).map((record: any) => {
          const authUser = userMap.get(record.user_id);
          const taskCreatedAt = record.created_at ? new Date(record.created_at).getTime() : 0;
          const retryImage =
            record.operation_type === "generate_image"
              ? (images || [])
                  .filter((image: any) => image.user_id === record.user_id)
                  .map((image: any) => ({
                    ...image,
                    distance: Math.abs(new Date(image.created_at).getTime() - taskCreatedAt),
                  }))
                  .filter((image: any) => image.distance <= 2 * 60 * 60 * 1000)
                  .sort((a: any, b: any) => a.distance - b.distance)[0]
              : null;

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
            retry_supported: Boolean(retryImage?.image_url),
            retry_image_url: retryImage?.image_url || null,
            retry_prompt: retryImage?.prompt || null,
            retry_image_type: retryImage?.image_type || null,
            retry_aspect_ratio: retryImage?.aspect_ratio || null,
            retry_style: retryImage?.style || null,
            retry_scene: retryImage?.scene || null,
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

      case "delete_images": {
        if (!imageIds.length) {
          return json({ error: "请选择至少一张图片。" }, 400);
        }

        const { error: deleteError } = await supabase.from("generated_images").delete().in("id", imageIds);
        if (deleteError) throw deleteError;

        return json({ success: true, deleted: imageIds.length });
      }

      case "add_credits": {
        if (!userId || !amount || amount <= 0) {
          return json({ error: "充值参数不正确。" }, 400);
        }

        const { data: rechargeResult, error: rechargeError } = await supabase.rpc("add_balance", {
          p_user_id: userId,
          p_amount: amount,
          p_payment_method: "admin_manual",
          p_notes: notes || "管理员手动补充积分",
        });
        if (rechargeError) throw rechargeError;

        const nextBalance = Array.isArray(rechargeResult)
          ? Number(rechargeResult[0]?.new_balance || 0)
          : Number((rechargeResult as { new_balance?: number } | null)?.new_balance || 0);

        return json({ result: { new_balance: nextBalance } });
      }

      case "get_settings": {
        const defaults = getDefaultSettings();
        const { data: rows, error: settingsError } = await supabase
          .from("admin_settings")
          .select("key,value,updated_at,updated_by");
        if (settingsError) throw settingsError;

        const settings =
          rows?.reduce((acc: Record<string, unknown>, row: any) => {
            acc[row.key] = row.value;
            return acc;
          }, { ...defaults }) || defaults;

        return json({ settings });
      }

      case "save_settings": {
        const settings = body.settings as Record<string, unknown> | undefined;
        if (!settings || typeof settings !== "object") {
          return json({ error: "缺少系统配置内容。" }, 400);
        }

        const entries = Object.entries(settings)
          .filter(([key, value]) => typeof key === "string" && value && typeof value === "object")
          .map(([key, value]) => ({
            key,
            value,
            updated_by: currentUser?.id || null,
            updated_at: new Date().toISOString(),
          }));

        if (!entries.length) {
          return json({ error: "没有可保存的配置项。" }, 400);
        }

        const { error: upsertError } = await supabase.from("admin_settings").upsert(entries, {
          onConflict: "key",
        });
        if (upsertError) throw upsertError;

        return json({ success: true, saved: entries.length });
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
