import { useMemo, useState } from "react";
import {
  CheckCircle2,
  FileImage,
  LayoutPanelTop,
  Loader2,
  Sparkles,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { generateDetailPlan, type DetailPlanOption } from "@/lib/detail-plan";

const platformOptions = ["淘宝/天猫", "京东", "拼多多", "小红书", "抖音", "亚马逊"];
const languageOptions = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
];
const screenCountOptions = [3, 4, 5, 6, 7, 8];

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
      className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/25"
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
    <h3 className="text-lg font-semibold text-foreground">先做一版详情页策划</h3>
    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
      上传商品图、补充卖点和目标平台后，AI 会先输出 3 套整版方案，包含配色、风格、文案方向和每一屏的结构建议。
    </p>
  </div>
);

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

  const activePlan = useMemo(
    () => planOptions[selectedOptionIndex] || null,
    [planOptions, selectedOptionIndex],
  );

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
      setError("请先上传至少 1 张产品图");
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

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <div className="mb-6 flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          <LayoutPanelTop className="h-3.5 w-3.5" />
          AI 详情页
        </div>
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">先策划，再逐屏生成</h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          这一版先做“整版规划器”。它会参考你的商品图和补充要求，先产出 3 套详情页方案，包含整版风格、配色、文案方向和每一屏的视觉建议。
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
                  <div key={`${image.slice(0, 40)}-${index}`} className="relative overflow-hidden rounded-2xl border border-border bg-background">
                    <img src={image} alt={`product-${index + 1}`} className="aspect-square w-full object-cover" />
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
              <p className="text-xs text-muted-foreground">先让 AI 做长图结构和风格规划</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <SelectField
                label="目标平台"
                value={targetPlatform}
                onChange={setTargetPlatform}
                options={platformOptions}
              />
              <SelectField
                label="目标语言"
                value={targetLanguage}
                onChange={setTargetLanguage}
                options={languageOptions}
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
                placeholder="例如：主推防摔与高级感，详情页想突出材质、手感、镜头位保护、送礼感；整体视觉偏轻奢干净。"
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
                      先从 3 套整体方向里选一套，再进入下一步逐屏生成。
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full bg-muted px-3 py-1">商品识别：{productSummary || "未返回"}</span>
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
                          <span className="text-sm font-semibold text-foreground">{option.planName}</span>
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
                      <span className="mt-1 block text-sm text-foreground">{activePlan.designSpec.layoutTone}</span>
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
                        <dd className="mt-1 text-foreground">{activePlan.designSpec.mainColors.join(" / ")}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-wider text-muted-foreground">辅助色</dt>
                        <dd className="mt-1 text-foreground">{activePlan.designSpec.accentColors.join(" / ")}</dd>
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
                        <dd className="mt-1 leading-6 text-foreground">{activePlan.designSpec.languageGuidelines}</dd>
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

                <div className="mt-5 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                  这一版先把“整版策划”跑通。下一步我会在这个模块里继续补“逐屏生成、单屏重生、长图拼接和导出”。
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
