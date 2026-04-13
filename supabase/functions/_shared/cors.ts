/**
 * Shared CORS helpers for all Supabase Edge Functions.
 *
 * Allowed origins are read from the ALLOWED_ORIGINS env var (comma-separated).
 * Fallback includes the production domains and common local dev ports.
 */

const ENV_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);

const DEFAULT_ORIGINS = [
  "https://picspark.cn",
  "https://www.picspark.cn",
  "http://localhost:8080",
  "http://localhost:5173",
  "http://localhost:3000",
];

const ALLOWED_ORIGINS = new Set([...DEFAULT_ORIGINS, ...ENV_ORIGINS]);

/** Check if an origin from the Vercel preview pattern should be allowed. */
function isVercelPreview(origin: string) {
  return /^https:\/\/ecom-image-forge[a-z0-9-]*\.vercel\.app$/.test(origin);
}

export function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("origin") || "";
  if (ALLOWED_ORIGINS.has(origin) || isVercelPreview(origin)) {
    return origin;
  }
  return "";
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = getAllowedOrigin(req);
  if (!origin) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

export function handleOptions(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
