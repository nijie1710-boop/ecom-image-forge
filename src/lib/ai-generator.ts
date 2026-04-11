import {
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  supabase,
} from "@/integrations/supabase/client";
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
  debugContext?: {
    source?: "main" | "detail" | "copy";
    screenNumber?: number;
  };
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

const GENERATE_FAIL_ERROR = "当前生成失败，请稍后重试";
const NO_IMAGE_ERROR = "商品图片解析失败";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException("任务已取消", "AbortError");
  }
}

async function getInvokeHeaders() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("UNAUTHORIZED");
  }

  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${session.access_token}`,
  };
}

async function invokeGenerateImage(
  body: Record<string, unknown>,
  headers: Record<string, string>,
) {
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/generate-image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      status: 0,
      payload: {
        error: "EDGE_FUNCTION_FETCH_FAILED",
        message,
        meta: body.debugContext,
      },
      rawText: message,
    };
  }

  const rawText = await response.text();
  let payload: Record<string, unknown> | null = null;

  try {
    payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    rawText,
  };
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
    "积分不足",
    "模型配置错误",
    "后端环境变量缺失",
    "product_image_required",
  ].some((keyword) => normalized.includes(keyword));
}

function isRetryableError(message: string | undefined): boolean {
  if (!message) return false;

  const normalized = message.toLowerCase();
  return [
    "timeout",
    "timed out",
    "failed to fetch",
    "networkerror",
    "network request failed",
    "edge_function_fetch_failed",
    "生成接口请求失败",
    "浏览器未能连接",
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
    "上游模型失败",
  ].some((keyword) => normalized.includes(keyword));
}

function normalizeHttpError(status: number, payload: Record<string, unknown> | null, rawText: string) {
  const meta = payload?.meta as
    | {
        failures?: Array<{ code?: string; status?: number; detail?: string; model?: string }>;
        modelsTried?: string[];
      }
    | undefined;
  const lastFailure = meta?.failures?.[meta.failures.length - 1];

  if (status === 0) {
    return `生成接口请求失败：${rawText || "浏览器未能连接到 Edge Function"}`;
  }

  if (payload?.error === "PRODUCT_IMAGE_REQUIRED") {
    return "商品图片缺失或解析失败，请重新上传更清晰的商品图。";
  }

  if (payload?.error === "EMPTY_IMAGE_RESULT") {
    return "AI 没有返回有效图片，请换一个方案或稍后重试。";
  }

  if (payload?.error === "MODEL_NOT_SUPPORTED") {
    return `模型配置错误：${String(payload.detail || payload.message || "当前模型不可用")}`;
  }

  if (payload?.error === "FALLBACK_CHAIN_FAILED") {
    const code = lastFailure?.code || "UNKNOWN";
    const upstreamStatus = lastFailure?.status ? `/${lastFailure.status}` : "";
    const detail = lastFailure?.detail || payload.detail || payload.message || "fallback 后仍失败";
    return `上游模型失败（${code}${upstreamStatus}）：${String(detail).slice(0, 180)}`;
  }

  const detailed =
    typeof payload?.error === "string"
      ? payload.error
      : typeof payload?.message === "string"
      ? payload.message
      : typeof payload?.detail === "string"
      ? payload.detail
      : rawText || `HTTP_${status}`;

  if (
    !detailed ||
    detailed === `HTTP_${status}` ||
    detailed.toLowerCase().includes("edge function returned a non-2xx status code")
  ) {
    if (status === 401) {
      return normalizeUserErrorMessage("UNAUTHORIZED", GENERATE_FAIL_ERROR);
    }
    if (status === 402) {
      return normalizeUserErrorMessage("INSUFFICIENT_BALANCE", GENERATE_FAIL_ERROR);
    }
    if (status === 404 || status === 422) {
      return normalizeUserErrorMessage("MODEL_NOT_SUPPORTED", GENERATE_FAIL_ERROR);
    }
    if ([429, 500, 502, 503, 504].includes(status)) {
      return `generate-image ${status}：${rawText || "上游或 Edge Function 暂时不可用"}`;
    }
  }

  return normalizeUserErrorMessage(detailed, GENERATE_FAIL_ERROR);
}

async function generateSingleImageRaw(
  params: GenerateImageParams,
  attemptLabel: string,
): Promise<{ url: string | null; error: string | null; meta?: GenerateImageMeta }> {
  ensureNotAborted(params.signal);
  const headers = await getInvokeHeaders();

  const { ok, status, payload, rawText } = await invokeGenerateImage(
    {
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
      debugContext: {
        ...params.debugContext,
        promptLength: params.prompt.length,
        referenceGalleryCount: params.referenceGallery?.length || 0,
        hasStyleReference: Boolean(params.styleReferenceImage),
        hasModelReference: Boolean(params.modelImage),
      },
    },
    headers,
  );

  ensureNotAborted(params.signal);

  if (!ok) {
    const normalizedError = normalizeHttpError(status, payload, rawText);
    console.error(`[${attemptLabel}] generate-image edge function error:`, {
      status,
      error: normalizedError,
      payload,
    });
    return {
      url: null,
      error: normalizedError,
      meta: (payload?.meta as GenerateImageMeta | undefined) || undefined,
    };
  }

  const data = payload as Record<string, any> | null;

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
  const isDetailScreen = params.debugContext?.source === "detail";
  const retryCount = isDetailScreen ? 3 : 2;

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

    await sleep((isDetailScreen ? 1600 : 1200) * (attempt + 1));
  }

  return {
    url: null,
    error: lastError || normalizeUserErrorMessage(lastError, GENERATE_FAIL_ERROR),
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
        error: lastError || "本次没有生成成功，请稍后重试。",
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
