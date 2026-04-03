import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Cloud,
  Download,
  FolderHeart,
  Image as ImageIcon,
  Search,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  loadCuratedImageLibrary,
  removeCuratedImage,
  toggleCuratedFavorite,
  markCuratedBest,
  type CuratedImageRecord,
} from "@/lib/image-library";

type SourceType = "cloud" | "local" | "curated";

interface ImageRecord {
  id: string;
  image_url: string;
  prompt?: string;
  style?: string;
  scene?: string;
  aspect_ratio?: string;
  image_type?: string;
  created_at: string;
  source: SourceType;
  group_id?: string;
  task_kind?: "image" | "detail" | "copy";
  favorite?: boolean;
  is_best?: boolean;
}

const MyImagesPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localImages, setLocalImages] = useState<ImageRecord[]>([]);
  const [curatedImages, setCuratedImages] = useState<ImageRecord[]>([]);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | SourceType>("all");
  const [viewFilter, setViewFilter] = useState<"all" | "favorites" | "best">("all");

  const { data: cloudImages, isLoading: isLoadingCloud } = useQuery({
    queryKey: ["my-images", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_images")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []).map((img) => ({ ...img, source: "cloud" as const }));
    },
    enabled: !!user,
  });

  const loadLocalState = () => {
    try {
      const localHistory = JSON.parse(localStorage.getItem("local_image_history") || "[]");
      setLocalImages(localHistory.map((img: any) => ({ ...img, source: "local" as const })));
      setCuratedImages(loadCuratedImageLibrary().map((img) => ({ ...img, source: "curated" as const })));
    } catch (error) {
      console.error("load image library failed:", error);
    }
  };

  useEffect(() => {
    loadLocalState();
  }, []);

  const mergedImages = useMemo(() => {
    const map = new Map<string, ImageRecord>();

    [...(cloudImages || []), ...localImages, ...curatedImages].forEach((item) => {
      const existing = map.get(item.image_url);
      if (!existing) {
        map.set(item.image_url, item);
        return;
      }
      map.set(item.image_url, {
        ...existing,
        ...item,
        favorite: item.favorite || existing.favorite,
        is_best: item.is_best || existing.is_best,
        source: existing.source === "curated" ? existing.source : item.source,
      });
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [cloudImages, curatedImages, localImages]);

  const filteredImages = useMemo(() => {
    return mergedImages.filter((item) => {
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (viewFilter === "favorites" && !item.favorite) return false;
      if (viewFilter === "best" && !item.is_best) return false;
      if (!query.trim()) return true;
      const haystack = [item.prompt, item.style, item.scene, item.image_type]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    });
  }, [mergedImages, query, sourceFilter, viewFilter]);

  const groupedImages = useMemo(() => {
    const groups = new Map<string, ImageRecord[]>();
    filteredImages.forEach((item) => {
      const key = item.group_id || item.created_at.slice(0, 10);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries());
  }, [filteredImages]);

  const isLoading = user ? isLoadingCloud : false;

  const deleteCloudMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("generated_images").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-images"] });
      toast({ title: "已删除云端图片" });
    },
  });

  const deleteLocalImage = (id: string) => {
    try {
      const localHistory = JSON.parse(localStorage.getItem("local_image_history") || "[]");
      const updated = localHistory.filter((img: any) => img.id !== id);
      localStorage.setItem("local_image_history", JSON.stringify(updated));
      setLocalImages(updated);
      toast({ title: "已删除本地图片" });
    } catch (error) {
      console.error("delete local image failed:", error);
    }
  };

  const handleDelete = (image: ImageRecord) => {
    if (image.source === "cloud") {
      deleteCloudMutation.mutate(image.id);
      return;
    }
    if (image.source === "curated") {
      removeCuratedImage(image.id);
      loadLocalState();
      toast({ title: "已移出精选图库" });
      return;
    }
    deleteLocalImage(image.id);
  };

  const isMobile = () =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent,
    );

  const downloadImage = (url: string, filename: string) => {
    if (isMobile()) {
      window.open(url, "_blank");
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
          }
        }, "image/jpeg");
      }
    };
    img.onerror = () => window.open(url, "_blank");
    img.src = url;
  };

  const handleFavorite = (image: ImageRecord) => {
    toggleCuratedFavorite(image.image_url, {
      image_url: image.image_url,
      prompt: image.prompt,
      aspect_ratio: image.aspect_ratio,
      image_type: image.image_type,
      style: image.style,
      scene: image.scene,
      group_id: image.group_id,
      task_kind: image.task_kind,
    });
    loadLocalState();
  };

  const handleBest = (image: ImageRecord) => {
    markCuratedBest(image.image_url, image.group_id, {
      image_url: image.image_url,
      prompt: image.prompt,
      aspect_ratio: image.aspect_ratio,
      image_type: image.image_type,
      style: image.style,
      scene: image.scene,
      group_id: image.group_id,
      task_kind: image.task_kind,
    });
    loadLocalState();
  };

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-8 rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              <FolderHeart className="h-3.5 w-3.5" />
              图片库
            </div>
            <h1 className="mt-3 text-2xl font-bold text-foreground">统一管理你的生成结果</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              这里会展示云端历史、本地历史和你手动收藏的精选图，方便你筛选、下载和继续使用。
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl bg-muted/70 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">云端</div>
              <div className="mt-1 text-sm font-medium text-foreground">{cloudImages?.length || 0} 张</div>
            </div>
            <div className="rounded-2xl bg-muted/70 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">本地</div>
              <div className="mt-1 text-sm font-medium text-foreground">{localImages.length} 张</div>
            </div>
            <div className="rounded-2xl bg-muted/70 px-4 py-3">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">精选</div>
              <div className="mt-1 text-sm font-medium text-foreground">{curatedImages.length} 张</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索提示词、风格、场景或图片类型"
              className="w-full rounded-2xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-primary/25"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { value: "all", label: "全部来源" },
              { value: "cloud", label: "云端" },
              { value: "local", label: "本地" },
              { value: "curated", label: "精选" },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setSourceFilter(item.value as "all" | SourceType)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  sourceFilter === item.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { value: "all", label: "全部" },
              { value: "favorites", label: "已收藏" },
              { value: "best", label: "最佳图" },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setViewFilter(item.value as "all" | "favorites" | "best")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  viewFilter === item.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="aspect-square animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : groupedImages.length > 0 ? (
        <div className="space-y-8">
          {groupedImages.map(([groupKey, images]) => (
            <section key={groupKey}>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    {images[0]?.group_id ? "同一批次结果" : groupKey}
                  </h2>
                  <p className="text-xs text-muted-foreground">{images.length} 张图片</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {images.map((img) => (
                  <div
                    key={`${img.id}-${img.source}`}
                    className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="relative">
                      <img
                        src={img.image_url}
                        alt={img.prompt || "Generated"}
                        className="aspect-square w-full object-cover"
                      />
                      <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm">
                          {img.source === "cloud" ? "云端" : img.source === "local" ? "本地" : "精选"}
                        </span>
                        {img.favorite && (
                          <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] text-primary-foreground">
                            已收藏
                          </span>
                        )}
                        {img.is_best && (
                          <span className="rounded-full bg-amber-500 px-2.5 py-1 text-[11px] text-white">
                            最佳图
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 p-3">
                      <div className="space-y-1">
                        <div className="line-clamp-2 text-sm font-medium text-foreground">
                          {img.prompt || "未记录提示词"}
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {img.image_type && (
                            <span className="rounded-full bg-muted px-2.5 py-1">{img.image_type}</span>
                          )}
                          {img.aspect_ratio && (
                            <span className="rounded-full bg-muted px-2.5 py-1">{img.aspect_ratio}</span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleFavorite(img)}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                            img.favorite
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-foreground hover:border-primary/40 hover:text-primary"
                          }`}
                        >
                          <Star className="mr-1 inline h-3.5 w-3.5" />
                          {img.favorite ? "已收藏" : "收藏"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBest(img)}
                          className={`rounded-xl border px-3 py-2 text-xs font-medium transition ${
                            img.is_best
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background text-foreground hover:border-primary/40 hover:text-primary"
                          }`}
                        >
                          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                          {img.is_best ? "最佳" : "标记最佳"}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => downloadImage(img.image_url, `image-${img.id}.jpg`)}
                        >
                          <Download className="mr-1 h-3.5 w-3.5" />
                          下载
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="rounded-xl"
                          onClick={() => handleDelete(img)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          删除
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-border bg-card p-16 text-center">
          <ImageIcon className="mx-auto mb-4 h-16 w-16 text-muted-foreground/20" />
          <p className="mb-2 text-lg font-semibold text-foreground">图片库还是空的</p>
          <p className="mb-6 text-sm text-muted-foreground">
            先去生成几张图片，或者把你满意的结果加入精选图库。
          </p>
          <Link to="/dashboard/generate">
            <Button variant="hero">去 AI 生图</Button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default MyImagesPage;
