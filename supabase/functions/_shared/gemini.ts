export const IMAGE_MODEL_LABELS = {
  "gemini-2.5-flash-image": "Nano Banana",
  "gemini-3.1-flash-image-preview": "Nano Banana 2",
  "nano-banana-pro-preview": "Nano Banana Pro",
  "gemini-3-pro-image-preview": "Nano Banana Pro",
} as const;

export type ImageModelInput = keyof typeof IMAGE_MODEL_LABELS;
export type CanonicalImageModel =
  | "gemini-2.5-flash-image"
  | "gemini-3.1-flash-image-preview"
  | "gemini-3-pro-image-preview";
export type TextModel = "gemini-2.5-flash" | "gemini-2.5-flash-lite";

export type GeminiAttemptFailure = {
  model: string;
  attempt: number;
  status: number;
  code: string;
  detail: string;
};

export type GeminiExecutionMeta = {
  modelRequested: string;
  modelUsed: string;
  fallbackUsed: boolean;
  modelsTried: string[];
  failures: GeminiAttemptFailure[];
  resolution?: string;
  rawResponseLength?: number;
};

export class FunctionError extends Error {
  code: string;
  status: number;
  detail?: string;
  meta?: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    message: string,
    options?: { detail?: string; meta?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "FunctionError";
    this.code = code;
    this.status = status;
    this.detail = options?.detail;
    this.meta = options?.meta;
  }
}

const IMAGE_MODEL_DEFINITIONS: Record<
  ImageModelInput,
  {
    label: string;
    requestedModel: CanonicalImageModel;
    fallbackChain: CanonicalImageModel[];
    aliases: string[];
  }
> = {
  "gemini-2.5-flash-image": {
    label: "Nano Banana",
    requestedModel: "gemini-2.5-flash-image",
    fallbackChain: [
      "gemini-2.5-flash-image",
      "gemini-3.1-flash-image-preview",
      "gemini-3-pro-image-preview",
    ],
    aliases: ["nano banana", "gemini-2.5-flash-image"],
  },
  "gemini-3.1-flash-image-preview": {
    label: "Nano Banana 2",
    requestedModel: "gemini-3.1-flash-image-preview",
    fallbackChain: [
      "gemini-3.1-flash-image-preview",
      "gemini-2.5-flash-image",
      "gemini-3-pro-image-preview",
    ],
    aliases: ["nano banana 2", "banana 2", "gemini-3.1-flash-image-preview"],
  },
  "nano-banana-pro-preview": {
    label: "Nano Banana Pro",
    requestedModel: "gemini-3-pro-image-preview",
    fallbackChain: [
      "gemini-3-pro-image-preview",
      "gemini-3.1-flash-image-preview",
      "gemini-2.5-flash-image",
    ],
    aliases: [
      "nano banana pro",
      "nano-banana-pro-preview",
      "gemini-3-pro-image-preview",
      "pro image preview",
    ],
  },
  "gemini-3-pro-image-preview": {
    label: "Nano Banana Pro",
    requestedModel: "gemini-3-pro-image-preview",
    fallbackChain: [
      "gemini-3-pro-image-preview",
      "gemini-3.1-flash-image-preview",
      "gemini-2.5-flash-image",
    ],
    aliases: [
      "nano banana pro",
      "nano-banana-pro-preview",
      "gemini-3-pro-image-preview",
      "pro image preview",
    ],
  },
};

const DEFAULT_TEXT_MODEL_CHAIN: TextModel[] = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];

export function jsonResponse(payload: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(extraHeaders || {}),
    },
  });
}

export function errorResponse(
  error: unknown,
  extraHeaders?: Record<string, string>,
  fallbackMessage = "Unknown error",
) {
  if (error instanceof FunctionError) {
    return jsonResponse(
      {
        error: error.code,
        message: error.message,
        detail: error.detail,
        meta: error.meta,
      },
      error.status,
      extraHeaders,
    );
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return jsonResponse(
    {
      error: "UNKNOWN_ERROR",
      message,
    },
    500,
    extraHeaders,
  );
}

export function requireEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new FunctionError(
      `${name}_MISSING`,
      500,
      `Required environment variable ${name} is missing`,
    );
  }
  return value;
}

export function resolveImageModelSelection(value: unknown) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return IMAGE_MODEL_DEFINITIONS["gemini-2.5-flash-image"];
  }

  for (const definition of Object.values(IMAGE_MODEL_DEFINITIONS)) {
    if (definition.aliases.some((alias) => normalized.includes(alias))) {
      return definition;
    }
  }

  throw new FunctionError(
    "MODEL_NOT_SUPPORTED",
    500,
    `Unsupported image model selection: ${String(value || "")}`,
    { detail: String(value || "") },
  );
}

export function getDefaultTextModelChain() {
  return [...DEFAULT_TEXT_MODEL_CHAIN];
}

function sanitizeDetail(detail: string) {
  return detail.replace(/\s+/g, " ").trim().slice(0, 500);
}

function extractErrorDetail(rawText: string) {
  try {
    const parsed = JSON.parse(rawText);
    return sanitizeDetail(String(parsed?.error?.message || rawText));
  } catch {
    return sanitizeDetail(rawText);
  }
}

function classifyUpstreamFailure(status: number, detail: string) {
  const normalized = detail.toLowerCase();

  if (
    status === 404 ||
    normalized.includes("not found for api version") ||
    normalized.includes("call listmodels") ||
    normalized.includes("model") && normalized.includes("not found")
  ) {
    return {
      code: "MODEL_NOT_SUPPORTED",
      status: 500,
      message: "Configured Gemini model is invalid or unavailable",
    };
  }

  if (status === 429 || normalized.includes("rate limit") || normalized.includes("resource exhausted")) {
    return {
      code: "UPSTREAM_429",
      status: 503,
      message: "Gemini upstream rate limited the request",
    };
  }

  if (status === 503 || normalized.includes("temporarily unavailable")) {
    return {
      code: "UPSTREAM_503",
      status: 503,
      message: "Gemini upstream is temporarily unavailable",
    };
  }

  if ([500, 502, 504].includes(status) || normalized.includes("internal")) {
    return {
      code: `UPSTREAM_${status || 500}`,
      status: 503,
      message: "Gemini upstream returned a server error",
    };
  }

  return {
    code: "UPSTREAM_REQUEST_FAILED",
    status: status >= 500 ? 503 : 502,
    message: "Gemini request failed",
  };
}

function isRetryableFailure(status: number, code: string, detail: string) {
  if ([408, 429, 500, 502, 503, 504].includes(status)) return true;
  const normalized = detail.toLowerCase();
  if (code === "EMPTY_IMAGE_RESULT" || code === "EMPTY_TEXT_RESULT") return true;
  return [
    "timeout",
    "temporarily unavailable",
    "try again",
    "internal",
    "resource exhausted",
    "rate limit",
    "no image returned",
    "empty",
  ].some((keyword) => normalized.includes(keyword));
}

type CallGeminiOptions = {
  apiKey: string;
  functionName: string;
  models: string[];
  parts: unknown[];
  expectImage?: boolean;
  generationConfig?: Record<string, unknown>;
};

async function callGeminiWithFallback(options: CallGeminiOptions) {
  const failures: GeminiAttemptFailure[] = [];
  const modelsTried: string[] = [];

  for (const model of options.models) {
    modelsTried.push(model);

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${options.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: options.parts }],
            generationConfig: options.generationConfig,
            safetySettings: options.expectImage
              ? [
                  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
                ]
              : undefined,
          }),
        },
      );

      const rawText = await response.text();

      if (!response.ok) {
        const detail = extractErrorDetail(rawText);
        const classified = classifyUpstreamFailure(response.status, detail);
        const failure = {
          model,
          attempt,
          status: response.status,
          code: classified.code,
          detail,
        };
        failures.push(failure);
        console.error(`[${options.functionName}] Gemini request failed`, failure);
        if (attempt < 2 && isRetryableFailure(response.status, classified.code, detail)) {
          continue;
        }
        break;
      }

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const failure = {
          model,
          attempt,
          status: 200,
          code: "INVALID_JSON_RESPONSE",
          detail: sanitizeDetail(rawText),
        };
        failures.push(failure);
        console.error(`[${options.functionName}] Gemini invalid JSON`, failure);
        if (attempt < 2) continue;
        break;
      }

      if (options.expectImage) {
        const candidates = (parsed as {
          candidates?: Array<{
            content?: {
              parts?: Array<{ inlineData?: { mimeType: string; data: string } }>;
            };
          }>;
        }).candidates;
        const partsOut = candidates?.[0]?.content?.parts || [];
        const imagePart = partsOut.find((part) => part.inlineData?.data);

        if (imagePart?.inlineData?.data) {
          return {
            kind: "image" as const,
            modelUsed: model,
            modelsTried,
            failures,
            rawResponseLength: rawText.length,
            imageUrl: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
          };
        }

        const failure = {
          model,
          attempt,
          status: 200,
          code: "EMPTY_IMAGE_RESULT",
          detail: "Gemini returned 200 but no image payload",
        };
        failures.push(failure);
        console.error(`[${options.functionName}] Gemini empty image result`, failure);
        if (attempt < 2) continue;
        break;
      }

      const candidates = (parsed as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      }).candidates;
      const partsOut = candidates?.[0]?.content?.parts || [];
      const textPart = partsOut.find((part) => typeof part.text === "string" && part.text.trim());

      if (textPart?.text) {
        return {
          kind: "text" as const,
          modelUsed: model,
          modelsTried,
          failures,
          rawResponseLength: rawText.length,
          text: textPart.text,
        };
      }

      const failure = {
        model,
        attempt,
        status: 200,
        code: "EMPTY_TEXT_RESULT",
        detail: "Gemini returned 200 but no text payload",
      };
      failures.push(failure);
      console.error(`[${options.functionName}] Gemini empty text result`, failure);
      if (attempt < 2) continue;
      break;
    }
  }

  const lastFailure = failures[failures.length - 1];
  throw new FunctionError(
    lastFailure?.code === "MODEL_NOT_SUPPORTED" && failures.every((item) => item.code === "MODEL_NOT_SUPPORTED")
      ? "MODEL_NOT_SUPPORTED"
      : "FALLBACK_CHAIN_FAILED",
    lastFailure?.status === 500 ? 500 : 503,
    "All configured Gemini fallback models failed",
    {
      detail: lastFailure?.detail,
      meta: {
        modelRequested: options.models[0],
        modelsTried,
        failures,
      },
    },
  );
}

export async function callGeminiTextWithFallback(options: {
  apiKey: string;
  functionName: string;
  models?: string[];
  parts: unknown[];
  generationConfig?: Record<string, unknown>;
  resolution?: string;
}) {
  const result = await callGeminiWithFallback({
    apiKey: options.apiKey,
    functionName: options.functionName,
    models: options.models || getDefaultTextModelChain(),
    parts: options.parts,
    generationConfig: options.generationConfig,
  });

  return {
    text: result.text,
    meta: {
      modelRequested: (options.models || getDefaultTextModelChain())[0],
      modelUsed: result.modelUsed,
      fallbackUsed: result.modelUsed !== (options.models || getDefaultTextModelChain())[0],
      modelsTried: result.modelsTried,
      failures: result.failures,
      resolution: options.resolution,
      rawResponseLength: result.rawResponseLength,
    } satisfies GeminiExecutionMeta,
  };
}

export async function callGeminiImageWithFallback(options: {
  apiKey: string;
  functionName: string;
  selectedModel: ImageModelInput | string;
  parts: unknown[];
  generationConfig?: Record<string, unknown>;
  resolution?: string;
}) {
  const selection = resolveImageModelSelection(options.selectedModel);
  const result = await callGeminiWithFallback({
    apiKey: options.apiKey,
    functionName: options.functionName,
    models: selection.fallbackChain,
    parts: options.parts,
    expectImage: true,
    generationConfig: {
      responseModalities: ["text", "image"],
      maxOutputTokens: 512,
      ...(options.generationConfig || {}),
    },
  });

  return {
    imageUrl: result.imageUrl,
    modelSelection: selection,
    meta: {
      modelRequested: selection.requestedModel,
      modelUsed: result.modelUsed,
      fallbackUsed: result.modelUsed !== selection.requestedModel,
      modelsTried: result.modelsTried,
      failures: result.failures,
      resolution: options.resolution,
      rawResponseLength: result.rawResponseLength,
    } satisfies GeminiExecutionMeta,
  };
}
