const ERROR_TEXT = {
  loginRequired: "未登录，请先登录",
  unsupportedImage: "图片格式不支持",
  parseFailed: "商品图解析失败",
  quotaExceeded: "AI 额度不足",
  generationFailed: "当前生成失败，请重试",
  systemBusy: "系统繁忙，请稍后再试",
} as const;

function normalizeRawError(rawError: unknown) {
  if (typeof rawError === "string") return rawError.trim();

  if (rawError instanceof Error) {
    return rawError.message.trim();
  }

  if (rawError && typeof rawError === "object") {
    const maybeMessage = ["message", "error", "detail", "msg"]
      .map((key) => (rawError as Record<string, unknown>)[key])
      .find((value) => typeof value === "string" && value.trim());

    if (typeof maybeMessage === "string") {
      return maybeMessage.trim();
    }
  }

  return "";
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function matchKnownError(message: string) {
  const lower = message.toLowerCase();

  if (
    lower.includes("unauthorized") ||
    lower.includes("not authenticated") ||
    lower.includes("jwt") ||
    lower.includes("forbidden") ||
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("invalid login credentials") ||
    lower.includes("email not confirmed") ||
    lower.includes("login required")
  ) {
    return ERROR_TEXT.loginRequired;
  }

  if (
    lower.includes("mime") ||
    lower.includes("invalid image") ||
    lower.includes("image_required") ||
    lower.includes("unsupported") ||
    lower.includes("format") ||
    lower.includes("jpg") ||
    lower.includes("png") ||
    lower.includes("webp")
  ) {
    return ERROR_TEXT.unsupportedImage;
  }

  if (
    lower.includes("ocr_upstream_failed") ||
    lower.includes("translations_required") ||
    lower.includes("parse failed") ||
    lower.includes("decode") ||
    lower.includes("base64") ||
    lower.includes("canvas") ||
    lower.includes("tainted")
  ) {
    return ERROR_TEXT.parseFailed;
  }

  if (
    lower.includes("insufficient_balance") ||
    lower.includes("billing") ||
    lower.includes("resource exhausted") ||
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("429")
  ) {
    return ERROR_TEXT.quotaExceeded;
  }

  if (
    lower.includes("replace_upstream_failed") ||
    lower.includes("empty_image_result") ||
    lower.includes("no image returned") ||
    lower.includes("generation failed")
  ) {
    return ERROR_TEXT.generationFailed;
  }

  if (
    lower.includes("edge function") ||
    lower.includes("failed to send a request") ||
    lower.includes("timeout") ||
    lower.includes("deadline") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504") ||
    lower.includes("521") ||
    lower.includes("cloudflare") ||
    lower.includes("web server is down") ||
    lower.includes("load failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("network")
  ) {
    return ERROR_TEXT.systemBusy;
  }

  return "";
}

export function normalizeUserErrorMessage(rawError: unknown, fallback = ERROR_TEXT.systemBusy): string {
  const normalized = normalizeRawError(rawError);
  if (!normalized) return fallback;

  const cleaned = stripHtmlTags(normalized);

  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed?.message === "string" && parsed.message.trim()) {
      return matchKnownError(parsed.message) || stripHtmlTags(parsed.message);
    }
    if (typeof parsed?.error === "string" && parsed.error.trim()) {
      return matchKnownError(parsed.error) || stripHtmlTags(parsed.error);
    }
    if (typeof parsed?.detail === "string" && parsed.detail.trim()) {
      return matchKnownError(parsed.detail) || stripHtmlTags(parsed.detail);
    }
  } catch {
    // ignore JSON parse errors
  }

  return matchKnownError(cleaned) || fallback;
}

export function errorHintFromMessage(message: string): string | null {
  switch (message) {
    case ERROR_TEXT.loginRequired:
      return "请刷新页面后重新登录，再继续当前操作。";
    case ERROR_TEXT.unsupportedImage:
      return "请上传 JPG、PNG 或 WEBP 格式的清晰图片。";
    case ERROR_TEXT.parseFailed:
      return "建议更换更清晰的原图，避免截图或过度压缩图片。";
    case ERROR_TEXT.quotaExceeded:
      return "请检查上游 AI 账号额度，或稍后再试。";
    case ERROR_TEXT.generationFailed:
      return "建议保留当前识别结果，稍后重新生成一次。";
    case ERROR_TEXT.systemBusy:
      return "当前服务连接异常，请稍后重试；如持续出现，请检查认证或上游服务状态。";
    default:
      return null;
  }
}

export const USER_VISIBLE_ERROR_TEXT = ERROR_TEXT;
