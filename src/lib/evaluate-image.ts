import { apiPost } from "@/lib/api-client";

export interface ImageEvaluation {
  score: number;
  rating: string;
  usageSuggestion: string;
  strengths: string[];
  improvements: string[];
}

interface EvaluateResponse {
  evaluation: ImageEvaluation;
  meta?: Record<string, unknown>;
}

export async function evaluateImage(
  imageUrl: string,
  imageType?: string,
  aspectRatio?: string,
): Promise<ImageEvaluation> {
  const res = await apiPost<EvaluateResponse>("evaluate-image", {
    imageUrl,
    imageType,
    aspectRatio,
  }, { auth: "optional" });

  if (!res.ok || !res.data?.evaluation) {
    const msg = (res.data as Record<string, unknown> | null)?.error;
    throw new Error(typeof msg === "string" ? msg : "图片评估失败，请重试");
  }

  return res.data.evaluation;
}
