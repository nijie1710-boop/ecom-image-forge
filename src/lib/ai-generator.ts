import { supabase } from "@/integrations/supabase/client";

export type GenerationModel =
  | "gemini-3.1-flash-image-preview"
  | "nano-banana-pro-preview"
  | "gemini-2.5-flash-image";

export type OutputResolution = "0.5k" | "1k" | "2k" | "4k";

export interface GenerateImageParams {
  prompt: string;
  aspectRatio?: string;
  n?: number;
  imageBase64?: string;
  imageType?: string;
  textLanguage?: string;
  model?: GenerationModel;
  resolution?: OutputResolution;
}

export interface GenerateImageResult {
  images: string[];
  error?: string;
}

function isFatalError(message: string | undefined): boolean {
  if (!message) return false;
  return (
    message.includes("余额不足") ||
    message.includes("未授权") ||
    message.includes("请先登录") ||
    message.includes("认证失败") ||
    message.includes("INSUFFICIENT_BALANCE") ||
    message.includes("权限不足")
  );
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
    },
  });

  if (error) {
    console.error(`[attempt ${attempt}] Edge function error:`, error);
    return { url: null, error: error.message || "服务暂时不可用，请稍后重试" };
  }

  if (data?.error) {
    const errorMsg =
      typeof data.error === "string"
        ? data.error
        : data.error?.error || "生成失败";
    console.error(`[attempt ${attempt}] Generation error:`, errorMsg);
    return { url: null, error: errorMsg };
  }

  const imageUrl = data?.images?.[0];
  if (!imageUrl) {
    return { url: null, error: "未能生成图片，请重试" };
  }

  return { url: imageUrl, error: null };
}

export async function generateImage(
  params: GenerateImageParams,
): Promise<GenerateImageResult> {
  try {
    const count = Math.min(Math.max(params.n || 1, 1), 9);
    const images: string[] = [];
    let lastError: string | undefined;

    for (let i = 0; i < count; i++) {
      const result = await generateSingleImage(params, i + 1);

      if (result.url) {
        images.push(result.url);
        continue;
      }

      if (result.error) {
        lastError = result.error;
        if (isFatalError(result.error)) {
          break;
        }
        if (i < count - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
      }
    }

    if (images.length === 0) {
      return { images: [], error: lastError || "未能生成图片，请重试" };
    }

    return { images };
  } catch (error: any) {
    console.error("Generation error:", error);
    return { images: [], error: error.message || "未知错误" };
  }
}
