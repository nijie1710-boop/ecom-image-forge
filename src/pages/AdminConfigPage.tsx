import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Save, Settings2, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  generation_defaults: { model: "gemini-2.5-flash-image", aspectRatio: "3:4", resolution: "1k", imageCount: 1 },
  detail_defaults: { model: "gemini-3.1-flash-image-preview", aspectRatio: "3:4", resolution: "2k", screenCount: 4 },
  translation_defaults: { targetLanguage: "en", batchLimit: 8, renderMode: "stable" },
  feature_flags: {
    enableAdminRetry: true,
    enableDetailDesign: true,
    enableImageTranslation: true,
    enableNanoBananaPro: true,
  },
  operations: { lowBalanceThreshold: 3, imageRetentionDays: 30 },
};

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
    });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () => callAdminApi({ action: "save_settings", settings }),
    onSuccess: () => {
      toast.success("系统配置已保存");
      queryClient.invalidateQueries({ queryKey: ["admin-settings"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
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

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Settings2 className="h-3.5 w-3.5" />
              系统配置
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-foreground">系统配置第一页</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              先集中管理默认模型、默认规格、低余额阈值和主要功能开关。后面再继续拆价格规则、角色权限和更细的运营策略。
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

      {isLoading ? (
        <div className="rounded-3xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          正在加载系统配置...
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                AI 生图默认配置
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">默认模型</div>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={settings.generation_defaults.model}
                    onChange={(event) => updateSection("generation_defaults", { model: event.target.value })}
                  >
                    {MODEL_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">默认比例</div>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={settings.generation_defaults.aspectRatio}
                    onChange={(event) => updateSection("generation_defaults", { aspectRatio: event.target.value })}
                  >
                    {RATIO_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">默认清晰度</div>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={settings.generation_defaults.resolution}
                    onChange={(event) => updateSection("generation_defaults", { resolution: event.target.value })}
                  >
                    {RESOLUTION_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">默认张数</div>
                  <Input
                    type="number"
                    min={1}
                    max={9}
                    value={settings.generation_defaults.imageCount}
                    onChange={(event) => updateSection("generation_defaults", { imageCount: Number(event.target.value) || 1 })}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                AI 详情页默认配置
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">默认模型</div>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={settings.detail_defaults.model}
                    onChange={(event) => updateSection("detail_defaults", { model: event.target.value })}
                  >
                    {MODEL_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">默认比例</div>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={settings.detail_defaults.aspectRatio}
                    onChange={(event) => updateSection("detail_defaults", { aspectRatio: event.target.value })}
                  >
                    {RATIO_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">默认清晰度</div>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={settings.detail_defaults.resolution}
                    onChange={(event) => updateSection("detail_defaults", { resolution: event.target.value })}
                  >
                    {RESOLUTION_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">默认屏数</div>
                  <Input
                    type="number"
                    min={1}
                    max={8}
                    value={settings.detail_defaults.screenCount}
                    onChange={(event) => updateSection("detail_defaults", { screenCount: Number(event.target.value) || 4 })}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr_1fr_0.9fr]">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">图文翻译默认配置</div>
              <div className="mt-4 grid gap-4">
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">默认目标语言</div>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={settings.translation_defaults.targetLanguage}
                    onChange={(event) => updateSection("translation_defaults", { targetLanguage: event.target.value })}
                  >
                    {TRANSLATE_LANGUAGES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">批量上限</div>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={settings.translation_defaults.batchLimit}
                    onChange={(event) => updateSection("translation_defaults", { batchLimit: Number(event.target.value) || 8 })}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">默认渲染模式</div>
                  <select
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                    value={settings.translation_defaults.renderMode}
                    onChange={(event) => updateSection("translation_defaults", { renderMode: event.target.value })}
                  >
                    <option value="stable">稳定替换</option>
                    <option value="balanced">平衡模式</option>
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="text-sm font-semibold text-foreground">运营阈值</div>
              <div className="mt-4 grid gap-4">
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">低余额阈值</div>
                  <Input
                    type="number"
                    min={0}
                    max={999}
                    value={settings.operations.lowBalanceThreshold}
                    onChange={(event) => updateSection("operations", { lowBalanceThreshold: Number(event.target.value) || 0 })}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <div className="text-muted-foreground">图片保留天数</div>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={settings.operations.imageRetentionDays}
                    onChange={(event) => updateSection("operations", { imageRetentionDays: Number(event.target.value) || 30 })}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <ShieldAlert className="h-4 w-4 text-primary" />
                功能开关
              </div>
              <div className="mt-4 space-y-4">
                {[
                  { key: "enableAdminRetry", label: "开启后台重试" },
                  { key: "enableDetailDesign", label: "开启 AI 详情页" },
                  { key: "enableImageTranslation", label: "开启图文翻译" },
                  { key: "enableNanoBananaPro", label: "开放 Pro 模型" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between rounded-2xl border border-border bg-background px-4 py-3">
                    <div className="text-sm text-foreground">{item.label}</div>
                    <Switch
                      checked={settings.feature_flags[item.key as keyof AdminSettingsPayload["feature_flags"]]}
                      onCheckedChange={(checked) =>
                        updateSection("feature_flags", { [item.key]: checked } as Partial<AdminSettingsPayload["feature_flags"]>)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
