export const VERCEL_ENV_VARS = [
  { key: "VITE_SUPABASE_URL", type: "plain" },
  { key: "VITE_SUPABASE_PUBLISHABLE_KEY", type: "plain" },
  { key: "VITE_APP_URL", type: "plain" },
  { key: "SUPABASE_URL", type: "plain" },
  { key: "SUPABASE_PUBLISHABLE_KEY", type: "encrypted" },
  { key: "SUPABASE_SERVICE_ROLE_KEY", type: "encrypted" },
  { key: "APP_URL", type: "plain" },
  { key: "ALLOWED_ORIGINS", type: "plain", optional: true },
  { key: "ALIPAY_APP_ID", type: "encrypted" },
  { key: "ALIPAY_PRIVATE_KEY", type: "encrypted" },
  { key: "ALIPAY_PUBLIC_KEY", type: "encrypted" },
  { key: "ALIPAY_GATEWAY", type: "plain" },
  { key: "ALIPAY_NOTIFY_URL", type: "plain" },
  { key: "ALIPAY_RETURN_URL", type: "plain" },
];

export const SUPABASE_SECRET_VARS = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "APP_URL",
  "GEMINI_API_KEY",
  "ALIPAY_APP_ID",
  "ALIPAY_PRIVATE_KEY",
  "ALIPAY_PUBLIC_KEY",
  "ALIPAY_GATEWAY",
  "ALIPAY_NOTIFY_URL",
  "ALIPAY_RETURN_URL",
];

export const REQUIRED_CI_ENV = [
  "DEPLOY_ENV",
  "VERCEL_TARGET",
  "VERCEL_TOKEN",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_DB_PASSWORD",
  "GEMINI_API_KEY",
  ...VERCEL_ENV_VARS.filter((item) => !item.optional).map((item) => item.key),
];

export function readEnv(name) {
  return String(process.env[name] ?? "").trim();
}

export function getMissing(names) {
  return [...new Set(names)].filter((name) => !readEnv(name));
}

export function maskSecrets(names) {
  for (const name of names) {
    if (!/(TOKEN|KEY|PASSWORD|PRIVATE|SECRET|ACCESS)/i.test(name)) continue;
    const value = readEnv(name);
    if (value && value.length >= 8) console.log(`::add-mask::${value}`);
  }
}
