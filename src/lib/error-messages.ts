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

    switch (parsed?.error) {
      case "INSUFFICIENT_BALANCE":
        return "当前上游 AI 账户额度不足或触发限流，请稍后重试。";
      case "UNAUTHORIZED":
        return "当前登录状态已失效，请刷新页面后重新登录。";
      case "OCR_UPSTREAM_FAILED":
        return "文字识别服务暂时不可用，请稍后重试。";
      case "REPLACE_UPSTREAM_FAILED":
        return "自动替换图片失败，但识别结果通常仍可保留。建议稍后重试，或改用稳定替换模式。";
      case "EMPTY_IMAGE_RESULT":
        return "模型已响应，但没有返回可用图片结果。建议稍后重试。";
      case "IMAGE_REQUIRED":
        return "请先上传一张需要翻译的图片。";
      case "TRANSLATIONS_REQUIRED":
        return "请先识别文字并确认译文，再生成翻译图。";
      default:
        break;
    }
  } catch {
    // ignore malformed JSON payloads
  }

  const lower = normalized.toLowerCase();

  if (
    lower.includes("failed to send a request") ||
    lower.includes("edge function returned a non-2xx") ||
    lower.includes("edge function")
  ) {
    return "边缘函数请求失败，请稍后重试；如果持续出现，请检查函数部署和网络连接。";
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
    lower.includes("quotaexceedederror") ||
    lower.includes("localstorage") ||
    lower.includes("storage quota") ||
    lower.includes("the quota has been exceeded")
  ) {
    return "图片已经生成成功，但保存到本地缓存时空间不足。你可以先清理部分图片记录后再试。";
  }

  if (
    lower.includes("quota") ||
    lower.includes("insufficient_balance") ||
    lower.includes("billing") ||
    lower.includes("resource exhausted") ||
    lower.includes("429") ||
    lower.includes("rate limit")
  ) {
    return "当前上游 AI 账户额度不足或触发限流，请稍后重试。";
  }

  if (
    lower.includes("timeout") ||
    lower.includes("deadline") ||
    lower.includes("504") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    return "上游模型响应超时，请稍后重试，或先换一张更小的图片再试。";
  }

  if (lower.includes("empty_image_result") || lower.includes("no image returned")) {
    return "模型已响应，但没有返回可用图片结果。建议稍后重试。";
  }

  if (
    lower.includes("base64") ||
    lower.includes("decode") ||
    lower.includes("mime") ||
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
    return "图片本地渲染失败，请重新上传原图后再试。";
  }

  if (lower.includes("json") || lower.includes("schema") || lower.includes("format")) {
    return "返回结果格式异常，请重新尝试一次。";
  }

  return normalized;
}

export function errorHintFromMessage(message: string): string | null {
  const lower = message.toLowerCase();

  if (lower.includes("登录") || lower.includes("认证")) {
    return "建议：刷新页面并重新登录后再试。";
  }

  if (lower.includes("额度") || lower.includes("限流") || lower.includes("余额")) {
    return "建议：稍后重试，或检查上游 AI 账户是否还有额度。";
  }

  if (lower.includes("本地缓存") || lower.includes("空间不足")) {
    return "建议：先清理部分图片库或浏览器站点缓存，再继续生成。";
  }

  if (lower.includes("图片处理") || lower.includes("本地渲染") || lower.includes("图片加载")) {
    return "建议：换一张更清晰的原图，避免上传截图或过度压缩图片。";
  }

  if (lower.includes("超时")) {
    return "建议：先减少批量数量，或换一张更小的图片再试。";
  }

  if (lower.includes("没有返回可用图片") || lower.includes("识别结果")) {
    return "建议：识别结果通常仍会保留，你可以先校对译文后再重新生成。";
  }

  if (lower.includes("边缘函数请求失败") || lower.includes("部署")) {
    return "建议：稍后重试；如果持续失败，请检查 Supabase 边缘函数是否正常部署。";
  }

  return null;
}
