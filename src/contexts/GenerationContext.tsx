import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  type FidelityContext,
  generateImage,
  type FidelityMode,
  type GenerationModel,
  type ModelMode,
  type OutputResolution,
} from "@/lib/ai-generator";
import { overlayTextOnImage, type OverlayStyle } from "@/lib/image-text-overlay";
import { supabase } from "@/integrations/supabase/client";
import { deductCredits } from "@/lib/detail-credits";
import { isSelfHosted, uploadImageToServer, apiPost } from "@/lib/api-client";

export type GenerationJobKind = "copy" | "image" | "detail";
export type GenerationJobStatus = "running" | "done" | "error" | "canceled";

export interface DetailScreenJobResult {
  screen: number;
  title: string;
  prompt: string;
  status: "idle" | "running" | "done" | "error" | "canceled";
  imageUrl?: string;
  error?: string;
  chargeStatus?: "not_charged" | "charged" | "charge_failed";
  chargeAmount?: number;
  chargeError?: string;
  overlayTitle: string;
  overlayBody: string;
  overlayEnabled: boolean;
}

export interface GenerationJob {
  id: string;
  kind: GenerationJobKind;
  status: GenerationJobStatus;
  step: string;
  current: number;
  total: number;
  results: string[];
  error?: string;
  uploadedImages: string[];
  generatedCopy?: {
    productName: string;
    title: string;
    sellingPoints: string[];
    targetAudience: string;
    priceRange: string;
  };
  detailScreens?: DetailScreenJobResult[];
  detailSettings?: {
    aspectRatio: string;
    textLanguage: string;
    model?: GenerationModel;
    resolution?: OutputResolution;
    styleReferenceImage?: string;
    styleReferenceText?: string;
    fidelityMode?: FidelityMode;
    fidelityContext?: FidelityContext;
  };
  createdAt: number;
}

export interface CopyGenParams {
  uploadedImages: string[];
  generatedCopy: {
    productName: string;
    title: string;
    sellingPoints: string[];
    targetAudience: string;
    priceRange: string;
  };
  copyPlatform: string;
  copyImageType: "main" | "detail" | "all";
  enableTextOverlay: boolean;
  overlayTemplate: OverlayStyle;
  userId?: string;
  onComplete?: (images: string[]) => void;
}

export interface ImageGenParams {
  prompt: string;
  aspectRatio: string;
  imageBase64?: string;
  imageType?: string;
  textLanguage?: string;
  n: number;
  model?: GenerationModel;
  resolution?: OutputResolution;
  referenceGallery?: string[];
  styleReferenceImage?: string;
  styleReferenceText?: string;
  modelMode?: ModelMode;
  modelImage?: string;
  fidelityMode?: FidelityMode;
  fidelityContext?: FidelityContext;
  userId?: string;
  onComplete?: (images: string[]) => void;
}

export interface DetailGenParams {
  aspectRatio: string;
  textLanguage: string;
  model?: GenerationModel;
  resolution?: OutputResolution;
  productImages: string[];
  styleReferenceImage?: string;
  styleReferenceText?: string;
  fidelityMode?: FidelityMode;
  fidelityContext?: FidelityContext;
  screens: DetailScreenJobResult[];
  screenCost?: number;
  chargeDescription?: string;
  userId?: string;
  onComplete?: (screens: DetailScreenJobResult[]) => void;
}

interface GenerationContextType {
  jobs: GenerationJob[];
  activeJob: GenerationJob | null;
  startCopyGeneration: (params: CopyGenParams) => string;
  startImageGeneration: (params: ImageGenParams) => string;
  startDetailGeneration: (params: DetailGenParams) => string;
  cancelJob: (id: string) => void;
  clearJob: (id: string) => void;
  getLatestResults: () => string[];
  getJob: (id: string) => GenerationJob | null;
}

export const GenerationContext = createContext<GenerationContextType | null>(null);

export const useGeneration = () => {
  const ctx = useContext(GenerationContext);
  if (!ctx) {
    throw new Error("useGeneration must be used inside GenerationProvider");
  }
  return ctx;
};

type HistoryPayload = {
  prompt: string;
  aspectRatio: string;
  imageType?: string;
  style?: string;
  scene?: string;
};

class JobCanceledError extends Error {
  constructor() {
    super("任务已取消");
    this.name = "JobCanceledError";
  }
}

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new JobCanceledError());
      return;
    }
    const timer = window.setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new JobCanceledError());
      },
      { once: true },
    );
  });
}

async function blobFromDataUrlOrRemote(source: string, signal?: AbortSignal): Promise<Blob> {
  if (source.startsWith("data:")) {
    const [header, body] = source.split(",");
    const mimeType = header.match(/^data:([^;]+);base64$/)?.[1] || "image/png";
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  const response = await fetch(source, { signal });
  if (!response.ok) {
    throw new Error(`图片下载失败: ${response.status}`);
  }
  return await response.blob();
}

export const GenerationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const jobsRef = useRef<GenerationJob[]>([]);
  const canceledJobsRef = useRef<Set<string>>(new Set());
  const jobRunIdsRef = useRef<Map<string, string>>(new Map());
  const jobAbortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const updateJobsState = useCallback((updater: (prev: GenerationJob[]) => GenerationJob[]) => {
    setJobs((prev) => {
      const next = updater(prev);
      jobsRef.current = next;
      return next;
    });
  }, []);

  const addJob = useCallback(
    (job: GenerationJob) => {
      updateJobsState((prev) => [job, ...prev.slice(0, 11)]);
    },
    [updateJobsState],
  );

  const updateJob = useCallback(
    (id: string, patch: Partial<GenerationJob>) => {
      updateJobsState((prev) => prev.map((job) => (job.id === id ? { ...job, ...patch } : job)));
    },
    [updateJobsState],
  );

  const updateDetailScreen = useCallback(
    (
      jobId: string,
      screenNumber: number,
      updater: (screen: DetailScreenJobResult) => DetailScreenJobResult,
    ) => {
      updateJobsState((prev) =>
        prev.map((job) => {
          if (job.id !== jobId) return job;
          return {
            ...job,
            detailScreens: (job.detailScreens || []).map((screen) =>
              screen.screen === screenNumber ? updater(screen) : screen,
            ),
          };
        }),
      );
    },
    [updateJobsState],
  );

  const startJobExecution = useCallback((jobId: string) => {
    canceledJobsRef.current.delete(jobId);
    const controller = new AbortController();
    const runId = crypto.randomUUID();
    jobRunIdsRef.current.set(jobId, runId);
    jobAbortControllersRef.current.set(jobId, controller);
    return { runId, controller };
  }, []);

  const finishJobExecution = useCallback((jobId: string, runId: string) => {
    if (jobRunIdsRef.current.get(jobId) === runId) {
      jobRunIdsRef.current.delete(jobId);
      jobAbortControllersRef.current.delete(jobId);
      canceledJobsRef.current.delete(jobId);
    }
  }, []);

  const isJobExecutionActive = useCallback((jobId: string, runId: string) => {
    return (
      jobRunIdsRef.current.get(jobId) === runId &&
      !canceledJobsRef.current.has(jobId)
    );
  }, []);

  const assertJobExecutionActive = useCallback(
    (jobId: string, runId: string) => {
      if (!isJobExecutionActive(jobId, runId)) {
        throw new JobCanceledError();
      }
    },
    [isJobExecutionActive],
  );

  const uploadToStorage = useCallback(async (source: string, id: string, signal?: AbortSignal): Promise<string> => {
    try {
      if (signal?.aborted) throw new JobCanceledError();

      if (isSelfHosted) {
        // Self-hosted: upload via API
        let dataUrl = source;
        if (!source.startsWith("data:")) {
          // Convert remote URL to data URL first
          const blob = await blobFromDataUrlOrRemote(source, signal);
          const reader = new FileReader();
          dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to read blob"));
            reader.readAsDataURL(blob);
          });
        }
        if (signal?.aborted) throw new JobCanceledError();
        return await uploadImageToServer(dataUrl, "images");
      }

      // Supabase mode
      const blob = await blobFromDataUrlOrRemote(source, signal);
      const fileName = `generated/${id}.png`;
      const { error } = await supabase.storage
        .from("generated-images")
        .upload(fileName, blob, { upsert: true, contentType: blob.type || "image/png" });

      if (error) {
        console.error("upload generated image failed:", error);
        return source;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("generated-images").getPublicUrl(fileName);
      return publicUrl;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new JobCanceledError();
      }
      if (error instanceof JobCanceledError) throw error;
      console.error("upload generated image unexpected error:", error);
      return source;
    }
  }, []);

  const writeLocalHistory = useCallback(async (permanentUrls: string[], payload: HistoryPayload) => {
    if (!permanentUrls.length) return;
    try {
      const existing = JSON.parse(localStorage.getItem("local_image_history") || "[]");
      const records = permanentUrls.map((url) => ({
        id: crypto.randomUUID(),
        image_url: url,
        prompt: payload.prompt,
        style: payload.style || "",
        scene: payload.scene || "",
        aspect_ratio: payload.aspectRatio,
        image_type: payload.imageType || "",
        created_at: new Date().toISOString(),
      }));

      localStorage.setItem(
        "local_image_history",
        JSON.stringify([...records, ...existing].slice(0, 150)),
      );
    } catch (error) {
      console.error("save local history failed:", error);
    }
  }, []);

  const writeCloudHistory = useCallback(
    async (userId: string | undefined, permanentUrls: string[], payload: HistoryPayload) => {
      if (!userId || !permanentUrls.length) return;
      try {
        const records = permanentUrls.map((url) => ({
          image_url: url,
          prompt: payload.prompt,
          aspect_ratio: payload.aspectRatio,
          image_type: payload.imageType || null,
          style: payload.style || null,
          scene: payload.scene || null,
        }));

        if (isSelfHosted) {
          const resp = await apiPost("user-images", { action: "save", records });
          if (!resp.ok) {
            console.error("save cloud history failed:", resp.rawText);
          }
        } else {
          const supabaseRecords = records.map((r) => ({ ...r, user_id: userId }));
          const { error } = await supabase.from("generated_images").insert(supabaseRecords);
          if (error) {
            console.error("save cloud history failed:", error);
          }
        }
      } catch (error) {
        console.error("save cloud history unexpected error:", error);
      }
    },
    [],
  );

  const persistHistoryOnce = useCallback(
    async (
      userId: string | undefined,
      images: string[],
      payload: HistoryPayload,
      signal?: AbortSignal,
    ) => {
      if (!images.length) return;
      if (signal?.aborted) throw new JobCanceledError();

      const permanentUrls = await Promise.all(
        images.map((url) => uploadToStorage(url, crypto.randomUUID(), signal)),
      );

      if (signal?.aborted) throw new JobCanceledError();

      await Promise.all([
        writeLocalHistory(permanentUrls, payload),
        writeCloudHistory(userId, permanentUrls, payload),
      ]);

      return permanentUrls;
    },
    [uploadToStorage, writeCloudHistory, writeLocalHistory],
  );

  const getValidImageUrl = useCallback((source: string | undefined): string | undefined => {
    if (!source) return undefined;
    if (/^https?:\/\//i.test(source) || source.startsWith("data:")) return source;
    return undefined;
  }, []);

  const ensureUsableImageUrl = useCallback(
    async (source: string | undefined, tag: string, signal?: AbortSignal): Promise<string | undefined> => {
      if (!source) return undefined;
      if (source.startsWith("data:")) return source;
      if (/^https?:\/\//i.test(source)) return source;
      const uploaded = await uploadToStorage(source, `${tag}-${crypto.randomUUID()}`, signal);
      return uploaded;
    },
    [uploadToStorage],
  );

  const startCopyGeneration = useCallback(
    (params: CopyGenParams): string => {
      const jobId = crypto.randomUUID();
      const total = params.copyImageType === "all" ? 5 : params.copyImageType === "main" ? 1 : 3;

      addJob({
        id: jobId,
        kind: "copy",
        status: "running",
        step: "准备生成",
        current: 0,
        total,
        results: [],
        uploadedImages: params.uploadedImages,
        generatedCopy: params.generatedCopy,
        createdAt: Date.now(),
      });

      const { runId, controller } = startJobExecution(jobId);

      void (async () => {
        try {
          const productImage = await ensureUsableImageUrl(
            getValidImageUrl(params.uploadedImages[0]),
            "copy-source",
            controller.signal,
          );
          assertJobExecutionActive(jobId, runId);

          if (!productImage) {
            updateJob(jobId, { status: "error", error: "产品图上传失败，请重试" });
            return;
          }

          const allImages: string[] = [];
          const platformRatioMap: Record<string, string> = {
            "淘宝/天猫": "1:1",
            京东: "1:1",
            拼多多: "1:1",
            抖音: "9:16",
            小红书: "3:4",
            亚马逊: "1:1",
          };
          const mainRatio = platformRatioMap[params.copyPlatform] || "1:1";

          if (params.copyImageType === "main" || params.copyImageType === "all") {
            updateJob(jobId, { step: "生成主图", current: 1 });
            const mainResult = await generateImage({
              prompt: `Professional e-commerce hero image for ${params.generatedCopy.productName}. ${params.generatedCopy.title}`,
              aspectRatio: mainRatio,
              imageBase64: productImage,
              imageType: "主图",
              n: 1,
              signal: controller.signal,
            });
            assertJobExecutionActive(jobId, runId);
            if (mainResult.images.length) {
              allImages.push(...mainResult.images);
            }
          }

          if (params.copyImageType === "detail" || params.copyImageType === "all") {
            const detailPrompts = [
              {
                label: "卖点展示",
                prompt: `Product detail page image for ${params.generatedCopy.productName}. Highlights: ${params.generatedCopy.sellingPoints.slice(0, 3).join("，")}.`,
              },
              {
                label: "场景展示",
                prompt: `Lifestyle scene for ${params.generatedCopy.productName}, targeting ${params.generatedCopy.targetAudience}.`,
              },
              {
                label: "工艺细节",
                prompt: `Macro craftsmanship close-up for ${params.generatedCopy.productName}.`,
              },
            ];

            for (let index = 0; index < detailPrompts.length; index += 1) {
              assertJobExecutionActive(jobId, runId);
              const stepNumber = params.copyImageType === "all" ? index + 2 : index + 1;
              updateJob(jobId, { step: detailPrompts[index].label, current: stepNumber });
              const detailResult = await generateImage({
                prompt: detailPrompts[index].prompt,
                aspectRatio: "3:4",
                imageBase64: productImage,
                imageType: "详情图",
                n: 1,
                signal: controller.signal,
              });
              assertJobExecutionActive(jobId, runId);
              if (detailResult.images.length) {
                allImages.push(...detailResult.images);
              }
            }
          }

          if (!allImages.length) {
            updateJob(jobId, { status: "error", error: "未能生成图片，请重试" });
            return;
          }

          let finalImages = allImages;
          if (params.enableTextOverlay && params.generatedCopy.sellingPoints.length) {
            updateJob(jobId, { step: "后贴文案", current: total });
            finalImages = await Promise.all(
              allImages.map((url) =>
                overlayTextOnImage(url, {
                  productName: params.generatedCopy.productName,
                  sellingPoints: params.generatedCopy.sellingPoints,
                  style: params.overlayTemplate,
                  price: params.generatedCopy.priceRange || undefined,
                  promoText: params.generatedCopy.title || undefined,
                }),
              ),
            );
            assertJobExecutionActive(jobId, runId);
          }

          const payload: HistoryPayload = {
            prompt: `AI 文案联动 - ${params.generatedCopy.productName}`,
            aspectRatio: mainRatio,
          };

          const persistedUrls =
            (await persistHistoryOnce(params.userId, finalImages, payload, controller.signal)) || finalImages;
          assertJobExecutionActive(jobId, runId);

          updateJob(jobId, {
            status: "done",
            step: "完成",
            current: total,
            results: persistedUrls,
            error: undefined,
          });
          params.onComplete?.(persistedUrls);
        } catch (error) {
          if (error instanceof JobCanceledError || (error instanceof DOMException && error.name === "AbortError")) {
            updateJob(jobId, { status: "canceled", step: "已取消", error: undefined });
            return;
          }
          if (!isJobExecutionActive(jobId, runId)) {
            return;
          }
          updateJob(jobId, {
            status: "error",
            error: error instanceof Error ? error.message : "生成失败",
          });
        } finally {
          finishJobExecution(jobId, runId);
        }
      })();

      return jobId;
    },
    [
      addJob,
      assertJobExecutionActive,
      ensureUsableImageUrl,
      finishJobExecution,
      getValidImageUrl,
      isJobExecutionActive,
      persistHistoryOnce,
      startJobExecution,
      updateJob,
    ],
  );

  const startImageGeneration = useCallback(
    (params: ImageGenParams): string => {
      const jobId = crypto.randomUUID();
      addJob({
        id: jobId,
        kind: "image",
        status: "running",
        step: "准备生成",
        current: 0,
        total: params.n,
        results: [],
        uploadedImages: params.imageBase64 ? [params.imageBase64] : [],
        createdAt: Date.now(),
      });

      const { runId, controller } = startJobExecution(jobId);

      void (async () => {
        try {
          const primaryImage = await ensureUsableImageUrl(
            getValidImageUrl(params.imageBase64),
            "single-source",
            controller.signal,
          );
          const gallery = await Promise.all(
            (params.referenceGallery || [])
              .filter((item) => item && item !== params.imageBase64)
              .map((item, index) => ensureUsableImageUrl(getValidImageUrl(item), `gallery-${index}`, controller.signal)),
          );
          const styleReferenceImage = await ensureUsableImageUrl(
            getValidImageUrl(params.styleReferenceImage),
            "style-reference",
            controller.signal,
          );
          const modelImage = await ensureUsableImageUrl(
            getValidImageUrl(params.modelImage),
            "model-reference",
            controller.signal,
          );
          assertJobExecutionActive(jobId, runId);

          const results: string[] = [];
          for (let index = 0; index < params.n; index += 1) {
            assertJobExecutionActive(jobId, runId);
            updateJob(jobId, { step: `生成第 ${index + 1} 张`, current: index + 1 });

            const result = await generateImage({
              ...params,
              n: 1,
              imageBase64: primaryImage,
              referenceGallery: gallery.filter(Boolean) as string[],
              styleReferenceImage,
              modelImage,
              fidelityContext: params.fidelityContext,
              debugContext: {
                source: "main",
              },
              signal: controller.signal,
            });
            assertJobExecutionActive(jobId, runId);

            if (result.error) {
              updateJob(jobId, { status: "error", error: result.error, results });
              return;
            }

            if (result.images[0]) {
              results.push(result.images[0]);
            }
          }

          if (!results.length) {
            updateJob(jobId, { status: "error", error: "未能生成图片，请重试" });
            return;
          }

          const payload: HistoryPayload = {
            prompt: params.prompt,
            aspectRatio: params.aspectRatio,
            imageType: params.imageType,
            style: params.styleReferenceText,
          };

          const persistedUrls = (await persistHistoryOnce(params.userId, results, payload, controller.signal)) || results;
          assertJobExecutionActive(jobId, runId);

          updateJob(jobId, {
            status: "done",
            step: "完成",
            current: params.n,
            results: persistedUrls,
            error: undefined,
          });
          params.onComplete?.(persistedUrls);
        } catch (error) {
          if (error instanceof JobCanceledError || (error instanceof DOMException && error.name === "AbortError")) {
            updateJob(jobId, {
              status: "canceled",
              step: "已取消",
              current: 0,
              error: undefined,
            });
            return;
          }
          if (!isJobExecutionActive(jobId, runId)) {
            return;
          }
          updateJob(jobId, {
            status: "error",
            error: error instanceof Error ? error.message : "生成失败",
          });
        } finally {
          finishJobExecution(jobId, runId);
        }
      })();

      return jobId;
    },
    [
      addJob,
      assertJobExecutionActive,
      ensureUsableImageUrl,
      finishJobExecution,
      getValidImageUrl,
      isJobExecutionActive,
      persistHistoryOnce,
      startJobExecution,
      updateJob,
    ],
  );

  const startDetailGeneration = useCallback(
    (params: DetailGenParams): string => {
      const jobId = crypto.randomUUID();
      addJob({
        id: jobId,
        kind: "detail",
        status: "running",
        step: "准备逐屏生成",
        current: 0,
        total: params.screens.length,
        results: [],
        uploadedImages: params.productImages,
        detailScreens: params.screens,
        detailSettings: {
          aspectRatio: params.aspectRatio,
          textLanguage: params.textLanguage,
          model: params.model,
          resolution: params.resolution,
          styleReferenceImage: params.styleReferenceImage,
          styleReferenceText: params.styleReferenceText,
          fidelityMode: params.fidelityMode,
          fidelityContext: params.fidelityContext,
        },
        createdAt: Date.now(),
      });

      const { runId, controller } = startJobExecution(jobId);

      void (async () => {
        try {
          const primaryImage = await ensureUsableImageUrl(
            getValidImageUrl(params.productImages[0]),
            "detail-primary",
            controller.signal,
          );
          assertJobExecutionActive(jobId, runId);

          if (!primaryImage) {
            updateJob(jobId, { status: "error", error: "缺少主商品图，无法生成" });
            return;
          }

          const gallery = await Promise.all(
            params.productImages
              .slice(1)
              .map((item, index) => ensureUsableImageUrl(getValidImageUrl(item), `detail-gallery-${index}`, controller.signal)),
          );
          const styleReferenceImage = await ensureUsableImageUrl(
            getValidImageUrl(params.styleReferenceImage),
            "detail-style",
            controller.signal,
          );
          assertJobExecutionActive(jobId, runId);

          const completedImages: string[] = [];
          const completedScreenNumbers: number[] = [];
          const chargedScreens: number[] = [];
          const renderFailedScreens: Array<{ screen: number; error: string }> = [];
          const chargeFailedScreens: Array<{ screen: number; error: string }> = [];
          const highVolumeBatch = params.screens.length >= 4;
          let consecutiveRenderFailures = 0;

          for (let index = 0; index < params.screens.length; index += 1) {
            const screen = params.screens[index];
            assertJobExecutionActive(jobId, runId);

            updateJob(jobId, { step: `生成第 ${screen.screen} 屏`, current: index + 1 });
            updateDetailScreen(jobId, screen.screen, (current) => ({
              ...current,
              status: "running",
              error: undefined,
              chargeStatus: "not_charged",
              chargeAmount: undefined,
              chargeError: undefined,
            }));

            const result = await generateImage({
              prompt: screen.prompt,
              aspectRatio: params.aspectRatio,
              n: 1,
              imageBase64: primaryImage,
              imageType: "详情图",
              textLanguage: params.textLanguage,
              model: params.model,
              resolution: params.resolution,
              referenceGallery: (gallery.filter(Boolean) as string[]).slice(
                0,
                params.fidelityMode === "strict"
                  ? params.fidelityContext?.categoryHint === "phone-case"
                    ? 6
                    : 5
                  : 1,
              ),
              styleReferenceImage,
              styleReferenceText: params.styleReferenceText,
              fidelityMode: params.fidelityMode,
              fidelityContext: params.fidelityContext,
              debugContext: {
                source: "detail",
                screenNumber: screen.screen,
              },
              signal: controller.signal,
            });
            assertJobExecutionActive(jobId, runId);

            if (result.error || !result.images[0]) {
              const screenError = result.error || "本屏生成失败";
              consecutiveRenderFailures += 1;
              renderFailedScreens.push({ screen: screen.screen, error: screenError });
              updateDetailScreen(jobId, screen.screen, (current) => ({
                ...current,
                status: "error",
                error: `本屏生成失败，未扣费：${screenError}`,
                chargeStatus: "not_charged",
                chargeAmount: 0,
                chargeError: undefined,
              }));
              if (index < params.screens.length - 1) {
                const failureDelay = highVolumeBatch
                  ? 5200 + Math.min(consecutiveRenderFailures - 1, 3) * 1200
                  : 1600;
                await wait(failureDelay, controller.signal);
              }
              continue;
            }

            let chargeStatus: DetailScreenJobResult["chargeStatus"] = "charged";
            let chargeAmount = params.screenCost && params.screenCost > 0 ? params.screenCost : 0;
            let chargeError: string | undefined;

            if (params.screenCost && params.screenCost > 0) {
              const deductResult = await deductCredits(
                params.screenCost,
                "detail_screen_generation",
                `${params.chargeDescription || "AI 详情页逐屏生成"} - 第 ${screen.screen} 屏`,
              );

              if (!deductResult.success) {
                chargeStatus = "charge_failed";
                chargeAmount = 0;
                chargeError = deductResult.error || "未知错误";
                console.warn("detail screen generated but charge failed:", {
                  screen: screen.screen,
                  error: chargeError,
                });
                chargeFailedScreens.push({ screen: screen.screen, error: chargeError });
              } else {
                chargedScreens.push(screen.screen);
              }
            }

            consecutiveRenderFailures = 0;
            completedImages.push(result.images[0]);
            completedScreenNumbers.push(screen.screen);
            updateDetailScreen(jobId, screen.screen, (current) => ({
              ...current,
              status: "done",
              imageUrl: result.images[0],
              error:
                chargeStatus === "charge_failed"
                  ? `本屏已生成，但扣费失败：${chargeError || "未知错误"}。请稍后同步积分状态。`
                  : undefined,
              chargeStatus,
              chargeAmount,
              chargeError,
            }));

            if (index < params.screens.length - 1) {
              await wait(highVolumeBatch ? 4200 : 1800, controller.signal);
            }
          }

          if (!completedImages.length) {
            updateJob(jobId, {
              status: "error",
              step: "生成失败",
              current: params.screens.length,
              results: [],
              error:
                renderFailedScreens[0]?.error || "当前生成失败，请重试。建议保留当前识别结果，稍后重新生成一次。",
            });
            return;
          }

          const payload: HistoryPayload = {
            prompt: params.screens.map((screen) => `${screen.screen}. ${screen.title}`).join(" | "),
            aspectRatio: params.aspectRatio,
            imageType: "详情图",
            style: params.styleReferenceText,
          };

          const persistedUrls =
            (await persistHistoryOnce(params.userId, completedImages, payload, controller.signal)) || completedImages;
          assertJobExecutionActive(jobId, runId);

          // Write persisted URLs back to individual screen results
          persistedUrls.forEach((url, index) => {
            const screenNumber = completedScreenNumbers[index];
            if (screenNumber !== undefined && url !== completedImages[index]) {
              updateDetailScreen(jobId, screenNumber, (current) => ({ ...current, imageUrl: url }));
            }
          });

          const finalScreens =
            (jobsRef.current.find((job) => job.id === jobId)?.detailScreens || []) as DetailScreenJobResult[];

          updateJob(jobId, {
            status: "done",
            step: renderFailedScreens.length || chargeFailedScreens.length ? "部分完成" : "完成",
            current: params.screens.length,
            results: persistedUrls,
            error:
              renderFailedScreens.length || chargeFailedScreens.length
                ? [
                    `已成功生成 ${completedImages.length} 屏，已扣 ${chargedScreens.length * (params.screenCost || 0)} 积分。`,
                    renderFailedScreens.length
                      ? `生成失败 ${renderFailedScreens.length} 屏，未扣费：${renderFailedScreens
                          .map((item) => `第 ${item.screen} 屏`)
                          .join("、")}。`
                      : "",
                    chargeFailedScreens.length
                      ? `另有 ${chargeFailedScreens.length} 屏已生成但扣费失败，请稍后同步积分状态：${chargeFailedScreens
                          .map((item) => `第 ${item.screen} 屏`)
                          .join("、")}。`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                : undefined,
          });
          params.onComplete?.(finalScreens);
        } catch (error) {
          if (error instanceof JobCanceledError || (error instanceof DOMException && error.name === "AbortError")) {
            updateJob(jobId, {
              status: "canceled",
              step: "已取消",
              current: 0,
              error: undefined,
            });
            return;
          }
          if (!isJobExecutionActive(jobId, runId)) {
            return;
          }
          updateJob(jobId, {
            status: "error",
            error: error instanceof Error ? error.message : "逐屏生成失败",
          });
        } finally {
          finishJobExecution(jobId, runId);
        }
      })();

      return jobId;
    },
    [
      addJob,
      assertJobExecutionActive,
      ensureUsableImageUrl,
      finishJobExecution,
      getValidImageUrl,
      isJobExecutionActive,
      persistHistoryOnce,
      startJobExecution,
      updateDetailScreen,
      updateJob,
    ],
  );

  const cancelJob = useCallback(
    (id: string) => {
      canceledJobsRef.current.add(id);
      jobAbortControllersRef.current.get(id)?.abort();
      const currentJob = jobsRef.current.find((job) => job.id === id);
      if (!currentJob || currentJob.status !== "running") return;

      updateJob(id, {
        status: "canceled",
        step: "正在取消",
        error: undefined,
      });
    },
    [updateJob],
  );

  const clearJob = useCallback(
    (id: string) => {
      canceledJobsRef.current.delete(id);
      jobRunIdsRef.current.delete(id);
      jobAbortControllersRef.current.delete(id);
      updateJobsState((prev) => prev.filter((job) => job.id !== id));
    },
    [updateJobsState],
  );

  const getLatestResults = useCallback(() => {
    const finished = jobsRef.current.find((job) => job.status === "done");
    return finished?.results || [];
  }, []);

  const getJob = useCallback((id: string) => {
    return jobsRef.current.find((job) => job.id === id) || null;
  }, []);

  const activeJob = useMemo(() => jobs[0] || null, [jobs]);

  const value = useMemo<GenerationContextType>(
    () => ({
      jobs,
      activeJob,
      startCopyGeneration,
      startImageGeneration,
      startDetailGeneration,
      cancelJob,
      clearJob,
      getLatestResults,
      getJob,
    }),
    [
      jobs,
      activeJob,
      startCopyGeneration,
      startImageGeneration,
      startDetailGeneration,
      cancelJob,
      clearJob,
      getLatestResults,
      getJob,
    ],
  );

  return <GenerationContext.Provider value={value}>{children}</GenerationContext.Provider>;
};
