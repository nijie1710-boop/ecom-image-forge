export function normalizeUserErrorMessage(
  rawError: unknown,
  fallback = "服务暂时不可用，请稍后重试。",
): string {
  const message =
    typeof rawError === "string"
      ? rawError
      : rawError instanceof Error
        ? rawError.message
        : "";

  const normalized = message.trim();
  if (!normalized) return fallback;

  try {
    const parsed = JSON.parse(normalized);

    if (parsed?.message) return String(parsed.message);

    if (parsed?.error === "INSUFFICIENT_BALANCE") {
      return "当前 AI 接口额度不足或触发限流，请稍后重试，或检查上游账号余额与配额。";
    }

    if (parsed?.error === "UNAUTHORIZED") {
      return "当前登录状态已失效，请刷新页面后重新登录。";
    }

    if (parsed?.error === "OCR_UPSTREAM_FAILED") {
      return "文字识别失败，当前 OCR 服务暂时不可用，请稍后重试。";
    }

    if (parsed?.error === "REPLACE_UPSTREAM_FAILED") {
      return "AI 已识别文字，但自动替换生成图片失败。我已为你保留识别结果，请稍后重试或直接修改译文。";
    }

    if (parsed?.error === "EMPTY_IMAGE_RESULT") {
      return "AI 已响应，但这次没有返回可用图片结果。我已为你保留识别结果，请稍后重试。";
    }

    if (parsed?.error === "IMAGE_REQUIRED") {
      return "请先上传一张需要翻译的图片。";
    }

    if (parsed?.error === "TRANSLATIONS_REQUIRED") {
      return "请先识别文字并确认译文，再生成翻译图。";
    }
  } catch {
    // ignore JSON parse errors
  }

  const lower = normalized.toLowerCase();

  if (
    lower.includes("non-2xx") ||
    lower.includes("edge function") ||
    lower.includes("failed to send a request")
  ) {
    return "服务连接失败，请稍后重试；如果反复出现，可能是边缘函数部署异常或网络不稳定。";
  }

  if (
    lower.includes("unauthorized") ||
    lower.includes("not authenticated") ||
    lower.includes("jwt") ||
    lower.includes("forbidden") ||
    lower.includes("401") ||
    lower.includes("403")
  ) {
    return "当前登录状态已失效，请刷新页面后重新登录。";
  }

  if (
    lower.includes("quota") ||
    lower.includes("insufficient_balance") ||
    lower.includes("billing") ||
    lower.includes("resource exhausted") ||
    lower.includes("429") ||
    lower.includes("rate limit")
  ) {
    return "当前 AI 接口额度不足或触发限流，请稍后重试，或检查上游账号余额与配额。";
  }

  if (
    lower.includes("timeout") ||
    lower.includes("deadline") ||
    lower.includes("504") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    return "上游模型响应超时，请稍后重试，或先减小图片尺寸后再试。";
  }

  if (lower.includes("empty_image_result") || lower.includes("no image returned")) {
    return "AI 已响应，但没有返回图片结果。我已为你保留识别结果，请稍后重试。";
  }

  if (
    lower.includes("base64") ||
    lower.includes("decode") ||
    lower.includes("mime") ||
    lower.includes("image data") ||
    lower.includes("invalid image")
  ) {
    return "图片处理失败，请换一张更清晰的 JPG、PNG 或 WEBP 图片再试。";
  }

  if (
    lower.includes("canvas") ||
    lower.includes("cors") ||
    lower.includes("tainted") ||
    lower.includes("load")
  ) {
    return "图片加载失败，可能是文件损坏或跨域限制，请重新上传后再试。";
  }

  if (lower.includes("json") || lower.includes("schema") || lower.includes("format")) {
    return "AI 返回结果格式异常，请重新尝试一次；如果持续失败，需要检查后端函数返回结构。";
  }

  return normalized;
}

export function errorHintFromMessage(message: string): string | null {
  const lower = message.toLowerCase();

  if (lower.includes("登录") || lower.includes("认证")) {
    return "建议：刷新页面并重新登录后再试。";
  }

  if (lower.includes("额度") || lower.includes("限流") || lower.includes("余额")) {
    return "建议：先切换到更低成本模型，或检查上游 API 账号余额与配额。";
  }

  if (lower.includes("图片处理") || lower.includes("图片加载")) {
    return "建议：换一张更清晰的原图，避免上传截图或过度压缩图片。";
  }

  if (lower.includes("超时")) {
    return "建议：先减少批量数量，或更换更小的图片再试。";
  }

  if (lower.includes("没有返回图片") || lower.includes("识别结果")) {
    return "建议：识别结果已经保留。你可以先校对译文，再重新生成。";
  }

  if (lower.includes("连接失败") || lower.includes("部署异常")) {
    return "建议：稍后重试；如果持续失败，请检查 Supabase 边缘函数是否正常部署。";
  }

  return null;
}
