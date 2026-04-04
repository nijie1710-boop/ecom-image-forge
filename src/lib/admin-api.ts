import { supabase } from "@/integrations/supabase/client";

export async function callAdminApi(body: Record<string, unknown>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { data, error } = await supabase.functions.invoke("admin-users", {
    body,
    headers: {
      "x-admin-email": session?.user?.email || "",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });

  if (error) {
    const context = (error as Error & { context?: Response }).context;
    if (context) {
      try {
        const payload = await context.json();
        throw new Error(payload?.error || error.message || "管理员请求失败，请稍后重试。");
      } catch {
        throw new Error(error.message || "管理员请求失败，请稍后重试。");
      }
    }
    throw new Error(error.message || "管理员请求失败，请稍后重试。");
  }

  if (data?.error) {
    throw new Error(String(data.error));
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
