import { supabase } from "@/integrations/supabase/client";

function normalizeAdminErrorMessage(message?: string) {
  const text = String(message || "").trim();
  if (!text) return "管理员请求失败，请稍后重试。";

  if (text.includes("not admin") || text.includes("没有管理员权限")) {
    return "当前账号没有管理员权限，请重新登录后再试。";
  }
  if (text.includes("JWT") || text.includes("session") || text.includes("登录")) {
    return "登录状态已失效，请重新登录后再进入后台。";
  }
  return text;
}

export async function callAdminApi(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("登录状态已失效，请重新登录后再进入后台。");
  }

  const { data, error } = await supabase.functions.invoke("admin-users", {
    body,
  });

  if (error) {
    const response = (error as Error & { context?: Response }).context;
    if (response) {
      try {
        const payload = await response.json();
        throw new Error(normalizeAdminErrorMessage(payload?.error || error.message));
      } catch {
        throw new Error(normalizeAdminErrorMessage(error.message));
      }
    }
    throw new Error(normalizeAdminErrorMessage(error.message));
  }

  if (data?.error) {
    throw new Error(normalizeAdminErrorMessage(String(data.error)));
  }

  return data;
}

export interface UserWithBalance {
  user_id: string;
  email: string;
  balance: number;
  total_recharged: number;
  total_consumed: number;
  created_at: string;
  created_at_auth?: string;
}

export interface AdminTask {
  id: string;
  user_id: string;
  email: string;
  amount: number;
  credits: number;
  operation_type: string;
  task_type: string;
  status: string;
  description: string;
  created_at: string;
  related_record_id?: string | null;
}

export interface AdminImage {
  id: string;
  user_id: string;
  email: string;
  image_url: string;
  prompt?: string | null;
  image_type?: string | null;
  style?: string | null;
  scene?: string | null;
  aspect_ratio?: string | null;
  status?: string | null;
  created_at: string;
}
