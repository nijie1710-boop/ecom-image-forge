function requireFrontendEnv(name: string, value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(
      `Missing required frontend environment variable: ${name}. Configure it separately for Production and Preview/Staging.`,
    );
  }
  return normalized;
}

function requireUrlEnv(name: string, value: unknown): string {
  const normalized = requireFrontendEnv(name, value);
  try {
    return new URL(normalized).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`Invalid frontend environment variable: ${name} must be a valid URL.`);
  }
}

export const SUPABASE_URL = requireUrlEnv("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL);
export const SUPABASE_PUBLISHABLE_KEY = requireFrontendEnv(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);
export const SUPABASE_HOST = new URL(SUPABASE_URL).host;

export function requireFrontendAppUrl(): string {
  return requireUrlEnv("VITE_APP_URL", import.meta.env.VITE_APP_URL);
}

if (typeof console !== "undefined") {
  console.info(`[env] Supabase host: ${SUPABASE_HOST}`);
}
