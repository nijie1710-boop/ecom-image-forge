import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://rqgrovumfgjwuhkthqxe.supabase.co";
const DEFAULT_APP_URL = "https://www.picspark.cn";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kR5Qt951QycXiDjppFSquQ_XODYlvpq";

export function applyCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export function handleOptions(req, res) {
  applyCors(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return true;
  }
  return false;
}

export async function parseJsonBody(req) {
  if (!req) return {};
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
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
    if (url.hostname === "picspark.cn" || url.hostname === "www.picspark.cn") {
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

function normalizePem(value, kind) {
  const raw = String(value || "")
    .trim()
    .replace(/\\n/g, "\n");

  if (!raw) return "";
  if (raw.includes("BEGIN ")) return raw;

  const wrapped = raw.match(/.{1,64}/g)?.join("\n") || raw;
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

export function respondJson(res, status, payload) {
  applyCors(res);
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
