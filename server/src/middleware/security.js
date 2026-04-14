import rateLimit from "express-rate-limit";

// ── Rate Limiters ────────────────────────────────────────────────

/** Auth endpoints: 15 requests per minute per IP */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1 minute
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "请求过于频繁，请 1 分钟后再试" },
});

/** Alipay notify: 60 requests per minute per IP (Alipay retries) */
export const alipayNotifyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: "fail",
});

/** General API: 120 requests per minute per IP */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_REQUESTS", message: "请求过于频繁，请稍后再试" },
});

// ── Security Headers (lightweight, no extra dependency) ─────────

/**
 * Middleware that sets essential security headers.
 * Covers CSP, X-Frame, X-Content-Type, HSTS, Referrer-Policy, Permissions-Policy.
 */
export function securityHeaders(_req, res, next) {
  // Content-Security-Policy — restrict resource origins
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src  'self'",
      "style-src   'self' 'unsafe-inline'",            // Tailwind inline styles
      "img-src     'self' data: blob: https:",          // allow remote images
      "font-src    'self' https://fonts.gstatic.com",
      "connect-src 'self' https://api.picspark.cn https://*.supabase.co",
      "frame-ancestors 'none'",                         // block iframe embedding
    ].join("; "),
  );

  // Prevent clickjacking
  res.setHeader("X-Frame-Options", "DENY");

  // Prevent MIME-type sniffing
  res.setHeader("X-Content-Type-Options", "nosniff");

  // HSTS — force HTTPS for 1 year
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  // Referrer — send origin only to same-origin, nothing to cross-origin
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions — disable sensitive browser features
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Hide server tech
  res.removeHeader("X-Powered-By");

  next();
}
