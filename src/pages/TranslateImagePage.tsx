import { useCallback, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  ImagePlus,
  Languages,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  errorHintFromMessage,
  normalizeUserErrorMessage,
} from "@/lib/error-messages";
import { upsertCuratedImage } from "@/lib/image-library";
import { WorkspaceHeader, WorkspaceShell } from "@/components/workspace/WorkspaceShell";

interface TranslationItem {
  original: string;
  translated: string;
  position: string;
}

type JobStatus = "uploaded" | "ocring" | "editing" | "rendering" | "done" | "error";

interface TranslationJob {
  id: string;
  fileName: string;
  originalImage: string;
  translatedImage: string;
  translations: TranslationItem[];
  status: JobStatus;
  error: string | null;
  hint: string | null;
}

const MAX_FILES = 8;
const LOCAL_HISTORY_KEY = "local_image_history";

const TARGET_LANGUAGES = [
  { value: "en", label: "English" },
  { value: "zh", label: "简体中文" },
  { value: "zh_tw", label: "繁體中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
  { value: "ru", label: "Русский" },
  { value: "ar", label: "العربية" },
  { value: "th", label: "ไทย" },
  { value: "vi", label: "Tiếng Việt" },
];

const STATUS_META: Record<JobStatus, { label: string; className: string }> = {
  uploaded: { label: "待处理", className: "bg-muted text-muted-foreground" },
  ocring: { label: "识别中", className: "bg-primary/10 text-primary" },
  editing: { label: "待校对", className: "bg-amber-500/10 text-amber-700" },
  rendering: { label: "生成中", className: "bg-primary/10 text-primary" },
  done: { label: "已完成", className: "bg-emerald-500/10 text-emerald-700" },
  error: { label: "失败", className: "bg-destructive/10 text-destructive" },
};

const readFileAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });

const compressImageForTranslation = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxEdge = 1600;
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("图片处理失败"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = () => reject(new Error("图片处理失败"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });

async function readInvokeError(error: any) {
  if (!error) return "服务暂时不可用，请稍后重试。";
  const context = error.context;

  if (context instanceof Response) {
    try {
      const text = await context.text();
      return normalizeUserErrorMessage(text, error.message);
    } catch {
      return normalizeUserErrorMessage(error.message);
    }
  }

  if (typeof context === "string") {
    return normalizeUserErrorMessage(context, error.message);
  }

  return normalizeUserErrorMessage(error.message);
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function PreviewPanel({
  title,
  subtitle,
  image,
  placeholder,
}: {
  title: string;
  subtitle: string;
  image?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
      </div>
      {image ? (
        <div className="overflow-hidden rounded-2xl bg-muted/30">
          <img src={image} alt={title} className="max-h-[460px] w-full object-contain" />
        </div>
      ) : (
        <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
          {placeholder}
        </div>
      )}
    </div>
  );
}

export default function TranslateImagePage() {
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("en");

  const activeJob = jobs.find((job) => job.id === activeJobId) || jobs[0] || null;
  const doneJobs = jobs.filter((job) => job.status === "done");
  const pendingJobs = jobs.filter((job) => job.status !== "done");
  const targetLanguageLabel =
    TARGET_LANGUAGES.find((item) => item.value === targetLanguage)?.label || "English";

  const updateJob = useCallback(
    (jobId: string, updater: (job: TranslationJob) => TranslationJob) => {
      setJobs((current) => current.map((job) => (job.id === jobId ? updater(job) : job)));
    },
    [],
  );

  const persistTranslatedImage = useCallback(async (job: TranslationJob, imageUrl: string) => {
    let permanentUrl = imageUrl;

    if (!imageUrl.startsWith("data:") && !imageUrl.includes("/storage/")) {
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const fileName = `translated/${crypto.randomUUID()}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("generated-images")
          .upload(fileName, blob, { upsert: true });

        if (!uploadError && uploadData) {
          const { data: urlData } = supabase.storage.from("generated-images").getPublicUrl(fileName);
          permanentUrl = urlData.publicUrl;
        }
      } catch (error) {
        console.warn("upload translated image failed:", error);
      }
    }

    const localHistory = JSON.parse(localStorage.getItem(LOCAL_HISTORY_KEY) || "[]");
    localStorage.setItem(
      LOCAL_HISTORY_KEY,
      JSON.stringify(
        [
          {
            id: crypto.randomUUID(),
            image_url: permanentUrl,
            prompt: `图文翻译 · ${job.fileName}`,
            style: "翻译",
            scene: "translate",
            task_kind: "translate",
            image_type: "图文翻译",
            aspect_ratio: "original",
            created_at: new Date().toISOString(),
          },
          ...localHistory,
        ].slice(0, 150),
      ),
    );

    upsertCuratedImage({
      image_url: permanentUrl,
      prompt: `图文翻译 · ${job.fileName}`,
      style: "翻译",
      scene: "translate",
      image_type: "图文翻译",
      aspect_ratio: "original",
      task_kind: "translate",
    });

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("generated_images").insert({
          user_id: user.id,
          image_url: permanentUrl,
          prompt: `图文翻译 · ${job.fileName}`,
          style: "翻译",
          scene: "translate",
          image_type: "图文翻译",
          aspect_ratio: "original",
        });
      }
    } catch (error) {
      console.warn("save translated record failed:", error);
    }

    return permanentUrl;
  }, []);

  const handleFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
      if (!files.length) return;
      if (files.some((file) => file.size > 10 * 1024 * 1024)) {
        toast.error("单张图片不能超过 10MB");
        return;
      }

      const availableSlots = Math.max(0, MAX_FILES - jobs.length);
      const nextFiles = files.slice(0, availableSlots);
      if (!nextFiles.length) {
        toast.error(`最多只能上传 ${MAX_FILES} 张图片`);
        return;
      }

      const payload = await Promise.all(
        nextFiles.map(async (file) => ({
          id: crypto.randomUUID(),
          fileName: file.name,
          originalImage: await compressImageForTranslation(file),
          translatedImage: "",
          translations: [],
          status: "uploaded" as const,
          error: null,
          hint: null,
        })),
      );

      setJobs((current) => [...current, ...payload]);
      setActiveJobId((current) => current || payload[0]?.id || null);

      if (files.length > availableSlots) {
        toast.warning(`已达到上限，只保留前 ${availableSlots} 张`);
      }
    },
    [jobs.length],
  );

  const handleImageUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files?.length) return;
      await handleFiles(event.target.files);
      event.target.value = "";
    },
    [handleFiles],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      if (!event.dataTransfer.files?.length) return;
      await handleFiles(event.dataTransfer.files);
    },
    [handleFiles],
  );

  const removeJob = useCallback(
    (jobId: string) => {
      setJobs((current) => {
        const next = current.filter((job) => job.id !== jobId);
        if (activeJobId === jobId) setActiveJobId(next[0]?.id || null);
        return next;
      });
    },
    [activeJobId],
  );

  const runOCR = useCallback(
    async (job: TranslationJob) => {
      updateJob(job.id, (current) => ({ ...current, status: "ocring", error: null, hint: null }));

      try {
        const { data, error } = await supabase.functions.invoke("translate-image", {
          body: { imageUrl: job.originalImage, step: "ocr", targetLanguage },
        });
        if (error) throw new Error(await readInvokeError(error));

        const nextTranslations = Array.isArray(data?.translations) ? data.translations : [];
        if (!nextTranslations.length) throw new Error("未检测到可翻译的文字内容");

        updateJob(job.id, (current) => ({
          ...current,
          translations: nextTranslations,
          status: "editing",
          error: null,
          hint: null,
        }));
        return nextTranslations as TranslationItem[];
      } catch (error) {
        const message = normalizeUserErrorMessage(error, "文字识别失败");
        updateJob(job.id, (current) => ({
          ...current,
          status: "error",
          error: message,
          hint: errorHintFromMessage(message),
        }));
        throw error;
      }
    },
    [targetLanguage, updateJob],
  );

  const runGenerate = useCallback(
    async (job: TranslationJob) => {
      updateJob(job.id, (current) => ({ ...current, status: "rendering", error: null, hint: null }));

      try {
        const { data, error } = await supabase.functions.invoke("translate-image", {
          body: {
            imageUrl: job.originalImage,
            step: "replace",
            translations: job.translations,
            targetLanguage,
          },
        });
        if (error) throw new Error(await readInvokeError(error));
        if (!data?.imageUrl) throw new Error("翻译图片生成失败");

        const permanentUrl = await persistTranslatedImage(job, data.imageUrl);
        updateJob(job.id, (current) => ({
          ...current,
          translatedImage: permanentUrl,
          status: "done",
          error: null,
          hint: null,
        }));
      } catch (error) {
        const message = normalizeUserErrorMessage(error, "翻译图片生成失败");
        updateJob(job.id, (current) => ({
          ...current,
          status: "error",
          error: message,
          hint: errorHintFromMessage(message),
        }));
        throw error;
      }
    },
    [persistTranslatedImage, targetLanguage, updateJob],
  );

  const handleRecognize = useCallback(async () => {
    if (!activeJob) return;
    try {
      await runOCR(activeJob);
      toast.success(`文字识别完成，已按 ${targetLanguageLabel} 生成候选译文`);
    } catch (error) {
      toast.error(normalizeUserErrorMessage(error, "文字识别失败"));
    }
  }, [activeJob, runOCR, targetLanguageLabel]);

  const handleGenerateActive = useCallback(async () => {
    if (!activeJob) return;
    try {
      const current = jobs.find((job) => job.id === activeJob.id) || activeJob;
      const nextTranslations = current.translations.length ? current.translations : await runOCR(current);
      await runGenerate({ ...current, translations: nextTranslations });
      toast.success(`翻译图片已生成，并已加入图片库（${targetLanguageLabel}）`);
    } catch (error) {
      toast.error(normalizeUserErrorMessage(error, "翻译图片生成失败"));
    }
  }, [activeJob, jobs, runGenerate, runOCR, targetLanguageLabel]);

  const handleGenerateAll = useCallback(async () => {
    if (!jobs.length) return;
    setIsBatchRunning(true);
    let successCount = 0;

    try {
      for (const seedJob of jobs) {
        const current = jobs.find((item) => item.id === seedJob.id) || seedJob;
        try {
          const nextTranslations = current.translations.length ? current.translations : await runOCR(current);
          await runGenerate({ ...current, translations: nextTranslations });
          successCount += 1;
        } catch (error) {
          console.warn("batch translate item failed:", error);
        }
      }

      if (successCount > 0) {
        toast.success(`已完成 ${successCount} 张翻译，并自动加入图片库（${targetLanguageLabel}）`);
      } else {
        toast.error("批量翻译没有成功结果，请先检查报错提示");
      }
    } finally {
      setIsBatchRunning(false);
    }
  }, [jobs, runGenerate, runOCR, targetLanguageLabel]);

  const updateTranslation = useCallback(
    (index: number, value: string) => {
      if (!activeJob) return;
      updateJob(activeJob.id, (current) => ({
        ...current,
        translations: current.translations.map((item, itemIndex) =>
          itemIndex === index ? { ...item, translated: value } : item,
        ),
      }));
    },
    [activeJob, updateJob],
  );

  const handleDownload = useCallback((job: TranslationJob) => {
    if (!job.translatedImage) return;
    const link = document.createElement("a");
    link.href = job.translatedImage;
    link.download = `translated-${job.fileName || job.id}.png`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleDownloadAll = useCallback(() => {
    doneJobs.forEach((job, index) => {
      setTimeout(() => handleDownload(job), index * 180);
    });
  }, [doneJobs, handleDownload]);

  const resetAll = useCallback(() => {
    setJobs([]);
    setActiveJobId(null);
    setIsBatchRunning(false);
  }, []);

  const summary = useMemo(
    () => ({ total: jobs.length, done: doneJobs.length, waiting: pendingJobs.length }),
    [doneJobs.length, jobs.length, pendingJobs.length],
  );

  return (
    <div className="mx-auto max-w-[1480px] space-y-6 px-4 py-6 md:px-6">
      <WorkspaceHeader
        icon={Languages}
        badge="图文翻译"
        title="上传图片，识别文字，生成多国语言版本"
        description="支持多目标语言翻译、批量上传和单张删除。识别和生成后的结果会自动加入图片库，并带上图文翻译来源标签。"
        steps={["1. 上传原图", "2. 识别与校对", "3. 生成翻译图"]}
        stats={[
          { label: "总任务", value: summary.total },
          { label: "已完成", value: summary.done },
          { label: "待处理", value: summary.waiting },
        ]}
      />

      <WorkspaceShell
        sidebar={
        <Card className="rounded-3xl border-border shadow-sm xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          <CardHeader className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">批量任务</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">最多上传 {MAX_FILES} 张，支持一次处理整批图片。</p>
              </div>
              <Badge variant="secondary">{jobs.length}/{MAX_FILES}</Badge>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">目标语言</div>
              <Select value={targetLanguage} onValueChange={setTargetLanguage}>
                <SelectTrigger>
                  <SelectValue placeholder="选择目标语言" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_LANGUAGES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-6 text-center transition hover:border-primary/50 hover:bg-primary/10">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium text-foreground">添加翻译图片</div>
                <div className="text-xs text-muted-foreground">JPG、PNG、WEBP，单张不超过 10MB</div>
              </div>
              <input className="hidden" type="file" accept="image/*" multiple onChange={handleImageUpload} />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button className="flex-1" onClick={() => void handleGenerateAll()} disabled={!jobs.length || isBatchRunning}>
                {isBatchRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />批量处理中</> : <><Sparkles className="mr-2 h-4 w-4" />批量翻译全部</>}
              </Button>
              <Button variant="outline" onClick={handleDownloadAll} disabled={!doneJobs.length}>
                <Download className="mr-2 h-4 w-4" />
                全部下载
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3">
            {jobs.length ? jobs.map((job) => {
              const meta = STATUS_META[job.status];
              const active = activeJob?.id === job.id;
              return (
                <div key={job.id} className={`relative rounded-2xl border p-3 pr-12 transition ${active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 hover:bg-muted/30"}`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-8 w-8"
                    onClick={() => removeJob(job.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <button type="button" onClick={() => setActiveJobId(job.id)} className="flex w-full items-start gap-3 text-left">
                    <img src={job.originalImage} alt={job.fileName} className="h-16 w-16 rounded-xl object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{job.fileName}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.className}`}>{meta.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {job.translations.length ? `${job.translations.length} 处文字` : "待识别"}
                        </span>
                      </div>
                      {job.error && <div className="mt-2 line-clamp-2 text-xs text-destructive">{job.error}</div>}
                    </div>
                  </button>
                </div>
              );
            }) : (
              <div className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                先上传图片，右侧会显示当前任务的识别结果、翻译内容和最终成品。
              </div>
            )}
          </CardContent>
        </Card>
        }
        content={
        <div className="space-y-6">
          {activeJob ? (
            <>
              <Card className="rounded-3xl border-border shadow-sm">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="text-base">当前任务：{activeJob.fileName}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        当前目标语言是 {targetLanguageLabel}。你可以先识别校对，也可以直接一键生成翻译图。
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => void handleRecognize()} disabled={activeJob.status === "ocring" || activeJob.status === "rendering"}>
                        {activeJob.status === "ocring" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Languages className="mr-2 h-4 w-4" />}
                        识别文字
                      </Button>
                      <Button onClick={() => void handleGenerateActive()} disabled={activeJob.status === "ocring" || activeJob.status === "rendering"}>
                        {activeJob.status === "rendering" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                        一键生成翻译图
                      </Button>
                      <Button variant="outline" onClick={() => handleDownload(activeJob)} disabled={!activeJob.translatedImage}>
                        <Download className="mr-2 h-4 w-4" />
                        下载
                      </Button>
                    </div>
                  </div>

                  {activeJob.error && (
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">
                      <div className="flex items-start gap-2 text-destructive">
                        <XCircle className="mt-0.5 h-4 w-4" />
                        <div>
                          <div className="font-medium">当前任务失败</div>
                          <div className="mt-1">{activeJob.error}</div>
                          {activeJob.hint && <div className="mt-2 text-destructive/80">{activeJob.hint}</div>}
                        </div>
                      </div>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <PreviewPanel title="原图" subtitle="用于 OCR 识别和替换生成" image={activeJob.originalImage} />
                    <PreviewPanel
                      title="结果图"
                      subtitle={activeJob.translatedImage ? "已自动加入图片库，来源为图文翻译" : "生成后会自动存入图片库"}
                      image={activeJob.translatedImage}
                      placeholder={activeJob.status === "rendering" ? "正在生成翻译图..." : "这里会显示翻译后的最终图片"}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-border shadow-sm">
                <CardHeader className="space-y-3">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="text-base">识别与校对</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">识别完成后可直接修改译文。这里的修改会直接用于最终生成。</p>
                    </div>
                    {activeJob.status === "done" && (
                      <div className="inline-flex items-center gap-1 text-sm text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        已完成并入图库
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {activeJob.translations.length ? activeJob.translations.map((item, index) => (
                    <div key={`${activeJob.id}-${index}`} className="grid gap-3 rounded-2xl border border-border p-4 md:grid-cols-[1.2fr_1.6fr_160px]">
                      <div className="space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">原文</div>
                        <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-foreground">{item.original}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">译文</div>
                        <Input value={item.translated} onChange={(event) => updateTranslation(index, event.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">位置</div>
                        <div className="rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{item.position}</div>
                      </div>
                    </div>
                  )) : (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
                      <ImagePlus className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                      <div className="font-medium text-foreground">还没有识别结果</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        先点“识别文字”，或者直接点“一键生成翻译图”，系统会按 {targetLanguageLabel} 自动完成识别和生成。
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="rounded-3xl border-dashed border-border">
              <CardContent className="flex min-h-[540px] flex-col items-center justify-center gap-4 text-center">
                <div className="rounded-3xl bg-primary/10 p-4 text-primary">
                  <ImagePlus className="h-10 w-10" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">先上传要翻译的图片</div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    支持拖拽批量上传，上传后可以逐张识别和生成，也能整批翻译后直接进入图片库。
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        }
      />

      {!!doneJobs.length && (
        <Card className="rounded-3xl border-border shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">已完成结果</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {doneJobs.map((job) => (
              <div key={`done-${job.id}`} className="overflow-hidden rounded-2xl border border-border bg-card">
                <img src={job.translatedImage} alt={job.fileName} className="aspect-[4/5] w-full object-cover" />
                <div className="space-y-2 p-3">
                  <div className="line-clamp-1 text-sm font-medium text-foreground">{job.fileName}</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">图文翻译</Badge>
                    <Badge variant="secondary">{targetLanguageLabel}</Badge>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => handleDownload(job)}>
                    <Download className="mr-2 h-4 w-4" />
                    下载这张
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {jobs.length > 0 && (
        <div className="flex justify-end">
          <Button variant="outline" onClick={resetAll}>
            <RefreshCw className="mr-2 h-4 w-4" />
            清空当前批次
          </Button>
        </div>
      )}
    </div>
  );
}
