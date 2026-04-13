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
import { useEffect, useRef } from "react";
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
import {
  WorkspaceEmptyState,
  WorkspaceSection,
} from "@/components/workspace/WorkspaceBlocks";

interface TranslationItem {
  original: string;
  translated: string;
  position: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  align?: "left" | "center" | "right";
  textColor?: string;
  backgroundColor?: string;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  bgOpacity?: number;
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
  renderMode?: "stable" | "ai";
  renderModel?: string;
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

const TRANSLATION_RENDER_MODES = [
  { value: "ai", label: "AI 精修替换" },
  { value: "stable", label: "稳定替换" },
] as const;

const AI_REPLACE_MODELS = [
  { value: "gemini-3.1-flash-image-preview", label: "Nano Banana 2" },
  { value: "gemini-3-pro-image-preview", label: "Nano Banana Pro" },
  { value: "gemini-2.5-flash-image", label: "Nano Banana" },
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

function clampPercent(value?: number, fallback = 0) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(100, Math.max(0, value));
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function hasRenderableBox(item: TranslationItem) {
  return (
    typeof item.x === "number" &&
    typeof item.y === "number" &&
    typeof item.width === "number" &&
    typeof item.height === "number"
  );
}

function inferBoxFromPosition(item: TranslationItem, index: number, total: number) {
  const pos = item.position.toLowerCase();
  const isTop = /(top|title|headline|header|上|标题|顶部)/.test(pos);
  const isBottom = /(bottom|footer|price|cta|下|底部|价格|按钮)/.test(pos);
  const isLeft = /(left|左)/.test(pos);
  const isRight = /(right|右)/.test(pos);
  const isCenter = /(center|middle|居中|中央)/.test(pos);

  const baseHeight = Math.max(8, 14 - total * 0.4);
  const fallbackY = 18 + index * (baseHeight + 2);

  return {
    x: isLeft ? 8 : isRight ? 58 : isCenter ? 20 : 14,
    y: isTop ? Math.min(38, fallbackY) : isBottom ? 78 + Math.min(index * 6, 12) : fallbackY,
    width: isLeft || isRight ? 34 : isCenter ? 60 : 72,
    height: isTop ? 10 : isBottom ? 9 : baseHeight,
    align: (isLeft ? "left" : isRight ? "right" : "center") as "left" | "center" | "right",
  };
}

function resolveTranslationBox(item: TranslationItem, index: number, total: number) {
  return hasRenderableBox(item) ? item : { ...item, ...inferBoxFromPosition(item, index, total) };
}

function parseColor(color?: string) {
  if (!color) return null;
  const normalized = color.trim().toLowerCase();
  if (!normalized || normalized === "transparent" || normalized === "none") return null;

  const hex = normalized.replace("#", "");
  if (/^[0-9a-f]{6}$/i.test(hex)) {
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgbaMatch = normalized.match(/rgba?\(([^)]+)\)/);
  if (rgbaMatch) {
    const [r = 255, g = 255, b = 255, a = 1] = rgbaMatch[1]
      .split(",")
      .map((part) => Number(part.trim()));
    return { r, g, b, a: Number.isFinite(a) ? a : 1 };
  }

  return null;
}

function rgbaString(color: { r: number; g: number; b: number; a?: number }) {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${color.a ?? 1})`;
}

function luminance(color: { r: number; g: number; b: number }) {
  return 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
}

function pickFontStack(language: string) {
  switch (language) {
    case "ja":
      return `"Noto Sans JP","Hiragino Sans","Yu Gothic","Microsoft YaHei",sans-serif`;
    case "ko":
      return `"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic","Microsoft YaHei",sans-serif`;
    case "zh":
    case "zh_tw":
      return `"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif`;
    default:
      return `"Inter","Noto Sans","Segoe UI","Arial",sans-serif`;
  }
}

function drawRoundedBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, safeRadius);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  ctx.lineTo(x + width, y + height - safeRadius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  ctx.lineTo(x + safeRadius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.quadraticCurveTo(x, y, x + safeRadius, y);
  ctx.closePath();
  ctx.fill();
}

function sampleRegionColor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(1, Math.floor(width));
  const sh = Math.max(1, Math.floor(height));

  try {
    const imageData = ctx.getImageData(sx, sy, sw, sh).data;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;

    for (let i = 0; i < imageData.length; i += 4) {
      const alpha = imageData[i + 3] / 255;
      if (alpha < 0.1) continue;
      r += imageData[i];
      g += imageData[i + 1];
      b += imageData[i + 2];
      count += 1;
    }

    if (!count) return { r: 255, g: 255, b: 255, a: 0.96 };
    return { r: r / count, g: g / count, b: b / count, a: 0.96 };
  } catch {
    return { r: 255, g: 255, b: 255, a: 0.96 };
  }
}

async function renderTranslatedImageLocally(
  imageUrl: string,
  translations: TranslationItem[],
  language: string,
) {
  const image = new Image();
  image.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("原图加载失败，无法本地生成翻译图"));
    image.src = imageUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器画布初始化失败，无法本地生成翻译图");

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const renderQueue = translations.map((item, index) =>
    resolveTranslationBox(item, index, translations.length),
  );

  for (const item of renderQueue) {
    const offsetXPct = clampNumber(item.offsetX ?? 0, -20, 20);
    const offsetYPct = clampNumber(item.offsetY ?? 0, -20, 20);
    const scale = clampNumber(item.scale ?? 1, 0.7, 1.8);
    const backgroundOpacity = clampNumber(item.bgOpacity ?? 0.96, 0.15, 1);

    const x = (clampPercent((item.x ?? 12) + offsetXPct, 12) / 100) * canvas.width;
    const y = (clampPercent((item.y ?? 12) + offsetYPct, 12) / 100) * canvas.height;
    const width = ((clampPercent(item.width, 24) * scale) / 100) * canvas.width;
    const height = ((clampPercent(item.height, 8) * scale) / 100) * canvas.height;
    const expandX = Math.max(6, width * 0.06);
    const expandY = Math.max(4, height * 0.18);
    const padding = Math.max(8, Math.round(Math.min(width, height) * 0.1));
    const boxX = Math.max(0, x - expandX / 2);
    const boxY = Math.max(0, y - expandY / 2);
    const boxW = Math.max(28, Math.min(canvas.width - boxX, width + expandX));
    const boxH = Math.max(20, Math.min(canvas.height - boxY, height + expandY));
    const sampledBackground = sampleRegionColor(ctx, boxX, boxY, boxW, boxH);
    const explicitBackground = parseColor(item.backgroundColor);
    const background = { ...(explicitBackground || sampledBackground), a: backgroundOpacity };
    const explicitText = parseColor(item.textColor);
    const foreground =
      explicitText ||
      (luminance(background) < 150
        ? { r: 255, g: 255, b: 255, a: 1 }
        : { r: 18, g: 18, b: 18, a: 1 });
    const radius = Math.max(8, Math.min(boxH / 2.4, 18));

    ctx.save();
    ctx.fillStyle = rgbaString(background);
    drawRoundedBox(ctx, boxX, boxY, boxW, boxH, radius);

    const maxFont = Math.max(14, Math.floor(boxH * 0.42));
    let fontSize = maxFont;
    const maxWidth = boxW - padding * 2;
    const lines = (size: number) => {
      ctx.font = `600 ${size}px ${pickFontStack(language)}`;
      const words = item.translated.split(/\s+/).filter(Boolean);
      if (words.length <= 1) {
        const chars = item.translated.split("");
        const rows: string[] = [];
        let current = "";
        for (const char of chars) {
          const candidate = current + char;
          if (ctx.measureText(candidate).width > maxWidth && current) {
            rows.push(current);
            current = char;
          } else {
            current = candidate;
          }
        }
        if (current) rows.push(current);
        return rows;
      }

      const rows: string[] = [];
      let current = "";
      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (ctx.measureText(candidate).width > maxWidth && current) {
          rows.push(current);
          current = word;
        } else {
          current = candidate;
        }
      }
      if (current) rows.push(current);
      return rows;
    };

    let wrapped = lines(fontSize);
    while (fontSize > 12 && wrapped.length * fontSize * 1.3 > boxH - padding * 2) {
      fontSize -= 1;
      wrapped = lines(fontSize);
    }

    ctx.font = `600 ${fontSize}px ${pickFontStack(language)}`;
    ctx.fillStyle = rgbaString(foreground);
    ctx.textBaseline = "middle";
    ctx.textAlign = item.align || "center";

    const lineHeight = fontSize * 1.28;
    const totalHeight = wrapped.length * lineHeight;
    let textY = boxY + boxH / 2 - totalHeight / 2 + lineHeight / 2;
    const textX =
      item.align === "left"
        ? boxX + padding
        : item.align === "right"
          ? boxX + boxW - padding
          : boxX + boxW / 2;

    for (const line of wrapped) {
      ctx.fillText(line, textX, textY, maxWidth);
      textY += lineHeight;
    }
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
}

async function renderTranslatedImageSimple(
  imageUrl: string,
  translations: TranslationItem[],
  language: string,
) {
  const image = new Image();
  image.decoding = "async";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("原图加载失败，无法生成翻译图"));
    image.src = imageUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || image.width;
  canvas.height = image.naturalHeight || image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器画布初始化失败，无法生成翻译图");

  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  translations
    .map((item, index) => resolveTranslationBox(item, index, translations.length))
    .forEach((item) => {
      const x = (clampPercent(item.x, 12) / 100) * canvas.width;
      const y = (clampPercent(item.y, 12) / 100) * canvas.height;
      const width = (clampPercent(item.width, 48) / 100) * canvas.width;
      const height = (clampPercent(item.height, 10) / 100) * canvas.height;
      const padding = Math.max(8, Math.round(height * 0.18));
      const foreground = parseColor(item.textColor) || { r: 18, g: 18, b: 18, a: 1 };
      const background = parseColor(item.backgroundColor) || { r: 255, g: 255, b: 255, a: 0.88 };

      ctx.save();
      ctx.fillStyle = rgbaString(background);
      ctx.fillRect(x, y, width, height);
      const fontSize = Math.max(12, Math.floor(height * 0.42));
      ctx.font = `600 ${fontSize}px ${pickFontStack(language)}`;
      ctx.fillStyle = rgbaString(foreground);
      ctx.textBaseline = "middle";
      ctx.textAlign = item.align || "center";
      const textX =
        item.align === "left"
          ? x + padding
          : item.align === "right"
            ? x + width - padding
            : x + width / 2;
      ctx.fillText(item.translated, textX, y + height / 2, width - padding * 2);
      ctx.restore();
    });

  return canvas.toDataURL("image/png");
}

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
    <div className="space-y-3 rounded-2xl border border-border p-3 sm:p-4">
      <div>
        <div className="font-medium text-foreground">{title}</div>
        <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>
      </div>
      {image ? (
        <div className="overflow-hidden rounded-2xl bg-muted/30">
          <img src={image} alt={title} className="max-h-[320px] w-full object-contain sm:max-h-[460px]" />
        </div>
      ) : (
        <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-4 text-center text-sm text-muted-foreground sm:min-h-[360px]">
          {placeholder}
        </div>
      )}
    </div>
  );
}

function ComparePreview({
  original,
  translated,
  ratio,
  onRatioChange,
  translations,
  activeIndex,
  onSelect,
  onAdjust,
}: {
  original: string;
  translated: string;
  ratio: number;
  onRatioChange: (value: number) => void;
  translations: TranslationItem[];
  activeIndex: number | null;
  onSelect: (index: number) => void;
  onAdjust: (index: number, patch: Partial<TranslationItem>) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    index: number;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const finishDrag = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, []);

  const handleStartDrag = useCallback(
    (index: number, event: React.PointerEvent<HTMLButtonElement>) => {
      const frame = frameRef.current;
      if (!frame) return;
      const rect = frame.getBoundingClientRect();
      dragRef.current = {
        index,
        startX: event.clientX,
        startY: event.clientY,
        startOffsetX: translations[index]?.offsetX ?? 0,
        startOffsetY: translations[index]?.offsetY ?? 0,
        width: rect.width,
        height: rect.height,
      };
      onSelect(index);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [onSelect, translations],
  );

  const handleDrag = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ((event.clientX - drag.startX) / Math.max(drag.width, 1)) * 100;
      const dy = ((event.clientY - drag.startY) / Math.max(drag.height, 1)) * 100;
      onAdjust(drag.index, {
        offsetX: clampNumber(drag.startOffsetX + dx, -20, 20),
        offsetY: clampNumber(drag.startOffsetY + dy, -20, 20),
      });
    },
    [onAdjust],
  );

  return (
    <div className="space-y-3 rounded-2xl border border-border p-3 sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-medium text-foreground">原图 / 结果对比</div>
          <div className="mt-1 text-sm text-muted-foreground">拖动滑块，快速查看当前替换效果是否自然。</div>
        </div>
        <Badge variant="secondary" className="w-fit">稳定替换</Badge>
      </div>
      <div className="overflow-hidden rounded-2xl bg-muted/30">
        <div ref={frameRef} className="relative mx-auto w-full max-w-[420px] sm:max-w-[520px]">
          <img src={original} alt="原图对比" className="block w-full object-contain" />
          <div className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${ratio}%` }}>
            <img src={translated} alt="翻译图对比" className="block w-full max-w-[420px] object-contain sm:max-w-[520px]" />
          </div>
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)]"
            style={{ left: `${ratio}%` }}
          />
          <div className="absolute inset-0">
            {translations.map((item, index) => {
              const base = resolveTranslationBox(item, index, translations.length);
              const scale = clampNumber(item.scale ?? 1, 0.7, 1.8);
              const width = clampNumber((base.width ?? 24) * scale, 8, 90);
              const height = clampNumber((base.height ?? 8) * scale, 4, 40);
              const left = clampNumber((base.x ?? 12) + (item.offsetX ?? 0), 0, 100 - width);
              const top = clampNumber((base.y ?? 12) + (item.offsetY ?? 0), 0, 100 - height);
              const isActive = activeIndex === index;

              return (
                <button
                  key={`translation-box-${index}`}
                  type="button"
                  onClick={() => onSelect(index)}
                  onPointerDown={(event) => handleStartDrag(index, event)}
                  onPointerMove={handleDrag}
                  onPointerUp={() => {
                    dragRef.current = null;
                  }}
                  className={`absolute rounded-xl border transition ${
                    isActive
                      ? "border-primary bg-primary/10 shadow-[0_0_0_2px_rgba(249,115,22,0.15)]"
                      : "border-white/70 bg-black/10 hover:border-primary/60"
                  }`}
                  style={{
                    left: `${left}%`,
                    top: `${top}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    touchAction: "none",
                  }}
                >
                  <span
                    className={`absolute -top-2 left-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      isActive ? "bg-primary text-primary-foreground" : "bg-background/95 text-foreground"
                    }`}
                  >
                    文本 {index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <div className="text-xs leading-5 text-muted-foreground">
        先点选需要调整的文字块，再直接拖动框体微调位置。更细的大小、透明度和对齐可以在下方逐条设置。
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={ratio}
        onChange={(event) => onRatioChange(Number(event.target.value))}
        className="w-full"
      />
    </div>
  );
}

export default function TranslateImagePage() {
  const [jobs, setJobs] = useState<TranslationJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [renderStrategy, setRenderStrategy] = useState<"ai" | "stable">("ai");
  const [replaceModel, setReplaceModel] = useState("gemini-3.1-flash-image-preview");
  const [compareRatio, setCompareRatio] = useState(50);
  const [selectedTranslationIndex, setSelectedTranslationIndex] = useState<number | null>(null);

  const activeJob = jobs.find((job) => job.id === activeJobId) || jobs[0] || null;
  const activeJobError = activeJob?.status === "error" ? activeJob.error : null;
  const activeJobHint = activeJob?.status === "error" ? activeJob.hint : null;
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

  useEffect(() => {
    if (!activeJob?.translations.length) {
      setSelectedTranslationIndex(null);
      return;
    }
    setSelectedTranslationIndex((current) =>
      current === null || current >= activeJob.translations.length ? 0 : current,
    );
  }, [activeJob]);

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

    try {
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
    } catch (error) {
      console.warn("save translation local history failed:", error);
    }

    try {
      upsertCuratedImage({
        image_url: permanentUrl,
        prompt: `图文翻译 · ${job.fileName}`,
        style: "翻译",
        scene: "translate",
        image_type: "图文翻译",
        aspect_ratio: "original",
        task_kind: "translate",
      });
    } catch (error) {
      console.warn("save curated translation image failed:", error);
    }

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
        let outputImage = "";
        let outputMode: "stable" | "ai" = "stable";
        let outputModel: string | undefined;

        if (renderStrategy === "ai") {
          try {
            const { data, error } = await supabase.functions.invoke("translate-image", {
              body: {
                imageUrl: job.originalImage,
                step: "replace",
                translations: job.translations,
                targetLanguage,
                preferredModel: replaceModel,
              },
            });
            if (error) throw new Error(await readInvokeError(error));
            if (!data?.imageUrl) throw new Error("AI 精修替换没有返回可用图片");
            outputImage = data.imageUrl;
            outputMode = "ai";
            outputModel = typeof data?.model === "string" ? data.model : replaceModel;
          } catch (replaceError) {
            console.warn("ai replace failed, fallback to stable renderer:", replaceError);
          }
        }

        if (!outputImage) {
          try {
            outputImage = await renderTranslatedImageLocally(
              job.originalImage,
              job.translations,
              targetLanguage,
            );
          } catch (advancedRenderError) {
            console.warn("advanced translation render failed, fallback to simple renderer:", advancedRenderError);
            outputImage = await renderTranslatedImageSimple(
              job.originalImage,
              job.translations,
              targetLanguage,
            );
          }
          outputMode = "stable";
        }

        updateJob(job.id, (current) => ({
          ...current,
          translatedImage: outputImage,
          status: "done",
          error: null,
          hint: null,
          renderMode: outputMode,
          renderModel: outputModel,
        }));

        void persistTranslatedImage(job, outputImage)
          .then((permanentUrl) => {
            updateJob(job.id, (current) =>
              current.status !== "done"
                ? current
                : {
                    ...current,
                    translatedImage: permanentUrl,
                  },
            );
          })
          .catch((persistError) => {
            console.warn("persist translated image failed, keep local preview:", persistError);
          });
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
    [persistTranslatedImage, replaceModel, renderStrategy, targetLanguage, updateJob],
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

  const updateTranslationItem = useCallback(
    <K extends keyof TranslationItem>(index: number, key: K, value: TranslationItem[K]) => {
      if (!activeJob) return;
      updateJob(activeJob.id, (current) => ({
        ...current,
        translations: current.translations.map((item, itemIndex) =>
          itemIndex === index ? { ...item, [key]: value } : item,
        ),
      }));
    },
    [activeJob, updateJob],
  );

  const resetTranslationAdjustments = useCallback(
    (index: number) => {
      if (!activeJob) return;
      updateJob(activeJob.id, (current) => ({
        ...current,
        translations: current.translations.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                align: "center",
                offsetX: 0,
                offsetY: 0,
                scale: 1,
                bgOpacity: 0.96,
              }
            : item,
        ),
      }));
      toast.success(`已恢复文本 ${index + 1} 的默认微调`);
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
    <div className="mx-auto max-w-[1480px] space-y-5 px-3 py-4 sm:px-4 sm:py-5 md:space-y-6 md:px-6 md:py-6">
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
        <Card className="overflow-hidden rounded-3xl border-border shadow-sm xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          <CardHeader className="space-y-4 p-4 sm:p-6">
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">生成模式</div>
                <Select value={renderStrategy} onValueChange={(value: "ai" | "stable") => setRenderStrategy(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择模式" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSLATION_RENDER_MODES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">精修模型</div>
                <Select value={replaceModel} onValueChange={setReplaceModel} disabled={renderStrategy !== "ai"}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择模型" />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_REPLACE_MODELS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-primary/30 bg-primary/5 px-4 py-5 text-center transition hover:border-primary/50 hover:bg-primary/10 sm:py-6">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Upload className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium text-foreground">添加翻译图片</div>
                <div className="text-xs text-muted-foreground">JPG、PNG、WEBP，单张不超过 10MB</div>
              </div>
              <input className="hidden" type="file" accept="image/*" multiple onChange={handleImageUpload} />
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button className="w-full sm:flex-1" onClick={() => void handleGenerateAll()} disabled={!jobs.length || isBatchRunning}>
                {isBatchRunning ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />批量处理中</> : <><Sparkles className="mr-2 h-4 w-4" />批量翻译全部</>}
              </Button>
              <Button className="w-full sm:w-auto" variant="outline" onClick={handleDownloadAll} disabled={!doneJobs.length}>
                <Download className="mr-2 h-4 w-4" />
                全部下载
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 p-4 pt-0 sm:p-6 sm:pt-0">
            {jobs.length ? jobs.map((job) => {
              const meta = STATUS_META[job.status];
              const active = activeJob?.id === job.id;
              return (
                <div key={job.id} className={`relative rounded-2xl border p-3 pr-11 transition sm:pr-12 ${active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/30 hover:bg-muted/30"}`}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-2 h-8 w-8 rounded-xl"
                    onClick={() => removeJob(job.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <button type="button" onClick={() => setActiveJobId(job.id)} className="flex w-full items-start gap-2.5 text-left sm:gap-3">
                    <img src={job.originalImage} alt={job.fileName} className="h-14 w-14 rounded-xl object-cover sm:h-16 sm:w-16" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{job.fileName}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${meta.className}`}>{meta.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {job.translations.length ? `${job.translations.length} 处文字` : "待识别"}
                        </span>
                        {job.status === "done" && (
                          <span className="text-xs text-emerald-700">
                            {job.renderMode === "ai" ? "AI 精修替换" : "稳定替换"}
                          </span>
                        )}
                      </div>
                      {job.status === "error" && job.error && (
                        <div className="mt-2 line-clamp-2 text-xs text-destructive">{job.error}</div>
                      )}
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
          <WorkspaceSection
                title={`当前任务：${activeJob.fileName}`}
                description={`当前目标语言是 ${targetLanguageLabel}。你可以先识别校对，也可以直接一键生成翻译图。`}
                actions={
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                    <Button className="w-full sm:w-auto" variant="outline" onClick={() => void handleRecognize()} disabled={activeJob.status === "ocring" || activeJob.status === "rendering"}>
                      {activeJob.status === "ocring" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Languages className="mr-2 h-4 w-4" />}
                      识别文字
                    </Button>
                    <Button className="w-full sm:w-auto" onClick={() => void handleGenerateActive()} disabled={activeJob.status === "ocring" || activeJob.status === "rendering"}>
                      {activeJob.status === "rendering" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                      一键生成翻译图
                    </Button>
                    <Button className="w-full sm:w-auto" variant="outline" onClick={() => handleDownload(activeJob)} disabled={!activeJob.translatedImage}>
                      <Download className="mr-2 h-4 w-4" />
                      下载
                    </Button>
                  </div>
                }
              >
                {activeJobError && (
                  <div className="mb-5 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm">
                    <div className="flex items-start gap-2 text-destructive">
                      <XCircle className="mt-0.5 h-4 w-4" />
                      <div>
                        <div className="font-medium">当前任务失败</div>
                        <div className="mt-1">{activeJobError}</div>
                        {activeJobHint && <div className="mt-2 text-destructive/80">{activeJobHint}</div>}
                      </div>
                    </div>
                  </div>
                )}
                {activeJob.status === "done" && (
                  <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    <div className="font-medium">当前任务已完成</div>
                    <div className="mt-1">
                      {activeJob.renderMode === "ai"
                        ? `当前结果使用 AI 精修替换生成${activeJob.renderModel ? `（${AI_REPLACE_MODELS.find((item) => item.value === activeJob.renderModel)?.label || activeJob.renderModel}）` : ""}，会优先保留原海报版式和视觉关系。`
                        : "当前结果使用稳定替换模式生成，优先保证版位正确和整体可用性。你可以通过下方对比快速检查哪里还需要继续优化。"}
                    </div>
                  </div>
                )}
                  <div className="grid gap-4 xl:grid-cols-2">
                    <PreviewPanel title="原图" subtitle="用于 OCR 识别和替换生成" image={activeJob.originalImage} />
                    <PreviewPanel
                      title="结果图"
                      subtitle={
                        activeJob.translatedImage
                          ? activeJob.renderMode === "ai"
                            ? "已自动加入图片库，当前为 AI 精修替换结果"
                            : "已自动加入图片库，当前为稳定替换结果"
                          : "生成后会自动存入图片库"
                      }
                      image={activeJob.translatedImage}
                      placeholder={activeJob.status === "rendering" ? "正在生成翻译图..." : "这里会显示翻译后的最终图片"}
                    />
                  </div>
                  {activeJob.translatedImage && (
                    <div className="mt-4">
                      <ComparePreview
                        original={activeJob.originalImage}
                        translated={activeJob.translatedImage}
                        ratio={compareRatio}
                        onRatioChange={setCompareRatio}
                        translations={activeJob.translations}
                        activeIndex={selectedTranslationIndex}
                        onSelect={setSelectedTranslationIndex}
                        onAdjust={(index, patch) => {
                          Object.entries(patch).forEach(([key, value]) => {
                            updateTranslationItem(index, key as keyof TranslationItem, value as any);
                          });
                        }}
                      />
                    </div>
                  )}
              </WorkspaceSection>

              <Card className="rounded-3xl border-border shadow-sm">
                <CardHeader className="space-y-3 p-4 sm:p-6">
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
                <CardContent className="space-y-4 p-4 pt-0 sm:p-6 sm:pt-0">
                  {activeJob.translations.length ? activeJob.translations.map((item, index) => (
                    <div
                      key={`${activeJob.id}-${index}`}
                      className={`space-y-3 rounded-2xl border p-3 transition sm:p-4 ${
                        selectedTranslationIndex === index
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border"
                      }`}
                      onClick={() => setSelectedTranslationIndex(index)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-foreground">文本 {index + 1}</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 rounded-xl px-3 text-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            resetTranslationAdjustments(index);
                          }}
                        >
                          恢复默认微调
                        </Button>
                      </div>
                      <div className="grid gap-3 md:grid-cols-[1.2fr_1.6fr_160px]">
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
                      <div className="grid gap-3 rounded-2xl bg-muted/30 p-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="space-y-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">对齐</div>
                          <Select
                            value={item.align || "center"}
                            onValueChange={(value: "left" | "center" | "right") =>
                              updateTranslationItem(index, "align", value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="对齐" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="left">左对齐</SelectItem>
                              <SelectItem value="center">居中</SelectItem>
                              <SelectItem value="right">右对齐</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">X 偏移</div>
                            <Input
                              type="number"
                              min={-20}
                              max={20}
                              step={1}
                              value={item.offsetX ?? 0}
                              onChange={(event) =>
                                updateTranslationItem(index, "offsetX", clampNumber(Number(event.target.value), -20, 20))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Y 偏移</div>
                            <Input
                              type="number"
                              min={-20}
                              max={20}
                              step={1}
                              value={item.offsetY ?? 0}
                              onChange={(event) =>
                                updateTranslationItem(index, "offsetY", clampNumber(Number(event.target.value), -20, 20))
                              }
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">缩放</div>
                            <Input
                              type="number"
                              min={0.7}
                              max={1.8}
                              step={0.1}
                              value={item.scale ?? 1}
                              onChange={(event) =>
                                updateTranslationItem(index, "scale", clampNumber(Number(event.target.value), 0.7, 1.8))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">底色透明</div>
                            <Input
                              type="number"
                              min={0.15}
                              max={1}
                              step={0.05}
                              value={item.bgOpacity ?? 0.96}
                              onChange={(event) =>
                                updateTranslationItem(index, "bgOpacity", clampNumber(Number(event.target.value), 0.15, 1))
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">微调说明</div>
                          <div className="rounded-xl bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                            先调 `缩放` 和 `底色透明`，再用 `X/Y 偏移` 贴近原版位。改完后重新点一次“一键生成翻译图”。
                          </div>
                        </div>
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
            <WorkspaceEmptyState
              icon={ImagePlus}
              title="先上传要翻译的图片"
              description="支持拖拽批量上传，上传后可以逐张识别和生成，也能整批翻译后直接进入图片库。"
              className="min-h-[320px] sm:min-h-[540px]"
            />
          )}
        </div>
        }
      />

      {!!doneJobs.length && (
        <Card className="rounded-3xl border-border shadow-sm">
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-base">已完成结果</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-6 sm:pt-0 xl:grid-cols-4">
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
