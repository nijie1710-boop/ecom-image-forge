import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Redo,
  SlidersHorizontal,
  Type,
  Undo,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
}

const DEFAULT_FONT =
  '"Microsoft YaHei","PingFang SC","Noto Sans SC","Helvetica Neue",Arial,sans-serif';

const EditPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryUrl = searchParams.get("url");
  const storedUrl =
    typeof window !== "undefined" ? sessionStorage.getItem("detail-design-edit-image") : null;
  const imageUrl = queryUrl || storedUrl;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const selectedText = useMemo(
    () => textOverlays.find((overlay) => overlay.id === selectedTextId) || null,
    [selectedTextId, textOverlays],
  );

  useEffect(() => {
    if (!imageUrl) {
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
      setHistory([imageUrl]);
      setHistoryIndex(0);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (!image) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }

    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    ctx.filter = "none";

    textOverlays.forEach((overlay) => {
      ctx.font = `${overlay.fontSize}px ${overlay.fontFamily}`;
      ctx.fillStyle = overlay.color;
      ctx.textBaseline = "top";

      const lines = overlay.text.split("\n");
      lines.forEach((line, index) => {
        ctx.fillText(line, overlay.x, overlay.y + index * overlay.fontSize * 1.3);
      });
    });
  }, [image, brightness, contrast, saturation, textOverlays]);

  const pushHistorySnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const snapshot = canvas.toDataURL("image/png");
    setHistory((current) => {
      const next = current.slice(0, historyIndex + 1);
      next.push(snapshot);
      setHistoryIndex(next.length - 1);
      return next;
    });
  };

  const applyHistoryImage = (url: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setImage(img);
      setTextOverlays([]);
      setSelectedTextId(null);
    };
    img.src = url;
  };

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    applyHistoryImage(history[nextIndex]);
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    applyHistoryImage(history[nextIndex]);
  };

  const addText = () => {
    const overlay: TextOverlay = {
      id: Date.now().toString(),
      text: "双击修改文字",
      x: 60,
      y: 60,
      fontSize: 48,
      color: "#ffffff",
      fontFamily: DEFAULT_FONT,
    };
    setTextOverlays((current) => [...current, overlay]);
    setSelectedTextId(overlay.id);
  };

  const updateText = (id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays((current) =>
      current.map((overlay) => (overlay.id === id ? { ...overlay, ...updates } : overlay)),
    );
  };

  const deleteText = (id: string) => {
    setTextOverlays((current) => current.filter((overlay) => overlay.id !== id));
    setSelectedTextId(null);
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `edited-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const handleSaveCurrent = () => {
    pushHistorySnapshot();
  };

  if (!imageUrl) {
    return (
      <div className="flex h-full min-h-[60vh] items-center justify-center p-6">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">没有可编辑的图片</p>
          <Button onClick={() => navigate("/dashboard/detail-design")} className="mt-4">
            返回 AI 详情图
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background">
      <div className="flex items-center justify-between border-b bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            返回
          </Button>
          <h1 className="text-base font-semibold text-foreground">图片编辑</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleUndo} disabled={historyIndex <= 0}>
            <Undo className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRedo}
            disabled={historyIndex < 0 || historyIndex >= history.length - 1}
          >
            <Redo className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={handleSaveCurrent}>
            保存当前
          </Button>
          <Button variant="hero" onClick={downloadImage}>
            <Download className="mr-1.5 h-4 w-4" />
            下载
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-20 border-r bg-card p-3">
          <div className="space-y-3">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-2xl"
              onClick={addText}
              title="添加文字"
            >
              <Type className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/40 p-4">
          <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <canvas
              ref={canvasRef}
              className="max-h-[72vh] max-w-full rounded-xl object-contain"
            />
          </div>
        </div>

        <div className="w-[320px] space-y-6 overflow-y-auto border-l bg-card p-4">
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
              <SlidersHorizontal className="h-4 w-4" />
              基础调整
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">亮度</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={brightness}
                  onChange={(event) => setBrightness(Number(event.target.value))}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">对比度</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={contrast}
                  onChange={(event) => setContrast(Number(event.target.value))}
                  className="mt-1 w-full"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">饱和度</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={saturation}
                  onChange={(event) => setSaturation(Number(event.target.value))}
                  className="mt-1 w-full"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBrightness(100);
                  setContrast(100);
                  setSaturation(100);
                }}
              >
                重置基础调整
              </Button>
            </div>
          </div>

          {selectedText ? (
            <div>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Type className="h-4 w-4" />
                文字编辑
              </h2>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">文字内容</label>
                  <textarea
                    rows={4}
                    value={selectedText.text}
                    onChange={(event) =>
                      updateText(selectedText.id, { text: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">文字大小</label>
                  <input
                    type="range"
                    min="16"
                    max="120"
                    value={selectedText.fontSize}
                    onChange={(event) =>
                      updateText(selectedText.id, { fontSize: Number(event.target.value) })
                    }
                    className="mt-1 w-full"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">字体颜色</label>
                  <input
                    type="color"
                    value={selectedText.color}
                    onChange={(event) =>
                      updateText(selectedText.id, { color: event.target.value })
                    }
                    className="mt-1 h-10 w-full rounded-lg border border-border bg-background"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={selectedText.x}
                    onChange={(event) =>
                      updateText(selectedText.id, { x: Number(event.target.value) })
                    }
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                    placeholder="X"
                  />
                  <input
                    type="number"
                    value={selectedText.y}
                    onChange={(event) =>
                      updateText(selectedText.id, { y: Number(event.target.value) })
                    }
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                    placeholder="Y"
                  />
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={() => deleteText(selectedText.id)}
                >
                  删除这段文字
                </Button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              先点左侧 `T` 按钮添加文字，或在已有文字上继续编辑。
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditPage;
