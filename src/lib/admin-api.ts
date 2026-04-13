import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

function normalizeAdminErrorMessage(message?: string) {
  const text = String(message || "").trim();
  if (!text) return "管理员请求失败，请稍后重试。";

  const lower = text.toLowerCase();

  if (lower.includes("not admin") || lower.includes("admin only")) {
    return "当前账号没有管理员权限，请切换管理员账号后再试。";
  }

  if (lower.includes("jwt") || lower.includes("session") || lower.includes("token") || lower.includes("login")) {
    return "登录状态已失效，请重新登录后再进入后台。";
  }

  if (
    lower.includes("failed to send a request to the edge function") ||
    lower.includes("edge function returned a non-2xx status code")
  ) {
    return "后台接口暂时不可用，请刷新页面后重试。";
  }

  return text;
}

async function parseAdminResponse(response: Response) {
  const text = await response.text();

  try {
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return { error: text || response.statusText };
  }
}

async function resolveAdminSession() {
  const {
    data: { session: cachedSession },
  } = await supabase.auth.getSession();

  if (!cachedSession?.user) {
    throw new Error("登录状态已失效，请重新登录后再进入后台。");
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("登录状态已失效，请重新登录后再进入后台。");
  }

  const {
    data: { session: activeSession },
  } = await supabase.auth.getSession();

  const resolvedSession = activeSession || cachedSession;
  if (!resolvedSession?.access_token) {
    throw new Error("登录状态已失效，请重新登录后再进入后台。");
  }

  return resolvedSession;
}

export async function callAdminApi(body: Record<string, unknown>) {
  const session = await resolveAdminSession();

  const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await parseAdminResponse(response);

  if (!response.ok) {
    throw new Error(normalizeAdminErrorMessage(String(data?.error || data?.message || response.statusText)));
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
  retry_supported?: boolean;
  retry_image_url?: string | null;
  retry_prompt?: string | null;
  retry_image_type?: string | null;
  retry_aspect_ratio?: string | null;
  retry_style?: string | null;
  retry_scene?: string | null;
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

export interface AdminSettingsPayload {
  generation_defaults: {
    model: string;
    aspectRatio: string;
    resolution: string;
    imageCount: number;
  };
  detail_defaults: {
    model: string;
    aspectRatio: string;
    resolution: string;
    screenCount: number;
  };
  translation_defaults: {
    targetLanguage: string;
    batchLimit: number;
    renderMode: string;
  };
  feature_flags: {
    enableAdminRetry: boolean;
    enableDetailDesign: boolean;
    enableImageTranslation: boolean;
    enableNanoBananaPro: boolean;
  };
  operations: {
    lowBalanceThreshold: number;
    imageRetentionDays: number;
  };
  recharge_packages: Array<{
    id: string;
    label: string;
    price: number;
    credits: number;
    badge?: string;
    highlight?: boolean;
  }>;
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
