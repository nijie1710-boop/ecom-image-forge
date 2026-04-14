import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, RefreshCw, Save, Settings2, Sparkles, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { callAdminApi, type AdminSettingsPayload } from "@/lib/admin-api";

const MODEL_OPTIONS = [
  { value: "gemini-2.5-flash-image", label: "Nano Banana" },
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2" },
  { value: "nano-banana-pro-preview", label: "Nano Banana Pro" },
];

const RATIO_OPTIONS = ["1:1", "3:4", "4:3", "16:9", "9:16"];
const RESOLUTION_OPTIONS = ["0.5k", "1k", "2k", "4k"];
const TRANSLATE_LANGUAGES = ["en", "zh", "ja", "ko", "fr", "de", "es", "it", "pt", "ru"];

const EMPTY_SETTINGS: AdminSettingsPayload = {
  generation_defaults: {
    model: "gemini-2.5-flash-image",
    aspectRatio: "3:4",
    resolution: "1k",
    imageCount: 1,
  },
  detail_defaults: {
    model: "gemini-3.1-flash-image-preview",
    aspectRatio: "3:4",
    resolution: "2k",
    screenCount: 4,
  },
  translation_defaults: {
    targetLanguage: "en",
    batchLimit: 8,
    renderMode: "stable",
  },
  feature_flags: {
    enableAdminRetry: true,
    enableDetailDesign: true,
    enableImageTranslation: true,
    enableNanoBananaPro: true,
  },
  operations: {
    lowBalanceThreshold: 3,
    imageRetentionDays: 30,
  },
  recharge_packages: [
    { id: "starter", label: "体验包", price: 19.9, credits: 200, badge: "适合试用", highlight: false },
    { id: "growth", label: "常用包", price: 49.9, credits: 520, badge: "推荐", highlight: true },
    { id: "pro", label: "进阶包", price: 99, credits: 1080, badge: "更省单价", highlight: false },
    { id: "business", label: "商用包", price: 199, credits: 2280, badge: "高频创作", highlight: false },
  ],
  credit_rules: {
    generation: { nanoBanana: 5, nanoBanana2: 7, nanoBananaPro: 12 },
    detail: {
      planning: 1,
      nanoBanana: 7,
      nanoBanana2_05k: 7,
      nanoBanana2_1k: 9,
      nanoBanana2_2k: 14,
      nanoBanana2_4k: 18,
      nanoBananaPro_1k: 14,
      nanoBananaPro_2k: 16,
      nanoBananaPro_4k: 30,
    },
    translation: { basic: 4, refined: 6 },
  },
};

function SectionCard({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-2 text-primary">{icon}</div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <Input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
    />
  );
}

function SettingField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

export default function AdminConfigPage() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AdminSettingsPayload>(EMPTY_SETTINGS);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => callAdminApi({ action: "get_settings" }),
  });

  useEffect(() => {
    if (!data?.settings) return;
    setSettings({
      generation_defaults: { ...EMPTY_SETTINGS.generation_defaults, ...(data.settings.generation_defaults || {}) },
      detail_defaults: { ...EMPTY_SETTINGS.detail_defaults, ...(data.settings.detail_defaults || {}) },
      translation_defaults: { ...EMPTY_SETTINGS.translation_defaults, ...(data.settings.translation_defaults || {}) },
      feature_flags: { ...EMPTY_SETTINGS.feature_flags, ...(data.settings.feature_flags || {}) },
      operations: { ...EMPTY_SETTINGS.operations, ...(data.settings.operations || {}) },
      recharge_packages:
        data.settings.recharge_packages?.length > 0 ? data.settings.recharge_packages : EMPTY_SETTINGS.recharge_packages,
      credit_rules: {
        generation: { ...EMPTY_SETTINGS.credit_rules.generation, ...(data.settings.credit_rules?.generation || {}) },
        detail: { ...EMPTY_SETTINGS.credit_rules.detail, ...(data.settings.credit_rules?.detail || {}) },
        translation: { ...EMPTY_SETTINGS.credit_rules.translation, ...(data.settings.credit_rules?.translation || {}) },
      },
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => callAdminApi({ action: "save_settings", settings }),
    onSuccess: () => {
      toast.success("系统配置已保存");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateSection = <K extends keyof AdminSettingsPayload>(section: K, patch: Partial<AdminSettingsPayload[K]>) => {
    setSettings((current) => ({
      ...current,
      [section]: {
        ...current[section],
        ...patch,
      },
    }));
  };

  const updatePackage = (index: number, patch: Partial<AdminSettingsPayload["recharge_packages"][number]>) => {
    setSettings((current) => ({
      ...current,
      recharge_packages: current.recharge_packages.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  };

  const updateCreditRule = (
    section: keyof AdminSettingsPayload["credit_rules"],
    key: string,
    value: number,
  ) => {
    setSettings((current) => ({
      ...current,
      credit_rules: {
        ...current.credit_rules,
        [section]: {
          ...current.credit_rules[section],
          [key]: value,
        },
      },
    }));
  };

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
        正在加载系统配置...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Settings2 className="h-3.5 w-3.5" />
              系统配置
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-foreground">默认值与收费规则</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              统一配置前台默认模型、积分套餐、扣费规则和主要功能开关。充值页与后台会直接读取这里的配置。
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => refetch()}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
            <Button size="sm" className="rounded-xl" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="mr-1.5 h-4 w-4" />
              {saveMutation.isPending ? "保存中..." : "保存配置"}
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="defaults" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-2xl bg-muted/60 p-1">
          <TabsTrigger value="defaults" className="rounded-xl py-2.5">
            默认配置
          </TabsTrigger>
          <TabsTrigger value="pricing" className="rounded-xl py-2.5">
            积分套餐
          </TabsTrigger>
          <TabsTrigger value="features" className="rounded-xl py-2.5">
            功能开关
          </TabsTrigger>
        </TabsList>

        <TabsContent value="defaults" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <SectionCard
              title="AI 主图默认值"
              description="控制普通生图页首次进入时的模型、比例、清晰度和张数。"
              icon={<Sparkles className="h-4 w-4" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <SettingField label="默认模型">
                  <Select
                    value={settings.generation_defaults.model}
                    onValueChange={(value) => updateSection("generation_defaults", { model: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingField>
                <SettingField label="默认比例">
                  <Select
                    value={settings.generation_defaults.aspectRatio}
                    onValueChange={(value) => updateSection("generation_defaults", { aspectRatio: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RATIO_OPTIONS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingField>
                <SettingField label="默认清晰度">
                  <Select
                    value={settings.generation_defaults.resolution}
                    onValueChange={(value) => updateSection("generation_defaults", { resolution: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTION_OPTIONS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingField>
                <SettingField label="默认张数" hint="建议保持 1 张控成本">
                  <NumberField
                    value={settings.generation_defaults.imageCount}
                    min={1}
                    max={9}
                    onChange={(value) => updateSection("generation_defaults", { imageCount: value || 1 })}
                  />
                </SettingField>
              </div>
            </SectionCard>

            <SectionCard
              title="AI 详情图默认值"
              description="控制策划页首次进入时的模型、比例、清晰度和默认屏数。"
              icon={<Sparkles className="h-4 w-4" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <SettingField label="默认模型">
                  <Select
                    value={settings.detail_defaults.model}
                    onValueChange={(value) => updateSection("detail_defaults", { model: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingField>
                <SettingField label="默认比例">
                  <Select
                    value={settings.detail_defaults.aspectRatio}
                    onValueChange={(value) => updateSection("detail_defaults", { aspectRatio: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RATIO_OPTIONS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingField>
                <SettingField label="默认清晰度">
                  <Select
                    value={settings.detail_defaults.resolution}
                    onValueChange={(value) => updateSection("detail_defaults", { resolution: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RESOLUTION_OPTIONS.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item.toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingField>
                <SettingField label="默认屏数">
                  <NumberField
                    value={settings.detail_defaults.screenCount}
                    min={1}
                    max={8}
                    onChange={(value) => updateSection("detail_defaults", { screenCount: value || 4 })}
                  />
                </SettingField>
              </div>
            </SectionCard>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <SectionCard
              title="图文翻译默认值"
              description="控制翻译页默认目标语言、批量上限和默认渲染模式。"
              icon={<Sparkles className="h-4 w-4" />}
            >
              <div className="grid gap-4 md:grid-cols-3">
                <SettingField label="目标语言">
                  <Select
                    value={settings.translation_defaults.targetLanguage}
                    onValueChange={(value) => updateSection("translation_defaults", { targetLanguage: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSLATE_LANGUAGES.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SettingField>
                <SettingField label="批量上限">
                  <NumberField
                    value={settings.translation_defaults.batchLimit}
                    min={1}
                    max={20}
                    onChange={(value) => updateSection("translation_defaults", { batchLimit: value || 8 })}
                  />
                </SettingField>
                <SettingField label="渲染模式">
                  <Select
                    value={settings.translation_defaults.renderMode}
                    onValueChange={(value) => updateSection("translation_defaults", { renderMode: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stable">稳定替换</SelectItem>
                      <SelectItem value="ai_refine">AI 精修替换</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingField>
              </div>
            </SectionCard>

            <SectionCard
              title="运营参数"
              description="用于低余额提醒、资源保留等日常运营管理。"
              icon={<Wallet className="h-4 w-4" />}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <SettingField label="低余额提醒阈值" hint="积分">
                  <NumberField
                    value={settings.operations.lowBalanceThreshold}
                    min={0}
                    max={999}
                    onChange={(value) => updateSection("operations", { lowBalanceThreshold: value })}
                  />
                </SettingField>
                <SettingField label="图片保留天数" hint="仅用于后台提醒">
                  <NumberField
                    value={settings.operations.imageRetentionDays}
                    min={1}
                    max={365}
                    onChange={(value) => updateSection("operations", { imageRetentionDays: value || 30 })}
                  />
                </SettingField>
              </div>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-6">
          <SectionCard
            title="充值套餐"
            description="前台充值页会读取这里的套餐，用户下单后直接按套餐积分入账。建议只做小幅优惠，不要过度送积分。"
            icon={<CreditCard className="h-4 w-4" />}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              {settings.recharge_packages.map((pkg, index) => (
                <div
                  key={pkg.id}
                  className={`rounded-2xl border p-4 ${pkg.highlight ? "border-primary/40 bg-primary/5" : "border-border bg-background"}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Input
                        value={pkg.label}
                        onChange={(event) => updatePackage(index, { label: event.target.value })}
                        className="h-9 border-none bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
                      />
                      <div className="text-xs text-muted-foreground">套餐 ID：{pkg.id}</div>
                    </div>
                    {pkg.badge ? <Badge variant="outline">{pkg.badge}</Badge> : null}
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <SettingField label="售价" hint="元">
                      <NumberField
                        value={pkg.price}
                        min={0}
                        step={0.1}
                        onChange={(value) => updatePackage(index, { price: value })}
                      />
                    </SettingField>
                    <SettingField label="到账积分" hint="积分">
                      <NumberField
                        value={pkg.credits}
                        min={0}
                        onChange={(value) => updatePackage(index, { credits: value })}
                      />
                    </SettingField>
                    <SettingField label="角标">
                      <Input
                        value={pkg.badge || ""}
                        placeholder="例如：推荐"
                        onChange={(event) => updatePackage(index, { badge: event.target.value })}
                      />
                    </SettingField>
                    <label className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                      <span>高亮推荐</span>
                      <Switch
                        checked={Boolean(pkg.highlight)}
                        onCheckedChange={(checked) => updatePackage(index, { highlight: checked })}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard
            title="扣费规则"
            description="建议按模型和屏数收费，先不要强依赖分辨率收费。这里的数值会给前台展示和后续扣费逻辑共用。"
            icon={<Wallet className="h-4 w-4" />}
          >
            <div className="grid gap-6 xl:grid-cols-3">
              <div className="rounded-2xl border border-border p-4">
                <h4 className="text-sm font-semibold text-foreground">AI 主图</h4>
                <div className="mt-4 space-y-4">
                  <SettingField label="Nano Banana">
                    <NumberField
                      value={settings.credit_rules.generation.nanoBanana}
                      min={0}
                      onChange={(value) => updateCreditRule("generation", "nanoBanana", value)}
                    />
                  </SettingField>
                  <SettingField label="Nano Banana 2">
                    <NumberField
                      value={settings.credit_rules.generation.nanoBanana2}
                      min={0}
                      onChange={(value) => updateCreditRule("generation", "nanoBanana2", value)}
                    />
                  </SettingField>
                  <SettingField label="Nano Banana Pro">
                    <NumberField
                      value={settings.credit_rules.generation.nanoBananaPro}
                      min={0}
                      onChange={(value) => updateCreditRule("generation", "nanoBananaPro", value)}
                    />
                  </SettingField>
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <h4 className="text-sm font-semibold text-foreground">AI 详情图</h4>
                <div className="mt-4 space-y-4">
                  <SettingField label="方案策划 / 次">
                    <NumberField
                      value={settings.credit_rules.detail.planning}
                      min={0}
                      onChange={(value) => updateCreditRule("detail", "planning", value)}
                    />
                  </SettingField>
                  <SettingField label="Nano Banana / 屏（所有分辨率）">
                    <NumberField
                      value={settings.credit_rules.detail.nanoBanana}
                      min={0}
                      onChange={(value) => updateCreditRule("detail", "nanoBanana", value)}
                    />
                  </SettingField>
                  <SettingField label="Nano Banana 2 · 0.5K / 屏">
                    <NumberField
                      value={settings.credit_rules.detail.nanoBanana2_05k}
                      min={0}
                      onChange={(value) => updateCreditRule("detail", "nanoBanana2_05k", value)}
                    />
                  </SettingField>
                  <SettingField label="Nano Banana 2 · 1K / 屏">
                    <NumberField
                      value={settings.credit_rules.detail.nanoBanana2_1k}
                      min={0}
                      onChange={(value) => updateCreditRule("detail", "nanoBanana2_1k", value)}
                    />
                  </SettingField>
                  <SettingField label="Nano Banana 2 · 2K / 屏">
                    <NumberField
                      value={settings.credit_rules.detail.nanoBanana2_2k}
                      min={0}
                      onChange={(value) => updateCreditRule("detail", "nanoBanana2_2k", value)}
                    />
                  </SettingField>
                  <SettingField label="Nano Banana 2 · 4K / 屏">
                    <NumberField
                      value={settings.credit_rules.detail.nanoBanana2_4k}
                      min={0}
                      onChange={(value) => updateCreditRule("detail", "nanoBanana2_4k", value)}
                    />
                  </SettingField>
                  <SettingField label="Nano Banana Pro · 1K / 屏">
                    <NumberField
                      value={settings.credit_rules.detail.nanoBananaPro_1k}
                      min={0}
                      onChange={(value) => updateCreditRule("detail", "nanoBananaPro_1k", value)}
                    />
                  </SettingField>
                  <SettingField label="Nano Banana Pro · 2K / 屏">
                    <NumberField
                      value={settings.credit_rules.detail.nanoBananaPro_2k}
                      min={0}
                      onChange={(value) => updateCreditRule("detail", "nanoBananaPro_2k", value)}
                    />
                  </SettingField>
                  <SettingField label="Nano Banana Pro · 4K / 屏">
                    <NumberField
                      value={settings.credit_rules.detail.nanoBananaPro_4k}
                      min={0}
                      onChange={(value) => updateCreditRule("detail", "nanoBananaPro_4k", value)}
                    />
                  </SettingField>
                </div>
              </div>

              <div className="rounded-2xl border border-border p-4">
                <h4 className="text-sm font-semibold text-foreground">图文翻译</h4>
                <div className="mt-4 space-y-4">
                  <SettingField label="基础翻译">
                    <NumberField
                      value={settings.credit_rules.translation.basic}
                      min={0}
                      onChange={(value) => updateCreditRule("translation", "basic", value)}
                    />
                  </SettingField>
                  <SettingField label="精修翻译">
                    <NumberField
                      value={settings.credit_rules.translation.refined}
                      min={0}
                      onChange={(value) => updateCreditRule("translation", "refined", value)}
                    />
                  </SettingField>
                </div>
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="features" className="space-y-6">
          <SectionCard
            title="功能开关"
            description="用于控制后台重试、高成本模型和主要能力的开放状态。"
            icon={<Settings2 className="h-4 w-4" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-foreground">后台重试</div>
                  <div className="mt-1 text-xs text-muted-foreground">允许后台对支持的任务执行重试。</div>
                </div>
                <Switch
                  checked={settings.feature_flags.enableAdminRetry}
                  onCheckedChange={(checked) => updateSection("feature_flags", { enableAdminRetry: checked })}
                />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-foreground">AI 详情图</div>
                  <div className="mt-1 text-xs text-muted-foreground">是否向普通用户开放 AI 详情图功能。</div>
                </div>
                <Switch
                  checked={settings.feature_flags.enableDetailDesign}
                  onCheckedChange={(checked) => updateSection("feature_flags", { enableDetailDesign: checked })}
                />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-foreground">图文翻译</div>
                  <div className="mt-1 text-xs text-muted-foreground">控制图文翻译页面是否对外开放。</div>
                </div>
                <Switch
                  checked={settings.feature_flags.enableImageTranslation}
                  onCheckedChange={(checked) => updateSection("feature_flags", { enableImageTranslation: checked })}
                />
              </label>
              <label className="flex items-center justify-between rounded-2xl border border-border px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-foreground">Nano Banana Pro</div>
                  <div className="mt-1 text-xs text-muted-foreground">高成本模型建议按需开放。</div>
                </div>
                <Switch
                  checked={settings.feature_flags.enableNanoBananaPro}
                  onCheckedChange={(checked) => updateSection("feature_flags", { enableNanoBananaPro: checked })}
                />
              </label>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
