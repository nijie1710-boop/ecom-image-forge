
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Edit3,
  FileImage,
  Images,
  ImagePlus,
  LayoutPanelTop,
  Loader2,
  Palette,
  RefreshCw,
  Sparkles,
  StopCircle,
  Upload,
  Wand2,
  X,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useGeneration } from "@/contexts/GenerationContext";
import {
  generateDetailPlan,
  optimizeProductInfo,
  type DetailPlanOption,
  type DetailPlanScreen,
} from "@/lib/detail-plan";
import {
  type GenerationModel,
  type OutputResolution,
} from "@/lib/ai-generator";

const platformOptions = ["淘宝/天猫", "京东", "拼多多", "小红书", "抖音", "亚马逊"];

const planningLanguageOptions = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
];

const generationLanguageOptions = [
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

const screenCountOptions = [3, 4, 5, 6, 7, 8];

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

const modelOptions: { value: GenerationModel; label: string; hint: string }[] = [
  {
    value: "gemini-3.1-flash-image-preview",
    label: "Nano Banana 2",
    hint: "细节稳，适合详情页主力生成",
  },
  {
    value: "nano-banana-pro-preview",
    label: "Nano Banana Pro",
    hint: "创意更活跃，适合风格拉开差异",
  },
  {
    value: "gemini-2.5-flash-image",
    label: "Nano Banana",
    hint: "速度更快，适合快速试方案",
  },
];

const resolutionOptions: { value: OutputResolution; label: string }[] = [
  { value: "0.5k", label: "0.5K 快速" },
  { value: "1k", label: "1K 标准" },
  { value: "2k", label: "2K 高清" },
  { value: "4k", label: "4K 超清" },
];

type ScreenStatus = "idle" | "running" | "done" | "error" | "canceled";

type GeneratedScreenState = {
  screen: number;
  title: string;
  status: ScreenStatus;
  prompt: string;
  imageUrl?: string;
  error?: string;
  overlayTitle: string;
  overlayBody: string;
  overlayEnabled: boolean;
};

const DETAIL_JOB_ID_KEY = "detail-design-active-job-id";
const DETAIL_DRAFT_KEY = "detail-design-draft";

const SelectField = ({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<string | { value: string; label: string }>;
}) => (
  <div className="space-y-1.5">
    <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {label}
    </label>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-primary/25"
    >
      {options.map((option) =>
        typeof option === "string" ? (
          <option key={option} value={option}>
            {option}
          </option>
        ) : (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ),
      )}
    </select>
  </div>
);

const EmptyState = () => (
  <div className="rounded-3xl border border-dashed border-border bg-card/60 p-8 text-center">
    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
      <LayoutPanelTop className="h-7 w-7 text-primary" />
    </div>
    <h3 className="text-lg font-semibold text-foreground">先生成一套详情页方案</h3>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
      上传商品图、补充卖点后，AI 会先输出 3 套完整详情页方案，包含整版调性、配色规范和每一屏的结构建议。
    </p>
  </div>
);

function languageRule(language: string): string {
  if (language === "pure") {
    return "整张图禁止新增任何场景文字、海报字、标题字或水印。商品本身已有 logo 或印花文字可以保留。";
  }

  const current =
    generationLanguageOptions.find((option) => option.value === language)?.label || language;
  return `如果画面中需要出现新增文字，只能使用 ${current}，不要混入其他语言。`;
}

function typographyRule(language: string): string {
  if (language === "pure") {
    return "纯图片模式下不要新增任何版式文字，也不要为了排版预留文案区。";
  }

  if (language === "zh") {
    return "新增中文文字请使用清晰、端正、现代、易读的免费商用中文无衬线字体风格，优先参考思源黑体、阿里巴巴普惠体、HarmonyOS Sans SC 的视觉气质，不要花字、手写体、书法体、伪中文或乱码。";
  }

  return "新增文字请使用清晰、标准、现代的无衬线字体风格，字形必须完整可读，不要出现乱码、伪文字或错误字符。";
}

function buildScreenPrompt(args: {
  plan: DetailPlanOption;
  screen: DetailPlanScreen;
  productSummary: string;
  visibleText: string;
  productInfo: string;
  targetPlatform: string;
  targetLanguage: string;
  screenIdea?: string;
}): string {
  const {
    plan,
    screen,
    productSummary,
    visibleText,
    productInfo,
    targetPlatform,
    targetLanguage,
    screenIdea,
  } =
    args;

  return `
你正在为电商详情页生成第 ${screen.screen} 屏视觉。

必须严格使用上传商品图中的同一件商品，不得替换商品、不得改掉商品主体结构、颜色、材质、图案和关键细节。
允许变化的内容只有：背景、场景、灯光、构图、辅材和镜头语言。

商品识别：
${productSummary || "请优先依据上传商品图识别商品。"}

商品图中可见文字：
${visibleText || "NONE"}

用户补充要求：
${productInfo || "无额外补充"}

目标平台：
${targetPlatform}

详情页整体方案：
- 方案名称：${plan.planName}
- 风格调性：${plan.tone}
- 目标人群：${plan.audience}
- 方案摘要：${plan.summary}

整版设计规范：
- 主色：${plan.designSpec.mainColors.join("、")}
- 辅助色：${plan.designSpec.accentColors.join("、")}
- 版式氛围：${plan.designSpec.layoutTone}
- 画面风格：${plan.designSpec.imageStyle}
- 文案规范：${plan.designSpec.languageGuidelines}

当前要生成的分屏：
- 标题：${screen.title}
- 目标：${screen.goal}
- 视觉方向：${screen.visualDirection}
- 重点卖点：${screen.copyPoints.join("；")}
- 画面内主标题：${screen.overlayTitle || screen.title}
- 画面内卖点短句：${screen.overlayBodyLines?.join("；") || screen.copyPoints.join("；")}
- 人物建议：${screen.humanModelSuggested ? "建议人物出镜" : "建议纯商品展示"}${screen.humanModelReason ? `；原因：${screen.humanModelReason}` : ""}
- 用户补充的分屏构思：${screenIdea?.trim() || "无"}

生成要求：
1. 这是电商详情页分屏，不要回退成单纯主图白底棚拍。
2. 画面必须明显体现当前分屏的目标和视觉方向。
3. 如果用户提供了分屏构思，必须优先吸收并融入当前这一屏，而不是忽略它。
4. 如果当前语言不是 pure，请把“画面内主标题”和“画面内卖点短句”直接生成在图片里，不要省略，不要留到后期再贴字。
5. 画面中的文字必须层级清晰、字形正确、拼写正确、排版整洁，并与电商详情页视觉一致。
6. ${typographyRule(targetLanguage)}
7. ${languageRule(targetLanguage)}
8. 如果当前分屏建议人物出镜，可以自然加入真人模特、手部交互或使用动作，但人物只能辅助解释卖点，不能盖住商品主体。
9. 如果当前分屏建议纯商品展示，就不要额外加入真人模特，除非只是极轻微的手部辅助且明显更利于说明使用方式。
10. 保持商品真实、可售、适合电商详情页，不做无关艺术化改造。
`.trim();
}

async function loadImageElement(src: string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败"));
    image.src = src;
  });
}

const DetailDesignPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { startDetailGeneration, cancelJob, getJob, jobs } = useGeneration();
  const [productImages, setProductImages] = useState<string[]>([]);
  const [styleReferenceImage, setStyleReferenceImage] = useState<string>("");
  const [styleReferenceText, setStyleReferenceText] = useState("");
  const [productInfo, setProductInfo] = useState("");
  const [targetPlatform, setTargetPlatform] = useState(platformOptions[0]);
  const [targetLanguage, setTargetLanguage] = useState("zh");
  const [screenCount, setScreenCount] = useState("4");
  const [useScreenIdeas, setUseScreenIdeas] = useState(false);
  const [screenIdeas, setScreenIdeas] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOptimizingProductInfo, setIsOptimizingProductInfo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productSummary, setProductSummary] = useState("");
  const [visibleText, setVisibleText] = useState("NONE");
  const [planOptions, setPlanOptions] = useState<DetailPlanOption[]>([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const [selectedModel, setSelectedModel] =
    useState<GenerationModel>("gemini-3.1-flash-image-preview");
  const [selectedRatio, setSelectedRatio] = useState("3:4");
  const [selectedResolution, setSelectedResolution] =
    useState<OutputResolution>("2k");
  const [generationLanguage, setGenerationLanguage] = useState("zh");
  const [generatedScreens, setGeneratedScreens] = useState<GeneratedScreenState[]>([]);
  const [isGeneratingScreens, setIsGeneratingScreens] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [hasRestoredDraft, setHasRestoredDraft] = useState(false);
  const [showScreenIdeas, setShowScreenIdeas] = useState(false);
  const [showGenerationSettings, setShowGenerationSettings] = useState(false);
  const resultsSectionRef = useRef<HTMLElement | null>(null);

  const activePlan = useMemo(
    () => planOptions[selectedOptionIndex] || null,
    [planOptions, selectedOptionIndex],
  );
  const activeDetailJob = useMemo(
    () => (detailJobId ? getJob(detailJobId) : null),
    [detailJobId, getJob, jobs],
  );

  useEffect(() => {
    const savedJobId = sessionStorage.getItem(DETAIL_JOB_ID_KEY);
    if (savedJobId) {
      setDetailJobId(savedJobId);
    }
    const rawDraft = sessionStorage.getItem(DETAIL_DRAFT_KEY);
    if (!rawDraft) {
      setHasRestoredDraft(true);
      return;
    }
    try {
      const draft = JSON.parse(rawDraft) as Partial<{
        productInfo: string;
        styleReferenceText: string;
        productImages: string[];
        styleReferenceImage: string;
        selectedRatio: string;
        selectedResolution: OutputResolution;
        generationLanguage: string;
        selectedModel: GenerationModel;
        targetPlatform: string;
        targetLanguage: string;
        screenCount: string;
        useScreenIdeas: boolean;
        screenIdeas: string[];
        productSummary: string;
        visibleText: string;
        planOptions: DetailPlanOption[];
        selectedOptionIndex: number;
      }>;
      setProductImages(draft.productImages || []);
      setProductInfo(draft.productInfo || "");
      setStyleReferenceImage(draft.styleReferenceImage || "");
      setStyleReferenceText(draft.styleReferenceText || "");
      setSelectedRatio(draft.selectedRatio || "3:4");
      setSelectedResolution(draft.selectedResolution || "2k");
      setGenerationLanguage(draft.generationLanguage || "zh");
      setSelectedModel(draft.selectedModel || "gemini-3.1-flash-image-preview");
      setTargetPlatform(draft.targetPlatform || platformOptions[0]);
      setTargetLanguage(draft.targetLanguage || "zh");
      setScreenCount(draft.screenCount || "4");
      setUseScreenIdeas(Boolean(draft.useScreenIdeas));
      setScreenIdeas(draft.screenIdeas || []);
      setProductSummary(draft.productSummary || "");
      setVisibleText(draft.visibleText || "NONE");
      setPlanOptions(draft.planOptions || []);
      setSelectedOptionIndex(draft.selectedOptionIndex || 0);
    } catch {
      sessionStorage.removeItem(DETAIL_DRAFT_KEY);
    } finally {
      setHasRestoredDraft(true);
    }
  }, []);

  useEffect(() => {
    if (!activePlan) {
      setGeneratedScreens([]);
      return;
    }

    setGeneratedScreens((current) =>
      activePlan.screens.map((screen) => {
        const existing = current.find((item) => item.screen === screen.screen);
        return {
          screen: screen.screen,
          title: screen.title,
          status: existing?.status || "idle",
          prompt: existing?.prompt || "",
          imageUrl: existing?.imageUrl,
          error: existing?.error,
          overlayTitle: existing?.overlayTitle || screen.overlayTitle || screen.title,
          overlayBody:
            existing?.overlayBody ||
            screen.overlayBodyLines?.join("\n") ||
            screen.copyPoints.join("\n"),
          overlayEnabled:
            generationLanguage === "pure"
              ? false
              : existing?.overlayEnabled ?? true,
        };
      }),
    );
    setGenerationError(null);
  }, [activePlan, generationLanguage]);

  useEffect(() => {
    const desired = Number(screenCount) || 4;
    setScreenIdeas((current) => {
      const next = Array.from({ length: desired }, (_, index) => current[index] || "");
      return next;
    });
  }, [screenCount]);

  useEffect(() => {
    if (!activeDetailJob || activeDetailJob.kind !== "detail") {
      if (detailJobId && !getJob(detailJobId)) {
        sessionStorage.removeItem(DETAIL_JOB_ID_KEY);
        setDetailJobId(null);
      }
      return;
    }

    setProductImages((current) =>
      current.length ? current : activeDetailJob.uploadedImages.slice(0, 5),
    );
    setStyleReferenceImage((current) => current || activeDetailJob.detailSettings?.styleReferenceImage || "");
    setStyleReferenceText((current) => current || activeDetailJob.detailSettings?.styleReferenceText || "");
    if (activeDetailJob.detailSettings?.aspectRatio) {
      setSelectedRatio(activeDetailJob.detailSettings.aspectRatio);
    }
    if (activeDetailJob.detailSettings?.textLanguage) {
      setGenerationLanguage(activeDetailJob.detailSettings.textLanguage);
    }
    if (activeDetailJob.detailSettings?.model) {
      setSelectedModel(activeDetailJob.detailSettings.model);
    }
    if (activeDetailJob.detailSettings?.resolution) {
      setSelectedResolution(activeDetailJob.detailSettings.resolution);
    }
    if (activeDetailJob.detailScreens?.length) {
      setGeneratedScreens((current) => {
        if (!current.length) {
          return activeDetailJob.detailScreens || [];
        }
        const merged = [...current];
        activeDetailJob.detailScreens?.forEach((screen) => {
          const index = merged.findIndex((item) => item.screen === screen.screen);
          if (index >= 0) {
            merged[index] = { ...merged[index], ...screen };
          } else {
            merged.push(screen);
          }
        });
        return merged.sort((a, b) => a.screen - b.screen);
      });
    }
    setIsGeneratingScreens(activeDetailJob.status === "running");
    if (activeDetailJob.status === "error") {
      setGenerationError(activeDetailJob.error || "逐屏生成失败");
    } else if (activeDetailJob.status === "canceled") {
      setGenerationError("后台任务已取消");
    }

    if (activeDetailJob.status !== "running") {
      sessionStorage.removeItem(DETAIL_JOB_ID_KEY);
    }
  }, [activeDetailJob, detailJobId, getJob]);

  useEffect(() => {
    const shouldFocusResults = sessionStorage.getItem("detail-design-focus-results");
    if (!shouldFocusResults) return;
    if (!generatedScreens.length) return;

    const timer = window.setTimeout(() => {
      resultsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      sessionStorage.removeItem("detail-design-focus-results");
    }, 120);

    return () => window.clearTimeout(timer);
  }, [generatedScreens.length]);

  useEffect(() => {
    if (!hasRestoredDraft) return;
    sessionStorage.setItem(
      DETAIL_DRAFT_KEY,
      JSON.stringify({
        productImages,
        productInfo,
        styleReferenceImage,
        styleReferenceText,
        selectedRatio,
        selectedResolution,
        generationLanguage,
        selectedModel,
        targetPlatform,
        targetLanguage,
        screenCount,
        useScreenIdeas,
        screenIdeas,
        productSummary,
        visibleText,
        planOptions,
        selectedOptionIndex,
      }),
    );
  }, [
    hasRestoredDraft,
    planOptions,
    productImages,
    productInfo,
    productSummary,
    screenCount,
    screenIdeas,
    selectedOptionIndex,
    selectedModel,
    selectedRatio,
    selectedResolution,
    styleReferenceImage,
    styleReferenceText,
    targetLanguage,
    targetPlatform,
    useScreenIdeas,
    visibleText,
  ]);

  const compressImage = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          const maxWidth = 1280;
          const width = Math.min(maxWidth, image.width);
          const height = Math.round((image.height * width) / image.width);
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("无法处理图片"));
            return;
          }
          ctx.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", 0.88));
        };
        image.onerror = () => reject(new Error("图片读取失败"));
        image.src = dataUrl;
      };
      reader.onerror = () => reject(new Error("文件读取失败"));
      reader.readAsDataURL(file);
    });

  const resetPlan = () => {
    setError(null);
    setPlanOptions([]);
    setSelectedOptionIndex(0);
    setProductSummary("");
    setVisibleText("NONE");
    setGeneratedScreens([]);
    setGenerationError(null);
  };

  const updateScreenIdea = (index: number, value: string) => {
    setScreenIdeas((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    const availableSlots = Math.max(0, 5 - productImages.length);
    const imageFiles = Array.from(files)
      .filter((file) => file.type.match(/image\/(jpeg|png|webp)/))
      .slice(0, availableSlots || 5);

    if (!imageFiles.length) return;

    const compressed = await Promise.all(imageFiles.map((file) => compressImage(file)));
    setProductImages((current) => [...current, ...compressed].slice(0, 5));
    resetPlan();
  };

  const handleSingleAsset = async (
    files: FileList | null,
    setter: (value: string) => void,
  ) => {
    if (!files?.length) return;
    const file = Array.from(files).find((item) => item.type.match(/image\/(jpeg|png|webp)/));
    if (!file) return;
    const compressed = await compressImage(file);
    setter(compressed);
    resetPlan();
  };

  const removeImage = (index: number) => {
    setProductImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
    resetPlan();
  };

  const appendPlanningContext = () => {
    const chunks = [productInfo.trim()];

    if (styleReferenceText.trim()) {
      chunks.push(`风格补充：${styleReferenceText.trim()}`);
    }
    chunks.push(
      "人物策略：由 AI 根据当前商品品类和每一屏的卖点表达，自行判断是否需要真人模特、手部出镜或纯商品展示。只有在上身效果、手持演示、尺寸对比或生活场景更能说明卖点时才加入人物，并且人物不能喧宾夺主。",
    );

    return chunks.filter(Boolean).join("\n");
  };

  const handleGeneratePlan = async () => {
    if (!productImages.length) {
      setError("请先上传至少 1 张商品图");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await generateDetailPlan({
        productImages,
        productInfo: appendPlanningContext(),
        targetPlatform,
        targetLanguage,
        screenCount: Number(screenCount),
        screenIdeas: useScreenIdeas ? screenIdeas : [],
      });

      setProductSummary(result.productSummary);
      setVisibleText(result.visibleText);
      setPlanOptions(result.planOptions || []);
      setSelectedOptionIndex(0);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "详情页策划失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOptimizeProductInfo = async () => {
    if (!productImages.length && !productInfo.trim()) {
      setError("请先上传商品图或填写一些基础产品信息");
      return;
    }

    setIsOptimizingProductInfo(true);
    setError(null);

    try {
      const optimized = await optimizeProductInfo({
        productImages,
        productInfo,
        targetPlatform,
      });
      setProductInfo(optimized);
    } catch (optimizeError) {
      setError(optimizeError instanceof Error ? optimizeError.message : "产品信息优化失败");
    } finally {
      setIsOptimizingProductInfo(false);
    }
  };

  const updateGeneratedScreen = (
    screenNumber: number,
    updater: (current: GeneratedScreenState) => GeneratedScreenState,
  ) => {
    setGeneratedScreens((current) =>
      current.map((item) => (item.screen === screenNumber ? updater(item) : item)),
    );
  };

  const getComposedImageUrl = async (generated: GeneratedScreenState): Promise<string> => {
    if (!generated.imageUrl) {
      throw new Error("当前没有可预览图片");
    }
    return generated.imageUrl;
  };

  const composeLongPosterImage = async (screens: GeneratedScreenState[]): Promise<string> => {
    const completed = screens.filter((screen) => screen.imageUrl);
    if (!completed.length) {
      throw new Error("当前没有可拼接的分屏图片");
    }

    const composedEntries = await Promise.all(
      completed.map(async (screen) => ({
        screen: screen.screen,
        url: await getComposedImageUrl(screen),
      })),
    );

    const loaded = await Promise.all(
      composedEntries.map(async (item) => ({
        screen: item.screen,
        image: await loadImageElement(item.url),
      })),
    );

    const gap = 0;
    const width = Math.max(...loaded.map((item) => item.image.naturalWidth || item.image.width));
    const height =
      loaded.reduce((sum, item) => sum + (item.image.naturalHeight || item.image.height), 0) +
      gap * Math.max(0, loaded.length - 1);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("无法创建长图画布");
    }

    ctx.fillStyle = "#f7f4ef";
    ctx.fillRect(0, 0, width, height);

    let offsetY = 0;
    loaded.forEach(({ image }) => {
      const imageWidth = image.naturalWidth || image.width;
      const imageHeight = image.naturalHeight || image.height;
      const drawX = Math.round((width - imageWidth) / 2);
      ctx.drawImage(image, drawX, offsetY, imageWidth, imageHeight);
      offsetY += imageHeight + gap;
    });

    return canvas.toDataURL("image/png");
  };

  const handlePreviewScreen = async (generated: GeneratedScreenState) => {
    setIsPreparingPreview(true);
    try {
      const composed = await getComposedImageUrl(generated);
      setPreviewImageUrl(composed);
      setPreviewTitle(generated.title);
    } catch (previewError) {
      setGenerationError(
        previewError instanceof Error ? previewError.message : "预览成品失败",
      );
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handlePreviewLongImage = async () => {
    setIsPreparingPreview(true);
    try {
      const composed = await composeLongPosterImage(generatedScreens);
      setPreviewImageUrl(composed);
      setPreviewTitle("详情页长图预览");
    } catch (previewError) {
      setGenerationError(
        previewError instanceof Error ? previewError.message : "预览长图失败",
      );
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handleDownloadScreen = async (generated: GeneratedScreenState) => {
    try {
      const composed = await getComposedImageUrl(generated);
      const link = document.createElement("a");
      link.href = composed;
      link.download = `detail-screen-${generated.screen}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (downloadError) {
      setGenerationError(
        downloadError instanceof Error ? downloadError.message : "下载成品失败",
      );
    }
  };

  const handleDownloadLongImage = async () => {
    try {
      const composed = await composeLongPosterImage(generatedScreens);
      const link = document.createElement("a");
      link.href = composed;
      link.download = `detail-long-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (downloadError) {
      setGenerationError(
        downloadError instanceof Error ? downloadError.message : "下载长图失败",
      );
    }
  };

  const handleOpenEditor = async (generated: GeneratedScreenState) => {
    try {
      const composed = await getComposedImageUrl(generated);
      sessionStorage.setItem("detail-design-edit-image", composed);
      navigate("/dashboard/edit?source=detail-design");
    } catch (editError) {
      setGenerationError(
        editError instanceof Error ? editError.message : "打开编辑页失败",
      );
    }
  };

  const createScreenJobPayload = (screens: DetailPlanScreen[]): GeneratedScreenState[] => {
    if (!activePlan) return [];

    return screens.map((screen) => {
      const current = generatedScreens.find((item) => item.screen === screen.screen);
      const prompt = buildScreenPrompt({
        plan: activePlan,
        screen,
        productSummary,
        visibleText,
        productInfo: appendPlanningContext(),
        targetPlatform,
        targetLanguage: generationLanguage,
        screenIdea: useScreenIdeas ? screenIdeas[screen.screen - 1] : "",
      });

      return {
        screen: screen.screen,
        title: screen.title,
        status: "idle",
        prompt,
        imageUrl: current?.imageUrl,
        error: undefined,
        overlayTitle: screen.overlayTitle || screen.title,
        overlayBody: screen.overlayBodyLines?.join("\n") || screen.copyPoints.join("\n"),
        overlayEnabled: generationLanguage !== "pure",
      };
    });
  };

  const launchDetailGeneration = (screens: DetailPlanScreen[]) => {
    if (!activePlan || !productImages.length) {
      setGenerationError("请先完成方案策划并保留至少 1 张商品图");
      return;
    }

    const nextScreens = createScreenJobPayload(screens);
    setGeneratedScreens((current) => {
      const merged = [...current];
      nextScreens.forEach((screen) => {
        const index = merged.findIndex((item) => item.screen === screen.screen);
        if (index >= 0) {
          merged[index] = { ...merged[index], ...screen, status: "idle", error: undefined };
        } else {
          merged.push(screen);
        }
      });
      return merged.sort((a, b) => a.screen - b.screen);
    });

    setGenerationError(null);
    setIsGeneratingScreens(true);
    const jobId = startDetailGeneration({
      aspectRatio: selectedRatio,
      textLanguage: generationLanguage,
      model: selectedModel,
      resolution: selectedResolution,
      productImages,
      styleReferenceImage: styleReferenceImage || undefined,
      styleReferenceText: styleReferenceText.trim() || undefined,
      screens: nextScreens,
      userId: user?.id,
    });
    setDetailJobId(jobId);
    sessionStorage.setItem(DETAIL_JOB_ID_KEY, jobId);
  };

  const handleGenerateAllScreens = async () => {
    if (!activePlan) return;
    launchDetailGeneration(activePlan.screens);
  };

  const handleRegenerateScreen = async (screen: DetailPlanScreen) => {
    launchDetailGeneration([screen]);
  };

  const currentModelHint =
    modelOptions.find((option) => option.value === selectedModel)?.hint || "";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <div className="mb-6 flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <LayoutPanelTop className="h-3.5 w-3.5" />
          AI 详情页
        </div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">先策划，再逐屏生成</h1>
        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="rounded-full bg-muted px-2.5 py-1">1. 上传商品</span>
          <span className="rounded-full bg-muted px-2.5 py-1">2. 选方案</span>
          <span className="rounded-full bg-muted px-2.5 py-1">3. 逐屏生成</span>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">商品素材</h2>
                <p className="text-xs text-muted-foreground">建议上传 1-5 张多角度商品图</p>
              </div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {productImages.length}/5
              </span>
            </div>

            <label
              className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-4 text-center transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/40"
              }`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                void handleFiles(event.dataTransfer.files);
              }}
            >
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(event) => void handleFiles(event.target.files)}
              />
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground">拖拽上传或点击选择图片</p>
              <p className="mt-1 text-xs text-muted-foreground">JPG、PNG、WEBP，最多 5 张</p>
            </label>

            {productImages.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {productImages.map((image, index) => (
                  <div
                    key={`${image.slice(0, 40)}-${index}`}
                    className="relative overflow-hidden rounded-2xl border border-border bg-background"
                  >
                    <img
                      src={image}
                      alt={`product-${index + 1}`}
                      className="aspect-square w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {productImages.length < 5 && (
                  <label className="flex aspect-square cursor-pointer items-center justify-center rounded-2xl border border-dashed border-border bg-background text-muted-foreground transition hover:border-primary/40 hover:text-primary">
                    <div className="text-center">
                      <Upload className="mx-auto mb-2 h-5 w-5" />
                      <div className="text-xs">继续添加</div>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      className="hidden"
                      onChange={(event) => void handleFiles(event.target.files)}
                    />
                  </label>
                )}
              </div>
            )}

            <div className="mt-5 space-y-4 border-t border-border pt-5">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    产品信息
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleOptimizeProductInfo}
                    disabled={isOptimizingProductInfo || (!productImages.length && !productInfo.trim())}
                    className="h-8 rounded-xl px-3 text-xs"
                  >
                    {isOptimizingProductInfo ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        AI 优化中
                      </>
                    ) : (
                      <>
                        <Wand2 className="mr-1.5 h-3.5 w-3.5" />
                        AI 帮忙优化
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  value={productInfo}
                  onChange={(event) => setProductInfo(event.target.value)}
                  placeholder="填写产品介绍、核心卖点、材质、尺寸、适用人群和你希望画面保留的信息。也可以先上传商品图，再点右上角 AI 帮忙优化。"
                  className="min-h-28 rounded-2xl"
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  AI 会把商品信息整理成更适合详情页策划和画面内文案生成的结构化文本，你再微调即可。
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Images className="h-4.5 w-4.5" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm font-semibold text-foreground">人物出镜交给 AI 判断</div>
                    <p className="text-xs leading-5 text-muted-foreground">
                      这里不再手动上传模特图。系统会根据商品品类和每一屏的目标，自动判断是否需要真人模特、手部交互或纯商品展示。
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      例如服饰上身效果、手持产品演示、尺寸对比场景会更容易触发人物出镜；结构细节和参数屏则优先保持纯商品表达。
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-background p-4">
                <div className="mb-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Palette className="h-4 w-4 text-primary" />
                    风格参考
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    可选上传风格参考图，生成时只参考氛围、构图、光线和色调，不替换你的商品。
                  </p>
                </div>

                <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-border px-4 text-center transition-colors hover:border-primary/40 hover:bg-muted/40">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) =>
                      void handleSingleAsset(event.target.files, setStyleReferenceImage)
                    }
                  />
                  {styleReferenceImage ? (
                    <div className="relative w-full">
                      <img
                        src={styleReferenceImage}
                        alt="style-reference"
                        className="h-36 w-full rounded-xl object-cover"
                      />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          setStyleReferenceImage("");
                          resetPlan();
                        }}
                        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Images className="mb-2 h-5 w-5 text-primary" />
                      <div className="text-sm font-medium text-foreground">上传风格参考图</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        参考风格，不改商品本体
                      </div>
                    </>
                  )}
                </label>

                <Textarea
                  value={styleReferenceText}
                  onChange={(event) => setStyleReferenceText(event.target.value)}
                  placeholder="可再补充风格要求，例如：暖色高级感、极简留白、轻奢桌面、通透阳光感。"
                  className="mt-3 min-h-24 rounded-2xl"
                />
              </div>
            </div>
          </section>
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">策划参数</h2>
              <p className="text-xs text-muted-foreground">先生成 3 套整版方案，再选一套往下走</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <SelectField
                label="目标平台"
                value={targetPlatform}
                onChange={setTargetPlatform}
                options={platformOptions}
              />
              <SelectField
                label="策划语言"
                value={targetLanguage}
                onChange={setTargetLanguage}
                options={planningLanguageOptions}
              />
              <SelectField
                label="详情页屏数"
                value={screenCount}
                onChange={setScreenCount}
                options={screenCountOptions.map((count) => ({
                  value: String(count),
                  label: `${count} 屏`,
                }))}
              />
            </div>

            {error && (
              <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="button"
              onClick={handleGeneratePlan}
              disabled={isLoading}
              className="mt-5 h-12 w-full rounded-2xl text-sm font-semibold"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  AI 正在策划详情页
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  生成 3 套详情页方案
                </>
              )}
            </Button>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <button
              type="button"
              onClick={() => setShowScreenIdeas((current) => !current)}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div>
                <h2 className="text-base font-semibold text-foreground">分屏构思</h2>
                <p className="text-xs text-muted-foreground">
                  可选项。有明确想法时再展开填写，没有也可以直接继续。
                </p>
              </div>
              {showScreenIdeas ? (
                <ChevronUp className="mt-1 h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="mt-1 h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showScreenIdeas && (
              <div className="mt-4 space-y-4 border-t border-border pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    启用后，AI 会优先参考你对某几屏的指定构思。
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseScreenIdeas((current) => !current)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      useScreenIdeas
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {useScreenIdeas ? "已启用" : "点击启用"}
                  </button>
                </div>

                <div className="space-y-3">
                  {Array.from({ length: Number(screenCount) || 4 }, (_, index) => (
                    <div key={`screen-idea-${index}`} className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">第 {index + 1} 屏</label>
                      <input
                        type="text"
                        value={screenIdeas[index] || ""}
                        onChange={(event) => updateScreenIdea(index, event.target.value)}
                        disabled={!useScreenIdeas}
                        placeholder={
                          index === 0
                            ? "例如：首屏突出高级材质和主视觉氛围"
                            : index === 1
                              ? "例如：第二屏放大材质细节和工艺说明"
                              : "例如：补充这一屏希望呈现的重点"
                        }
                        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none transition focus:ring-2 focus:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {activePlan && (
            <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">逐屏生成设置</h2>
                  <p className="text-xs text-muted-foreground">
                    默认参数已经能直接生成，需要时再展开调整。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGenerationSettings((current) => !current)}
                  className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                >
                  {showGenerationSettings ? "收起高级项" : "展开高级项"}
                </button>
              </div>

              {showGenerationSettings && (
                <div className="grid gap-4 border-b border-border pb-4 md:grid-cols-2 xl:grid-cols-1">
                  <SelectField
                    label="生成模型"
                    value={selectedModel}
                    onChange={(value) => setSelectedModel(value as GenerationModel)}
                    options={modelOptions.map((option) => ({
                      value: option.value,
                      label: option.label,
                    }))}
                  />
                  <div className="-mt-2 text-xs text-muted-foreground">{currentModelHint}</div>
                  <SelectField
                    label="画面比例"
                    value={selectedRatio}
                    onChange={setSelectedRatio}
                    options={ratioOptions}
                  />
                  <SelectField
                    label="清晰度"
                    value={selectedResolution}
                    onChange={(value) => setSelectedResolution(value as OutputResolution)}
                    options={resolutionOptions}
                  />
                  <SelectField
                    label="文字语言"
                    value={generationLanguage}
                    onChange={setGenerationLanguage}
                    options={generationLanguageOptions}
                  />
                </div>
              )}

              <div className="mt-4 space-y-2 rounded-2xl border border-border bg-background p-4 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>人物策略</span>
                  <span className="font-medium text-foreground">
                    AI 自行判断
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>风格参考图</span>
                  <span className="font-medium text-foreground">
                    {styleReferenceImage ? "已上传" : "未上传"}
                  </span>
                </div>
                {styleReferenceText.trim() && (
                  <div className="rounded-xl bg-muted/60 px-3 py-2 leading-5 text-foreground">
                    风格补充：{styleReferenceText.trim()}
                  </div>
                )}
                <p>
                  当前流程会优先用商品图锁定产品本体，再用风格图控制氛围，并根据每屏方案自动决定是否加入人物表达。
                </p>
              </div>

              {generationError && (
                <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {generationError}
                </div>
              )}

              <div className="mt-5 grid gap-2">
                <Button
                  type="button"
                  onClick={handleGenerateAllScreens}
                  disabled={isGeneratingScreens}
                  className="h-12 w-full rounded-2xl text-sm font-semibold"
                >
                  {isGeneratingScreens ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      后台逐屏生成中
                    </>
                  ) : (
                    <>
                      <ImagePlus className="mr-2 h-4 w-4" />
                      生成当前方案 {activePlan.screens.length} 屏
                    </>
                  )}
                </Button>
                {isGeneratingScreens && detailJobId && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => cancelJob(detailJobId)}
                    className="h-11 w-full rounded-2xl text-sm font-semibold"
                  >
                    <StopCircle className="mr-2 h-4 w-4" />
                    取消后台任务
                  </Button>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-5">
          {!activePlan ? (
            <EmptyState />
          ) : (
            <>
              <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">AI 详情页方案</h2>
                    <p className="text-sm text-muted-foreground">
                      先从 3 套整体方向里选一套。选中的方案会直接作为下面逐屏生成的执行蓝本。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-3 py-1">
                      商品识别：{productSummary || "未返回"}
                    </span>
                    <span className="rounded-full bg-muted px-3 py-1">可见文字：{visibleText}</span>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-3">
                  {planOptions.map((option, index) => {
                    const active = index === selectedOptionIndex;
                    return (
                      <button
                        type="button"
                        key={`${option.planName}-${index}`}
                        onClick={() => setSelectedOptionIndex(index)}
                        className={`rounded-3xl border p-4 text-left transition-all ${
                          active
                            ? "border-primary bg-primary/5 shadow-md shadow-primary/5"
                            : "border-border bg-background hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
                        }`}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground">
                            {option.planName}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                              active
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {active ? "当前方案" : `方案 ${index + 1}`}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          <span className="rounded-full bg-muted px-2.5 py-1">调性：{option.tone}</span>
                          <span className="rounded-full bg-muted px-2.5 py-1">
                            {option.screens.length} 屏
                          </span>
                        </div>
                        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
                          {option.summary}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {option.designSpec.mainColors.slice(0, 3).map((color) => (
                            <span
                              key={`${option.planName}-${color}`}
                              className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-foreground"
                            >
                              {color}
                            </span>
                          ))}
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">目标人群：{option.audience}</span>
                          {active ? (
                            <span className="inline-flex items-center gap-1 font-medium text-primary">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              用于生成
                            </span>
                          ) : (
                            <span className="font-medium text-foreground">点击切换</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-xl font-semibold text-foreground">{activePlan.planName}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{activePlan.summary}</p>
                  </div>
                  <div className="grid gap-2 text-xs text-muted-foreground md:grid-cols-2 lg:min-w-[260px]">
                    <div className="rounded-2xl bg-muted px-3 py-2">
                      <span className="block text-[11px] uppercase tracking-wider">目标人群</span>
                      <span className="mt-1 block text-sm text-foreground">{activePlan.audience}</span>
                    </div>
                    <div className="rounded-2xl bg-muted px-3 py-2">
                      <span className="block text-[11px] uppercase tracking-wider">版式氛围</span>
                      <span className="mt-1 block text-sm text-foreground">
                        {activePlan.designSpec.layoutTone}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-muted/70 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">当前方案调性</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{activePlan.tone}</div>
                  </div>
                  <div className="rounded-2xl bg-muted/70 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">目标人群</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{activePlan.audience}</div>
                  </div>
                  <div className="rounded-2xl bg-muted/70 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground">执行屏数</div>
                    <div className="mt-1 text-sm font-medium text-foreground">{activePlan.screens.length} 屏</div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <div className="mb-3 flex items-center gap-2">
                      <Wand2 className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold text-foreground">整版设计规范</h4>
                    </div>
                    <dl className="space-y-3 text-sm">
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">主色</dt>
                        <dd className="mt-1 text-foreground">
                          {activePlan.designSpec.mainColors.join(" / ")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">辅助色</dt>
                        <dd className="mt-1 text-foreground">
                          {activePlan.designSpec.accentColors.join(" / ")}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">字体建议</dt>
                        <dd className="mt-1 text-foreground">{activePlan.designSpec.typography}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">画面风格</dt>
                        <dd className="mt-1 text-foreground">{activePlan.designSpec.imageStyle}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">文案规范</dt>
                        <dd className="mt-1 leading-6 text-foreground">
                          {activePlan.designSpec.languageGuidelines}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-2xl border border-border bg-background p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <FileImage className="h-4 w-4 text-primary" />
                      <h4 className="text-sm font-semibold text-foreground">分屏结构预览</h4>
                    </div>
                    <div className="space-y-3">
                      {activePlan.screens.map((screen) => (
                        <div
                          key={`${activePlan.planName}-${screen.screen}`}
                          className="rounded-2xl border border-border bg-card px-4 py-3 transition hover:border-primary/20"
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {screen.screen}
                            </span>
                            <span className="font-medium text-foreground">{screen.title}</span>
                          </div>
                          <p className="text-sm text-muted-foreground">{screen.goal}</p>
                          <p className="mt-2 text-sm leading-6 text-foreground">
                            视觉方向：{screen.visualDirection}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-foreground">
                            人物建议：
                            {screen.humanModelSuggested
                              ? ` 建议加入真人或手部出镜，${screen.humanModelReason || "更有利于表达使用场景。"}`
                              : ` 优先纯商品展示，${screen.humanModelReason || "避免人物抢走主体注意力。"}`
                            }
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                              {screen.humanModelSuggested ? "建议人物辅助" : "建议纯商品表达"}
                            </span>
                            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
                              标题：{screen.overlayTitle || screen.title}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {screen.copyPoints.map((point, index) => (
                              <span
                                key={`${screen.screen}-${index}`}
                                className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                              >
                                {point}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
              <section
                ref={resultsSectionRef}
                id="detail-results"
                className="rounded-3xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">逐屏生成结果</h3>
                    <p className="text-sm text-muted-foreground">
                      先看每屏结果，不满意就单独重生；全部满意后再预览或下载长图。
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                      已完成 {generatedScreens.filter((screen) => screen.status === "done").length}/
                      {generatedScreens.length}
                    </div>
                    {generatedScreens.some((screen) => screen.imageUrl) && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          disabled={isPreparingPreview}
                          onClick={() => void handlePreviewLongImage()}
                        >
                          <ZoomIn className="mr-1.5 h-4 w-4" />
                          预览长图
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => void handleDownloadLongImage()}
                        >
                          <Download className="mr-1.5 h-4 w-4" />
                          下载长图
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  {activePlan.screens.map((screen) => {
                    const generated = generatedScreens.find(
                      (item) => item.screen === screen.screen,
                    );

                    return (
                      <div
                        key={`generated-${screen.screen}`}
                        className="grid gap-4 rounded-2xl border border-border bg-background p-4 xl:grid-cols-[320px_minmax(0,1fr)]"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                              {screen.screen}
                            </span>
                            <div>
                              <h4 className="text-sm font-semibold text-foreground">{screen.title}</h4>
                              <p className="text-xs text-muted-foreground">{screen.goal}</p>
                            </div>
                          </div>

                          <div className="rounded-2xl bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">
                            <div>
                              <span className="font-semibold text-foreground">视觉方向：</span>
                              {screen.visualDirection}
                            </div>
                            <div className="mt-2">
                              <span className="font-semibold text-foreground">卖点关键词：</span>
                              {screen.copyPoints.join("、")}
                            </div>
                            <div className="mt-2">
                              <span className="font-semibold text-foreground">人物建议：</span>
                              {screen.humanModelSuggested
                                ? `建议加入人物辅助，${screen.humanModelReason || "帮助解释使用场景。"}`
                                : `建议纯商品表达，${screen.humanModelReason || "把注意力留给商品本体。"}`
                              }
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="rounded-xl"
                              disabled={generated?.status === "running" || isGeneratingScreens}
                              onClick={() => void handleRegenerateScreen(screen)}
                            >
                              {generated?.status === "running" ? (
                                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="mr-1.5 h-4 w-4" />
                              )}
                              {generated?.imageUrl ? "重生本屏" : "生成本屏"}
                            </Button>
                            {generated?.imageUrl && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="rounded-xl"
                                onClick={() => void handleOpenEditor(generated)}
                              >
                                <Edit3 className="mr-1.5 h-4 w-4" />
                                图片编辑
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="overflow-hidden rounded-2xl border border-border bg-card">
                            {generated?.status === "done" && generated.imageUrl ? (
                              <img
                                src={generated.imageUrl}
                                alt={`${screen.title} generated result`}
                                className="aspect-[3/4] w-full object-cover"
                              />
                            ) : generated?.status === "running" ? (
                              <div className="flex aspect-[3/4] items-center justify-center bg-muted/50">
                                <div className="text-center text-sm text-muted-foreground">
                                  <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-primary" />
                                  正在生成第 {screen.screen} 屏
                                </div>
                              </div>
                            ) : (
                              <div className="flex aspect-[3/4] items-center justify-center bg-muted/40 text-center text-sm text-muted-foreground">
                                <div>
                                  <ImagePlus className="mx-auto mb-3 h-7 w-7 text-primary/60" />
                                  还没有生成这屏内容
                                </div>
                              </div>
                            )}
                          </div>

                          {generated?.error && (
                            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                              {generated.error}
                            </div>
                          )}

                          {generated?.imageUrl && (
                            <>
                              <div className="rounded-2xl border border-border bg-muted/30 p-3">
                                <div className="mb-3">
                                  <div className="text-sm font-medium text-foreground">
                                    本屏直出文案
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    下面这些文案会直接按方案生成到图片里，字体会优先往思源黑体、阿里巴巴普惠体、HarmonyOS Sans SC 这类免费中文黑体风格靠。
                                  </div>
                                </div>
                                <div className="space-y-3">
                                  <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      主标题
                                    </div>
                                    <div className="mt-1 text-sm font-medium text-foreground">
                                      {screen.overlayTitle || screen.title}
                                    </div>
                                  </div>
                                  <div className="rounded-xl border border-border bg-background px-3 py-2.5">
                                    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      卖点短句
                                    </div>
                                    <div className="mt-2 grid gap-2">
                                      {(screen.overlayBodyLines?.length
                                        ? screen.overlayBodyLines
                                        : screen.copyPoints
                                      ).slice(0, 4).map((line, lineIndex) => (
                                        <div
                                          key={`${screen.screen}-copy-${lineIndex}`}
                                          className="rounded-lg bg-muted/50 px-2.5 py-2 text-sm text-foreground"
                                        >
                                          {line}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  <p className="text-xs leading-5 text-muted-foreground">
                                    如果当前语言不是纯图片模式，系统会优先把这些文字直接生成到画面里，而不是再做后贴。
                                  </p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="rounded-xl"
                                  disabled={isPreparingPreview}
                                  onClick={() => void handlePreviewScreen(generated)}
                                >
                                  {isPreparingPreview ? (
                                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                                  ) : (
                                    <ZoomIn className="mr-1.5 h-4 w-4" />
                                  )}
                                  预览成品
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="rounded-xl"
                                  onClick={() => void handleDownloadScreen(generated)}
                                >
                                  <Download className="mr-1.5 h-4 w-4" />
                                  下载成品
                                </Button>
                              </div>
                            </>
                          )}

                          {generated?.prompt && (
                            <details className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                              <summary className="cursor-pointer font-medium text-foreground">
                                查看本屏生成提示词
                              </summary>
                              <p className="mt-3 whitespace-pre-wrap leading-6">{generated.prompt}</p>
                            </details>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <Dialog
        open={!!previewImageUrl}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewImageUrl(null);
            setPreviewTitle("");
          }
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>{previewTitle || "成品预览"}</DialogTitle>
          </DialogHeader>
          {previewImageUrl && (
            <img
              src={previewImageUrl}
              alt={previewTitle || "成品预览"}
              className="max-h-[80vh] w-full rounded-2xl object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DetailDesignPage;
