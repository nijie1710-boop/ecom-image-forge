import { useState, useRef, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Download, Type, Crop, RotateCw, Sun, Contrast, Palette, Undo, Redo, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontFamily: string;
}

const EditPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const imageUrl = searchParams.get("url");
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
  const [selectedText, setSelectedText] = useState<string | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [cropMode, setCropMode] = useState(false);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // 加载图片
  useEffect(() => {
    if (imageUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        setImage(img);
        drawImage();
      };
      img.src = imageUrl;
    }
  }, [imageUrl]);

  // 绘制图片到 Canvas
  const drawImage = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !image) return;

    canvas.width = image.width;
    canvas.height = image.height;

    // 应用滤镜
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    ctx.drawImage(image, 0, 0);
    ctx.filter = "none";

    // 绘制文字
    textOverlays.forEach((overlay) => {
      ctx.font = `${overlay.fontSize}px ${overlay.fontFamily}`;
      ctx.fillStyle = overlay.color;
      ctx.fillText(overlay.text, overlay.x, overlay.y);
    });
  };

  // 保存到历史记录
  const saveToHistory = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(imageData);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // 撤销
  const undo = () => {
    if (historyIndex > 0) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.putImageData(history[historyIndex - 1], 0, 0);
      setHistoryIndex(historyIndex - 1);
    }
  };

  // 重做
  const redo = () => {
    if (historyIndex < history.length - 1) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.putImageData(history[historyIndex + 1], 0, 0);
      setHistoryIndex(historyIndex + 1);
    }
  };

  // 添加文字
  const addText = () => {
    const newText: TextOverlay = {
      id: Date.now().toString(),
      text: "双击编辑文字",
      x: 100,
      y: 100,
      fontSize: 48,
      color: "#ffffff",
      fontFamily: "Arial"
    };
    setTextOverlays([...textOverlays, newText]);
    setSelectedText(newText.id);
    saveToHistory();
  };

  // 更新文字
  const updateText = (id: string, updates: Partial<TextOverlay>) => {
    setTextOverlays(textOverlays.map(t => 
      t.id === id ? { ...t, ...updates } : t
    ));
    drawImage();
  };

  // 删除文字
  const deleteText = (id: string) => {
    setTextOverlays(textOverlays.filter(t => t.id !== id));
    setSelectedText(null);
    drawImage();
  };

  // 下载图片
  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement("a");
    link.download = `edited-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  if (!imageUrl) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">没有图片可编辑</p>
        <Button onClick={() => navigate("/dashboard/images")} className="mt-4">
          返回图片库
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            ← 返回
          </Button>
          <h1 className="font-display font-semibold">图片编辑</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={undo} disabled={historyIndex <= 0}>
            <Undo className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={redo} disabled={historyIndex >= history.length - 1}>
            <Redo className="h-4 w-4" />
          </Button>
          <Button variant="hero" onClick={downloadImage}>
            <Download className="h-4 w-4 mr-2" />
            下载
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧工具栏 */}
        <div className="w-16 border-r bg-card flex flex-col items-center py-4 gap-4">
          <Button
            variant={selectedText ? "default" : "ghost"}
            size="icon"
            onClick={addText}
            title="添加文字"
          >
            <Type className="h-5 w-5" />
          </Button>
          <Button
            variant={cropMode ? "default" : "ghost"}
            size="icon"
            onClick={() => setCropMode(!cropMode)}
            title="裁剪"
          >
            <Crop className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" title="旋转">
            <RotateCw className="h-5 w-5" />
          </Button>
        </div>

        {/* 中间画布 */}
        <div className="flex-1 overflow-auto p-4 bg-muted flex items-center justify-center">
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-full shadow-lg"
              style={{ maxHeight: "70vh" }}
            />
            {textOverlays.map((overlay) => (
              <div
                key={overlay.id}
                className={`absolute cursor-move ${selectedText === overlay.id ? "border-2 border-primary" : ""}`}
                style={{
                  left: overlay.x,
                  top: overlay.y,
                  fontSize: overlay.fontSize,
                  color: overlay.color,
                  fontFamily: overlay.fontFamily,
                }}
                onClick={() => setSelectedText(overlay.id)}
              >
                {overlay.text}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧属性面板 */}
        <div className="w-64 border-l bg-card p-4 overflow-y-auto">
          {/* 滤镜 */}
          <div className="mb-6">
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Sun className="h-4 w-4" />
              滤镜
            </h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-muted-foreground">亮度</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  onMouseUp={drawImage}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">对比度</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  onMouseUp={drawImage}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground">饱和度</label>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={saturation}
                  onChange={(e) => setSaturation(Number(e.target.value))}
                  onMouseUp={drawImage}
                  className="w-full"
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => {
                setBrightness(100);
                setContrast(100);
                setSaturation(100);
                drawImage();
              }}>
                重置滤镜
              </Button>
            </div>
          </div>

          {/* 文字属性 */}
          {selectedText && (
            <div className="mb-6">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Type className="h-4 w-4" />
                文字属性
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-muted-foreground">文字内容</label>
                  <input
                    type="text"
                    value={textOverlays.find(t => t.id === selectedText)?.text || ""}
                    onChange={(e) => updateText(selectedText, { text: e.target.value })}
                    className="w-full mt-1 px-2 py-1 border rounded"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">字体大小</label>
                  <input
                    type="range"
                    min="12"
                    max="120"
                    value={textOverlays.find(t => t.id === selectedText)?.fontSize || 48}
                    onChange={(e) => updateText(selectedText, { fontSize: Number(e.target.value) })}
                    onMouseUp={drawImage}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground">颜色</label>
                  <input
                    type="color"
                    value={textOverlays.find(t => t.id === selectedText)?.color || "#ffffff"}
                    onChange={(e) => updateText(selectedText, { color: e.target.value })}
                    className="w-full h-8 mt-1"
                  />
                </div>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={() => deleteText(selectedText)}
                  className="w-full"
                >
                  删除文字
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditPage;
