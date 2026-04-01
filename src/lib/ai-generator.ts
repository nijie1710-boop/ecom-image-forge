import { supabase } from "@/integrations/supabase/client";

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
}

export interface GenerateImageResult {
  images: string[];
  error?: string;
}

function isFatalError(message: string | undefined): boolean {
  if (!message) return false;

  const normalized = message.toLowerCase();
  return [
    "insufficient_balance",
    "unauthorized",
    "forbidden",
    "authentication",
    "quota",
    "billing",
    "login",
    "not authenticated",
  ].some((keyword) => normalized.includes(keyword));
}

async function generateSingleImage(
  params: GenerateImageParams,
  attempt: number,
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("generate-image", {
    body: {
      prompt: params.prompt,
      imageBase64: params.imageBase64 || undefined,
      aspectRatio: params.aspectRatio || "1:1",
      imageType: params.imageType || "主图",
      textLanguage: params.textLanguage || "zh",
      model: params.model || "nano-banana-pro-preview",
      resolution: params.resolution || "2k",
      referenceGallery: params.referenceGallery || [],
      referenceStyleUrl: params.styleReferenceImage || undefined,
      styleReferenceText: params.styleReferenceText || undefined,
      modelMode: params.modelMode || "none",
      modelImage: params.modelImage || undefined,
    },
  });

  if (error) {
    console.error(`[attempt ${attempt}] generate-image edge function error:`, error);
    return {
      url: null,
      error: error.message || "图片生成服务暂时不可用，请稍后重试",
    };
  }

  if (data?.error) {
    const errorMessage =
      typeof data.error === "string"
        ? data.error
        : data.error?.message || data.error?.error || "生成失败";

    console.error(`[attempt ${attempt}] generate-image returned error:`, errorMessage);
    return { url: null, error: errorMessage };
  }

  const imageUrl = data?.images?.[0];
  if (!imageUrl) {
    return { url: null, error: "未能生成图片，请稍后重试" };
  }

  return { url: imageUrl, error: null };
}

export async function generateImage(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  try {
    const total = Math.min(Math.max(params.n || 1, 1), 9);
    const images: string[] = [];
    let lastError: string | undefined;

    for (let index = 0; index < total; index += 1) {
      const result = await generateSingleImage(params, index + 1);
      if (result.url) {
        images.push(result.url);
        continue;
      }

      if (result.error) {
        lastError = result.error;
        if (isFatalError(result.error)) {
          break;
        }
      }

      if (index < total - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1600));
      }
    }

    if (!images.length) {
      return {
        images: [],
        error: lastError || "未能生成图片，请稍后重试",
      };
    }

    return { images };
  } catch (error) {
    console.error("generateImage unexpected error:", error);
    return {
      images: [],
      error: error instanceof Error ? error.message : "未知错误",
    };
  }
}
