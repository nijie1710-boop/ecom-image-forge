const LOGIN_REQUIRED_MESSAGE = "未登录，请先登录";
const UNSUPPORTED_IMAGE_MESSAGE = "图片格式不支持";
const IMAGE_PARSE_FAILED_MESSAGE = "商品图解析失败";
const AI_QUOTA_MESSAGE = "AI 额度不足";
const GENERATION_FAILED_MESSAGE = "当前生成失败，请重试";
const SYSTEM_BUSY_MESSAGE = "系统繁忙，请稍后再试";

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
      "unauthorized",
      "401",
      "login required",
      "未登录",
      "请先登录",
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
      "image_required",
      "empty_image_result",
      "商品图解析",
      "解析失败",
      "no valid image",
      "no image returned",
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
      "额度不足",
      "积分不足",
      "余额不足",
    ])
  ) {
    return AI_QUOTA_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "timeout",
      "timed out",
      "busy",
      "temporarily unavailable",
      "upstream",
      "network",
      "502",
      "503",
      "504",
      "429",
      "too many requests",
      "email rate limit exceeded",
      "over_email_send_rate_limit",
      "failed to send a request to the edge function",
      "fetch failed",
      "load failed",
      "cloudflare",
      "系统繁忙",
      "稍后再试",
    ])
  ) {
    return SYSTEM_BUSY_MESSAGE;
  }

  if (includesAny(normalized, ["invalid login credentials", "invalid_credentials", "邮箱或密码不正确"])) {
    return "邮箱或密码不正确";
  }

  if (includesAny(normalized, ["invalid otp", "otp expired", "otp_expired", "token has expired", "验证码"])) {
    return "验证码有误或已过期，请重新发送";
  }

  if (includesAny(normalized, ["user already registered"])) {
    return "该邮箱已注册，请直接登录";
  }

  if (includesAny(normalized, ["email not confirmed"])) {
    return "账号尚未完成验证，请先完成注册或验证";
  }

  return fallback;
}

export function errorHintFromMessage(message: string | null | undefined) {
  if (!message) return null;
  if (message === LOGIN_REQUIRED_MESSAGE) return "请重新登录后再试。";
  if (message === UNSUPPORTED_IMAGE_MESSAGE) return "请上传 JPG、PNG 或 WEBP 格式的图片。";
  if (message === IMAGE_PARSE_FAILED_MESSAGE) return "请更换更清晰的商品图，或重新上传后再试。";
  if (message === AI_QUOTA_MESSAGE) return "请先充值积分，或稍后再试。";
  if (message === SYSTEM_BUSY_MESSAGE) return "建议稍后再试，或减少图片数量与规格。";
  if (message === GENERATION_FAILED_MESSAGE) return "建议保留当前识别结果，稍后重新生成一次。";
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
};
