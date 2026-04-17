/**
 * Unified API client.
 *
 * When VITE_API_URL is set, all calls go to the self-hosted Express backend.
 * Otherwise, falls back to the Supabase Edge Functions.
 */

const SELF_HOSTED_API_URL = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

/** True when self-hosted backend is configured */
export const isSelfHosted = Boolean(SELF_HOSTED_API_URL);

// ─── Token helpers ─────────────────────────────────────────────

const TOKEN_KEY = "picspark_token";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch { /* ignore */ }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}

// ─── API URL builder ───────────────────────────────────────────

/**
 * Build the full URL for an API endpoint.
 * Self-hosted:  /api/generate-image (same-origin; Vercel rewrites proxy to HK backend)
 * Supabase:     SUPABASE_URL/functions/v1/generate-image
 *
 * Using same-origin relative paths avoids SSL/CORS issues with api-staging.picspark.cn
 * and leverages Vercel's existing rewrites:
 *   - prod:    /api/* -> 101.32.186.47/api/*
 *   - staging: /api/* -> 101.32.186.47/staging-api/*
 */
export function buildApiUrl(functionName: string): string {
  if (SELF_HOSTED_API_URL) {
    return `/api/${functionName}`;
  }
  // Supabase fallback
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

// ─── Auth header builder ───────────────────────────────────────

/**
 * Get headers for API calls.
 * Self-hosted: uses JWT from localStorage.
 * Supabase:    uses session token from Supabase auth.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  if (SELF_HOSTED_API_URL) {
    const token = getStoredToken();
    if (!token) throw new Error("UNAUTHORIZED");
    return { Authorization: `Bearer ${token}` };
  }

  // Supabase fallback
  const { supabase, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("UNAUTHORIZED");
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${session.access_token}`,
  };
}

/**
 * Get optional auth headers (no throw if not logged in).
 */
export async function getOptionalAuthHeaders(): Promise<Record<string, string>> {
  if (SELF_HOSTED_API_URL) {
    const token = getStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const { supabase, SUPABASE_PUBLISHABLE_KEY } = await import("@/integrations/supabase/client");
  const { data: { session } } = await supabase.auth.getSession();
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  };
}

// ─── Generic fetch helpers ─────────────────────────────────────

export interface ApiResponse<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T | null;
  rawText: string;
}

/**
 * POST to an API function with auth.
 */
export async function apiPost<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>,
  options?: { auth?: "required" | "optional"; signal?: AbortSignal },
): Promise<ApiResponse<T>> {
  const auth = options?.auth ?? "required";
  const headers = auth === "required"
    ? await getAuthHeaders()
    : await getOptionalAuthHeaders();

  const url = buildApiUrl(functionName);
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: options?.signal,
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      data: null,
      rawText: err instanceof Error ? err.message : String(err),
    };
  }

  const rawText = await response.text();
  let data: T | null = null;
  try {
    data = rawText ? (JSON.parse(rawText) as T) : null;
  } catch {
    data = null;
  }

  return { ok: response.ok, status: response.status, data, rawText };
}

// ─── Self-hosted auth APIs ─────────────────────────────────────

export interface SelfHostedUser {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  is_admin?: boolean;
}

export interface AuthResult {
  user: SelfHostedUser;
  access_token: string;
}

export async function selfHostedLogin(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(buildApiUrl("auth/login"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "登录失败");
  setStoredToken(data.access_token);
  return data;
}

export async function selfHostedRegister(
  email: string,
  password: string,
  displayName?: string,
): Promise<AuthResult> {
  const res = await fetch(buildApiUrl("auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, displayName }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "注册失败");
  setStoredToken(data.access_token);
  return data;
}

export async function selfHostedGetMe(): Promise<SelfHostedUser | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch(buildApiUrl("auth/me"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      // Only clear token on 401 (actual auth failure / expired token)
      // Do NOT clear on 500/502/504 etc. — those are transient server errors
      if (res.status === 401) {
        clearStoredToken();
      }
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

export async function selfHostedSignOut() {
  clearStoredToken();
}

export async function selfHostedResetRequest(email: string): Promise<{ success: boolean; message: string }> {
  const res = await fetch(buildApiUrl("auth/reset-request"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "发送验证码失败");
  return data;
}

export async function selfHostedResetPassword(
  email: string,
  code: string,
  password: string,
): Promise<{ success: boolean; message: string }> {
  const res = await fetch(buildApiUrl("auth/reset-password"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "重置密码失败");
  return data;
}

// ─── Image upload helper ──────────────────────────────────────

/**
 * Upload a base64 image to the self-hosted backend.
 * Returns the public URL for the stored file.
 */
export async function uploadImageToServer(
  imageData: string,
  folder = "images",
): Promise<string> {
  const headers = await getAuthHeaders();
  const url = buildApiUrl("upload-image");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ imageData, folder }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed: ${text}`);
  }

  const data = await res.json();
  // Return relative /uploads/* path. Vercel rewrites handle routing:
  //   - prod:    /uploads/* -> 101.32.186.47/uploads/*
  //   - staging: /uploads/* -> 101.32.186.47/staging-uploads/*
  // Same-origin requests avoid SSL/CORS issues with api-staging.picspark.cn.
  if (data.url.startsWith("/uploads/")) {
    return data.url;
  }
  if (data.url.startsWith("/")) {
    return `${SELF_HOSTED_API_URL}${data.url}`;
  }
  return data.url;
}
