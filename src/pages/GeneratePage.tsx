import { useCallback, useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Ban,
  ChevronDown,
  ChevronUp,
  Check,
  Download,
  FolderPlus,
  Globe,
  Loader2,
  Palette,
  RefreshCw,
  Sparkles,
  Star,
  Upload,
  UserRound,
  X,
  ZoomIn,
  Edit3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GenerationContext } from "@/contexts/GenerationContext";
import type { GenerationModel, ModelMode, OutputResolution } from "@/lib/ai-generator";
import {
  findCuratedImage,
  markCuratedBest,
  toggleCuratedFavorite,
  upsertCuratedImage,
} from "@/lib/image-library";

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
  const [productBrief, setProductBrief] = useState("");
  const [textPrompt, setTextPrompt] = useState("");
  const [styleReferenceImage, setStyleReferenceImage] = useState("");
  const [styleReferenceText, setStyleReferenceText] = useState("");
  const [modelMode, setModelMode] = useState<ModelMode>("none");
  const [modelImage, setModelImage] = useState("");
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
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState<string | null>(null);
  const [savedUrls, setSavedUrls] = useState<string[]>([]);
  const [favoriteUrls, setFavoriteUrls] = useState<string[]>([]);
  const [bestImageUrl, setBestImageUrl] = useState<string | null>(null);

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

  useEffect(() => {
    if (!results.length) {
      setSavedUrls([]);
      setFavoriteUrls([]);
      setBestImageUrl(null);
      return;
    }

    const curated = results
      .map((url) => findCuratedImage(url))
      .filter(Boolean);
    setSavedUrls(curated.map((item) => item!.image_url));
    setFavoriteUrls(curated.filter((item) => item!.favorite).map((item) => item!.image_url));
    const best =
      curated.find((item) => item!.is_best && (!currentBatchId || item!.group_id === currentBatchId)) ||
      curated.find((item) => item!.is_best) ||
      null;
    setBestImageUrl(best?.image_url || null);
  }, [currentBatchId, results]);

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

  const handleSingleAsset = async (
    files: FileList | null,
    setter: (value: string) => void,
  ) => {
    if (!files?.length) return;
    const file = Array.from(files).find((item) => item.type.match(/image\/(jpeg|png|webp)/));
    if (!file) return;
    const dataUrl = await compressImage(file);
    setter(dataUrl);
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
    if (uploadedImages.length === 0 && !textPrompt.trim() && !productBrief.trim()) {
      return;
    }

    setIsGenerating(true);
    setResults([]);
    setErrorMessage(null);

    if (modelMode === "with_model" && !modelImage) {
      setIsGenerating(false);
      setErrorMessage("已选择有模特模式，请先上传模特图");
      return;
    }

    const totalImages = Math.min(Math.max(Number(selectedCount), 1), 9);
    const batchId = crypto.randomUUID();
    const finalPrompt = [productBrief.trim() ? `产品信息：${productBrief.trim()}` : "", textPrompt.trim()]
      .filter(Boolean)
      .join("\n");
    const params = {
      prompt: finalPrompt,
      aspectRatio: selectedRatio,
      n: totalImages,
      imageBase64: uploadedImages.length > 0 ? uploadedImages[0] : undefined,
      imageType,
      textLanguage,
      model: selectedModel,
      resolution: selectedResolution,
      referenceGallery: uploadedImages.slice(1),
      styleReferenceImage: styleReferenceImage || undefined,
      styleReferenceText: styleReferenceText.trim() || undefined,
      modelMode,
      modelImage: modelImage || undefined,
      userId: user?.id,
      onComplete: (images: string[]) => {
        setResults(images);
        setIsGenerating(false);
        setProgress(null);
      },
    };

    setCurrentBatchId(batchId);
    setLastParams({ ...params, _groupId: batchId });
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

    const batchId = crypto.randomUUID();
    setCurrentBatchId(batchId);
    setIsGenerating(true);
    setResults([]);
    setErrorMessage(null);
    setProgress({ current: 1, total: lastParams.n });
    startImageGeneration({
      ...lastParams,
      _groupId: batchId,
      onComplete: (images: string[]) => {
        setResults(images);
        setIsGenerating(false);
        setProgress(null);
      },
    });
  };

  const buildCuratedSeed = (src: string) => ({
    image_url: src,
    prompt: [productBrief.trim(), textPrompt.trim()].filter(Boolean).join("\n"),
    aspect_ratio: selectedRatio,
    image_type: imageType,
    style: styleReferenceText.trim() || undefined,
    scene: textPrompt.trim() || undefined,
    group_id: currentBatchId || undefined,
    task_kind: "image" as const,
  });

  const handleSaveToLibrary = (src: string) => {
    upsertCuratedImage(buildCuratedSeed(src));
    setSavedUrls((current) => Array.from(new Set([...current, src])));
  };

  const handleToggleFavorite = (src: string) => {
    const record = toggleCuratedFavorite(src, buildCuratedSeed(src));
    setSavedUrls((current) => Array.from(new Set([...current, src])));
    setFavoriteUrls((current) =>
      record.favorite ? Array.from(new Set([...current, src])) : current.filter((item) => item !== src),
    );
  };

  const handleMarkBest = (src: string) => {
    markCuratedBest(src, currentBatchId || undefined, buildCuratedSeed(src));
    setSavedUrls((current) => Array.from(new Set([...current, src])));
    setBestImageUrl(src);
  };

  const selectedModelLabel =
    modelOptions.find((option) => option.value === selectedModel)?.label || selectedModel;
  const selectedResolutionLabel =
    resolutionOptions.find((option) => option.value === selectedResolution)?.label ||
    selectedResolution;
  const selectedLanguageLabel =
    languageOptions.find((option) => option.value === textLanguage)?.label || textLanguage;

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
        <div className="space-y-2">
          <h2 className="text-base font-bold text-foreground">AI 电商图片生成</h2>
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2.5 py-1">1. 上传商品</span>
            <span className="rounded-full bg-muted px-2.5 py-1">2. 分析场景</span>
            <span className="rounded-full bg-muted px-2.5 py-1">3. 生成图片</span>
          </div>
        </div>

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
                    已完成商品识别，点选一个方案后就可以直接生成。
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
                  上传商品图后点“分析产品”，先拿 3 个可选场景方案。
                </div>
              )}
            </div>
          )}

          <textarea
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            rows={4}
            placeholder="直接写你想要的场景，或先点“分析产品”使用 AI 推荐方案。"
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
            label="生成数量"
            options={imageCountOptions}
            value={selectedCount}
            onChange={setSelectedCount}
          />
          <SelectField
            label="文字语言"
            options={languageOptions}
            value={textLanguage}
            onChange={setTextLanguage}
          />
        </div>

        <div className="rounded-2xl border border-border bg-background/60 p-3">
          <button
            type="button"
            onClick={() => setShowAdvancedOptions((current) => !current)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <div className="text-sm font-semibold text-foreground">补充素材与高级设置</div>
              <div className="text-xs text-muted-foreground">
                模特图、风格图、模型与清晰度都收在这里
              </div>
            </div>
            {showAdvancedOptions ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>

          {showAdvancedOptions && (
            <div className="mt-4 space-y-4 border-t border-border pt-4">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  产品信息
                </label>
                <Textarea
                  value={productBrief}
                  onChange={(event) => setProductBrief(event.target.value)}
                  placeholder="补充卖点、材质、尺寸或不允许改动的细节。"
                  className="min-h-24 rounded-xl"
                />
              </div>

              <div className="space-y-3 rounded-2xl border border-border bg-background/60 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <UserRound className="h-3.5 w-3.5" />
                      模特模式
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      需要人物出镜时再上传模特图
                    </p>
                  </div>
                  <div className="inline-flex rounded-lg bg-muted p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setModelMode("none");
                        setModelImage("");
                      }}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                        modelMode === "none"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      <Ban className="mr-1 inline h-3 w-3" />
                      无模特
                    </button>
                    <button
                      type="button"
                      onClick={() => setModelMode("with_model")}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                        modelMode === "with_model"
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      <UserRound className="mr-1 inline h-3 w-3" />
                      有模特
                    </button>
                  </div>
                </div>

                {modelMode === "with_model" && (
                  <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border px-3 text-center transition-colors hover:border-primary/40">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(event) => void handleSingleAsset(event.target.files, setModelImage)}
                    />
                    {modelImage ? (
                      <div className="relative w-full">
                        <img src={modelImage} alt="model" className="h-28 w-full rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            setModelImage("");
                          }}
                          className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <UserRound className="mb-2 h-4 w-4 text-primary" />
                        <p className="text-xs text-muted-foreground">上传模特图</p>
                      </>
                    )}
                  </label>
                )}
              </div>

              <div className="space-y-2 rounded-2xl border border-border bg-background/60 p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <Palette className="h-3.5 w-3.5" />
                  风格参考
                </div>
                <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border px-3 text-center transition-colors hover:border-primary/40">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => void handleSingleAsset(event.target.files, setStyleReferenceImage)}
                  />
                  {styleReferenceImage ? (
                    <div className="relative w-full">
                      <img
                        src={styleReferenceImage}
                        alt="style-reference"
                        className="h-28 w-full rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          setStyleReferenceImage("");
                        }}
                        className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Palette className="mb-2 h-4 w-4 text-primary" />
                      <p className="text-xs text-muted-foreground">上传风格参考图</p>
                    </>
                  )}
                </label>
                <Textarea
                  value={styleReferenceText}
                  onChange={(event) => setStyleReferenceText(event.target.value)}
                  placeholder="例如：暖色轻奢、极简留白、日落通透感。"
                  className="min-h-20 rounded-xl"
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
                  label="清晰度"
                  options={resolutionOptions}
                  value={selectedResolution}
                  onChange={(value) => setSelectedResolution(value as OutputResolution)}
                />
              </div>
            </div>
          )}
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
            <div className="mb-4 rounded-3xl border border-border bg-card p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    本次已生成 {results.length} 张结果
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-foreground">结果已经准备好了</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    先挑一张满意的结果预览或编辑，不满意再整体重生。
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="h-9 text-xs" onClick={handleRegenerate}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    重新生成
                  </Button>
                  <Button variant="default" size="sm" className="h-9 text-xs" onClick={downloadAll}>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    全部下载
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-muted/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">图片类型</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{imageType}</div>
                </div>
                <div className="rounded-2xl bg-muted/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">模型</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{selectedModelLabel}</div>
                </div>
                <div className="rounded-2xl bg-muted/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">规格</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {selectedResolutionLabel} / {selectedRatio}
                  </div>
                </div>
                <div className="rounded-2xl bg-muted/70 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">文字语言</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{selectedLanguageLabel}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              {results.map((src, index) => (
                <div
                  key={index}
                  className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                >
                  <div className="relative">
                    <img src={src} alt={`Generated ${index + 1}`} className="aspect-square w-full object-cover" />
                    <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                      方案 {index + 1}
                    </div>
                    <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
                  </div>
                  <div className="space-y-3 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-foreground">结果 {index + 1}</div>
                        <div className="text-xs text-muted-foreground">{imageType} / {selectedRatio}</div>
                      </div>
                      <button
                        onClick={() => setPreviewImage(src)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        <ZoomIn className="h-3.5 w-3.5" />
                        预览
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => setPreviewImage(src)}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        查看
                      </button>
                      <button
                        onClick={() => navigate(`/dashboard/edit?url=${encodeURIComponent(src)}`)}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => downloadImage(src, `picspark-${Date.now()}-${index + 1}.jpg`)}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        下载
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handleSaveToLibrary(src)}
                        className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                          savedUrls.includes(src)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:border-primary/40 hover:text-primary"
                        }`}
                      >
                        {savedUrls.includes(src) ? (
                          <>
                            <Check className="mr-1 inline h-3.5 w-3.5" />
                            已入库
                          </>
                        ) : (
                          <>
                            <FolderPlus className="mr-1 inline h-3.5 w-3.5" />
                            入图库
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleToggleFavorite(src)}
                        className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                          favoriteUrls.includes(src)
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:border-primary/40 hover:text-primary"
                        }`}
                      >
                        <Star className="mr-1 inline h-3.5 w-3.5" />
                        {favoriteUrls.includes(src) ? "已收藏" : "收藏"}
                      </button>
                      <button
                        onClick={() => handleMarkBest(src)}
                        className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                          bestImageUrl === src
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-foreground hover:border-primary/40 hover:text-primary"
                        }`}
                      >
                        <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                        {bestImageUrl === src ? "最佳" : "标记最佳"}
                      </button>
                    </div>
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
                上传商品图，先选一个场景方案，再生成电商图。
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
