import { supabase } from "@/integrations/supabase/client";
import { normalizeUserErrorMessage } from "@/lib/error-messages";
import type { GenerationModel } from "@/lib/gemini-models";

export type { GenerationModel } from "@/lib/gemini-models";

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

export interface GenerateImageMeta {
  modelRequested: string;
  modelUsed: string;
  fallbackUsed?: boolean;
  resolution?: string;
  modelsTried?: string[];
  failures?: Array<{
    model: string;
    attempt: number;
    status: number;
    code: string;
    detail: string;
  }>;
}

export interface GenerateImageResult {
  images: string[];
  error?: string;
  meta?: GenerateImageMeta[];
}

type InvokeLikeError = {
  message?: string;
  name?: string;
  context?: {
    json?: () => Promise<unknown>;
    text?: () => Promise<string>;
    status?: number;
  };
};

const DEFAULT_ERROR = "系统繁忙，请稍后再试";
const GENERATE_FAIL_ERROR = "当前生成失败，请重试";
const NO_IMAGE_ERROR = "商品图片解析失败";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("任务已取消", "AbortError");
  }
}

async function extractInvokeErrorPayload(error: unknown) {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybeError = error as InvokeLikeError;

  if (maybeError.context?.json) {
    try {
      return (await maybeError.context.json()) as
        | { error?: string; message?: string; detail?: string; meta?: Record<string, unknown> }
        | undefined;
    } catch {
      // ignore JSON extraction failures
    }
  }

  return null;
}

async function getInvokeHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function extractInvokeErrorMessage(error: unknown): Promise<string> {
  const payload = await extractInvokeErrorPayload(error);
  const detailed = payload?.error || payload?.message || payload?.detail;
  if (detailed) {
    return normalizeUserErrorMessage(detailed, GENERATE_FAIL_ERROR);
  }

  const maybeError = error as InvokeLikeError;
  if (maybeError?.context?.text) {
    try {
      const text = await maybeError.context.text();
      if (text) {
        return normalizeUserErrorMessage(text, GENERATE_FAIL_ERROR);
      }
    } catch {
      // ignore text extraction failures
    }
  }

  if (
    maybeError?.message?.includes("non-2xx") &&
    typeof maybeError?.context?.status === "number"
  ) {
    if (maybeError.context.status === 401) {
      return normalizeUserErrorMessage("UNAUTHORIZED", GENERATE_FAIL_ERROR);
    }
    if (maybeError.context.status === 402) {
      return normalizeUserErrorMessage("INSUFFICIENT_BALANCE", GENERATE_FAIL_ERROR);
    }
    if (maybeError.context.status === 429) {
      return normalizeUserErrorMessage("UPSTREAM_429", GENERATE_FAIL_ERROR);
    }
    if ([500, 502, 503, 504].includes(maybeError.context.status)) {
      return normalizeUserErrorMessage(`UPSTREAM_${maybeError.context.status}`, GENERATE_FAIL_ERROR);
    }
  }

  return normalizeUserErrorMessage(maybeError?.message, DEFAULT_ERROR);
}

function normalizeModelLabel(model: GenerationModel | undefined): GenerationModel {
  return model || "gemini-2.5-flash-image";
}

function normalizeResolution(resolution: OutputResolution | undefined): OutputResolution {
  return resolution || "1k";
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
    "model_not_supported",
    "gemini_api_key_missing",
    "supabase_url_missing",
    "supabase_service_role_key_missing",
    "未登录",
    "余额不足",
    "模型配置错误",
    "后端环境变量缺失",
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
    "fallback_chain_failed",
    "upstream_429",
    "upstream_500",
    "upstream_502",
    "upstream_503",
    "upstream_504",
    "no image returned",
    "system busy",
    "上游 ai 服务暂时不可用",
    "ai 没有返回有效图片",
    "系统繁忙",
  ].some((keyword) => normalized.includes(keyword));
}

async function generateSingleImageRaw(
  params: GenerateImageParams,
  attemptLabel: string,
): Promise<{ url: string | null; error: string | null; meta?: GenerateImageMeta }> {
  ensureNotAborted(params.signal);
  const headers = await getInvokeHeaders();

  const { data, error } = await supabase.functions.invoke("generate-image", {
    headers,
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

    console.error(`[${attemptLabel}] generate-image returned error:`, {
      error: errorMessage,
      meta: data?.meta,
    });
    return {
      url: null,
      error: normalizeUserErrorMessage(errorMessage, GENERATE_FAIL_ERROR),
      meta: data?.meta as GenerateImageMeta | undefined,
    };
  }

  const imageUrl = data?.images?.[0];
  const meta = data?.meta as GenerateImageMeta | undefined;
  if (meta) {
    console.info(`[${attemptLabel}] generate-image meta:`, meta);
  }

  if (!imageUrl) {
    return {
      url: null,
      error: normalizeUserErrorMessage("EMPTY_IMAGE_RESULT", NO_IMAGE_ERROR),
      meta,
    };
  }

  return { url: imageUrl, error: null, meta };
}

async function generateSingleImageStable(
  params: GenerateImageParams,
  batchIndex: number,
): Promise<{ url: string | null; error: string | null; meta?: GenerateImageMeta }> {
  let lastError: string | null = null;
  let lastMeta: GenerateImageMeta | undefined;
  const retryCount = 2;

  for (let attempt = 0; attempt < retryCount; attempt += 1) {
    ensureNotAborted(params.signal);
    const attemptLabel = `batch-${batchIndex}-attempt-${attempt + 1}`;
    const result = await generateSingleImageRaw(params, attemptLabel);
    if (result.url) {
      return result;
    }

    lastError = result.error;
    lastMeta = result.meta;

    if (isFatalError(result.error || undefined)) {
      return { url: null, error: result.error, meta: result.meta };
    }

    if (!isRetryableError(result.error || undefined) || attempt >= retryCount - 1) {
      break;
    }

    await sleep(1200 * (attempt + 1));
  }

  return {
    url: null,
    error: normalizeUserErrorMessage(lastError, GENERATE_FAIL_ERROR),
    meta: lastMeta,
  };
}

export async function generateImage(params: GenerateImageParams): Promise<GenerateImageResult> {
  try {
    ensureNotAborted(params.signal);
    const total = Math.min(Math.max(params.n || 1, 1), 9);
    const images: string[] = [];
    const meta: GenerateImageMeta[] = [];
    let lastError: string | undefined;

    for (let index = 0; index < total; index += 1) {
      const result = await generateSingleImageStable({ ...params, n: 1 }, index + 1);
      ensureNotAborted(params.signal);

      if (result.url) {
        images.push(result.url);
        if (result.meta) {
          meta.push(result.meta);
        }
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
        meta,
      };
    }

    if (images.length < total) {
      console.warn("generateImage partial success:", {
        requested: total,
        received: images.length,
        lastError,
        meta,
      });
    }

    return { images, meta };
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
