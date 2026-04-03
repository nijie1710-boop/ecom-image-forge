import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  Cloud,
  Download,
  FolderHeart,
  Image as ImageIcon,
  Loader2,
  Search,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  ZoomIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import {
  loadCuratedImageLibrary,
  markCuratedBest,
  removeCuratedImage,
  toggleCuratedFavorite,
} from "@/lib/image-library";

type SourceType = "cloud" | "local" | "curated";
type ViewFilter = "all" | "favorites" | "best";
type GroupMode = "batch" | "date" | "task";

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
  task_kind?: "image" | "detail" | "copy" | "translate";
  favorite?: boolean;
  is_best?: boolean;
}

const CLOUD_PAGE_SIZE = 24;

function sourceLabel(source: SourceType) {
  if (source === "cloud") return "云端";
  if (source === "local") return "本地";
  return "精选";
}

function taskGroupLabel(taskKind?: string) {
  if (taskKind === "detail") return "AI 详情页";
  if (taskKind === "copy") return "文案联动";
  if (taskKind === "translate") return "图文翻译";
  return "AI 生图";
}

function resolveTaskKind(item: Pick<ImageRecord, "task_kind" | "scene">) {
  if (item.task_kind) return item.task_kind;
  if (item.scene === "translate") return "translate";
  return "image";
}

function formatGroupTitle(groupMode: GroupMode, groupKey: string, firstImage?: ImageRecord) {
  if (groupMode === "task") return taskGroupLabel(groupKey);
  if (groupMode === "batch") return firstImage?.group_id ? "同一批次结果" : `批次 ${groupKey}`;
  return groupKey;
}

const MyImagesPage = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [localImages, setLocalImages] = useState<ImageRecord[]>([]);
  const [curatedImages, setCuratedImages] = useState<ImageRecord[]>([]);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | SourceType>("all");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");
  const [groupMode, setGroupMode] = useState<GroupMode>("batch");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewImage, setPreviewImage] = useState<ImageRecord | null>(null);

  const {
    data: cloudPages,
    isLoading: isLoadingCloud,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["my-images", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * CLOUD_PAGE_SIZE;
      const to = from + CLOUD_PAGE_SIZE - 1;

      const { data, error } = await supabase
        .from("generated_images")
        .select(
          "id,image_url,prompt,style,scene,aspect_ratio,image_type,created_at,group_id,task_kind",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const items = (data || []).map((image) => ({ ...image, source: "cloud" as const }));
      return {
        items,
        nextPage: items.length === CLOUD_PAGE_SIZE ? pageParam + 1 : undefined,
      };
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
  });

  const cloudImages = useMemo(
    () => (cloudPages?.pages || []).flatMap((page) => page.items),
    [cloudPages],
  );

  const refreshLocalState = () => {
    try {
      const localHistory = JSON.parse(localStorage.getItem("local_image_history") || "[]");
      setLocalImages(localHistory.map((image: any) => ({ ...image, source: "local" as const })));
      setCuratedImages(
        loadCuratedImageLibrary().map((image) => ({ ...image, source: "curated" as const })),
      );
    } catch (error) {
      console.error("load image library failed:", error);
    }
  };

  useEffect(() => {
    refreshLocalState();
  }, []);

  const mergedImages = useMemo(() => {
    const map = new Map<string, ImageRecord>();

    [...cloudImages, ...localImages, ...curatedImages].forEach((item) => {
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

        const haystack = [
          item.prompt,
          item.style,
          item.scene,
          item.image_type,
          taskGroupLabel(resolveTaskKind(item)),
        ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query.trim().toLowerCase());
    });
  }, [mergedImages, query, sourceFilter, viewFilter]);

  const groupedImages = useMemo(() => {
    const groups = new Map<string, ImageRecord[]>();

    filteredImages.forEach((item) => {
      const key =
        groupMode === "date"
          ? item.created_at.slice(0, 10)
          : groupMode === "task"
            ? resolveTaskKind(item)
            : item.group_id || item.created_at.slice(0, 10);

      const current = groups.get(key) || [];
      current.push(item);
      groups.set(key, current);
    });

    return Array.from(groups.entries());
  }, [filteredImages, groupMode]);

  useEffect(() => {
    const validIds = new Set(filteredImages.map((item) => item.id));
    setSelectedIds((current) => current.filter((id) => validIds.has(id)));
  }, [filteredImages]);

  const deleteCloudMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("generated_images").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-images"] });
    },
  });

  const updateLocalHistory = (updater: (items: any[]) => any[]) => {
    const localHistory = JSON.parse(localStorage.getItem("local_image_history") || "[]");
    const updated = updater(localHistory);
    localStorage.setItem("local_image_history", JSON.stringify(updated));
    setLocalImages(updated.map((image: any) => ({ ...image, source: "local" as const })));
  };

  const handleDelete = async (images: ImageRecord[]) => {
    const cloudIds = images.filter((item) => item.source === "cloud").map((item) => item.id);
    const localIds = new Set(images.filter((item) => item.source === "local").map((item) => item.id));
    const curatedIds = images.filter((item) => item.source === "curated").map((item) => item.id);

    try {
      if (cloudIds.length > 0) {
        await deleteCloudMutation.mutateAsync(cloudIds);
      }

      if (localIds.size > 0) {
        updateLocalHistory((items) => items.filter((item: any) => !localIds.has(item.id)));
      }

      if (curatedIds.length > 0) {
        curatedIds.forEach((id) => removeCuratedImage(id));
      }

      refreshLocalState();
      setSelectedIds((current) => current.filter((id) => !images.some((img) => img.id === id)));
      toast({ title: `已删除 ${images.length} 张图片` });
    } catch (error) {
      console.error("delete images failed:", error);
      toast({ title: "删除失败，请稍后重试" });
    }
  };

  const isMobile = () =>
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

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
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      }, "image/jpeg");
    };
    img.onerror = () => window.open(url, "_blank");
    img.src = url;
  };

  const handleBatchDownload = (images: ImageRecord[]) => {
    images.forEach((image, index) => {
      setTimeout(() => {
        downloadImage(image.image_url, `image-${image.id}-${index + 1}.jpg`);
      }, index * 250);
    });
  };

  const handleFavorite = (image: ImageRecord) => {
    const updated = toggleCuratedFavorite(image.image_url, {
      image_url: image.image_url,
      prompt: image.prompt,
      aspect_ratio: image.aspect_ratio,
      image_type: image.image_type,
      style: image.style,
      scene: image.scene,
      group_id: image.group_id,
      task_kind: image.task_kind,
    });
    refreshLocalState();
    toast({
      title: updated.favorite ? "已加入收藏" : "已取消收藏",
    });
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
    refreshLocalState();
    toast({
      title: "已标记为最佳图",
      description: "同一批次里会优先保留这张作为最佳结果。",
    });
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  const selectedImages = filteredImages.filter((item) => selectedIds.includes(item.id));

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
              点图片会直接大图预览，收藏和最佳图会立即更新状态，并给你明确提示。
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <StatCard label="云端已加载" value={`${cloudImages.length} 张`} icon={<Cloud className="h-4 w-4" />} />
            <StatCard label="本地" value={`${localImages.length} 张`} icon={<Smartphone className="h-4 w-4" />} />
            <StatCard label="精选" value={`${curatedImages.length} 张`} icon={<Star className="h-4 w-4" />} />
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-3xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索提示词、风格、场景、图片类型"
              className="w-full rounded-2xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition focus:ring-2 focus:ring-primary/25"
            />
          </div>

          <FilterGroup
            value={sourceFilter}
            onChange={(value) => setSourceFilter(value as "all" | SourceType)}
            options={[
              { value: "all", label: "全部来源" },
              { value: "cloud", label: "云端" },
              { value: "local", label: "本地" },
              { value: "curated", label: "精选" },
            ]}
          />

          <FilterGroup
            value={viewFilter}
            onChange={(value) => setViewFilter(value as ViewFilter)}
            options={[
              { value: "all", label: "全部" },
              { value: "favorites", label: "已收藏" },
              { value: "best", label: "最佳图" },
            ]}
          />

          <FilterGroup
            value={groupMode}
            onChange={(value) => setGroupMode(value as GroupMode)}
            options={[
              { value: "batch", label: "按批次" },
              { value: "date", label: "按日期" },
              { value: "task", label: "按任务" },
            ]}
          />
        </div>
      </div>

      {selectedImages.length > 0 && (
        <div className="mb-6 rounded-3xl border border-primary/20 bg-primary/5 p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-sm font-semibold text-foreground">已选中 {selectedImages.length} 张图片</div>
              <div className="text-xs text-muted-foreground">
                可以批量下载，或一次性删除这批已勾选结果。
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => handleBatchDownload(selectedImages)}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                批量下载
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-xl"
                onClick={() => void handleDelete(selectedImages)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                批量删除
              </Button>
              <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setSelectedIds([])}>
                清空选择
              </Button>
            </div>
          </div>
        </div>
      )}

      {user && isLoadingCloud ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="aspect-square animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : groupedImages.length > 0 ? (
        <>
          <div className="space-y-8">
            {groupedImages.map(([groupKey, images]) => (
              <section key={groupKey}>
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      {formatGroupTitle(groupMode, groupKey, images[0])}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {images.length} 张图片
                      {images.some((item) => item.is_best) ? " · 含最佳图" : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => setSelectedIds(images.map((item) => item.id))}
                    >
                      全选本组
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl"
                      onClick={() => handleBatchDownload(images)}
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" />
                      下载本组
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                  {images.map((img) => (
                    <div
                      key={`${img.id}-${img.source}`}
                      className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                    >
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setPreviewImage(img)}
                          className="block w-full text-left"
                        >
                          <img
                            src={img.image_url}
                            alt={img.prompt || "Generated"}
                            loading="lazy"
                            decoding="async"
                            className="aspect-square w-full object-cover transition duration-200 hover:scale-[1.01]"
                          />
                        </button>

                        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm">
                            {sourceLabel(img.source)}
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

                        <button
                          type="button"
                          onClick={() => setPreviewImage(img)}
                          className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-[11px] font-medium text-foreground shadow-sm transition hover:bg-white"
                        >
                          <ZoomIn className="h-3.5 w-3.5" />
                          预览大图
                        </button>

                        <label className="absolute right-3 top-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/85 shadow-sm backdrop-blur-sm">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(img.id)}
                            onChange={() => toggleSelected(img.id)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                          />
                        </label>
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

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleFavorite(img)}
                            className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition ${
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
                            className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                              img.is_best
                                ? "border-primary bg-primary/10 text-primary"
                                : "border-border bg-background text-foreground hover:border-primary/40 hover:text-primary"
                            }`}
                          >
                            <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                            {img.is_best ? "最佳图" : "标记最佳"}
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
                            onClick={() => void handleDelete([img])}
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

          {hasNextPage && (sourceFilter === "all" || sourceFilter === "cloud") && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                className="rounded-2xl"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在加载更多
                  </>
                ) : (
                  "加载更多云端图片"
                )}
              </Button>
            </div>
          )}
        </>
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

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-5xl p-4">
          {previewImage && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-base">
                  {previewImage.prompt || "图片预览"}
                </DialogTitle>
              </DialogHeader>

              <div className="overflow-hidden rounded-2xl border border-border bg-muted/20">
                <img
                  src={previewImage.image_url}
                  alt={previewImage.prompt || "Preview"}
                  className="max-h-[78vh] w-full object-contain"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-full bg-muted px-2.5 py-1">{sourceLabel(previewImage.source)}</span>
                  {previewImage.image_type && (
                    <span className="rounded-full bg-muted px-2.5 py-1">{previewImage.image_type}</span>
                  )}
                  {previewImage.aspect_ratio && (
                    <span className="rounded-full bg-muted px-2.5 py-1">{previewImage.aspect_ratio}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() =>
                      previewImage && downloadImage(previewImage.image_url, `image-${previewImage.id}.jpg`)
                    }
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    下载图片
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const StatCard = ({ label, value, icon }: { label: string; value: string; icon: ReactNode }) => (
  <div className="rounded-2xl bg-muted/70 px-4 py-3">
    <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
      {icon}
      {label}
    </div>
    <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
  </div>
);

const FilterGroup = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) => (
  <div className="flex flex-wrap gap-2">
    {options.map((item) => (
      <button
        key={item.value}
        type="button"
        onClick={() => onChange(item.value)}
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
          value === item.value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {item.label}
      </button>
    ))}
  </div>
);

export default MyImagesPage;
