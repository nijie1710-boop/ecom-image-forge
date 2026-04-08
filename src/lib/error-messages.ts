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
      "jwt",
      "auth session missing",
      "token",
      "401",
      "unauthorized",
      "invalid claim",
      "login required",
      "请先登录",
      "未登录",
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
      "jpg",
      "png",
      "webp",
      "图片格式",
      "图像格式",
    ])
  ) {
    return UNSUPPORTED_IMAGE_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "parse",
      "decode",
      "base64",
      "empty_image_result",
      "图片解析",
      "商品图解析",
      "ocr",
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
      "rate limit exceeded",
      "resource exhausted",
      "额度不足",
      "积分不足",
      "限流",
      "frequency limit",
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
      "502",
      "503",
      "504",
      "系统繁忙",
      "稍后再试",
      "服务不可用",
      "network",
      "failed to send a request to the edge function",
    ])
  ) {
    return SYSTEM_BUSY_MESSAGE;
  }

  if (
    includesAny(normalized, [
      "generate",
      "detail plan",
      "scene",
      "translate",
      "保存失败",
      "生成失败",
      "翻译失败",
      "策划失败",
      "场景识别失败",
    ])
  ) {
    return fallback;
  }

  return fallback;
}

export function errorHintFromMessage(message: string | null | undefined) {
  if (!message) return null;
  if (message === LOGIN_REQUIRED_MESSAGE) return "请重新登录后再操作。";
  if (message === UNSUPPORTED_IMAGE_MESSAGE) return "请上传 JPG、PNG 或 WEBP 格式图片。";
  if (message === IMAGE_PARSE_FAILED_MESSAGE) return "请更换更清晰的商品图，或重新上传。";
  if (message === AI_QUOTA_MESSAGE) return "请检查模型额度、计费配置或稍后重试。";
  if (message === SYSTEM_BUSY_MESSAGE) return "建议稍后再试，或降低图片数量和规格。";
  if (message === GENERATION_FAILED_MESSAGE) return "建议保留当前识别结果，稍后重新生成一次。";
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
