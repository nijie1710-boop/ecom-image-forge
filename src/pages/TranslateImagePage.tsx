import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Upload, Languages, Download, Loader2, Pencil, Check, X, ArrowRight, RefreshCw, Star, MessageSquare, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TranslationItem {
  original: string;
  translated: string;
  position: string;
}

type Step = "upload" | "ocr" | "edit" | "generating" | "done";

export default function TranslateImagePage() {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("upload");
  const [originalImage, setOriginalImage] = useState<string>("");
  const [translatedImage, setTranslatedImage] = useState<string>("");
  const [translations, setTranslations] = useState<TranslationItem[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [rating, setRating] = useState<number>(0);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const [regenerateHint, setRegenerateHint] = useState("");

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("图片大小不能超过10MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setOriginalImage(reader.result as string);
      setTranslatedImage("");
      setTranslations([]);
      setStep("upload");
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setOriginalImage(reader.result as string);
      setTranslatedImage("");
      setTranslations([]);
      setStep("upload");
    };
    reader.readAsDataURL(file);
  }, []);

  const startOCR = async () => {
    if (!originalImage) return;
    setIsLoading(true);
    setStep("ocr");
    try {
      const { data, error } = await supabase.functions.invoke("translate-image", {
        body: { imageUrl: originalImage, step: "ocr" },
      });
      if (error) throw error;
      if (!data.translations || data.translations.length === 0) {
        toast.error("未检测到中文文字");
        setStep("upload");
        return;
      }
      setTranslations(data.translations);
      setStep("edit");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "文字识别失败");
      setStep("upload");
    } finally {
      setIsLoading(false);
    }
  };

  const generateTranslated = async () => {
    setIsLoading(true);
    setStep("generating");
    try {
      const { data, error } = await supabase.functions.invoke("translate-image", {
        body: { imageUrl: originalImage, step: "replace", translations },
      });
      if (error) throw error;
      if (!data.imageUrl) throw new Error("未生成图片");
      setTranslatedImage(data.imageUrl);
      setStep("done");
      toast.success("翻译图片生成成功！");

      // 保存到历史记录
      try {
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;

        // 上传到 Storage 获取永久 URL
        let permanentUrl = data.imageUrl;
        if (!data.imageUrl.startsWith("data:") && !data.imageUrl.includes("storage")) {
          try {
            const response = await fetch(data.imageUrl);
            const blob = await response.blob();
            const fileName = `translated/${crypto.randomUUID()}.png`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from("generated-images")
              .upload(fileName, blob, { upsert: true });
            if (!uploadError && uploadData) {
              const { data: urlData } = supabase.storage.from("generated-images").getPublicUrl(fileName);
              permanentUrl = urlData.publicUrl;
            }
          } catch (e) {
            console.warn("上传翻译图片到存储失败:", e);
          }
        }

        // 保存到本地历史记录
        const localHistory = JSON.parse(localStorage.getItem("local_image_history") || "[]");
        const newRecord = {
          id: crypto.randomUUID(),
          image_url: permanentUrl,
          prompt: "图片翻译",
          style: "翻译",
          scene: "translate",
          aspect_ratio: "original",
          created_at: new Date().toISOString(),
        };
        localStorage.setItem("local_image_history", JSON.stringify([newRecord, ...localHistory].slice(0, 100)));

        // 如果已登录，保存到云端历史记录
        if (userId) {
          try {
            await supabase.from("generated_images").insert({
              user_id: userId,
              image_url: permanentUrl,
              prompt: "图片翻译",
              style: "翻译",
              scene: "translate",
              aspect_ratio: "original",
            });
          } catch (e) {
            console.warn("保存到云端历史记录失败:", e);
          }
        }
      } catch (e) {
        console.warn("保存历史记录失败:", e);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "图片生成失败");
      setStep("edit");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = () => {
    if (!translatedImage) return;
    const a = document.createElement("a");
    a.href = translatedImage;
    a.download = `translated-${Date.now()}.png`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const startEdit = (idx: number) => {
    setEditingIdx(idx);
    setEditValue(translations[idx].translated);
  };

  const confirmEdit = () => {
    if (editingIdx === null) return;
    setTranslations((prev) =>
      prev.map((t, i) => (i === editingIdx ? { ...t, translated: editValue } : t))
    );
    setEditingIdx(null);
  };

  const resetAll = () => {
    setStep("upload");
    setOriginalImage("");
    setTranslatedImage("");
    setTranslations([]);
    setEditingIdx(null);
    setRating(0);
    setFeedback("");
    setShowFeedback(false);
    setRegenerateHint("");
  };

  return (
    <div className="space-y-6 pb-24 md:pb-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Languages className="h-6 w-6 text-primary" />
          中→英图片翻译
        </h1>
        <p className="text-muted-foreground mt-1">
          上传含有中文文字的图片，AI 自动识别、翻译并替换为英文
        </p>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center gap-2 text-sm">
        {[
          { key: "upload", label: "上传图片" },
          { key: "ocr", label: "文字识别" },
          { key: "edit", label: "编辑翻译" },
          { key: "done", label: "生成结果" },
        ].map((s, i, arr) => (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s.key || (s.key === "edit" && step === "generating")
                  ? "bg-primary text-primary-foreground"
                  : ["done"].includes(step) && i < arr.findIndex((x) => x.key === "done")
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </div>
            <span className="hidden sm:inline text-muted-foreground">{s.label}</span>
            {i < arr.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Upload Area */}
      {!originalImage && (
        <Card
          className="border-2 border-dashed border-border hover:border-primary/50 transition-colors cursor-pointer"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <CardContent className="flex flex-col items-center justify-center py-16">
            <label className="cursor-pointer flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-foreground">点击或拖拽上传图片</p>
                <p className="text-sm text-muted-foreground mt-1">支持 JPG、PNG，最大 10MB</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      {originalImage && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Original Image */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">原始图片</h3>
                <Button variant="ghost" size="sm" onClick={resetAll}>
                  <RefreshCw className="h-4 w-4 mr-1" />
                  重新上传
                </Button>
              </div>
              <div className="rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center">
                <img
                  src={originalImage}
                  alt="Original"
                  className="max-w-full max-h-[500px] object-contain"
                />
              </div>
            </CardContent>
          </Card>

          {/* Translated Image or Action Area */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-foreground">
                  {step === "done" ? "翻译结果" : "操作"}
                </h3>
                {step === "done" && (
                  <Button size="sm" onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-1" />
                    下载
                  </Button>
                )}
              </div>

              {step === "done" && translatedImage ? (
                <div className="space-y-4">
                  <div className="rounded-lg overflow-hidden bg-muted/30 flex items-center justify-center">
                    <img
                      src={translatedImage}
                      alt="Translated"
                      className="max-w-full max-h-[400px] object-contain"
                    />
                  </div>

                  {/* Rating */}
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-foreground">翻译质量评分</p>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button
                          key={s}
                          onClick={() => { setRating(s); setShowFeedback(true); }}
                          className="p-0.5 transition-transform hover:scale-110"
                        >
                          <Star
                            className={`h-6 w-6 transition-colors ${
                              s <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
                            }`}
                          />
                        </button>
                      ))}
                      {rating > 0 && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {["", "很差", "较差", "一般", "不错", "完美"][rating]}
                        </span>
                      )}
                    </div>

                    {showFeedback && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                        <Textarea
                          placeholder="描述不满意的地方，例如：某处翻译不准确、字体太小..."
                          value={feedback}
                          onChange={(e) => setFeedback(e.target.value)}
                          className="min-h-[60px] text-sm"
                        />
                      </div>
                    )}
                  </div>

                  {/* Regenerate with hint */}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRegenerateHint(feedback || "");
                        setStep("edit");
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />
                      修改翻译重新生成
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRating(0);
                        setFeedback("");
                        setShowFeedback(false);
                        generateTranslated();
                      }}
                      disabled={isLoading}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                      重新生成
                    </Button>
                    <Button variant="outline" size="sm" onClick={resetAll}>
                      <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      翻译新图片
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-muted/20 border border-border flex flex-col items-center justify-center min-h-[300px] gap-4 p-6">
                  {(step === "ocr" || step === "generating") && isLoading ? (
                    <>
                      <Loader2 className="h-10 w-10 text-primary animate-spin" />
                      <p className="text-muted-foreground font-medium">
                        {step === "ocr" ? "正在识别中文文字..." : "正在生成翻译图片..."}
                      </p>
                    </>
                  ) : step === "upload" ? (
                    <>
                      <Languages className="h-10 w-10 text-muted-foreground/50" />
                      <p className="text-muted-foreground text-center">
                        点击下方按钮开始识别图片中的中文文字
                      </p>
                      <Button onClick={startOCR} size="lg">
                        <Languages className="h-4 w-4 mr-2" />
                        开始识别文字
                      </Button>
                    </>
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Translation Edit Table */}
      {step === "edit" && translations.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">
                检测到 {translations.length} 处中文文字
              </h3>
              <Button onClick={generateTranslated} disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                生成翻译图片
              </Button>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="text-left p-3 font-medium text-muted-foreground w-8">#</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">原文（中文）</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">译文（英文）</th>
                    <th className="text-left p-3 font-medium text-muted-foreground hidden sm:table-cell">位置</th>
                    <th className="p-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {translations.map((item, idx) => (
                    <tr key={idx} className="border-t border-border hover:bg-muted/20">
                      <td className="p-3 text-muted-foreground">{idx + 1}</td>
                      <td className="p-3 font-medium text-foreground">{item.original}</td>
                      <td className="p-3">
                        {editingIdx === idx ? (
                          <Input
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="h-8"
                            autoFocus
                          />
                        ) : (
                          <span className="text-foreground">{item.translated}</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell text-xs">
                        {item.position}
                      </td>
                      <td className="p-3">
                        {editingIdx === idx ? (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={confirmEdit}>
                              <Check className="h-3.5 w-3.5 text-green-500" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingIdx(null)}>
                              <X className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(idx)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* resetAll moved inline above */}
    </div>
  );
}
