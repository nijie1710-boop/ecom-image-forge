import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  generateImage,
  type GenerationModel,
  type ModelMode,
  type OutputResolution,
} from "@/lib/ai-generator";
import { overlayTextOnImage, type OverlayStyle } from "@/lib/image-text-overlay";
import { supabase } from "@/integrations/supabase/client";

export type GenerationJobKind = "copy" | "image" | "detail";
export type GenerationJobStatus = "running" | "done" | "error" | "canceled";

export interface DetailScreenJobResult {
  screen: number;
  title: string;
  prompt: string;
  status: "idle" | "running" | "done" | "error" | "canceled";
  imageUrl?: string;
  error?: string;
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
  screens: DetailScreenJobResult[];
  userId?: string;
  onComplete?: (screens: DetailScreenJobResult[]) => void;
}

type DetailScreenAttemptArgs = {
  prompt: string;
  aspectRatio: string;
  textLanguage: string;
  model?: GenerationModel;
  resolution?: OutputResolution;
  imageBase64: string;
  referenceGallery?: string[];
  styleReferenceImage?: string;
  styleReferenceText?: string;
};

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

async function blobFromDataUrlOrRemote(source: string): Promise<Blob> {
  if (source.startsWith("data:")) {
    const [header, body] = source.split(",");
    const mimeType = header.match(/^data:(.+);base64$/)?.[1] || "image/png";
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`图片下载失败: ${response.status}`);
  }
  return await response.blob();
}

async function generateDetailScreenWithRetry(args: DetailScreenAttemptArgs) {
  let lastError = "当前生成失败，请重试";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await generateImage({
      prompt: args.prompt,
      aspectRatio: args.aspectRatio,
      n: 1,
      imageBase64: args.imageBase64,
      imageType: "详情图",
      textLanguage: args.textLanguage,
      model: args.model,
      resolution: args.resolution,
      referenceGallery: args.referenceGallery,
      styleReferenceImage: args.styleReferenceImage,
      styleReferenceText: args.styleReferenceText,
    });

    if (!result.error && result.images[0]) {
      return result.images[0];
    }

    lastError = result.error || lastError;
  }

  throw new Error(lastError);
}

export const GenerationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const jobsRef = useRef<GenerationJob[]>([]);
  const canceledJobsRef = useRef<Set<string>>(new Set());

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
      updateJobsState((prev) =>
        prev.map((job) => (job.id === id ? { ...job, ...patch } : job)),
      );
    },
    [updateJobsState],
  );

  const updateDetailScreen = useCallback(
    (jobId: string, screenNumber: number, updater: (screen: DetailScreenJobResult) => DetailScreenJobResult) => {
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

  const uploadToStorage = useCallback(async (source: string, id: string): Promise<string> => {
    try {
      const blob = await blobFromDataUrlOrRemote(source);
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
      console.error("upload generated image unexpected error:", error);
      return source;
    }
  }, []);

  const saveLocalHistory = useCallback(
    async (images: string[], payload: HistoryPayload) => {
      if (!images.length) return;
      try {
        const existing = JSON.parse(localStorage.getItem("local_image_history") || "[]");
        const permanentUrls = await Promise.all(
          images.map((url) => uploadToStorage(url, crypto.randomUUID())),
        );
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
    },
    [uploadToStorage],
  );

  const saveCloudHistory = useCallback(
    async (userId: string | undefined, images: string[], payload: HistoryPayload) => {
      if (!userId || !images.length) return;
      try {
        const permanentUrls = await Promise.all(
          images.map((url) => uploadToStorage(url, crypto.randomUUID())),
        );
        const records = permanentUrls.map((url) => ({
          user_id: userId,
          image_url: url,
          prompt: payload.prompt,
          aspect_ratio: payload.aspectRatio,
          image_type: payload.imageType || null,
          style: payload.style || null,
          scene: payload.scene || null,
        }));
        const { error } = await supabase.from("generated_images").insert(records);
        if (error) {
          console.error("save cloud history failed:", error);
        }
      } catch (error) {
        console.error("save cloud history unexpected error:", error);
      }
    },
    [uploadToStorage],
  );

  const getValidImageUrl = useCallback((source: string | undefined): string | undefined => {
    if (!source) return undefined;
    if (/^https?:\/\//i.test(source) || source.startsWith("data:")) return source;
    return undefined;
  }, []);

  const ensureUsableImageUrl = useCallback(
    async (source: string | undefined, tag: string): Promise<string | undefined> => {
      if (!source) return undefined;
      if (source.startsWith("data:")) return source;
      if (/^https?:\/\//i.test(source)) return source;
      const uploaded = await uploadToStorage(source, `${tag}-${crypto.randomUUID()}`);
      return uploaded;
    },
    [uploadToStorage],
  );

  const startCopyGeneration = useCallback(
    (params: CopyGenParams): string => {
      const jobId = crypto.randomUUID();
      const total =
        params.copyImageType === "all" ? 5 : params.copyImageType === "main" ? 1 : 3;

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

      (async () => {
        try {
          const productImage = await ensureUsableImageUrl(
            getValidImageUrl(params.uploadedImages[0]),
            "copy-source",
          );

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
            });
            if (mainResult.images.length) {
              allImages.push(...mainResult.images);
            }
          }

          if (params.copyImageType === "detail" || params.copyImageType === "all") {
            const detailPrompts = [
              {
                label: "卖点展示",
                prompt: `Product detail page image for ${params.generatedCopy.productName}. Highlights: ${params.generatedCopy.sellingPoints.slice(0, 3).join("；")}.`,
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
              if (canceledJobsRef.current.has(jobId)) {
                updateJob(jobId, { status: "canceled", step: "已取消" });
                return;
              }
              const stepNumber = params.copyImageType === "all" ? index + 2 : index + 1;
              updateJob(jobId, { step: detailPrompts[index].label, current: stepNumber });
              const detailResult = await generateImage({
                prompt: detailPrompts[index].prompt,
                aspectRatio: "3:4",
                imageBase64: productImage,
                imageType: "详情图",
                n: 1,
              });
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
          }

          const payload: HistoryPayload = {
            prompt: `AI 文案联动 - ${params.generatedCopy.productName}`,
            aspectRatio: mainRatio,
          };

          await Promise.all([
            saveLocalHistory(finalImages, payload),
            saveCloudHistory(params.userId, finalImages, payload),
          ]);

          updateJob(jobId, {
            status: "done",
            step: "完成",
            current: total,
            results: finalImages,
            error: undefined,
          });
          params.onComplete?.(finalImages);
        } catch (error) {
          updateJob(jobId, {
            status: "error",
            error: error instanceof Error ? error.message : "生成失败",
          });
        }
      })();

      return jobId;
    },
    [
      addJob,
      ensureUsableImageUrl,
      getValidImageUrl,
      saveCloudHistory,
      saveLocalHistory,
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

      (async () => {
        try {
          const primaryImage = await ensureUsableImageUrl(
            getValidImageUrl(params.imageBase64),
            "single-source",
          );
          const gallery = await Promise.all(
            (params.referenceGallery || [])
              .filter((item) => item && item !== params.imageBase64)
              .map((item, index) =>
                ensureUsableImageUrl(getValidImageUrl(item), `gallery-${index}`),
              ),
          );
          const styleReferenceImage = await ensureUsableImageUrl(
            getValidImageUrl(params.styleReferenceImage),
            "style-reference",
          );
          const modelImage = await ensureUsableImageUrl(
            getValidImageUrl(params.modelImage),
            "model-reference",
          );

          const results: string[] = [];
          for (let index = 0; index < params.n; index += 1) {
            if (canceledJobsRef.current.has(jobId)) {
              updateJob(jobId, {
                status: "canceled",
                step: "已取消",
                current: index,
                results,
              });
              return;
            }

            updateJob(jobId, {
              step: `生成第 ${index + 1} 张`,
              current: index + 1,
            });

            const result = await generateImage({
              ...params,
              n: 1,
              imageBase64: primaryImage,
              referenceGallery: gallery.filter(Boolean) as string[],
              styleReferenceImage,
              modelImage,
            });

            if (result.error) {
              updateJob(jobId, {
                status: "error",
                error: result.error,
                results,
              });
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

          updateJob(jobId, {
            status: "done",
            step: "完成",
            current: params.n,
            results,
            error: undefined,
          });
          params.onComplete?.(results);

          void Promise.all([
            saveLocalHistory(results, payload),
            saveCloudHistory(params.userId, results, payload),
          ]).catch((error) => {
            console.error("save image generation history failed:", error);
          });
        } catch (error) {
          updateJob(jobId, {
            status: "error",
            error: error instanceof Error ? error.message : "生成失败",
          });
        }
      })();

      return jobId;
    },
    [
      addJob,
      ensureUsableImageUrl,
      getValidImageUrl,
      saveCloudHistory,
      saveLocalHistory,
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
        },
        createdAt: Date.now(),
      });

      (async () => {
        try {
          const primaryImage = await ensureUsableImageUrl(
            getValidImageUrl(params.productImages[0]),
            "detail-primary",
          );
          if (!primaryImage) {
            updateJob(jobId, { status: "error", error: "缺少主商品图，无法生成" });
            return;
          }

          const gallery = await Promise.all(
            params.productImages
              .slice(1)
              .map((item, index) =>
                ensureUsableImageUrl(getValidImageUrl(item), `detail-gallery-${index}`),
              ),
          );
          const styleReferenceImage = await ensureUsableImageUrl(
            getValidImageUrl(params.styleReferenceImage),
            "detail-style",
          );
          const completedImages: string[] = [];
          const failedScreens: Array<{ screen: number; error: string }> = [];

          for (let index = 0; index < params.screens.length; index += 1) {
            const screen = params.screens[index];
            if (canceledJobsRef.current.has(jobId)) {
              updateJob(jobId, {
                status: "canceled",
                step: "已取消",
                current: index,
                results: completedImages,
              });
              updateDetailScreen(jobId, screen.screen, (current) => ({
                ...current,
                status: "canceled",
              }));
              return;
            }

            updateJob(jobId, {
              step: `生成第 ${screen.screen} 屏`,
              current: index + 1,
            });
            updateDetailScreen(jobId, screen.screen, (current) => ({
              ...current,
              status: "running",
              error: undefined,
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
              referenceGallery: gallery.filter(Boolean) as string[],
              styleReferenceImage,
              styleReferenceText: params.styleReferenceText,
            });

            if (result.error || !result.images[0]) {
              updateDetailScreen(jobId, screen.screen, (current) => ({
                ...current,
                status: "error",
                error: result.error || "本屏生成失败",
              }));
              updateJob(jobId, {
                status: "error",
                error: result.error || `第 ${screen.screen} 屏生成失败`,
                results: completedImages,
              });
              return;
            }

            completedImages.push(result.images[0]);
            updateDetailScreen(jobId, screen.screen, (current) => ({
              ...current,
              status: "done",
              imageUrl: result.images[0],
              error: undefined,
            }));
          }

          const payload: HistoryPayload = {
            prompt: params.screens.map((screen) => `${screen.screen}. ${screen.title}`).join(" | "),
            aspectRatio: params.aspectRatio,
            imageType: "详情图",
            style: params.styleReferenceText,
          };

          const finalScreens =
            (jobsRef.current.find((job) => job.id === jobId)?.detailScreens || []) as DetailScreenJobResult[];

          updateJob(jobId, {
            status: "done",
            step: "完成",
            current: params.screens.length,
            results: completedImages,
            error: undefined,
          });
          params.onComplete?.(finalScreens);

          void Promise.all([
            saveLocalHistory(completedImages, payload),
            saveCloudHistory(params.userId, completedImages, payload),
          ]).catch((error) => {
            console.error("save detail generation history failed:", error);
          });
        } catch (error) {
          updateJob(jobId, {
            status: "error",
            error: error instanceof Error ? error.message : "逐屏生成失败",
          });
        }
      })();

      return jobId;
    },
    [
      addJob,
      ensureUsableImageUrl,
      getValidImageUrl,
      saveCloudHistory,
      saveLocalHistory,
      updateDetailScreen,
      updateJob,
    ],
  );

  const cancelJob = useCallback(
    (id: string) => {
      canceledJobsRef.current.add(id);
      const currentJob = jobsRef.current.find((job) => job.id === id);
      if (!currentJob || currentJob.status !== "running") return;

      updateJob(id, {
        status: "canceled",
        step: "正在取消",
      });
    },
    [updateJob],
  );

  const clearJob = useCallback(
    (id: string) => {
      canceledJobsRef.current.delete(id);
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
