import { buildApiUrl, getOptionalAuthHeaders } from "@/lib/api-client";
import { normalizeUserErrorMessage } from "@/lib/error-messages";

export type SceneSuggestion = {
  scene: string;
  description: string;
};

export type SuggestScenesResponse = {
  product_summary: string;
  visible_text: string;
  suggestions: SceneSuggestion[];
  meta?: {
    modelRequested: string;
    modelUsed: string;
    fallbackUsed?: boolean;
    modelsTried?: string[];
  };
};

async function getInvokeHeaders() {
  return getOptionalAuthHeaders();
}

export async function suggestScenes(imageBase64: string, imageType: string) {
  const headers = await getInvokeHeaders();
  const response = await fetch(buildApiUrl("suggest-scenes"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      imageBase64,
      imageType,
    }),
  });

  const rawText = await response.text();
  let payload: Record<string, unknown> | null = null;

  try {
    payload = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      typeof payload?.message === "string"
        ? payload.message
        : typeof payload?.detail === "string"
        ? payload.detail
        : typeof payload?.error === "string"
        ? payload.error
        : rawText || `HTTP_${response.status}`;
    throw new Error(normalizeUserErrorMessage(detail, "场景识别失败，请稍后重试。"));
  }

  if (!payload?.suggestions || !Array.isArray(payload.suggestions)) {
    throw new Error("场景识别没有返回有效结果，请稍后重试。");
  }

  return payload as unknown as SuggestScenesResponse;
}
