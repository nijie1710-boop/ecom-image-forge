import crypto from "node:crypto";

import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    const error = new Error(`Missing required environment variable: ${name}`);
    error.status = 500;
    throw error;
  }
  return value;
}

function normalizeOriginValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function readOriginList(name) {
  return String(process.env[name] || "")
    .split(",")
    .map((value) => normalizeOriginValue(value))
    .filter(Boolean);
}

const ALLOWED_ORIGINS = Array.from(
  new Set([...readOriginList("ALLOWED_ORIGINS"), normalizeOriginValue(process.env.APP_URL)].filter(Boolean)),
);

function resolveAllowedOrigin(req) {
  const origin = String(req?.headers?.origin || "").trim();
  if (origin && ALLOWED_ORIGINS.includes(origin)) return origin;
  // 鏈湴寮€鍙?/ Vercel Preview锛氭斁琛屽父瑙佺殑寮€鍙戞簮
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin;
  if (origin && /\.vercel\.app$/i.test(new URL(origin).hostname)) return origin;
  return ALLOWED_ORIGINS[0] || "";
}

export function applyCors(res, req) {
  const allowOrigin = req ? resolveAllowedOrigin(req) : ALLOWED_ORIGINS[0];
  if (allowOrigin) res.setHeader("Access-Control-Allow-Origin", allowOrigin);
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
      const error = new Error("璇锋眰浣撲笉鏄悎娉曠殑 JSON");
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

// 涓ユ牸鐨?PEM 澶?灏炬鍒欙細蹇呴』鏄?"-----BEGIN XXX-----" 鍜?"-----END XXX-----" 鎴愬鍑虹幇
const PEM_BEGIN_RE = /-----BEGIN ([A-Z0-9 ]+)-----/;
const PEM_END_RE = /-----END ([A-Z0-9 ]+)-----/;

function normalizePem(value, kind) {
  const raw = String(value || "")
    .trim()
    .replace(/\\n/g, "\n");

  if (!raw) return "";

  // 涓ユ牸鏍￠獙锛氬繀椤诲悓鏃舵湁 BEGIN 鍜?END 涓?label 涓€鑷?
  const beginMatch = raw.match(PEM_BEGIN_RE);
  const endMatch = raw.match(PEM_END_RE);
  if (beginMatch && endMatch && beginMatch[1] === endMatch[1]) {
    return raw;
  }
  // 濡傛灉鍙湁 BEGIN 娌℃湁 END锛岃涓轰笉瀹屾暣锛屾姏閿?
  if (beginMatch || endMatch) {
    throw new Error(`Invalid ${kind} PEM: BEGIN/END markers not paired correctly`);
  }

  // 绾?base64 瀛楃涓诧細蹇呴』鍙寘鍚?base64 鍚堟硶瀛楃
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
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!String(supabaseUrl).trim()) requireEnv("SUPABASE_URL");
  if (!String(serviceRoleKey).trim()) requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return {
    supabaseUrl,
    serviceRoleKey,
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
    requireEnv("SUPABASE_PUBLISHABLE_KEY");
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
  return `缂哄皯鍏抽敭鐜鍙橀噺锛?{missingKeys.join(", ")}`;
}

export async function requireUserFromRequest(req) {
  const authorization = req.headers.authorization || req.headers.Authorization || "";
  if (!String(authorization).startsWith("Bearer ")) {
    const error = new Error("鏈櫥褰曪紝璇峰厛鐧诲綍");
    error.status = 401;
    throw error;
  }

  const token = authorization.slice(7);
  const adminClient = createAdminClient();
  const {
    data: { user },
    error,
  } = await adminClient.auth.getUser(token);

  if (!error && user) {
    return user;
  }

  const authError = new Error("鏈櫥褰曪紝璇峰厛鐧诲綍");
  authError.status = 401;
  throw authError;
}

export function respondJson(res, status, payload, req) {
  // CORS 閫氬父宸茬敱 handleOptions 鍦ㄨ姹傚叆鍙ｈ缃ソ锛涜繖閲屼粎鍦ㄦ湭璁剧疆鏃跺厹搴曪紝
  // 閬垮厤瑕嗙洊姝ｇ‘鐨?origin銆?
  if (!res.getHeader || !res.getHeader("Access-Control-Allow-Origin")) {
    applyCors(res, req);
  }
  res.status(status).json(payload);
}

export function getPaymentPackages() {
  return [
    { id: "starter", label: "浣撻獙鍖?, price: 19.9, credits: 200, badge: "閫傚悎璇曠敤" },
    { id: "growth", label: "甯哥敤鍖?, price: 49.9, credits: 520, badge: "鎺ㄨ崘", highlight: true },
    { id: "pro", label: "杩涢樁鍖?, price: 99, credits: 1080, badge: "鍗曚环鏇寸渷" },
    { id: "business", label: "鍟嗙敤鍖?, price: 199, credits: 2280, badge: "楂橀鍒涗綔" },
  ];
}
