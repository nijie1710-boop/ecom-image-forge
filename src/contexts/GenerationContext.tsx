import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { generateImage } from "@/lib/ai-generator";
import { overlayTextOnImage, type OverlayStyle } from "@/lib/image-text-overlay";
import { supabase } from "@/integrations/supabase/client";

export type GenerationJobKind = "copy" | "image";

export interface GenerationJob {
  id: string;
  kind: GenerationJobKind;
  status: "running" | "done" | "error";
  step: string;
  current: number;
  total: number;
  results: string[];
  error?: string;
  uploadedImages: string[];
  generatedCopy?: any;
  createdAt: number;
}

interface GenerationContextType {
  jobs: GenerationJob[];
  activeJob: GenerationJob | null;
  startCopyGeneration: (params: CopyGenParams) => string;
  startImageGeneration: (params: ImageGenParams) => string;
  clearJob: (id: string) => void;
  getLatestResults: () => string[];
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
  style: string;
  scene: string;
  userId?: string;
  onComplete?: (images: string[]) => void;
}

export interface ImageGenParams {
  prompt: string;
  ratio: string;
  imageBase64?: string;
  referenceImageUrl?: string;
  imageType?: string;
  n: number;
  style: string;
  scene: string;
  model: string;
  uiRatioLabel?: string;
  userId?: string;
  onComplete?: (images: string[]) => void;
}

export const GenerationContext = createContext<GenerationContextType | null>(null);

export const useGeneration = () => {
  const ctx = useContext(GenerationContext);
  if (!ctx) {
    throw new Error("useGeneration must be inside GenerationProvider");
  }
  return ctx;
};

export const GenerationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const jobsRef = useRef<GenerationJob[]>([]);

  const updateJob = useCallback((id: string, patch: Partial<GenerationJob>) => {
    setJobs((prev) => {
      const next = prev.map((j) => (j.id === id ? { ...j, ...patch } : j));
      jobsRef.current = next;
      return next;
    });
  }, []);

  const addJob = useCallback((job: GenerationJob) => {
    setJobs((prev) => {
      const next = [job, ...prev.slice(0, 7)];
      jobsRef.current = next;
      return next;
    });
  }, []);

  const uploadToStorage = useCallback(async (url: string, id: string): Promise<string> => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const fileName = `generated/${id}.png`;

      const { error } = await supabase.storage.from("generated-images").upload(fileName, blob, { upsert: true });
      if (error) {
        console.error("上传失败:", error);
        return url;
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("generated-images").getPublicUrl(fileName);
      return publicUrl;
    } catch (err) {
      console.error("上传图片出错:", err);
      return url;
    }
  }, []);

  // 验证图片 URL 是否可访问 - 跳过 Lovable 内部 image_key 等无效格式，避免 fetch 失败导致崩溃
  const getValidImageUrl = useCallback((source: string | undefined): string | undefined => {
    if (!source) return undefined;
    if (/^https?:\/\//i.test(source) || source.startsWith("data:")) return source;
    console.warn("跳过无法访问的图片:", source.substring(0, 50));
    return undefined;
  }, []);

  const ensureUsableImageUrl = useCallback(
    async (source: string | undefined, tag: string): Promise<string | undefined> => {
      if (!source) return undefined;
      if (/^https?:\/\//i.test(source)) return source;

      const uploaded = await uploadToStorage(source, `${tag}-${crypto.randomUUID()}`);
      if (uploaded && /^https?:\/\//i.test(uploaded)) return uploaded;
      return source;
    },
    [uploadToStorage]
  );

  const saveLocalHistory = useCallback(
    async (images: string[], payload: { prompt: string; style: string; scene: string; aspectRatio: string }) => {
      try {
        const localHistory = JSON.parse(localStorage.getItem("local_image_history") || "[]");
        const permanentUrls = await Promise.all(images.map((url) => uploadToStorage(url, crypto.randomUUID())));
        const newRecords = permanentUrls.map((url) => ({
          id: crypto.randomUUID(),
          image_url: url,
          prompt: payload.prompt,
          style: payload.style,
          scene: payload.scene,
          aspect_ratio: payload.aspectRatio,
          created_at: new Date().toISOString(),
        }));
        localStorage.setItem("local_image_history", JSON.stringify([...newRecords, ...localHistory].slice(0, 100)));
      } catch (err) {
        console.error("保存到本地失败:", err);
      }
    },
    [uploadToStorage]
  );

  const saveCloudHistory = useCallback(
    async (
      userId: string | undefined,
      images: string[],
      payload: { prompt: string; style: string; scene: string; aspectRatio: string }
    ) => {
      if (!userId || images.length === 0) return;
      try {
        const permanentUrls = await Promise.all(images.map((url) => uploadToStorage(url, crypto.randomUUID())));
        const records = permanentUrls.map((url) => ({
          user_id: userId,
          image_url: url,
          prompt: payload.prompt,
          style: payload.style,
          scene: payload.scene,
          aspect_ratio: payload.aspectRatio,
        }));
        const { error } = await supabase.from("generated_images").insert(records);
        if (error) console.error("保存图片记录失败:", error);
      } catch (err) {
        console.error("保存图片出错:", err);
      }
    },
    [uploadToStorage]
  );

  const startCopyGeneration = useCallback(
    (params: CopyGenParams): string => {
      const jobId = crypto.randomUUID();
      const job: GenerationJob = {
        id: jobId,
        kind: "copy",
        status: "running",
        step: "准备生成",
        current: 0,
        total: params.copyImageType === "all" ? 5 : params.copyImageType === "main" ? 1 : 3,
        results: [],
        uploadedImages: params.uploadedImages,
        generatedCopy: params.generatedCopy,
        createdAt: Date.now(),
      };
      addJob(job);

      (async () => {
        const allImages: string[] = [];
        const { generatedCopy, copyPlatform, copyImageType, uploadedImages } = params;

        try {
          // 先验证图片格式，过滤无效的 Lovable image_key
          const validImageBase64 = getValidImageUrl(uploadedImages[0]);
          const productImageUrl = await ensureUsableImageUrl(validImageBase64, "source");
          if (!productImageUrl) {
            updateJob(jobId, { status: "error", error: "产品图上传失败，请重试" });
            return;
          }

          const platformRatioMap: Record<string, string> = {
            "淘宝/天猫": "1:1",
            "京东": "1:1",
            "拼多多": "1:1",
            "抖音": "9:16",
            "小红书": "3:4",
            "快手": "9:16",
          };
          const mainRatio = platformRatioMap[copyPlatform] || "1:1";

          if (copyImageType === "main" || copyImageType === "all") {
            updateJob(jobId, { step: "生成主图", current: 1 });
            const mainPrompt = `Professional e-commerce main product photo for ${copyPlatform}. Product: ${generatedCopy.productName}. ${generatedCopy.title}. Clean background, studio lighting, hero shot, high quality product photography.`;
            const mainResult = await generateImage({
              prompt: mainPrompt,
              aspectRatio: mainRatio,
              n: 1,
              imageBase64: productImageUrl,
            });
            if (mainResult.images?.length) allImages.push(...mainResult.images);
          }

          if (copyImageType === "detail" || copyImageType === "all") {
            const detailPrompts = [
              {
                label: "卖点展示",
                prompt: `Product detail page image showing key features. Product: ${generatedCopy.productName}. Highlights: ${generatedCopy.sellingPoints?.slice(0, 3).join("; ")}. Infographic style.`,
              },
              {
                label: "场景展示",
                prompt: `Lifestyle scene for ${generatedCopy.productName}. Target: ${generatedCopy.targetAudience}. Real-life usage, warm atmosphere.`,
              },
              {
                label: "细节特写",
                prompt: `Macro close-up for ${generatedCopy.productName}. Material quality, craftsmanship. ${generatedCopy.sellingPoints?.[0] || ""}. Sharp focus.`,
              },
            ];

            for (let i = 0; i < detailPrompts.length; i++) {
              const stepNum = copyImageType === "all" ? i + 2 : i + 1;
              updateJob(jobId, { step: detailPrompts[i].label, current: stepNum });
              const r = await generateImage({
                prompt: detailPrompts[i].prompt,
                aspectRatio: "3:4",
                n: 1,
                imageBase64: productImageUrl,
              });
              if (r.images?.length) allImages.push(...r.images);
            }
          }

          if (allImages.length === 0) {
            updateJob(jobId, { status: "error", error: "未能生成图片，请重试" });
            return;
          }

          let finalImages = allImages;
          if (params.enableTextOverlay && generatedCopy.sellingPoints?.length > 0) {
            updateJob(jobId, { step: "添加文字排版", current: params.copyImageType === "all" ? 5 : 4 });
            finalImages = await Promise.all(
              allImages.map((url) =>
                overlayTextOnImage(url, {
                  productName: generatedCopy.productName,
                  sellingPoints: generatedCopy.sellingPoints || [],
                  style: params.overlayTemplate,
                  price: generatedCopy.priceRange || undefined,
                  promoText: generatedCopy.title || undefined,
                })
              )
            );
          }

          const payload = {
            prompt: `AI文案联动 - ${generatedCopy.productName}`,
            style: params.style,
            scene: params.scene,
            aspectRatio: mainRatio,
          };

          await Promise.all([
            saveLocalHistory(finalImages, payload),
            saveCloudHistory(params.userId, finalImages, payload),
          ]);

          updateJob(jobId, { status: "done", results: finalImages, current: job.total, step: "完成" });
          params.onComplete?.(finalImages);
        } catch (err: any) {
          updateJob(jobId, { status: "error", error: err.message || "生成失败" });
        }
      })();

      return jobId;
    },
    [addJob, updateJob, saveLocalHistory, saveCloudHistory, ensureUsableImageUrl, getValidImageUrl]
  );

  const startImageGeneration = useCallback(
    (params: ImageGenParams): string => {
      const jobId = crypto.randomUUID();
      const job: GenerationJob = {
        id: jobId,
        kind: "image",
        status: "running",
        step: "生成图片",
        current: 0,
        total: params.n,
        results: [],
        uploadedImages: params.imageBase64 ? [params.imageBase64] : [],
        createdAt: Date.now(),
      };
      addJob(job);

      (async () => {
        let progressInterval: number | undefined;

        try {
          // 先验证图片格式，过滤无效的 Lovable image_key
          const validImageBase64 = getValidImageUrl(params.imageBase64);
          const validReferenceImageUrl = getValidImageUrl(params.referenceImageUrl);

          const productImageUrl = await ensureUsableImageUrl(validImageBase64, "source");
          if (validImageBase64 && !productImageUrl) {
            updateJob(jobId, { status: "error", error: "产品图上传失败，请重试" });
            return;
          }

          const styleReferenceUrl = await ensureUsableImageUrl(validReferenceImageUrl, "style");
          if (validReferenceImageUrl && !styleReferenceUrl) {
            updateJob(jobId, { status: "error", error: "参考图上传失败，请重试" });
            return;
          }

          // 进度条模拟
          progressInterval = window.setInterval(() => {
            setJobs((prev) => {
              const current = prev.find((x) => x.id === jobId);
              if (!current || current.status !== "running" || current.current >= current.total) return prev;
              const next = prev.map((x) => (x.id === jobId ? { ...x, current: x.current + 1 } : x));
              jobsRef.current = next;
              return next;
            });
          }, 3000);

          // 调用服务端生成（含服务端扣费，无需前端处理）
          const result = await generateImage({
            prompt: params.prompt,
            aspectRatio: params.ratio,
            n: params.n,
            imageBase64: productImageUrl,
            referenceImageUrl: styleReferenceUrl,
            imageType: params.imageType,
          });

          if (result.error) {
            // 服务端返回了清晰错误（余额不足、未授权、AI失败等）
            updateJob(jobId, { status: "error", error: result.error });
            return;
          }

          const images = result.images || [];
          if (images.length === 0) {
            updateJob(jobId, { status: "error", error: "未能生成图片，请重试" });
            return;
          }

          // 保存历史记录
          const payload = {
            prompt: params.prompt,
            style: params.style,
            scene: params.scene,
            aspectRatio: params.uiRatioLabel || params.ratio,
          };

          await Promise.all([
            saveLocalHistory(images, payload),
            saveCloudHistory(params.userId, images, payload),
          ]);

          updateJob(jobId, { status: "done", results: images, current: params.n, step: "完成" });
          params.onComplete?.(images);
        } catch (err: any) {
          updateJob(jobId, { status: "error", error: err.message || "生成失败" });
        } finally {
          if (progressInterval) window.clearInterval(progressInterval);
        }
      })();

      return jobId;
    },
    [addJob, updateJob, saveLocalHistory, saveCloudHistory, ensureUsableImageUrl, getValidImageUrl]
  );

  const clearJob = useCallback((id: string) => {
    setJobs((prev) => {
      const next = prev.filter((j) => j.id !== id);
      jobsRef.current = next;
      return next;
    });
  }, []);

  const getLatestResults = useCallback(() => {
    const done = jobsRef.current.find((j) => j.status === "done");
    return done?.results || [];
  }, []);

  const activeJob = jobs[0] || null;

  return (
    <GenerationContext.Provider value={{ jobs, activeJob, startCopyGeneration, startImageGeneration, clearJob, getLatestResults }}>
      {children}
    </GenerationContext.Provider>
  );
};
