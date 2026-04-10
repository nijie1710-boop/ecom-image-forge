const LOGIN_REQUIRED_MESSAGE = "未登录，请先登录";
const UNSUPPORTED_IMAGE_MESSAGE = "图片格式不支持";
const IMAGE_PARSE_FAILED_MESSAGE = "商品图片解析失败";
const AI_QUOTA_MESSAGE = "积分不足";
const GENERATION_FAILED_MESSAGE = "当前生成失败，请稍后重试";
const SYSTEM_BUSY_MESSAGE = "系统繁忙，请稍后再试";
const MODEL_CONFIG_MESSAGE = "模型配置错误，请联系管理员";
const GEMINI_ENV_MESSAGE = "AI 服务未配置，请联系管理员";
const SUPABASE_ENV_MESSAGE = "后端环境变量缺失，请联系管理员";
const UPSTREAM_UNAVAILABLE_MESSAGE = "上游 AI 服务暂时不可用";

function toText(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input;
  if (input instanceof Error) return input.message;

  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

export function normalizeUserErrorMessage(input: unknown, fallback = GENERATION_FAILED_MESSAGE) {
  const text = toText(input).trim();
  if (!text) return fallback;

  const normalized = text.toLowerCase();

  if (
    includesAny(normalized, [
      "not authenticated",
      "auth session missing",
      "jwt",
      "token",
      "missing authorization header",
      "unauthorized",
      "401",
      "login required",
      "未登录",
      "请先登录",
      "supabase auth validation failed",
    ])
  ) {
    return LOGIN_REQUIRED_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "unsupported image",
      "invalid image",
      "mime",
      "format",
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      "图片格式",
      "image_required",
    ])
  ) {
    return UNSUPPORTED_IMAGE_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "parse",
      "decode",
      "base64",
      "ocr",
      "product_image_required",
      "empty_image_result",
      "no valid image",
      "no image returned",
      "商品图片解析失败",
      "图片解析失败",
    ])
  ) {
    return IMAGE_PARSE_FAILED_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "insufficient_balance",
      "quota",
      "billing",
      "credit",
      "payment required",
      "402",
      "resource exhausted",
      "余额不足",
      "积分不足",
      "额度不足",
    ])
  ) {
    return AI_QUOTA_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "gemini_api_key_missing",
      "gemini_api_key is not configured",
      "required environment variable gemini_api_key is missing",
      "ai 服务未配置",
    ])
  ) {
    return GEMINI_ENV_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "supabase_url_missing",
      "supabase_service_role_key_missing",
      "supabase_env_missing",
      "required environment variable supabase_url is missing",
      "required environment variable supabase_service_role_key is missing",
      "后端环境变量缺失",
    ])
  ) {
    return SUPABASE_ENV_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "model_not_supported",
      "unsupported image model selection",
      "not found for api version",
      "call listmodels",
      "configured gemini model is invalid or unavailable",
      "模型配置错误",
      "模型名无效",
    ])
  ) {
    return MODEL_CONFIG_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "upstream_429",
      "upstream_500",
      "upstream_502",
      "upstream_503",
      "upstream_504",
      "fallback_chain_failed",
      "temporarily unavailable",
      "failed to send a request to the edge function",
      "edge function returned a non-2xx status code",
      "fetch failed",
      "load failed",
      "cloudflare",
      "503",
      "504",
      "502",
      "429",
      "上游 ai 服务暂时不可用",
    ])
  ) {
    return UPSTREAM_UNAVAILABLE_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "timeout",
      "timed out",
      "busy",
      "network",
      "系统繁忙",
      "稍后再试",
    ])
  ) {
    return SYSTEM_BUSY_MESSAGE;
  }

  if (includesAny(normalized, ["invalid login credentials", "invalid_credentials"])) {
    return "邮箱或密码不正确";
  }

  if (includesAny(normalized, ["invalid otp", "otp expired", "otp_expired", "token has expired"])) {
    return "验证码有误或已过期，请重新发送";
  }

  if (includesAny(normalized, ["user already registered"])) {
    return "该邮箱已注册，请直接登录";
  }

  if (includesAny(normalized, ["email not confirmed"])) {
    return "账号尚未完成验证，请先完成邮箱验证";
  }

  return fallback;
}

export function errorHintFromMessage(message: string | null | undefined) {
  if (!message) return null;
  if (message === LOGIN_REQUIRED_MESSAGE) return "请重新登录后再试。";
  if (message === UNSUPPORTED_IMAGE_MESSAGE) return "请上传 JPG、PNG 或 WEBP 格式图片。";
  if (message === IMAGE_PARSE_FAILED_MESSAGE) return "建议更换更清晰的商品图，或重新上传后再试。";
  if (message === AI_QUOTA_MESSAGE) return "请先充值积分，或减少生成数量后再试。";
  if (message === GEMINI_ENV_MESSAGE) return "需要检查服务器的 GEMINI_API_KEY 配置。";
  if (message === SUPABASE_ENV_MESSAGE) return "需要检查服务器的 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 配置。";
  if (message === MODEL_CONFIG_MESSAGE) return "需要核查当前功能配置的 Gemini 模型名是否仍然可用。";
  if (message === UPSTREAM_UNAVAILABLE_MESSAGE) return "建议稍后重试，或换一个同类模型再试。";
  if (message === SYSTEM_BUSY_MESSAGE) return "建议稍后重试，或减少图片数量与清晰度。";
  if (message === GENERATION_FAILED_MESSAGE) return "建议保留当前输入内容，稍后重新生成一次。";
  if (message === "邮箱或密码不正确") return "请检查邮箱和密码是否输入正确。";
  if (message === "验证码有误或已过期，请重新发送") return "请使用最新一封邮件中的验证码。";
  return null;
}

export const ERROR_MESSAGES = {
  loginRequired: LOGIN_REQUIRED_MESSAGE,
  unsupportedImage: UNSUPPORTED_IMAGE_MESSAGE,
  imageParseFailed: IMAGE_PARSE_FAILED_MESSAGE,
  aiQuota: AI_QUOTA_MESSAGE,
  generationFailed: GENERATION_FAILED_MESSAGE,
  systemBusy: SYSTEM_BUSY_MESSAGE,
  modelConfig: MODEL_CONFIG_MESSAGE,
  geminiEnv: GEMINI_ENV_MESSAGE,
  supabaseEnv: SUPABASE_ENV_MESSAGE,
  upstreamUnavailable: UPSTREAM_UNAVAILABLE_MESSAGE,
};
