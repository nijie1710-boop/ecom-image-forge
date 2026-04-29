import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  Crop,
  BarChart3,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GenerationContext } from "@/contexts/GenerationContext";
import type {
  FidelityCategory,
  FidelityContext,
  FidelityMode,
  GenerationModel,
  ModelMode,
  OutputResolution,
} from "@/lib/ai-generator";
import { errorHintFromMessage, normalizeUserErrorMessage } from "@/lib/error-messages";
import { suggestScenes } from "@/lib/suggest-scenes";
import {
  findCuratedImage,
  markCuratedBest,
  toggleCuratedFavorite,
  upsertCuratedImage,
} from "@/lib/image-library";
import { WorkspaceHeader, WorkspaceShell } from "@/components/workspace/WorkspaceShell";
import {
  WorkspaceEmptyState,
  WorkspaceSection,
  WorkspaceStatGrid,
} from "@/components/workspace/WorkspaceBlocks";
import {
  deductCredits,
  getGenerateImageUnitCost,
  getGenerateImageTotalCost,
  getUserBalance,
} from "@/lib/detail-credits";
import { MultiPlatformCropDialog } from "@/components/MultiPlatformCropDialog";
import { evaluateImage, type ImageEvaluation } from "@/lib/evaluate-image";

const ADMIN_GENERATE_RETRY_DRAFT_KEY = "admin-generate-retry-draft";
const imageTypes = ["主图", "详情图"];

const platformPresets = [
  { value: "", label: "不限平台（自选尺寸）", ratio: "" },
  { value: "taobao", label: "淘宝/天猫", ratio: "1:1" },
  { value: "jd", label: "京东", ratio: "1:1" },
  { value: "pdd", label: "拼多多", ratio: "1:1" },
  { value: "xiaohongshu", label: "小红书", ratio: "3:4" },
  { value: "douyin", label: "抖音电商", ratio: "3:4" },
  { value: "1688", label: "1688", ratio: "1:1" },
  { value: "amazon", label: "Amazon", ratio: "1:1" },
  { value: "shopify", label: "Shopify", ratio: "1:1" },
  { value: "tiktok", label: "TikTok Shop", ratio: "9:16" },
  { value: "ebay", label: "eBay", ratio: "1:1" },
  { value: "aliexpress", label: "AliExpress (速卖通)", ratio: "1:1" },
  { value: "wish", label: "Wish", ratio: "1:1" },
  { value: "lazada", label: "Lazada", ratio: "1:1" },
  { value: "shopee", label: "Shopee (虾皮)", ratio: "1:1" },
  { value: "mercadolibre", label: "Mercado Libre", ratio: "1:1" },
  { value: "etsy", label: "Etsy", ratio: "4:3" },
  { value: "walmart", label: "Walmart", ratio: "1:1" },
  { value: "temu", label: "Temu", ratio: "1:1" },
  { value: "ozon", label: "Ozon (俄罗斯)", ratio: "3:4" },
];

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

const modelOptions: { value: GenerationModel; label: string; hint: string }[] = [
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", hint: "性价比高，新手推荐" },
  { value: "nano-banana-pro-preview", label: "Nano Banana Pro", hint: "画面质量更高，适合精品图" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana", hint: "最快速度，适合快速试方案" },
  { value: "gpt-image-2-all", label: "GPT Image 2 ✨", hint: "汉字渲染最强 · 输出尺寸固定 · 速度较慢（30-90s）" },
];

const allResolutionOptions: { value: OutputResolution; label: string }[] = [
  { value: "0.5k", label: "0.5K 快速" },
  { value: "1k", label: "1K 标准" },
  { value: "2k", label: "2K 高清" },
  { value: "4k", label: "4K 超清" },
];

/** 每个模型可用的分辨率 */
const genModelResolutionMap: Record<GenerationModel, OutputResolution[]> = {
  "gemini-2.5-flash-image": ["1k"],
  "gemini-3.1-flash-image-preview": ["0.5k", "1k", "2k", "4k"],
  "nano-banana-pro-preview": ["1k", "2k", "4k"],
  // GPT Image 2 实际输出固定 1024×1024 / 1024×1536，档位仅控制精细度
  "gemini-3-pro-image-preview": ["1k", "2k", "4k"],
  "gpt-image-2": ["1k", "2k"],
  "gpt-image-2-all": ["1k", "2k"],
};

function getGenResolutionOptions(model: GenerationModel) {
  const allowed = genModelResolutionMap[model] || ["1k"];
  return allResolutionOptions.filter((o) => allowed.includes(o.value));
}

const imageCountOptions = Array.from({ length: 9 }, (_, index) => ({
  value: String(index + 1),
  label: `${index + 1} 张`,
}));

const PHONE_CASE_KEYWORDS = [
  "手机壳",
  "手机套",
  "保护壳",
  "保护套",
  "iphone case",
  "phone case",
  "magsafe",
  "镜头孔",
  "camera cutout",
];

const PRINTED_PRODUCT_KEYWORDS = [
  "印花",
  "图案",
  "pattern",
  "graphic",
  "printed",
  "插画",
  "壳面",
];

const PACKAGING_KEYWORDS = [
  "包装",
  "盒",
  "礼盒",
  "瓶",
  "袋",
  "包装盒",
  "box",
  "bottle",
  "pouch",
  "label",
];

function includesKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectFidelityCategory(texts: Array<string | undefined>): FidelityCategory {
  const combined = texts
    .map((value) => String(value || "").toLowerCase())
    .join("\n");

  if (includesKeyword(combined, PHONE_CASE_KEYWORDS)) return "phone-case";
  if (includesKeyword(combined, PACKAGING_KEYWORDS)) return "packaging";
  if (includesKeyword(combined, PRINTED_PRODUCT_KEYWORDS)) return "printed-product";
  return "general";
}

function buildStrictFidelityContext(args: {
  categoryHint: FidelityCategory;
  productBrief: string;
  prompt: string;
  productSummary: string;
  visibleTextSummary: string;
}): FidelityContext {
  const { categoryHint, productBrief, prompt, productSummary, visibleTextSummary } = args;
  const preservePattern =
    categoryHint === "phone-case" ||
    categoryHint === "printed-product" ||
    includesKeyword(`${productBrief}\n${prompt}\n${productSummary}\n${visibleTextSummary}`.toLowerCase(), PRINTED_PRODUCT_KEYWORDS);

  if (categoryHint === "phone-case") {
    return {
      categoryHint,
      preservePattern,
      preferProductOnly: true,
      suppressModelReference: true,
      strictReason: "phone-case-geometry-lock",
      structureReferencePriority: ["front", "back", "side", "camera-cutout-closeup"],
      preferredAngles: ["front", "mild-3-4", "flat-lay", "camera-closeup", "simple-desktop"],
      forbiddenAngles: ["dramatic-tilt", "heavy-handheld", "model-shot", "prop-occlusion"],
    };
  }

  if (categoryHint === "printed-product") {
    return {
      categoryHint,
      preservePattern,
      preferProductOnly: true,
      strictReason: "printed-layout-lock",
      structureReferencePriority: ["front", "back", "pattern-closeup"],
      preferredAngles: ["front", "mild-3-4", "flat-lay", "pattern-closeup"],
      forbiddenAngles: ["extreme-perspective", "heavy-occlusion"],
    };
  }

  if (categoryHint === "packaging") {
    return {
      categoryHint,
      preservePattern,
      preferProductOnly: true,
      strictReason: "packaging-structure-lock",
      structureReferencePriority: ["front", "back", "side", "label-closeup"],
      preferredAngles: ["front", "mild-3-4", "desktop", "label-closeup"],
      forbiddenAngles: ["fisheye", "heavy-handheld", "prop-occlusion"],
    };
  }

  return {
    categoryHint,
    preservePattern,
    preferProductOnly: false,
    strictReason: "general-structure-lock",
    structureReferencePriority: ["front", "side", "detail-closeup"],
    preferredAngles: ["front", "mild-3-4", "clean-desktop"],
    forbiddenAngles: ["extreme-perspective", "heavy-occlusion"],
  };
}

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
  const ctxRegenerateSingle = generationCtx?.regenerateSingle;
  const regeneratingIndex = generationCtx?.regeneratingIndex ?? null;

  const [searchParams] = useSearchParams();
  const templatePrompt = searchParams.get("prompt");
  const templateId = searchParams.get("template");

  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [productBrief, setProductBrief] = useState("");
  const [textPrompt, setTextPrompt] = useState("");
  const [styleReferenceImage, setStyleReferenceImage] = useState("");
  const [styleReferenceText, setStyleReferenceText] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [modelMode, setModelMode] = useState<ModelMode>("none");
  const [modelImage, setModelImage] = useState("");
  const [fidelityMode, setFidelityMode] = useState<FidelityMode>("normal");
  const [imageType, setImageType] = useState(imageTypes[0]);
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [selectedRatio, setSelectedRatio] = useState("3:4");
  const [textLanguage, setTextLanguage] = useState("zh");
  const [selectedModel, setSelectedModel] =
    useState<GenerationModel>("gemini-3.1-flash-image-preview");
  const [selectedResolution, setSelectedResolution] =
    useState<OutputResolution>("1k");
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
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [cropDialogImage, setCropDialogImage] = useState("");
  const [evaluations, setEvaluations] = useState<Record<number, ImageEvaluation>>({});
  const [evaluatingIndex, setEvaluatingIndex] = useState<number | null>(null);
  const errorHint = errorMessage ? errorHintFromMessage(errorMessage) : null;
  const suggestionHint = suggestionError ? errorHintFromMessage(suggestionError) : null;

  // ---- 积分计算 ----
  const imageCount = Math.min(Math.max(Number(selectedCount), 1), 9);
  const unitCost = getGenerateImageUnitCost(selectedModel, selectedResolution);
  const totalCost = getGenerateImageTotalCost(selectedModel, selectedResolution, imageCount);
  const balanceInsufficient = userBalance !== null && totalCost > 0 && userBalance < totalCost;

  const currentResOptions = useMemo(
    () => getGenResolutionOptions(selectedModel),
    [selectedModel],
  );
  const strictCategoryHint = useMemo(
    () =>
      detectFidelityCategory([
        imageType,
        productBrief,
        textPrompt,
        productSummary,
        visibleTextSummary,
        sceneSuggestions[selectedSuggestionIndex]?.description,
      ]),
    [
      imageType,
      productBrief,
      productSummary,
      sceneSuggestions,
      selectedSuggestionIndex,
      textPrompt,
      visibleTextSummary,
    ],
  );
  const strictFidelityContext = useMemo(
    () =>
      buildStrictFidelityContext({
        categoryHint: strictCategoryHint,
        productBrief,
        prompt: textPrompt,
        productSummary,
        visibleTextSummary,
      }),
    [productBrief, productSummary, strictCategoryHint, textPrompt, visibleTextSummary],
  );
  const strictModeDescription =
    strictCategoryHint === "phone-case"
      ? "已识别为手机壳类目：会优先锁定外轮廓、镜头孔、边框厚度和壳面图案，默认压低人物、手持和大角度斜拍。建议上传正面、背面、侧边和镜头孔特写。"
      : strictCategoryHint === "printed-product"
      ? "已识别为印花卖点商品：会把图案布局、图案比例和图案位置与商品结构一起锁定，减少重画图案。"
      : strictCategoryHint === "packaging"
      ? "已识别为包装类商品：会优先锁定包装轮廓、标签位置和结构边界，场景表达会更保守。"
      : "严格保真模式会优先保证商品结构和图案一致性，并把风格参考置于结构参考之后。";

  // 获取余额
  useEffect(() => {
    if (!user?.id) return;
    void getUserBalance(user.id).then(setUserBalance);
  }, [user?.id]);

  const refreshBalance = () => {
    if (user?.id) void getUserBalance(user.id).then(setUserBalance);
  };

  // 切换模型后修正不合法的分辨率
  useEffect(() => {
    const allowed = genModelResolutionMap[selectedModel] || ["1k"];
    if (!allowed.includes(selectedResolution)) {
      setSelectedResolution(allowed[0]);
    }
  }, [selectedModel, selectedResolution]);

  const handleFidelityModeChange = (value: string) => {
    const nextMode = value as FidelityMode;
    setFidelityMode(nextMode);
    if (nextMode === "strict") {
      setSelectedModel("gemini-3.1-flash-image-preview");
      setSelectedResolution("1k");
    }
    if (nextMode === "composite") {
      // Composite defaults to Banana 2 (1k), but user can switch to Pro for better fidelity.
      setSelectedModel("gemini-3.1-flash-image-preview");
      setSelectedResolution("1k");
      if (modelMode === "with_model") {
        setModelMode("none");
        setModelImage("");
      }
    }
    // Auto-enable multi-reference when strict, auto-disable for composite (only needs 1 image)
    if (nextMode === "strict" && !isBatchMode) {
      setIsBatchMode(true);
    }
    if (nextMode === "composite" && isBatchMode) {
      setIsBatchMode(false);
    }
  };

  useEffect(() => {
    // Strict mode: hard lock on Banana 2 + 1k (unchanged).
    if (fidelityMode === "strict") {
      if (selectedModel !== "gemini-3.1-flash-image-preview") {
        setSelectedModel("gemini-3.1-flash-image-preview");
      }
      if (selectedResolution !== "1k") {
        setSelectedResolution("1k");
      }
      return;
    }
    // Composite mode: no longer force Banana 2 — user may select Pro for higher fidelity.
  }, [fidelityMode, selectedModel, selectedResolution]);

  // Nano Banana only supports English text — force language when selected
  const isNanoBanana = selectedModel === "gemini-2.5-flash-image";
  useEffect(() => {
    if (isNanoBanana && textLanguage !== "en" && textLanguage !== "pure") {
      setTextLanguage("en");
    }
  }, [isNanoBanana, textLanguage]);

  useEffect(() => {
    if (templateId && !appliedTemplate) {
      setAppliedTemplate(templateId);
      if (templatePrompt) {
        setTextPrompt(templatePrompt);
      }
    }
  }, [appliedTemplate, templateId, templatePrompt]);

  useEffect(() => {
    const rawDraft = sessionStorage.getItem(ADMIN_GENERATE_RETRY_DRAFT_KEY);
    if (!rawDraft) return;

    try {
      const draft = JSON.parse(rawDraft) as Partial<{
        uploadedImages: string[];
        productBrief: string;
        textPrompt: string;
        styleReferenceText: string;
        styleReferenceImage: string;
        imageType: string;
        selectedRatio: string;
        textLanguage: string;
        fidelityMode: FidelityMode;
      }>;

      if (Array.isArray(draft.uploadedImages) && draft.uploadedImages.length) {
        setUploadedImages(draft.uploadedImages);
      }
      if (draft.productBrief) setProductBrief(draft.productBrief);
      if (draft.textPrompt) setTextPrompt(draft.textPrompt);
      if (draft.styleReferenceText) setStyleReferenceText(draft.styleReferenceText);
      if (draft.styleReferenceImage) setStyleReferenceImage(draft.styleReferenceImage);
      if (draft.imageType && imageTypes.includes(draft.imageType)) setImageType(draft.imageType);
      if (draft.selectedRatio) setSelectedRatio(draft.selectedRatio);
      if (draft.textLanguage) setTextLanguage(draft.textLanguage);
      if (draft.fidelityMode) setFidelityMode(draft.fidelityMode);

      setErrorMessage(null);
      setResults([]);
      setCurrentBatchId(null);
    } catch (error) {
      console.warn("restore admin generate retry draft failed:", error);
    } finally {
      sessionStorage.removeItem(ADMIN_GENERATE_RETRY_DRAFT_KEY);
    }
  }, []);

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
      setErrorMessage(normalizeUserErrorMessage(activeJob.error, "生成失败，请稍后重试。"));
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
      throw new Error("仅支持 JPG、PNG 或 WEBP 图片。");
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
      const data = await suggestScenes(imageDataUrl, imageType);

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
      setSuggestionError(
        normalizeUserErrorMessage(err, "场景识别失败，请稍后重试。"),
      );
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
            handleFile(file).catch((error) => {
              setSuggestionError(normalizeUserErrorMessage(error, "图片上传失败，请重试。"));
            });
          });
      } else {
        handleFile(files[0]).catch((error) => {
          setSuggestionError(normalizeUserErrorMessage(error, "图片上传失败，请重试。"));
        });
      }
    },
    [isBatchMode, uploadedImages.length],
  );

  const handleGenerate = async () => {
    if (!startImageGeneration) {
      setErrorMessage("系统初始化中，请刷新页面后重试");
      return;
    }
    if (uploadedImages.length === 0 && !textPrompt.trim() && !productBrief.trim()) {
      return;
    }

    if (modelMode === "with_model" && !modelImage) {
      setErrorMessage("已选择有模特模式，请先上传模特图");
      return;
    }

    const totalImages = Math.min(Math.max(Number(selectedCount), 1), 9);
    const cost = getGenerateImageTotalCost(selectedModel, selectedResolution, totalImages);
    const modelLabel =
      modelOptions.find((o) => o.value === selectedModel)?.label || selectedModel;

    // 扣费
    setIsGenerating(true);
    setResults([]);
    setErrorMessage(null);

    const deductResult = await deductCredits(
      cost,
      "generate_image",
      `AI 主图 ${totalImages} 张（${modelLabel} ${selectedResolution}，${unitCost} 积分/张）`,
    );
    if (!deductResult.success) {
      setIsGenerating(false);
      setErrorMessage(deductResult.error || "积分不足，请先充值");
      return;
    }
    refreshBalance();

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
      fidelityMode,
      fidelityContext: fidelityMode !== "normal" ? strictFidelityContext : undefined,
      negativePrompt: negativePrompt.trim() || undefined,
      unitCost,
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

  const handleRegenerate = async () => {
    if (!startImageGeneration) {
      setErrorMessage("系统初始化中，请刷新页面后重试");
      return;
    }
    if (!lastParams) {
      return;
    }

    const regenCount = lastParams.n || 1;
    const regenModel = lastParams.model || selectedModel;
    const regenRes = lastParams.resolution || selectedResolution;
    const cost = getGenerateImageTotalCost(regenModel, regenRes, regenCount);
    const modelLabel =
      modelOptions.find((o) => o.value === regenModel)?.label || regenModel;

    setIsGenerating(true);
    setResults([]);
    setErrorMessage(null);

    const deductResult = await deductCredits(
      cost,
      "generate_image",
      `AI 主图整批重生 ${regenCount} 张（${modelLabel} ${regenRes}，${getGenerateImageUnitCost(regenModel, regenRes)} 积分/张）`,
    );
    if (!deductResult.success) {
      setIsGenerating(false);
      setErrorMessage(deductResult.error || "积分不足，请先充值");
      return;
    }
    refreshBalance();

    const batchId = crypto.randomUUID();
    setCurrentBatchId(batchId);
    setProgress({ current: 1, total: regenCount });
    startImageGeneration({
      ...lastParams,
      _groupId: batchId,
      unitCost: getGenerateImageUnitCost(regenModel, regenRes),
      onComplete: (images: string[]) => {
        setResults(images);
        setIsGenerating(false);
        setProgress(null);
      },
    });
  };

  const handleRegenerateSingle = async () => {
    if (!startImageGeneration || !lastParams) {
      setErrorMessage("系统初始化中，请刷新页面后重试");
      return;
    }

    const singleModel = lastParams.model || selectedModel;
    const singleRes = lastParams.resolution || selectedResolution;
    const cost = getGenerateImageUnitCost(singleModel, singleRes);
    const modelLabel =
      modelOptions.find((o) => o.value === singleModel)?.label || singleModel;

    setIsGenerating(true);
    setErrorMessage(null);

    const deductResult = await deductCredits(
      cost,
      "generate_image",
      `AI 主图基于此图再生成（${modelLabel} ${singleRes}，${cost} 积分）`,
    );
    if (!deductResult.success) {
      setIsGenerating(false);
      setErrorMessage(deductResult.error || "积分不足，请先充值");
      return;
    }
    refreshBalance();

    const batchId = crypto.randomUUID();
    setCurrentBatchId(batchId);
    setProgress({ current: 1, total: 1 });
    startImageGeneration({
      ...lastParams,
      n: 1,
      _groupId: batchId,
      unitCost: cost,
      onComplete: (images: string[]) => {
        if (images.length > 0) {
          setResults((prev) => [...prev, ...images]);
        }
        setIsGenerating(false);
        setProgress(null);
      },
    });
  };

  const handleRegenerateIndividual = async (index: number) => {
    if (!ctxRegenerateSingle || !activeJob || !lastParams) {
      setErrorMessage("系统初始化中，请刷新页面后重试");
      return;
    }

    const singleModel = lastParams.model || selectedModel;
    const singleRes = lastParams.resolution || selectedResolution;
    const cost = getGenerateImageUnitCost(singleModel, singleRes);
    const modelLabel =
      modelOptions.find((o) => o.value === singleModel)?.label || singleModel;

    setErrorMessage(null);

    const deductResult = await deductCredits(
      cost,
      "generate_image",
      `AI 主图单图重新生成（${modelLabel} ${singleRes}，${cost} 积分）`,
    );
    if (!deductResult.success) {
      setErrorMessage(deductResult.error || "积分不足，请先充值");
      return;
    }
    refreshBalance();

    await ctxRegenerateSingle(activeJob.id, index, { ...lastParams, unitCost: cost });
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
    allResolutionOptions.find((option) => option.value === selectedResolution)?.label ||
    selectedResolution;
  const selectedLanguageLabel =
    languageOptions.find((option) => option.value === textLanguage)?.label || textLanguage;

  const openCropDialog = (src: string) => {
    setCropDialogImage(src);
    setCropDialogOpen(true);
  };

  const handleEvaluate = async (src: string, index: number) => {
    if (evaluatingIndex !== null) return;
    setEvaluatingIndex(index);
    try {
      const result = await evaluateImage(src, imageType, selectedRatio);
      setEvaluations((prev) => ({ ...prev, [index]: result }));
    } catch (err) {
      console.error("evaluate error:", err);
    } finally {
      setEvaluatingIndex(null);
    }
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
    <div className="space-y-5 py-1 md:space-y-6">
      <WorkspaceHeader
        icon={Sparkles}
        badge="AI 主图"
        title="AI 电商主图生成"
        description="上传商品图，快速生成主图、场景图或单张详情图。适合快速出图、试风格、试场景。"
        steps={["1. 上传商品", "2. 分析场景", "3. 生成图片"]}
      />

      <WorkspaceShell
        sidebar={
          <div className="space-y-4 rounded-3xl border border-border bg-card p-3 pb-24 shadow-sm sm:space-y-5 sm:p-4 md:p-5 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pb-6">
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
          适合单张或多张独立图片生成，不负责整套详情页结构策划。
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            还原模式
          </label>
          <RadioGroup
            value={fidelityMode}
            onValueChange={handleFidelityModeChange}
            className="grid grid-cols-3 gap-2"
          >
            {([
              { value: "normal", label: "自由创意", desc: "AI 自由发挥，效果最丰富" },
              { value: "strict", label: "AI 保真", desc: "AI 尽力保留商品结构" },
              { value: "composite", label: "抠图合成", desc: "商品像素不变，只换背景" },
            ] as const).map((opt) => (
              <label
                key={opt.value}
                className={`relative flex cursor-pointer flex-col items-center gap-1 rounded-xl border p-2 text-center transition-all ${
                  fidelityMode === opt.value
                    ? "border-primary bg-primary/10 shadow-sm"
                    : "border-border bg-background hover:border-primary/30"
                }`}
              >
                <RadioGroupItem value={opt.value} className="sr-only" />
                <span className={`text-xs font-semibold ${fidelityMode === opt.value ? "text-primary" : "text-foreground"}`}>
                  {opt.label}
                </span>
                <span className="text-[10px] leading-tight text-muted-foreground">
                  {opt.desc}
                </span>
              </label>
            ))}
          </RadioGroup>
          {fidelityMode === "strict" && (
            <div className="space-y-1.5">
              <p className="rounded-xl bg-primary/5 px-3 py-2 text-[11px] leading-5 text-primary">
                {strictModeDescription}
              </p>
              <p className="px-1 text-[10px] leading-4 text-muted-foreground">
                建议开启"多参考图"并上传多个角度：
                {strictCategoryHint === "phone-case"
                  ? "正面、背面、侧边、镜头孔特写（最多 6 张）"
                  : strictCategoryHint === "printed-product"
                  ? "正面、背面、图案特写（最多 5 张）"
                  : strictCategoryHint === "packaging"
                  ? "正面、背面、侧面、标签特写（最多 5 张）"
                  : "正面、侧面、细节特写（最多 4 张）"}
                。角度越多，还原度越高。
              </p>
            </div>
          )}
          {fidelityMode === "composite" && (
            <div className="space-y-1.5 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
              <p>
                商品将被自动抠图后融入 AI 生成的新场景，Gemini 会尽量保持商品细节一致。建议上传背景干净的商品图以获得最佳抠图效果。
              </p>
              {selectedModel !== "nano-banana-pro-preview" && (
                <p className="text-amber-800 dark:text-amber-300">
                  💡 追求更高保真度可切换到 <span className="font-semibold">Nano Banana Pro</span>，对 logo、文字、图案细节的还原明显更准（扣费会相应增加）。
                </p>
              )}
            </div>
          )}
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
              多参考图
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
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4 sm:gap-1.5">
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
                          handleFile(file).catch((error) => {
                            setSuggestionError(normalizeUserErrorMessage(error, "图片上传失败，请重试。"));
                          });
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            ) : (
              <label className="block cursor-pointer py-4">
                <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  {isBatchMode
                    ? "第 1 张为主商品图，其余为补充角度参考"
                    : "拖拽或点击上传产品图"}
                </p>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFile(file).catch((error) => {
                        setSuggestionError(normalizeUserErrorMessage(error, "图片上传失败，请重试。"));
                      });
                    }
                  }}
                />
              </label>
            )}
          </div>
          {isBatchMode && uploadedImages.length > 0 && (
            <p className="text-[10px] text-muted-foreground">
              第 1 张用于主体识别，其余 {uploadedImages.length - 1} 张用于补充角度和细节参考，不是分别批量生成。
            </p>
          )}
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
                  <span className="inline-flex items-center gap-1">
                    {isLoadingSuggestions ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-2.5 w-2.5" />
                    )}
                    <span>分析产品</span>
                  </span>
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
                <div className="rounded-lg bg-destructive/10 px-2 py-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-destructive">{suggestionError}</span>
                    <button onClick={handleAnalyzeProduct} className="shrink-0 text-primary hover:underline">
                      重试
                    </button>
                  </div>
                  {suggestionHint && (
                    <div className="mt-1 text-[11px] text-muted-foreground">{suggestionHint}</div>
                  )}
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

        <SelectField
          label="目标平台"
          options={platformPresets}
          value={selectedPlatform}
          onChange={(value) => {
            setSelectedPlatform(value);
            const preset = platformPresets.find((p) => p.value === value);
            if (preset?.ratio) setSelectedRatio(preset.ratio);
          }}
        />

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <SelectField
            label="生成数量"
            options={imageCountOptions}
            value={selectedCount}
            onChange={setSelectedCount}
          />
          <div className="space-y-1">
            <SelectField
              label="文字语言"
              options={isNanoBanana ? languageOptions.filter((o) => o.value === "en" || o.value === "pure") : languageOptions}
              value={textLanguage}
              onChange={setTextLanguage}
            />
            {isNanoBanana && (
              <div className="text-[10px] text-amber-600">
                Nano Banana 仅支持英文文字，其他语言会出现乱码
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <SelectField
              label="模型"
              options={modelOptions.map((o) => ({ value: o.value, label: o.label }))}
              value={selectedModel}
              onChange={(value) => setSelectedModel(value as GenerationModel)}
            />
            <div className="text-[10px] text-muted-foreground">
              {modelOptions.find((o) => o.value === selectedModel)?.hint || ""}
            </div>
          </div>
          <SelectField
            label="清晰度"
            options={currentResOptions}
            value={selectedResolution}
            onChange={(value) => setSelectedResolution(value as OutputResolution)}
          />
        </div>

        {sceneSuggestions.length > 0 && sceneSuggestions[selectedSuggestionIndex] && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">
            <Check className="h-3.5 w-3.5 shrink-0" />
            <span>已应用方案：{sceneSuggestions[selectedSuggestionIndex].scene}</span>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-background/60 p-3">
          <button
            type="button"
            onClick={() => setShowAdvancedOptions((current) => !current)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <div className="text-sm font-semibold text-foreground">补充素材与高级设置</div>
              <div className="text-xs text-muted-foreground">
                模特图、风格图、产品信息补充
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
                      onClick={() => {
                        if (fidelityMode === "strict") return;
                        setModelMode("with_model");
                      }}
                      disabled={fidelityMode === "strict"}
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
                {(fidelityMode === "strict" || fidelityMode === "composite") && (
                  <p className="text-[11px] leading-5 text-muted-foreground">
                    {fidelityMode === "composite"
                      ? "抠图合成模式下不支持模特图，商品会直接贴到场景上。"
                      : "AI 保真模式下会默认减少人物和手持遮挡，因此暂不启用模特图。"}
                  </p>
                )}

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
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">避免出现</label>
                  <Textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="例如：文字、人物、水印、过多装饰"
                    className="min-h-[60px] resize-none text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <Button
          variant="hero"
          className="w-full"
          onClick={handleGenerate}
          disabled={(uploadedImages.length === 0 && !textPrompt.trim()) || isGenerating || balanceInsufficient}
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
        <div className="text-center text-xs text-muted-foreground">
          预计消耗{" "}
          <span className="font-semibold text-foreground">{totalCost} 积分</span>
          <span className="mx-1">·</span>
          {unitCost} 积分/张
          {userBalance !== null && (
            <>
              <span className="mx-1">·</span>
              余额{" "}
              <span className={balanceInsufficient ? "font-semibold text-destructive" : "text-foreground"}>
                {userBalance}
              </span>
            </>
          )}
          {balanceInsufficient && (
            <span className="ml-1 text-destructive">（余额不足）</span>
          )}
        </div>
          </div>
        }
        content={
      <div className="space-y-5 rounded-3xl border border-border bg-card p-3 pb-24 shadow-sm sm:space-y-6 sm:p-4 md:p-6 lg:pb-6 xl:min-h-[720px]">
        {errorMessage && (
          <div className="mb-3 flex items-center justify-between rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
            <div className="min-w-0">
              <div>{errorMessage}</div>
              {errorHint && <div className="mt-1 text-xs text-muted-foreground">{errorHint}</div>}
            </div>
            <button onClick={() => setErrorMessage(null)} className="shrink-0">
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
            <div className="mt-6 grid w-full grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
              {Array.from({ length: Math.min(Math.max(Number(selectedCount), 1), 9) }).map(
                (_, index) => (
                  <div key={index} className="aspect-square rounded-lg bg-muted animate-pulse" />
                ),
              )}
            </div>
          </div>
        ) : results.length > 0 ? (
          <>
            <WorkspaceSection
              title="结果已经准备好了"
              description="已生成多张独立图片结果，可继续挑选、下载、编辑或重生。"
              actions={
                <>
                  <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    本次已生成 {results.length} 张结果
                  </div>
                  <Button variant="outline" size="sm" className="h-9 text-xs" onClick={handleRegenerate}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" />
                    整批重生
                  </Button>
                  <Button variant="default" size="sm" className="h-9 text-xs" onClick={downloadAll}>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    全部下载图片
                  </Button>
                </>
              }
              className="p-4"
            >
              <WorkspaceStatGrid
                items={[
                  { label: "图片类型", value: imageType },
                  { label: "模型", value: selectedModelLabel },
                  { label: "规格", value: `${selectedResolutionLabel} / ${selectedRatio}` },
                  { label: "文字语言", value: selectedLanguageLabel },
                  { label: "还原模式", value: fidelityMode === "composite" ? "抠图合成" : fidelityMode === "strict" ? "AI 保真" : "自由创意" },
                ]}
              />
            </WorkspaceSection>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <button
                        onClick={() => setPreviewImage(src)}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        <ZoomIn className="mr-1 inline h-3 w-3" />
                        查看
                      </button>
                      <button
                        onClick={() => navigate(`/dashboard/edit?url=${encodeURIComponent(src)}`)}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        <Edit3 className="mr-1 inline h-3 w-3" />
                        编辑图片
                      </button>
                      <button
                        onClick={() => downloadImage(src, `picspark-${Date.now()}-${index + 1}.jpg`)}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary"
                      >
                        <Download className="mr-1 inline h-3 w-3" />
                        下载图片
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => openCropDialog(src)}
                        className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/10"
                      >
                        <Crop className="mr-1 inline h-3 w-3" />
                        适配多平台
                      </button>
                      <button
                        onClick={() => handleEvaluate(src, index)}
                        disabled={evaluatingIndex !== null}
                        className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                          evaluations[index]
                            ? "border-accent/30 bg-accent/5 text-accent-foreground"
                            : "border-orange-500/30 bg-orange-500/5 text-orange-600 hover:bg-orange-500/10"
                        } disabled:opacity-50`}
                      >
                        {evaluatingIndex === index ? (
                          <>
                            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                            评估中...
                          </>
                        ) : evaluations[index] ? (
                          <>
                            <BarChart3 className="mr-1 inline h-3 w-3" />
                            {evaluations[index].score}分 · {evaluations[index].rating}
                          </>
                        ) : (
                          <>
                            <BarChart3 className="mr-1 inline h-3 w-3" />
                            AI 评分
                          </>
                        )}
                      </button>
                    </div>
                    {evaluations[index] && (
                      <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs leading-5">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                            {evaluations[index].score} / 10
                          </span>
                          <span className="font-medium text-foreground">
                            {evaluations[index].usageSuggestion}
                          </span>
                        </div>
                        {evaluations[index].strengths.length > 0 && (
                          <div className="mb-1.5">
                            <span className="font-medium text-green-600">优点：</span>
                            <span className="text-muted-foreground">{evaluations[index].strengths.join("、")}</span>
                          </div>
                        )}
                        {evaluations[index].improvements.length > 0 && (
                          <div>
                            <span className="font-medium text-orange-500">建议：</span>
                            <span className="text-muted-foreground">{evaluations[index].improvements.join("、")}</span>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button
                        onClick={() => handleRegenerateIndividual(index)}
                        disabled={isGenerating || regeneratingIndex !== null}
                        className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:opacity-50"
                      >
                        {regeneratingIndex === index ? (
                          <>
                            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
                            重新生成中...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-1 inline h-3 w-3" />
                            重新生成
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleRegenerateSingle}
                        disabled={isGenerating}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/40 hover:text-primary disabled:opacity-50"
                      >
                        <RefreshCw className="mr-1 inline h-3 w-3" />
                        基于此图再生成
                      </button>
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
          <WorkspaceEmptyState
            icon={Sparkles}
            title="准备开始生成"
            description="上传商品图并选择场景方案后，即可快速生成电商主图。"
            className="min-h-[400px]"
          />
        )}
      </div>
        }
      />

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

      <MultiPlatformCropDialog
        open={cropDialogOpen}
        onOpenChange={setCropDialogOpen}
        imageUrl={cropDialogImage}
      />
    </div>
  );
};

export default GeneratePage;
