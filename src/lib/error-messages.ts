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
  if (rawError instanceof Error) return rawError.message.trim();
  return "";
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
    lower.includes("登录")
  ) {
    return ERROR_TEXT.loginRequired;
  }

  if (
    lower.includes("mime") ||
    lower.includes("invalid image") ||
    lower.includes("image_required") ||
    lower.includes("不支持") ||
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
    lower.includes("未检测到可翻译的文字内容") ||
    lower.includes("解析失败") ||
    lower.includes("识别失败") ||
    lower.includes("base64") ||
    lower.includes("decode") ||
    lower.includes("canvas") ||
    lower.includes("tainted") ||
    lower.includes("load")
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
    lower.includes("生成失败")
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
    lower.includes("网络")
  ) {
    return ERROR_TEXT.systemBusy;
  }

  return "";
}

export function normalizeUserErrorMessage(
  rawError: unknown,
  fallback = ERROR_TEXT.systemBusy,
): string {
  const normalized = normalizeRawError(rawError);
  if (!normalized) return fallback;

  try {
    const parsed = JSON.parse(normalized);

    if (typeof parsed?.message === "string" && parsed.message.trim()) {
      const matched = matchKnownError(parsed.message);
      return matched || parsed.message.trim();
    }

    if (typeof parsed?.error === "string") {
      const matched = matchKnownError(parsed.error);
      if (matched) return matched;
    }

    if (typeof parsed?.detail === "string") {
      const matched = matchKnownError(parsed.detail);
      if (matched) return matched;
    }
  } catch {
    // ignore JSON parse errors
  }

  return matchKnownError(normalized) || fallback;
}

export function errorHintFromMessage(message: string): string | null {
  switch (message) {
    case ERROR_TEXT.loginRequired:
      return "请刷新页面并重新登录后再试。";
    case ERROR_TEXT.unsupportedImage:
      return "请上传 JPG、PNG 或 WEBP 格式的清晰图片。";
    case ERROR_TEXT.parseFailed:
      return "请换一张更清晰的商品图，避免上传截图或过度压缩图片。";
    case ERROR_TEXT.quotaExceeded:
      return "请检查上游 AI 账户额度或稍后再试。";
    case ERROR_TEXT.generationFailed:
      return "建议保持当前识别结果，稍后重试一次。";
    case ERROR_TEXT.systemBusy:
      return "请稍后重试；如果持续出现，请检查函数部署和网络连接。";
    default:
      return null;
  }
}

export const USER_VISIBLE_ERROR_TEXT = ERROR_TEXT;
