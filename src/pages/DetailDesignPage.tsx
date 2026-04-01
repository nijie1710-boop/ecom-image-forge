
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  FileImage,
  ImagePlus,
  LayoutPanelTop,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  generateDetailPlan,
  type DetailPlanOption,
  type DetailPlanScreen,
} from "@/lib/detail-plan";
import {
  generateImage,
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

type ScreenStatus = "idle" | "running" | "done" | "error";

type GeneratedScreenState = {
  screen: number;
  title: string;
  status: ScreenStatus;
  prompt: string;
  imageUrl?: string;
  error?: string;
};

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

function buildScreenPrompt(args: {
  plan: DetailPlanOption;
  screen: DetailPlanScreen;
  productSummary: string;
  visibleText: string;
  productInfo: string;
  targetPlatform: string;
  targetLanguage: string;
}): string {
  const { plan, screen, productSummary, visibleText, productInfo, targetPlatform, targetLanguage } =
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

生成要求：
1. 这是电商详情页分屏，不要回退成单纯主图白底棚拍。
2. 画面必须明显体现当前分屏的目标和视觉方向。
3. 如果需要出现说明性元素，优先用版式留白、局部结构和材质细节表达。
4. ${languageRule(targetLanguage)}
5. 保持商品真实、可售、适合电商详情页，不做无关艺术化改造。
`.trim();
}
const DetailDesignPage = () => {
  const [productImages, setProductImages] = useState<string[]>([]);
  const [productInfo, setProductInfo] = useState("");
  const [targetPlatform, setTargetPlatform] = useState(platformOptions[0]);
  const [targetLanguage, setTargetLanguage] = useState("zh");
  const [screenCount, setScreenCount] = useState("4");
  const [isLoading, setIsLoading] = useState(false);
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

  const activePlan = useMemo(
    () => planOptions[selectedOptionIndex] || null,
    [planOptions, selectedOptionIndex],
  );

  useEffect(() => {
    if (!activePlan) {
      setGeneratedScreens([]);
      return;
    }

    setGeneratedScreens(
      activePlan.screens.map((screen) => ({
        screen: screen.screen,
        title: screen.title,
        status: "idle",
        prompt: "",
      })),
    );
    setGenerationError(null);
  }, [activePlan]);

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

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;

    const imageFiles = Array.from(files)
      .filter((file) => file.type.match(/image\/(jpeg|png|webp)/))
      .slice(0, 5);

    if (!imageFiles.length) return;

    const compressed = await Promise.all(imageFiles.map((file) => compressImage(file)));
    setProductImages(compressed);
    resetPlan();
  };

  const removeImage = (index: number) => {
    setProductImages((current) => current.filter((_, currentIndex) => currentIndex !== index));
    resetPlan();
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
        productInfo,
        targetPlatform,
        targetLanguage,
        screenCount: Number(screenCount),
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

  const updateGeneratedScreen = (
    screenNumber: number,
    updater: (current: GeneratedScreenState) => GeneratedScreenState,
  ) => {
    setGeneratedScreens((current) =>
      current.map((item) => (item.screen === screenNumber ? updater(item) : item)),
    );
  };

  const generateOneScreen = async (screen: DetailPlanScreen) => {
    if (!activePlan || !productImages.length) return;

    const prompt = buildScreenPrompt({
      plan: activePlan,
      screen,
      productSummary,
      visibleText,
      productInfo,
      targetPlatform,
      targetLanguage: generationLanguage,
    });

    updateGeneratedScreen(screen.screen, (current) => ({
      ...current,
      status: "running",
      error: undefined,
      prompt,
    }));

    const result = await generateImage({
      prompt,
      aspectRatio: selectedRatio,
      n: 1,
      imageBase64: productImages[0],
      imageType: "详情图",
      textLanguage: generationLanguage,
      model: selectedModel,
      resolution: selectedResolution,
    });

    if (!result.images.length) {
      updateGeneratedScreen(screen.screen, (current) => ({
        ...current,
        status: "error",
        error: result.error || "本屏生成失败",
      }));
      return;
    }

    updateGeneratedScreen(screen.screen, (current) => ({
      ...current,
      status: "done",
      imageUrl: result.images[0],
      error: undefined,
    }));
  };

  const handleGenerateAllScreens = async () => {
    if (!activePlan || !productImages.length) {
      setGenerationError("请先完成方案策划并保留至少 1 张商品图");
      return;
    }

    setIsGeneratingScreens(true);
    setGenerationError(null);

    for (const screen of activePlan.screens) {
      await generateOneScreen(screen);
    }

    setIsGeneratingScreens(false);
  };

  const handleRegenerateScreen = async (screen: DetailPlanScreen) => {
    setGenerationError(null);
    await generateOneScreen(screen);
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
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          这一版已经把详情页规划器跑通，并接入了逐屏生成。你可以先选一套整版方案，再按每一屏的目标生成对应视觉。
        </p>
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
              </div>
            )}
          </section>
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">策划参数</h2>
              <p className="text-xs text-muted-foreground">先让 AI 规划详情页结构和整版风格</p>
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

            <div className="mt-4 space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                补充卖点 / 风格要求
              </label>
              <Textarea
                value={productInfo}
                onChange={(event) => setProductInfo(event.target.value)}
                placeholder="例如：想突出材质质感、防摔保护、镜头位保护和送礼感；整体页面偏轻奢、干净、带一点生活方式感。"
                className="min-h-32 rounded-2xl"
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

          {activePlan && (
            <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">逐屏生成设置</h2>
                <p className="text-xs text-muted-foreground">
                  这一步会按当前选中的整版方案，逐屏生成详情页视觉。
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
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

              {generationError && (
                <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {generationError}
                </div>
              )}

              <Button
                type="button"
                onClick={handleGenerateAllScreens}
                disabled={isGeneratingScreens}
                className="mt-5 h-12 w-full rounded-2xl text-sm font-semibold"
              >
                {isGeneratingScreens ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在逐屏生成
                  </>
                ) : (
                  <>
                    <ImagePlus className="mr-2 h-4 w-4" />
                    生成当前方案 {activePlan.screens.length} 屏
                  </>
                )}
              </Button>
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
                      先从 3 套整体方向里选一套，再进入下方逐屏生成。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-3 py-1">
                      商品识别：{productSummary || "未返回"}
                    </span>
                    <span className="rounded-full bg-muted px-3 py-1">可见文字：{visibleText}</span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  {planOptions.map((option, index) => {
                    const active = index === selectedOptionIndex;
                    return (
                      <button
                        type="button"
                        key={`${option.planName}-${index}`}
                        onClick={() => setSelectedOptionIndex(index)}
                        className={`rounded-2xl border p-4 text-left transition-all ${
                          active
                            ? "border-primary bg-primary/5 shadow-sm"
                            : "border-border bg-background hover:border-primary/30"
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold text-foreground">
                            {option.planName}
                          </span>
                          {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground">风格调性：{option.tone}</p>
                        <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                          {option.summary}
                        </p>
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
                          className="rounded-2xl border border-border bg-card px-4 py-3"
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
              <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">逐屏生成结果</h3>
                    <p className="text-sm text-muted-foreground">
                      先按当前方案逐屏生成，后面我再继续补单屏重排、长图拼接和导出。
                    </p>
                  </div>
                  <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    已完成 {generatedScreens.filter((screen) => screen.status === "done").length}/
                    {generatedScreens.length}
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
    </div>
  );
};

export default DetailDesignPage;
