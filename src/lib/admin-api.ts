import { supabase } from "@/integrations/supabase/client";

async function getAdminSessionToken() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return session?.access_token || "";
}

export async function callAdminApi(body: Record<string, unknown>) {
  const token = await getAdminSessionToken();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const response = await fetch(`${supabaseUrl}/functions/v1/admin-users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "管理员请求失败");
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
