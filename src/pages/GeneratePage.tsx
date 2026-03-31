import { useState, useCallback, useEffect, useContext } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Upload, X, Sparkles, Loader2, Copy, Check, Images, Download, Edit3, Eye, RefreshCw, Globe, ZoomIn } from "lucide-react";
import { type OverlayStyle } from "@/lib/image-text-overlay";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { GenerationContext } from "@/contexts/GenerationContext";

// Compact dropdown
const Sel = ({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) => (
  <div className="space-y-1">
    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full p-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 appearance-none cursor-pointer"
      style={{
        backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        backgroundSize: '14px',
        paddingRight: '32px'
      }}
    >
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  </div>
);

// Ratio options with platform labels
const ratioOptions = [
  { value: '1:1', label: '1:1 淘宝/天猫/京东' },
  { value: '3:4', label: '3:4 小红书' },
  { value: '9:16', label: '9:16 抖音/快手' },
  { value: '16:9', label: '16:9 横图/Banner' },
  { value: '4:5', label: '4:5 Instagram' },
  { value: '2:3', label: '2:3 竖版海报' },
];


const GeneratePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const generationCtx = useContext(GenerationContext);
  const startCopyGeneration = generationCtx?.startCopyGeneration;
  const startImageGeneration = generationCtx?.startImageGeneration;
  const activeJob = generationCtx?.activeJob ?? null;

  const imageTypes = ['主图', '详情图'];

  const languageOptions = [
    { value: 'zh', label: '🇨🇳 中文' },
    { value: 'en', label: '🇺🇸 English' },
    { value: 'ja', label: '🇯🇵 日本語' },
    { value: 'ko', label: '🇰🇷 한국어' },
    { value: 'de', label: '🇩🇪 Deutsch' },
    { value: 'fr', label: '🇫🇷 Français' },
    { value: 'es', label: '🇪🇸 Español' },
    { value: 'it', label: '🇮🇹 Italiano' },
    { value: 'pt', label: '🇵🇹 Português' },
    { value: 'ru', label: '🇷🇺 Русский' },
    { value: 'ar', label: '🇸🇦 العربية' },
    { value: 'th', label: '🇹🇭 ไทย' },
    { value: 'vi', label: '🇻🇳 Tiếng Việt' },
    { value: 'pure', label: '🚫 纯图片（无文字）' },
  ];

  const [searchParams] = useSearchParams();
  const templatePrompt = searchParams.get('prompt');
  const templateId = searchParams.get('template');

  // State
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [textPrompt, setTextPrompt] = useState("");
  const [imageType, setImageType] = useState(imageTypes[0]);
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [textLanguage, setTextLanguage] = useState('zh');

  // AI Scene Suggestion state
  const [sceneSuggestions, setSceneSuggestions] = useState<{ scene: string; description: string }[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null);
  const [lastParams, setLastParams] = useState<any>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // AI Copy state
  const [showCopy, setShowCopy] = useState(false);
  const [generatedCopy, setGeneratedCopy] = useState<any>(null);
  const [isGeneratingCopy, setIsGeneratingCopy] = useState(false);
  const [copyCopied, setCopyCopied] = useState(false);
  const [isGeneratingFromCopy, setIsGeneratingFromCopy] = useState(false);
  const [copyImageType, setCopyImageType] = useState<'main' | 'detail' | 'all'>('all');
  const [copyGenerateProgress, setCopyGenerateProgress] = useState<{ step: string; current: number; total: number } | null>(null);
  const [enableTextOverlay, setEnableTextOverlay] = useState(true);
  const [overlayTemplate, setOverlayTemplate] = useState<OverlayStyle>('selling-point');

  // Apply template
  useEffect(() => {
    if (templateId && !appliedTemplate) {
      setAppliedTemplate(templateId);
      if (templatePrompt) setTextPrompt(templatePrompt);
    }
  }, [templateId, templatePrompt]);

  // Sync from context
  useEffect(() => {
    if (!activeJob) return;
    if (activeJob.uploadedImages?.length > 0 && uploadedImages.length === 0) {
      setUploadedImages(activeJob.uploadedImages);
    }
    if (activeJob.kind === 'copy') {
      setCopyGenerateProgress({ step: activeJob.step, current: activeJob.current, total: activeJob.total });
      setIsGeneratingFromCopy(activeJob.status === 'running');
      if (activeJob.status === 'done' && activeJob.results.length > 0) {
        setResults(activeJob.results);
        setIsGeneratingFromCopy(false);
        setCopyGenerateProgress(null);
      }
      if (activeJob.status === 'error') {
        setIsGeneratingFromCopy(false);
        setCopyGenerateProgress(null);
        setErrorMessage(activeJob.error || '生成失败');
      }
      return;
    }
    if (activeJob.kind === 'image') {
      setProgress({ current: activeJob.current, total: activeJob.total });
      setIsGenerating(activeJob.status === 'running');
      if (activeJob.status === 'done' && activeJob.results.length > 0) {
        setResults(activeJob.results);
        setIsGenerating(false);
        setProgress(null);
      }
      if (activeJob.status === 'error') {
        setIsGenerating(false);
        setProgress(null);
        setErrorMessage(activeJob.error || '生成失败');
      }
    }
  }, [activeJob, uploadedImages.length]);

  // 图片压缩：超过 300KB 的图片压缩到 600px 宽度，质量 0.5
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // 如果文件小于 300KB，直接返回原文件
      if (file.size < 300 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
        return;
      }

      // 压缩大图
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;  // 更小
        const quality = 0.5;     // 更低质量

        let width = img.width;
        let height = img.height;
        if (width > MAX_WIDTH) {
          height = (height * MAX_WIDTH) / width;
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);

        // 输出为 JPEG（更小）
        const compressed = canvas.toDataURL('image/jpeg', quality);
        console.log(`Compressed: ${img.width}x${img.height} → ${width}x${height}, size: ${(file.size / 1024).toFixed(0)}KB → ${(compressed.length / 1024).toFixed(0)}KB`);
        resolve(compressed);
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleFile = async (file: File) => {
    if (!file.type.match(/image\/(jpeg|png|webp)/)) return;

    // 压缩图片（如果太大）
    const dataUrl = await compressImage(file);

    if (isBatchMode) {
      if (uploadedImages.length < 10) setUploadedImages(prev => [...prev, dataUrl]);
    } else {
      setUploadedImages([dataUrl]);
      // 触发 AI 场景推荐（单图模式）
      fetchSceneSuggestions(dataUrl);
    }
  };

  // AI 场景推荐
  const fetchSceneSuggestions = async (imageDataUrl: string) => {
    setIsLoadingSuggestions(true);
    setSuggestionError(null);
    setSceneSuggestions([]);
    try {
      // 直接传 base64 给函数（函数内部处理图片下载）
      const { data, error } = await supabase.functions.invoke('suggest-scenes', {
        body: { imageBase64: imageDataUrl, imageType },
      });
      if (error) { throw new Error(error.message || '场景推荐失败'); }
      if (data?.error) { throw new Error(data.error); }
      if (data?.suggestions && Array.isArray(data.suggestions)) {
        setSceneSuggestions(data.suggestions);
        console.log('AI 产品分析:', data.product_summary, '可见文字:', data.visible_text);
      } else {
        throw new Error('返回格式错误');
      }
    } catch (err: any) {
      setSuggestionError(err.message || '场景推荐失败，请稍后重试');
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  // 重新生成场景推荐
  const handleRefreshSuggestions = () => {
    if (uploadedImages.length > 0) {
      fetchSceneSuggestions(uploadedImages[0]);
    }
  };

  // 选择场景推荐
  const handleSelectScene = (scene: string) => {
    setTextPrompt(scene);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      if (isBatchMode) Array.from(files).slice(0, 10 - uploadedImages.length).forEach(f => handleFile(f));
      else handleFile(files[0]).catch(console.error);
    }
  }, [isBatchMode, uploadedImages.length]);

  const buildPrompt = () => {
    // 直接使用用户输入的场景描述 prompt
    return textPrompt.trim() || "";
  };

  const handleGenerate = () => {
    if (!startImageGeneration) {
      setErrorMessage('系统初始化中，请刷新页面后重试');
      return;
    }
    if (uploadedImages.length === 0 && !textPrompt.trim()) return;
    setIsGenerating(true);
    setResults([]);
    setErrorMessage(null);

    const finalPrompt = buildPrompt();
    const totalImages = isBatchMode ? Math.min(uploadedImages.length * 3, 9) : 3;

    const params = {
      prompt: finalPrompt,
      aspectRatio: selectedRatio,
      n: totalImages,
      imageBase64: uploadedImages.length > 0 ? uploadedImages[0] : undefined,
      imageType,
      textLanguage,
      userId: user?.id,
      onComplete: (images: string[]) => {
        setResults(images);
        setIsGenerating(false);
        setProgress(null);
      },
    };

    setLastParams(params);
    setProgress({ current: 1, total: totalImages });
    startImageGeneration(params);
  };

  const handleRegenerate = () => {
    if (!startImageGeneration) {
      setErrorMessage('系统初始化中，请刷新页面后重试');
      return;
    }
    if (!lastParams) return;
    setIsGenerating(true);
    setResults([]);
    setErrorMessage(null);
    setProgress({ current: 1, total: lastParams.n });
    startImageGeneration({
      ...lastParams,
      onComplete: (images: string[]) => {
        setResults(images);
        setIsGenerating(false);
        setProgress(null);
      },
    });
  };

  const handleGenerateCopy = async () => {
    if (uploadedImages.length === 0) return;
    setIsGeneratingCopy(true);
    setGeneratedCopy(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-copy', {
        body: { imageBase64: uploadedImages[0], platform: '淘宝/天猫', language: copyLanguage },
      });
      if (error) { setErrorMessage('文案生成失败: ' + (error.message || '未知错误')); return; }
      if (data?.error) { setErrorMessage('文案生成失败: ' + data.error); return; }
      setGeneratedCopy(data);
    } catch (err: any) {
      setErrorMessage('文案生成失败: ' + (err.message || '未知错误'));
    } finally {
      setIsGeneratingCopy(false);
    }
  };

  const handleGenerateFromCopy = () => {
    if (!startCopyGeneration) {
      setErrorMessage('系统初始化中，请刷新页面后重试');
      return;
    }
    if (!generatedCopy || uploadedImages.length === 0) return;
    setIsGeneratingFromCopy(true);
    setCopyGenerateProgress({ step: '准备生成', current: 0, total: 1 });
    startCopyGeneration({
      uploadedImages,
      generatedCopy,
      copyPlatform: '淘宝/天猫',
      copyImageType,
      enableTextOverlay,
      overlayTemplate,
      userId: user?.id,
      onComplete: (images) => {
        setResults(images);
        setIsGeneratingFromCopy(false);
        setCopyGenerateProgress(null);
      },
    });
  };

  const copyToClipboard = async () => {
    if (!generatedCopy) return;
    const text = `产品：${generatedCopy.productName}\n标题：${generatedCopy.title}\n卖点：\n${generatedCopy.sellingPoints?.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}`;
    try { await navigator.clipboard.writeText(text); } catch { /* fallback */ }
    setCopyCopied(true);
    setTimeout(() => setCopyCopied(false), 2000);
  };

  const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const downloadImage = (url: string, filename: string) => {
    if (!isMobile()) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            if (blob) {
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = filename;
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
              URL.revokeObjectURL(link.href);
            }
          }, 'image/jpeg');
        }
      };
      img.onerror = () => window.open(url, '_blank');
      img.src = url;
    } else {
      window.open(url, '_blank');
    }
  };

  const downloadAll = () => {
    results.forEach((src, i) => {
      setTimeout(() => downloadImage(src, `picspark-${Date.now()}-${i + 1}.jpg`), i * 300);
    });
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)]">
      {/* ===== LEFT PANEL ===== */}
      <div className="lg:w-[380px] lg:border-r border-border bg-card/50 flex-shrink-0 overflow-y-auto p-4 pb-24 lg:pb-6 space-y-3">
        <h2 className="font-bold text-foreground text-base">AI 电商图片生成</h2>

        {/* Product Upload */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">📦 产品图片</label>
            <button
              onClick={() => { setIsBatchMode(!isBatchMode); setUploadedImages([]); }}
              className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${isBatchMode ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground'}`}
            >
              <Images className="h-3 w-3 inline mr-0.5" />批量
            </button>
          </div>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            className={`border border-dashed rounded-lg p-2 text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
          >
            {uploadedImages.length > 0 ? (
              <div className="grid grid-cols-4 gap-1.5">
                {uploadedImages.map((img, idx) => (
                  <div key={idx} className="relative">
                    <img src={img} alt="" className="w-full rounded-md object-contain aspect-square" />
                    <button onClick={() => setUploadedImages(uploadedImages.filter((_, i) => i !== idx))} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
                {uploadedImages.length < (isBatchMode ? 10 : 1) && (
                  <label className="border border-dashed border-border rounded-md flex items-center justify-center aspect-square cursor-pointer hover:border-primary/40">
                    <Upload className="h-3.5 w-3.5 text-muted-foreground" />
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                  </label>
                )}
              </div>
            ) : (
              <label className="cursor-pointer block py-3">
                <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">拖拽或点击上传</p>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
            )}
          </div>
        </div>

        {/* Prompt & AI Scene Suggestions */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">✏️ 场景描述</label>
            {uploadedImages.length > 0 && !isBatchMode && (
              <button
                onClick={handleRefreshSuggestions}
                disabled={isLoadingSuggestions}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors flex items-center gap-0.5"
              >
                <RefreshCw className={`h-2.5 w-2.5 ${isLoadingSuggestions ? 'animate-spin' : ''}`} />
                换一批
              </button>
            )}
          </div>

          {/* AI Scene Suggestions */}
          {uploadedImages.length > 0 && !isBatchMode && (
            <div className="mb-2">
              {isLoadingSuggestions ? (
                <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  AI 正在识别产品并生成场景方案...
                </div>
              ) : suggestionError ? (
                <div className="flex items-center justify-between py-2 px-2 bg-destructive/10 rounded-lg text-xs">
                  <span className="text-destructive">❌ {suggestionError}</span>
                  <button onClick={handleRefreshSuggestions} className="text-primary hover:underline">重试</button>
                </div>
              ) : sceneSuggestions.length > 0 ? (
                <div className="space-y-1.5">
                  <p className="text-[10px] text-muted-foreground">👆 点击选择或直接编辑下方输入框</p>
                  {sceneSuggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => handleSelectScene(s.description)}
                      className={`w-full text-left p-2 rounded-lg border transition-colors ${
                        textPrompt === s.description
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border hover:border-primary/40 bg-muted/30'
                      }`}
                    >
                      <div className="text-[11px] font-medium text-foreground">{s.scene}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{s.description}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          <textarea
            value={textPrompt}
            onChange={(e) => setTextPrompt(e.target.value)}
            placeholder="描述你想要的场景，例如：现代客厅，温馨阳光，或从上方选择一个 AI 推荐的场景"
            className="w-full p-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
            rows={2}
          />
        </div>

        {/* Parameters grid */}
        <div className="grid grid-cols-2 gap-2">
          <Sel label="图片类型" options={imageTypes} value={imageType} onChange={setImageType} />
          <Sel label="尺寸" options={ratioOptions.map(r => r.label)} value={ratioOptions.find(r => r.value === selectedRatio)?.label || '1:1'} onChange={(v) => setSelectedRatio(ratioOptions.find(r => r.label === v)?.value || '1:1')} />
        </div>

        {/* Language */}
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
            <Globe className="h-3 w-3 inline mr-0.5" />文字语言
          </label>
          <select
            value={textLanguage}
            onChange={(e) => setTextLanguage(e.target.value)}
            className="w-full p-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 appearance-none cursor-pointer"
            style={{
              backgroundImage: `url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3e%3cpolyline points='6 9 12 15 18 9'/%3e%3c/svg%3e")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
              backgroundSize: '14px',
              paddingRight: '32px'
            }}
          >
            {languageOptions.map(lang => (
              <option key={lang.value} value={lang.value}>{lang.label}</option>
            ))}
          </select>
        </div>

        {/* Generate */}
        <Button variant="hero" className="w-full" onClick={handleGenerate} disabled={(uploadedImages.length === 0 && !textPrompt.trim()) || isGenerating}>
          {isGenerating ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />生成中...</> : <><Sparkles className="h-4 w-4 mr-1.5" />生成图片</>}
        </Button>

        {/* AI Copy section */}
        <button onClick={() => setShowCopy(!showCopy)} className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1">
          <Copy className="h-3 w-3" />{showCopy ? '收起 AI 文案' : '展开 AI 智能文案'}
        </button>

        {showCopy && (
          <div className="border-t border-border pt-3 space-y-2">
            {uploadedImages.length === 0 && <p className="text-[11px] text-amber-500">⚠️ 请先上传产品图片</p>}
            <Button variant="secondary" size="sm" className="w-full" onClick={handleGenerateCopy} disabled={uploadedImages.length === 0 || isGeneratingCopy}>
              {isGeneratingCopy ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />识别中...</> : <><Sparkles className="h-3.5 w-3.5 mr-1" />AI 识别 & 生成文案</>}
            </Button>
            {generatedCopy && (
              <div className="bg-muted/40 rounded-lg p-2.5 text-xs space-y-1.5">
                <div><span className="font-semibold text-primary">🏷️</span> {generatedCopy.productName}</div>
                <div><span className="font-semibold">📝</span> {generatedCopy.title}</div>
                <div>
                  <span className="font-semibold">🔥 卖点：</span>
                  <ul className="mt-0.5 space-y-0.5">
                    {generatedCopy.sellingPoints?.map((p: string, i: number) => (
                      <li key={i} className="flex items-start gap-1"><span className="text-primary">•</span>{p}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-6 text-[11px]" onClick={copyToClipboard}>
                    {copyCopied ? <><Check className="h-3 w-3 mr-0.5" />已复制</> : <><Copy className="h-3 w-3 mr-0.5" />复制</>}
                  </Button>
                </div>
                <div className="pt-1.5 border-t border-border space-y-1.5">
                  <div className="flex gap-1 p-0.5 bg-muted/50 rounded-md">
                    {(['all', 'main', 'detail'] as const).map(type => (
                      <button key={type} onClick={() => setCopyImageType(type)} className={`flex-1 py-1 rounded text-[11px] font-medium transition-colors ${copyImageType === type ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
                        {type === 'all' ? '全部' : type === 'main' ? '主图' : '详情'}
                      </button>
                    ))}
                  </div>
                  {copyGenerateProgress && (
                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                        <span>{copyGenerateProgress.step}...</span>
                        <span>{copyGenerateProgress.current}/{copyGenerateProgress.total}</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${(copyGenerateProgress.current / copyGenerateProgress.total) * 100}%` }} />
                      </div>
                    </div>
                  )}
                  <Button variant="hero" size="sm" className="w-full h-7 text-xs" onClick={handleGenerateFromCopy} disabled={isGeneratingFromCopy}>
                    {isGeneratingFromCopy ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />{copyGenerateProgress?.step || '生成中'}...</> : <><Sparkles className="h-3.5 w-3.5 mr-1" />一键生成</>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== RIGHT PANEL: Results ===== */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-background pb-24 lg:pb-6">
        {errorMessage && (
          <div className="mb-3 p-2.5 bg-destructive/10 text-destructive rounded-lg text-sm flex items-center justify-between">
            <span>❌ {errorMessage}</span>
            <button onClick={() => setErrorMessage(null)}><X className="h-4 w-4" /></button>
          </div>
        )}

        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
            <Sparkles className="h-10 w-10 text-primary animate-pulse mb-3" />
            <div className="text-lg font-bold text-foreground mb-2">
              {progress ? <>生成中 <span className="text-primary">{progress.current}</span>/{progress.total}</> : '准备中...'}
            </div>
            <div className="w-48 h-2 bg-muted rounded-full overflow-hidden mb-2">
              <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: progress ? `${(progress.current / progress.total) * 100}%` : '0%' }} />
            </div>
            <p className="text-xs text-muted-foreground">AI 正在生成，请稍候...</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 w-full mt-6">
              {Array.from({ length: isBatchMode ? Math.min(uploadedImages.length * 3, 9) : 3 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="font-semibold text-foreground text-sm">生成结果 ({results.length})</h3>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRegenerate} disabled={!lastParams}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />重新生成
                </Button>
                <Button variant="default" size="sm" className="h-7 text-xs" onClick={downloadAll}>
                  <Download className="h-3.5 w-3.5 mr-1" />全部下载
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {results.map((src, i) => (
                <div key={i} className="group relative overflow-hidden rounded-lg border border-border bg-muted/20">
                  <img src={src} alt={`Generated ${i + 1}`} className="w-full aspect-square object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-1.5">
                    <button onClick={() => setPreviewImage(src)} className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors" title="放大预览">
                      <ZoomIn className="h-4 w-4" />
                    </button>
                    <button onClick={() => navigate(`/dashboard/edit?url=${encodeURIComponent(src)}`)} className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors" title="编辑">
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button onClick={() => downloadImage(src, `picspark-${Date.now()}-${i + 1}.jpg`)} className="p-2 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors" title="下载">
                      <Download className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-center min-h-[400px]">
            <div>
              <Sparkles className="h-12 w-12 text-muted-foreground/15 mx-auto mb-3" />
              <h3 className="font-semibold text-muted-foreground mb-1 text-sm">准备就绪</h3>
              <p className="text-xs text-muted-foreground/60 max-w-xs">上传产品图，选择场景描述，开始生成专业电商图片</p>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-4xl p-2">
          {previewImage && (
            <img src={previewImage} alt="Preview" className="w-full h-auto rounded-lg" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GeneratePage;
