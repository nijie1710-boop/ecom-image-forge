import { supabase } from "@/integrations/supabase/client";
import { normalizeUserErrorMessage } from "@/lib/error-messages";

export type GenerationModel =
  | "gemini-3.1-flash-image-preview"
  | "nano-banana-pro-preview"
  | "gemini-2.5-flash-image";

export type OutputResolution = "0.5k" | "1k" | "2k" | "4k";
export type ModelMode = "none" | "with_model";

export interface GenerateImageParams {
  prompt: string;
  aspectRatio?: string;
  n?: number;
  imageBase64?: string;
  imageType?: string;
  textLanguage?: string;
  model?: GenerationModel;
  resolution?: OutputResolution;
  referenceGallery?: string[];
  styleReferenceImage?: string;
  styleReferenceText?: string;
  modelMode?: ModelMode;
  modelImage?: string;
  signal?: AbortSignal;
}

export interface GenerateImageResult {
  images: string[];
  error?: string;
}

const DEFAULT_ERROR = "系统繁忙，请稍后再试";
const GENERATE_FAIL_ERROR = "当前生成失败，请重试";
const NO_IMAGE_ERROR = "商品图解析失败";

type InvokeLikeError = {
  message?: string;
  context?: {
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
  };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("任务已取消", "AbortError");
  }
}

async function extractInvokeErrorMessage(error: unknown): Promise<string> {
  if (!error || typeof error !== "object") {
    return DEFAULT_ERROR;
  }

  const maybeError = error as InvokeLikeError;

  if (maybeError.context?.json) {
    try {
      const payload = (await maybeError.context.json()) as
        | { error?: string; message?: string; detail?: string }
        | undefined;
      const detailed = payload?.error || payload?.message || payload?.detail;
      if (detailed) {
        return normalizeUserErrorMessage(detailed, GENERATE_FAIL_ERROR);
      }
    } catch {
      // ignore JSON extraction failures
    }
  }

  if (maybeError.context?.text) {
    try {
      const text = await maybeError.context.text();
      if (text) {
        return normalizeUserErrorMessage(text, GENERATE_FAIL_ERROR);
      }
    } catch {
      // ignore text extraction failures
    }
  }

  return normalizeUserErrorMessage(maybeError.message, DEFAULT_ERROR);
}

function normalizeModelLabel(model: GenerationModel | undefined): GenerationModel {
  return model || "gemini-2.5-flash-image";
}

function normalizeResolution(resolution: OutputResolution | undefined): OutputResolution {
  return resolution || "1k";
}

function dedupeVariants(variants: GenerateImageParams[]): GenerateImageParams[] {
  const seen = new Set<string>();
  const result: GenerateImageParams[] = [];

  for (const variant of variants) {
    const key = JSON.stringify({
      model: variant.model,
      resolution: variant.resolution,
      hasGallery: Boolean(variant.referenceGallery?.length),
      hasStyle: Boolean(variant.styleReferenceImage),
      hasModel: Boolean(variant.modelImage),
      modelMode: variant.modelMode,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(variant);
  }

  return result;
}

function buildRequestVariants(params: GenerateImageParams): GenerateImageParams[] {
  const model = normalizeModelLabel(params.model);
  const resolution = normalizeResolution(params.resolution);
  const hasExtraRefs =
    Boolean(params.referenceGallery?.length) ||
    Boolean(params.styleReferenceImage) ||
    Boolean(params.modelImage);

  const variants: GenerateImageParams[] = [
    {
      ...params,
      model,
      resolution,
    },
  ];

  if (hasExtraRefs) {
    variants.push({
      ...params,
      model,
      resolution,
      referenceGallery: [],
      styleReferenceImage: undefined,
      styleReferenceText: params.styleReferenceText,
      modelMode: "none",
      modelImage: undefined,
    });
  }

  if (resolution === "4k" || resolution === "2k") {
    variants.push({
      ...params,
      model,
      resolution: resolution === "4k" ? "2k" : "1k",
    });

    if (hasExtraRefs) {
      variants.push({
        ...params,
        model,
        resolution: resolution === "4k" ? "2k" : "1k",
        referenceGallery: [],
        styleReferenceImage: undefined,
        styleReferenceText: params.styleReferenceText,
        modelMode: "none",
        modelImage: undefined,
      });
    }
  }

  if (model === "nano-banana-pro-preview") {
    variants.push({
      ...params,
      model: "gemini-3.1-flash-image-preview",
      resolution: resolution === "4k" ? "2k" : resolution,
    });
    variants.push({
      ...params,
      model: "gemini-2.5-flash-image",
      resolution: resolution === "4k" ? "2k" : resolution,
    });
  } else if (model === "gemini-3.1-flash-image-preview") {
    variants.push({
      ...params,
      model: "gemini-2.5-flash-image",
      resolution: resolution === "4k" ? "2k" : resolution,
    });
  }

  return dedupeVariants(variants);
}

function isFatalError(message: string | undefined): boolean {
  if (!message) return false;

  const normalized = message.toLowerCase();
  return [
    "insufficient_balance",
    "unauthorized",
    "forbidden",
    "authentication",
    "billing",
    "not authenticated",
    "login expired",
    "未登录",
    "余额不足",
    "积分不足",
    "无权限",
  ].some((keyword) => normalized.includes(keyword));
}

function isRetryableError(message: string | undefined): boolean {
  if (!message) return false;

  const normalized = message.toLowerCase();
  return [
    "timeout",
    "timed out",
    "try again",
    "temporarily unavailable",
    "empty_image_result",
    "no image returned",
    "no valid image",
    "rate limit",
    "quota exceeded",
    "internal",
    "upstream",
    "503",
    "502",
    "500",
    "429",
    "超时",
    "限流",
    "系统繁忙",
    "稍后重试",
    "没有返回有效图片",
  ].some((keyword) => normalized.includes(keyword));
}

async function generateSingleImageRaw(
  params: GenerateImageParams,
  attemptLabel: string,
): Promise<{ url: string | null; error: string | null }> {
  ensureNotAborted(params.signal);

  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: {
      prompt: params.prompt,
      imageBase64: params.imageBase64 || undefined,
      aspectRatio: params.aspectRatio || "1:1",
      imageType: params.imageType || "主图",
      textLanguage: params.textLanguage || "zh",
      model: normalizeModelLabel(params.model),
      resolution: normalizeResolution(params.resolution),
      referenceGallery: params.referenceGallery || [],
      referenceStyleUrl: params.styleReferenceImage || undefined,
      styleReferenceText: params.styleReferenceText || undefined,
      modelMode: params.modelMode || "none",
      modelImage: params.modelImage || undefined,
    },
  });

  ensureNotAborted(params.signal);

  if (error) {
    console.error(`[${attemptLabel}] generate-image edge function error:`, error);
    return {
      url: null,
      error: await extractInvokeErrorMessage(error),
    };
  }

  if (data?.error) {
    const errorMessage =
      typeof data.error === "string"
        ? data.error
        : data.error?.message || data.error?.error || GENERATE_FAIL_ERROR;

    console.error(`[${attemptLabel}] generate-image returned error:`, errorMessage);
    return {
      url: null,
      error: normalizeUserErrorMessage(errorMessage, GENERATE_FAIL_ERROR),
    };
  }

  const imageUrl = data?.images?.[0];
  if (!imageUrl) {
    return {
      url: null,
      error: normalizeUserErrorMessage("EMPTY_IMAGE_RESULT", NO_IMAGE_ERROR),
    };
  }

  return { url: imageUrl, error: null };
}

async function generateSingleImageStable(
  params: GenerateImageParams,
  batchIndex: number,
): Promise<{ url: string | null; error: string | null }> {
  const variants = buildRequestVariants(params);
  let lastError: string | null = null;

  for (let variantIndex = 0; variantIndex < variants.length; variantIndex += 1) {
    const variant = variants[variantIndex];
    const retryCount = isFatalError(lastError || undefined) ? 1 : 2;

    for (let attempt = 0; attempt < retryCount; attempt += 1) {
      ensureNotAborted(params.signal);
      const attemptLabel = `batch-${batchIndex}-variant-${variantIndex + 1}-attempt-${attempt + 1}`;
      const result = await generateSingleImageRaw(variant, attemptLabel);
      if (result.url) {
        return result;
      }

      lastError = result.error;
      if (isFatalError(result.error || undefined)) {
        return { url: null, error: result.error };
      }

      if (!isRetryableError(result.error || undefined)) {
        break;
      }

      if (attempt < retryCount - 1) {
        await sleep(1200 * (attempt + 1));
        ensureNotAborted(params.signal);
      }
    }
  }

  return {
    url: null,
    error: normalizeUserErrorMessage(lastError, GENERATE_FAIL_ERROR),
  };
}

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  try {
    ensureNotAborted(params.signal);
    const total = Math.min(Math.max(params.n || 1, 1), 9);
    const images: string[] = [];
    let lastError: string | undefined;

    for (let index = 0; index < total; index += 1) {
      const result = await generateSingleImageStable({ ...params, n: 1 }, index + 1);
      ensureNotAborted(params.signal);

      if (result.url) {
        images.push(result.url);
      } else if (result.error) {
        lastError = result.error;
        if (isFatalError(result.error)) {
          break;
        }
      }

      if (index < total - 1) {
        await sleep(images.length ? 900 : 1500);
        ensureNotAborted(params.signal);
      }
    }

    if (!images.length) {
      return {
        images: [],
        error: normalizeUserErrorMessage(lastError, "本次没有生成成功，请稍后重试。"),
      };
    }

    if (images.length < total) {
      console.warn("generateImage partial success:", {
        requested: total,
        received: images.length,
        lastError,
      });
    }

    return { images };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { images: [], error: "任务已取消" };
    }

    console.error("generateImage unexpected error:", error);
    return {
      images: [],
      error: normalizeUserErrorMessage(error, "生成服务异常，请稍后重试。"),
    };
  }
}
