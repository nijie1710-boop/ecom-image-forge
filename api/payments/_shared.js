import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

// ============================================================
// 常量配置：避免多处硬编码
// ============================================================
const DEFAULT_SUPABASE_URL = "https://rqgrovumfgjwuhkthqxe.supabase.co";
const DEFAULT_APP_URL = "https://www.picspark.cn";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kR5Qt951QycXiDjppFSquQ_XODYlvpq";

// 允许的业务域名（CORS + URL 规范化共用）
const ALLOWED_HOSTS = new Set(["picspark.cn", "www.picspark.cn"]);
const ALLOWED_ORIGINS = [
  "https://picspark.cn",
  "https://www.picspark.cn",
];

function resolveAllowedOrigin(req) {
  const origin = String(req?.headers?.origin || "").trim();
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  // 本地开发 / Vercel Preview：放行常见的开发源
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  if (origin && /\.vercel\.app$/i.test(new URL(origin).hostname)) return origin;
  // 默认回退到主站
  return ALLOWED_ORIGINS[0];
}

export function applyCors(res, req) {
  const allowOrigin = req ? resolveAllowedOrigin(req) : ALLOWED_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");
}

export function handleOptions(req, res) {
  applyCors(res, req);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

export async function parseJsonBody(req) {
  if (!req) return {};
  if (req.body && typeof req.body === "object") return req.body;

  const safeParse = (text) => {
    try {
      return JSON.parse(text);
    } catch {
      const error = new Error("请求体不是合法的 JSON");
      error.status = 400;
      throw error;
    }
  };

  if (typeof req.body === "string" && req.body.trim()) return safeParse(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? safeParse(raw) : {};
}

export async function parseRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export function parseFormEncoded(rawBody) {
  return Object.fromEntries(new URLSearchParams(String(rawBody || "")));
}

export function normalizeAppUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    if (ALLOWED_HOSTS.has(url.hostname)) {
      return DEFAULT_APP_URL;
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

export function appendQueryParams(url, params) {
  const target = new URL(url);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      target.searchParams.set(key, String(value));
    }
  });
  return target.toString();
}

// 严格的 PEM 头/尾正则：必须是 "-----BEGIN XXX-----" 和 "-----END XXX-----" 成对出现
const PEM_BEGIN_RE = /-----BEGIN ([A-Z0-9 ]+)-----/;
const PEM_END_RE = /-----END ([A-Z0-9 ]+)-----/;

function normalizePem(value, kind) {
  const raw = String(value || "")
    .trim()
    .replace(/\\n/g, "\n");

  if (!raw) return "";

  // 严格校验：必须同时有 BEGIN 和 END 且 label 一致
  const beginMatch = raw.match(PEM_BEGIN_RE);
  const endMatch = raw.match(PEM_END_RE);
  if (beginMatch && endMatch && beginMatch[1] === endMatch[1]) {
    return raw;
  }
  // 如果只有 BEGIN 没有 END，视为不完整，抛错
  if (beginMatch || endMatch) {
    throw new Error(`Invalid ${kind} PEM: BEGIN/END markers not paired correctly`);
  }

  // 纯 base64 字符串：必须只包含 base64 合法字符
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw)) {
    throw new Error(`Invalid ${kind} PEM: contains non-base64 characters`);
  }

  const compact = raw.replace(/\s+/g, "");
  const wrapped = compact.match(/.{1,64}/g)?.join("\n") || compact;
  const header = kind === "private" ? "PRIVATE KEY" : "PUBLIC KEY";
  return `-----BEGIN ${header}-----\n${wrapped}\n-----END ${header}-----`;
}

export function createAlipaySignContent(params, options = {}) {
  const excludeSignType = Boolean(options.excludeSignType);
  return Object.keys(params)
    .filter(
      (key) =>
        key !== "sign" &&
        (!excludeSignType || key !== "sign_type") &&
        params[key] !== "" &&
        params[key] !== undefined &&
        params[key] !== null,
    )
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

export function signAlipayParams(params, privateKey) {
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(createAlipaySignContent(params), "utf8");
  signer.end();
  return signer.sign(normalizePem(privateKey, "private"), "base64");
}

export function verifyAlipaySignature(params, sign, publicKey) {
  const verifier = crypto.createVerify("RSA-SHA256");
  verifier.update(createAlipaySignContent(params, { excludeSignType: true }), "utf8");
  verifier.end();
  return verifier.verify(normalizePem(publicKey, "public"), sign, "base64");
}

export function formatAlipayTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

export function createOrderNo(userId) {
  const compact = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `PS${compact}${String(userId || "").replace(/-/g, "").slice(0, 8)}${random}`;
}

export function getSupabaseConfig() {
  return {
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

export function createAdminClient() {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createUserClient(accessToken) {
  const { supabaseUrl } = getSupabaseConfig();
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    DEFAULT_SUPABASE_PUBLISHABLE_KEY;
  return createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function getRequiredOrderEnv() {
  return {
    ALIPAY_APP_ID: process.env.ALIPAY_APP_ID || "",
    ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY || "",
    ALIPAY_GATEWAY: process.env.ALIPAY_GATEWAY || "",
    ALIPAY_NOTIFY_URL: process.env.ALIPAY_NOTIFY_URL || "",
    ALIPAY_RETURN_URL: process.env.ALIPAY_RETURN_URL || "",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

export function getRequiredNotifyEnv() {
  return {
    ALIPAY_APP_ID: process.env.ALIPAY_APP_ID || "",
    ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY || "",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  };
}

export function getMissingEnv(envMap) {
  return Object.entries(envMap)
    .filter(([, value]) => !String(value || "").trim())
    .map(([key]) => key);
}

export function buildEnvErrorMessage(missingKeys) {
  return `缺少关键环境变量：${missingKeys.join(", ")}`;
}

export async function requireUserFromRequest(req) {
  const authorization = req.headers.authorization || req.headers.Authorization || "";
  if (!String(authorization).startsWith("Bearer ")) {
    const error = new Error("未登录，请先登录");
    error.status = 401;
    throw error;
  }

  const token = authorization.slice(7);
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();

  // 优先用 service role key 验证（最可靠）
  if (serviceRoleKey) {
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error } = await adminClient.auth.getUser(token);
    if (!error && user) return user;
  }

  // 降级：直接解码 JWT payload，安全由 Supabase RLS 在每次 DB 查询时兜底
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    if (payload.sub && payload.exp && payload.exp > now) {
      return { id: payload.sub, email: payload.email || "" };
    }
  } catch {
    // fall through
  }

  const authError = new Error("未登录，请先登录");
  authError.status = 401;
  throw authError;
}

export function respondJson(res, status, payload, req) {
  // CORS 通常已由 handleOptions 在请求入口设置好；这里仅在未设置时兜底，
  // 避免覆盖正确的 origin。
  if (!res.getHeader || !res.getHeader("Access-Control-Allow-Origin")) {
    applyCors(res, req);
  }
  res.status(status).json(payload);
}

export function getPaymentPackages() {
  return [
    { id: "starter", label: "体验包", price: 19.9, credits: 200, badge: "适合试用" },
    { id: "growth", label: "常用包", price: 49.9, credits: 520, badge: "推荐", highlight: true },
    { id: "pro", label: "进阶包", price: 99, credits: 1080, badge: "单价更省" },
    { id: "business", label: "商用包", price: 199, credits: 2280, badge: "高频创作" },
  ];
}
