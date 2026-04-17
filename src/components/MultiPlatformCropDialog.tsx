import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";

// Platform crop presets with recommended pixel dimensions
const cropPresets = [
  { label: "淘宝/天猫", ratio: "1:1", width: 800, height: 800 },
  { label: "京东", ratio: "1:1", width: 800, height: 800 },
  { label: "拼多多", ratio: "1:1", width: 750, height: 750 },
  { label: "小红书", ratio: "3:4", width: 1080, height: 1440 },
  { label: "抖音电商", ratio: "9:16", width: 1080, height: 1920 },
  { label: "Amazon", ratio: "1:1", width: 1600, height: 1600 },
  { label: "Shopify", ratio: "1:1", width: 1024, height: 1024 },
  { label: "TikTok Shop", ratio: "9:16", width: 1080, height: 1920 },
  { label: "eBay", ratio: "1:1", width: 1600, height: 1600 },
  { label: "Shopee", ratio: "1:1", width: 800, height: 800 },
  { label: "Etsy", ratio: "4:3", width: 1200, height: 900 },
  { label: "Walmart", ratio: "1:1", width: 1600, height: 1600 },
];

// Deduplicate by ratio to avoid redundant crops in preview
function getUniqueRatios() {
  const seen = new Set<string>();
  return cropPresets.filter((p) => {
    if (seen.has(p.ratio)) return false;
    seen.add(p.ratio);
    return true;
  });
}

function centerCrop(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  const srcRatio = img.naturalWidth / img.naturalHeight;
  const tgtRatio = targetW / targetH;

  let sx: number, sy: number, sw: number, sh: number;

  if (srcRatio > tgtRatio) {
    // Source wider → crop sides
    sh = img.naturalHeight;
    sw = sh * tgtRatio;
    sx = (img.naturalWidth - sw) / 2;
    sy = 0;
  } else {
    // Source taller → crop top/bottom
    sw = img.naturalWidth;
    sh = sw / tgtRatio;
    sx = 0;
    sy = (img.naturalHeight - sh) / 2;
  }

  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

interface CropResult {
  label: string;
  ratio: string;
  width: number;
  height: number;
  dataUrl: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
}

export function MultiPlatformCropDialog({ open, onOpenChange, imageUrl }: Props) {
  const [crops, setCrops] = useState<CropResult[]>([]);
  const [loading, setLoading] = useState(false);

  const generateCrops = useCallback(() => {
    if (!imageUrl) return;
    setLoading(true);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const results: CropResult[] = cropPresets.map((preset) => ({
        label: preset.label,
        ratio: preset.ratio,
        width: preset.width,
        height: preset.height,
        dataUrl: centerCrop(img, preset.width, preset.height),
      }));
      setCrops(results);
      setLoading(false);
    };
    img.onerror = () => setLoading(false);
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (open && imageUrl) {
      setCrops([]);
      generateCrops();
    }
  }, [open, imageUrl, generateCrops]);

  const downloadSingle = (crop: CropResult) => {
    downloadDataUrl(crop.dataUrl, `picspark-${crop.label}-${crop.width}x${crop.height}.jpg`);
  };

  const downloadAll = () => {
    crops.forEach((crop, i) => {
      setTimeout(() => downloadSingle(crop), i * 200);
    });
  };

  // Group by ratio for display
  const uniqueRatios = getUniqueRatios();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>一键适配多平台尺寸</span>
            {crops.length > 0 && (
              <Button size="sm" variant="default" onClick={downloadAll} className="text-xs">
                <Download className="mr-1 h-3.5 w-3.5" />
                全部下载 ({crops.length} 张)
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">正在裁剪生成...</span>
          </div>
        ) : (
          <div className="space-y-6">
            {uniqueRatios.map((ur) => {
              const group = crops.filter((c) => c.ratio === ur.ratio);
              if (!group.length) return null;
              return (
                <div key={ur.ratio}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {ur.ratio}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {group.map((g) => g.label).join("、")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {group.map((crop) => (
                      <div
                        key={crop.label}
                        className="overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md"
                      >
                        <div className="relative bg-muted/30 p-2">
                          <img
                            src={crop.dataUrl}
                            alt={crop.label}
                            className="mx-auto max-h-40 w-auto rounded-lg object-contain"
                          />
                        </div>
                        <div className="flex items-center justify-between p-2.5">
                          <div>
                            <div className="text-xs font-semibold text-foreground">{crop.label}</div>
                            <div className="text-[10px] text-muted-foreground">
                              {crop.width}×{crop.height}
                            </div>
                          </div>
                          <button
                            onClick={() => downloadSingle(crop)}
                            className="rounded-lg border border-border p-1.5 text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
