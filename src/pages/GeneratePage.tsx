import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Download,
  Globe,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  X,
  ZoomIn,
  Edit3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GenerationContext } from "@/contexts/GenerationContext";
import type { GenerationModel, OutputResolution } from "@/lib/ai-generator";

const imageTypes = ["主图", "详情图"];

const ratioOptions = [
  { value: "1:1", label: "1:1 正方形" },
  { value: "2:3", label: "2:3 竖版" },
  { value: "3:2", label: "3:2 横版" },
  { value: "3:4", label: "3:4 竖版" },
  { value: "4:3", label: "4:3 横版" },
  { value: "4:5", label: "4:5 竖版" },
  { value: "5:4", label: "5:4 横版" },
  { value: "9:16", label: "9:16 手机竖屏" },
  { value: "16:9", label: "16:9 宽屏" },
  { value: "21:9", label: "21:9 超宽屏" },
];

const languageOptions = [
  { value: "zh", label: "CN 中文" },
  { value: "en", label: "US English" },
  { value: "ja", label: "JP 日本語" },
  { value: "ko", label: "KR 한국어" },
  { value: "de", label: "DE Deutsch" },
  { value: "fr", label: "FR Français" },
  { value: "es", label: "ES Español" },
  { value: "it", label: "IT Italiano" },
  { value: "pt", label: "PT Português" },
  { value: "ru", label: "RU Русский" },
  { value: "ar", label: "AR العربية" },
  { value: "th", label: "TH ไทย" },
  { value: "vi", label: "VI Tiếng Việt" },
  { value: "pure", label: "纯图片（无新增文字）" },
];

const modelOptions: { value: GenerationModel; label: string }[] = [
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2" },
  { value: "nano-banana-pro-preview", label: "Nano Banana Pro" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana" },
];

const resolutionOptions: { value: OutputResolution; label: string }[] = [
  { value: "0.5k", label: "0.5K 快速" },
  { value: "1k", label: "1K 标准" },
  { value: "2k", label: "2K 高清" },
  { value: "4k", label: "4K 超清" },
];

const imageCountOptions = Array.from({ length: 9 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1} 张`,
}));

const SelectField = ({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<string | { value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className="space-y-1">
    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50"
    >
      {options.map((option) => {
        if (typeof option === "string") {
          return (
            <option key={option} value={option}>
              {option}
            </option>
          );
        }
        return (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        );
      })}
    </select>
  </div>
);

const GeneratePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const generationCtx = useContext(GenerationContext);
  const startImageGeneration = generationCtx?.startImageGeneration;
  const activeJob = generationCtx?.activeJob ?? null;

  const [searchParams] = useSearchParams();
  const templatePrompt = searchParams.get("prompt");
  const templateId = searchParams.get("template");

  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [textPrompt, setTextPrompt] = useState("");
  const [imageType, setImageType] = useState(imageTypes[0]);
  const [selectedRatio, setSelectedRatio] = useState("3:4");
  const [textLanguage, setTextLanguage] = useState("zh");
  const [selectedModel, setSelectedModel] =
    useState<GenerationModel>("nano-banana-pro-preview");
  const [selectedResolution, setSelectedResolution] =
    useState<OutputResolution>("2k");
  const [selectedCount, setSelectedCount] = useState("1");
  const [sceneSuggestions, setSceneSuggestions] = useState<
    { scene: string; description: string }[]
  >([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [showSuggestionDialog, setShowSuggestionDialog] = useState(false);
  const [productSummary, setProductSummary] = useState("");
  const [visibleTextSummary, setVisibleTextSummary] = useState("NONE");
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [lastParams, setLastParams] = useState<any>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    if (templateId && !appliedTemplate) {
      setAppliedTemplate(templateId);
      if (templatePrompt) {
        setTextPrompt(templatePrompt);
      }
    }
  }, [appliedTemplate, templateId, templatePrompt]);

  useEffect(() => {
    if (!activeJob || activeJob.kind !== "image") {
      return;
    }

    setProgress({ current: activeJob.current, total: activeJob.total });
    setIsGenerating(activeJob.status === "running");

    if (activeJob.status === "done" && activeJob.results.length > 0) {
      setResults(activeJob.results);
      setIsGenerating(false);
      setProgress(null);
    }

    if (activeJob.status === "error") {
      setIsGenerating(false);
      setProgress(null);
      setErrorMessage(activeJob.error || "生成失败");
    }
  }, [activeJob]);

  const resetSuggestionState = () => {
    setSceneSuggestions([]);
    setSelectedSuggestionIndex(0);
    setShowSuggestionDialog(false);
    setProductSummary("");
    setVisibleTextSummary("NONE");
    setSuggestionError(null);
  };

  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          const targetWidth = 768;
          const quality = 0.82;
          const width = targetWidth;
          const height = Math.round((image.height * targetWidth) / image.width);
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("无法处理图片"));
            return;
          }
          ctx.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        image.onerror = () => reject(new Error("图片读取失败"));
        image.src = dataUrl;
      };
      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsDataURL(file);
    });

  const handleFile = async (file: File) => {
    if (!file.type.match(/image\/(jpeg|png|webp)/)) {
      return;
    }

    const dataUrl = await compressImage(file);
    resetSuggestionState();

    if (isBatchMode) {
      if (uploadedImages.length < 10) {
        setUploadedImages((prev) => [...prev, dataUrl]);
      }
      return;
    }

    setUploadedImages([dataUrl]);
  };

  const fetchSceneSuggestions = async (imageDataUrl: string, openDialog = true) => {
    setIsLoadingSuggestions(true);
    setSuggestionError(null);
    setSceneSuggestions([]);
    setShowSuggestionDialog(false);

    try {
      const { data, error } = await supabase.functions.invoke("suggest-scenes", {
        body: { imageBase64: imageDataUrl, imageType },
      });

      if (error) {
        throw new Error(error.message || "场景识别失败");
      }
      if (data?.error) {
        throw new Error(data.error);
      }
      if (!data?.suggestions || !Array.isArray(data.suggestions)) {
        throw new Error("AI 返回格式错误");
      }

      setSceneSuggestions(data.suggestions);
      setProductSummary(data.product_summary || "");
      setVisibleTextSummary(data.visible_text || "NONE");
      setSelectedSuggestionIndex(0);

      if (data.suggestions[0]?.description) {
        setTextPrompt(data.suggestions[0].description);
      }

      if (openDialog) {
        setShowSuggestionDialog(true);
      }
    } catch (err: any) {
      let message = err.message || "场景识别失败，请稍后重试";
      if (message.includes("Base64 decoding failed")) {
        message = "图片数据处理失败，请更换图片后重试";
      }
      setSuggestionError(message);
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleAnalyzeProduct = () => {
    if (uploadedImages.length === 0) {
      setSuggestionError("请先上传产品图片");
      return;
    }
    fetchSceneSuggestions(uploadedImages[0], true);
  };

  const handleRefreshSuggestions = () => {
    if (uploadedImages.length > 0) {
      fetchSceneSuggestions(uploadedImages[0], true);
    }
  };

  const handleSelectSuggestion = (index: number) => {
    setSelectedSuggestionIndex(index);
    const selected = sceneSuggestions[index];
    if (selected) {
      setTextPrompt(selected.description);
    }
  };

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      const files = event.dataTransfer.files;
      if (files.length === 0) {
        return;
      }

      if (isBatchMode) {
        Array.from(files)
          .slice(0, 10 - uploadedImages.length)
          .forEach((file) => {
            handleFile(file).catch(console.error);
          });
      } else {
        handleFile(files[0]).catch(console.error);
      }
    },
    [isBatchMode, uploadedImages.length],
  );

  const handleGenerate = () => {
    if (!startImageGeneration) {
      setErrorMessage("系统初始化中，请刷新页面后重试");
      return;
    }
    if (uploadedImages.length === 0 && !textPrompt.trim()) {
      return;
    }

    setIsGenerating(true);
    setResults([]);
    setErrorMessage(null);

    const totalImages = Math.min(Math.max(Number(selectedCount), 1), 9);
    const params = {
      prompt: textPrompt.trim(),
      aspectRatio: selectedRatio,
      n: totalImages,
      imageBase64: uploadedImages.length > 0 ? uploadedImages[0] : undefined,
      imageType,
      textLanguage,
      model: selectedModel,
      resolution: selectedResolution,
      userId: user?.id,
      onComplete: (images: string[]) => {
        setResults(images);
        setIsGenerating(false);
        setProgress(null);
      },
    };

    setLastParams(params);
    setProgress({ current: 1, total: totalImages });
    startImageGeneration(params);
  };

  const handleRegenerate = () => {
    if (!startImageGeneration) {
      setErrorMessage("系统初始化中，请刷新页面后重试");
      return;
    }
    if (!lastParams) {
      return;
    }

    setIsGenerating(true);
    setResults([]);
    setErrorMessage(null);
    setProgress({ current: 1, total: lastParams.n });
    startImageGeneration({
      ...lastParams,
      onComplete: (images: string[]) => {
        setResults(images);
        setIsGenerating(false);
        setProgress(null);
      },
    });
  };

  const isMobile = () =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );

  const downloadImage = (url: string, filename: string) => {
    if (isMobile()) {
      window.open(url, "_blank");
      return;
    }

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) {
          return;
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      }, "image/jpeg");
    };
    image.onerror = () => window.open(url, "_blank");
    image.src = url;
  };

  const downloadAll = () => {
    results.forEach((src, index) => {
      setTimeout(() => {
        downloadImage(src, `picspark-${Date.now()}-${index + 1}.jpg`);
      }, index * 300);
    });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:flex-row">
      <div className="space-y-4 overflow-y-auto border-r border-border bg-card/50 p-4 pb-24 lg:w-[380px] lg:flex-shrink-0 lg:pb-6">
        <h2 className="text-base font-bold text-foreground">AI 电商图片生成</h2>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              产品图片
            </label>
            <button
              onClick={() => {
                setIsBatchMode(!isBatchMode);
                setUploadedImages([]);
                resetSuggestionState();
              }}
              className={`rounded-full border px-2 py-0.5 text-[10px] transition-colors ${
                isBatchMode
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground"
              }`}
            >
              批量
            </button>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            className={`rounded-lg border border-dashed p-2 text-center transition-colors ${
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
            }`}
          >
            {uploadedImages.length > 0 ? (
              <div className="grid grid-cols-4 gap-1.5">
                {uploadedImages.map((image, index) => (
                  <div key={index} className="relative">
                    <img src={image} alt="" className="aspect-square w-full rounded-md object-contain" />
                    <button
                      onClick={() => {
                        setUploadedImages(uploadedImages.filter((_, i) => i !== index));
                        if (index === 0) {
                          resetSuggestionState();
                        }
                      }}
                      className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {uploadedImages.length < (isBatchMode ? 10 : 1) && (
                  <label className="flex aspect-square cursor-pointer items-center justify-center rounded-md border border-dashed border-border hover:border-primary/40">
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          handleFile(file).catch(console.error);
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            ) : (
              <label className="block cursor-pointer py-4">
                <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">拖拽或点击上传产品图</p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFile(file).catch(console.error);
                    }
                  }}
                />
              </label>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              场景描述
            </label>
            {uploadedImages.length > 0 && !isBatchMode && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleAnalyzeProduct}
                  disabled={isLoadingSuggestions}
                  className="flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground transition-opacity disabled:opacity-60"
                >
                  {isLoadingSuggestions ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-2.5 w-2.5" />
                  )}
                  分析产品
                </button>
                {sceneSuggestions.length > 0 && (
                  <button
                    onClick={handleRefreshSuggestions}
                    disabled={isLoadingSuggestions}
                    className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-60"
                  >
                    <RefreshCw className={`h-2.5 w-2.5 ${isLoadingSuggestions ? "animate-spin" : ""}`} />
                    换一批
                  </button>
                )}
              </div>
            )}
          </div>

          {uploadedImages.length > 0 && !isBatchMode && (
            <div className="space-y-2">
              {isLoadingSuggestions ? (
                <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-3 text-xs text-muted-foreground">
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                  AI 正在识别产品并生成 3 个场景方案...
                </div>
              ) : suggestionError ? (
                <div className="flex items-center justify-between rounded-lg bg-destructive/10 px-2 py-2 text-xs">
                  <span className="text-destructive">{suggestionError}</span>
                  <button onClick={handleAnalyzeProduct} className="text-primary hover:underline">
                    重试
                  </button>
                </div>
              ) : sceneSuggestions.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">
                    已完成商品识别。你可以直接点选方案，也可以打开弹窗查看完整 AI 帮写内容。
                  </p>
                  {sceneSuggestions.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => handleSelectSuggestion(index)}
                      className={`w-full rounded-lg border p-2 text-left transition-colors ${
                        selectedSuggestionIndex === index
                          ? "border-primary bg-primary/10"
                          : "border-border bg-muted/30 hover:border-primary/40"
                      }`}
                    >
                      <div className="text-[11px] font-medium text-foreground">{item.scene}</div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground line-clamp-3">
                        {item.description}
                      </div>
                    </button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-full text-xs"
                    onClick={() => setShowSuggestionDialog(true)}
                  >
                    查看 AI 帮写方案详情
                  </Button>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                  上传产品图后，先点击“分析产品”，AI 会识别商品并生成 3 个场景方案供你选择。
                </div>
              )}
            </div>
          )}

          <textarea
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            rows={4}
            placeholder="描述你想要的场景，或先点击“分析产品”生成 AI 推荐方案。"
            className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="图片类型"
            options={imageTypes}
            value={imageType}
            onChange={setImageType}
          />
          <SelectField
            label="尺寸"
            options={ratioOptions}
            value={selectedRatio}
            onChange={setSelectedRatio}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="模型"
            options={modelOptions}
            value={selectedModel}
            onChange={(value) => setSelectedModel(value as GenerationModel)}
          />
          <SelectField
            label="生成数量"
            options={imageCountOptions}
            value={selectedCount}
            onChange={setSelectedCount}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <SelectField
            label="清晰度"
            options={resolutionOptions}
            value={selectedResolution}
            onChange={(value) => setSelectedResolution(value as OutputResolution)}
          />
          <SelectField
            label="文字语言"
            options={languageOptions}
            value={textLanguage}
            onChange={setTextLanguage}
          />
        </div>

        <Button
          variant="hero"
          className="w-full"
          onClick={handleGenerate}
          disabled={(uploadedImages.length === 0 && !textPrompt.trim()) || isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              生成中...
            </>
          ) : (
            <>
              <Sparkles className="mr-1.5 h-4 w-4" />
              生成图片
            </>
          )}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto bg-background p-4 pb-24 md:p-6 lg:pb-6">
        {errorMessage && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {isGenerating ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center">
            <Sparkles className="mb-3 h-10 w-10 animate-pulse text-primary" />
            <div className="mb-2 text-lg font-bold text-foreground">
              {progress ? (
                <>
                  生成中 <span className="text-primary">{progress.current}</span>/{progress.total}
                </>
              ) : (
                "准备中..."
              )}
            </div>
            <div className="mb-2 h-2 w-48 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-500"
                style={{ width: progress ? `${(progress.current / progress.total) * 100}%` : "0%" }}
              />
            </div>
            <p className="text-xs text-muted-foreground">AI 正在生成电商图片，请稍候...</p>
            <div className="mt-6 grid w-full grid-cols-2 gap-3 md:grid-cols-3">
              {Array.from({ length: Math.min(Math.max(Number(selectedCount), 1), 9) }).map(
                (_, index) => (
                  <div key={index} className="aspect-square rounded-lg bg-muted animate-pulse" />
                ),
              )}
            </div>
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">生成结果 ({results.length})</h3>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRegenerate}>
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  重新生成
                </Button>
                <Button variant="default" size="sm" className="h-7 text-xs" onClick={downloadAll}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  全部下载
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {results.map((src, index) => (
                <div key={index} className="group relative overflow-hidden rounded-lg border border-border bg-muted/20">
                  <img src={src} alt={`Generated ${index + 1}`} className="aspect-square w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <button
                      onClick={() => setPreviewImage(src)}
                      className="rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => navigate(`/dashboard/edit?url=${encodeURIComponent(src)}`)}
                      className="rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => downloadImage(src, `picspark-${Date.now()}-${index + 1}.jpg`)}
                      className="rounded-full bg-white/20 p-2 text-white transition-colors hover:bg-white/30"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-[400px] items-center justify-center text-center">
            <div>
              <Sparkles className="mx-auto mb-3 h-12 w-12 text-muted-foreground/15" />
              <h3 className="mb-1 text-sm font-semibold text-muted-foreground">准备就绪</h3>
              <p className="max-w-xs text-xs text-muted-foreground/60">
                上传产品图后，先点击“分析产品”获取 3 个方案，再确认生成专业电商图片。
              </p>
            </div>
          </div>
        )}
      </div>

      <Dialog open={showSuggestionDialog} onOpenChange={setShowSuggestionDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>AI 帮写方案选择</DialogTitle>
            <DialogDescription>
              先从分析结果里选一个方案，再回填到场景描述中继续编辑。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {sceneSuggestions.map((item, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectSuggestion(index)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    selectedSuggestionIndex === index
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:border-primary/50"
                  }`}
                >
                  方案{index + 1}
                </button>
              ))}
            </div>

            {(productSummary || visibleTextSummary !== "NONE") && (
              <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                {productSummary && (
                  <p>
                    <span className="font-semibold text-foreground">商品识别：</span>
                    {productSummary}
                  </p>
                )}
                {visibleTextSummary !== "NONE" && (
                  <p>
                    <span className="font-semibold text-foreground">可见文字：</span>
                    {visibleTextSummary}
                  </p>
                )}
              </div>
            )}

            {sceneSuggestions[selectedSuggestionIndex] && (
              <div className="rounded-lg border border-border bg-background p-4">
                <div className="mb-2 text-sm font-semibold text-foreground">
                  {sceneSuggestions[selectedSuggestionIndex].scene}
                </div>
                <textarea
                  value={sceneSuggestions[selectedSuggestionIndex].description}
                  onChange={(e) => {
                    const next = [...sceneSuggestions];
                    next[selectedSuggestionIndex] = {
                      ...next[selectedSuggestionIndex],
                      description: e.target.value,
                    };
                    setSceneSuggestions(next);
                    setTextPrompt(e.target.value);
                  }}
                  rows={12}
                  className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm leading-6 outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" onClick={handleRefreshSuggestions} disabled={isLoadingSuggestions}>
                {isLoadingSuggestions ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                重新帮写
              </Button>
              <Button
                variant="hero"
                onClick={() => {
                  const selected = sceneSuggestions[selectedSuggestionIndex];
                  if (selected) {
                    setTextPrompt(selected.description);
                  }
                  setShowSuggestionDialog(false);
                }}
              >
                确认选择
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-2">
          {previewImage && <img src={previewImage} alt="Preview" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GeneratePage;
