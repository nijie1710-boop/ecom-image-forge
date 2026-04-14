import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FolderOpen, Image, Search, Trash2, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { callAdminApi, type AdminImage } from "@/lib/admin-api";

const TYPE_FILTERS = [
  { value: "all", label: "全部" },
  { value: "主图", label: "主图" },
  { value: "详情图", label: "详情图" },
] as const;

const AdminImagesPage = () => {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]["value"]>("all");
  const [previewImage, setPreviewImage] = useState<AdminImage | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-images"],
    queryFn: () => callAdminApi({ action: "list_images" }),
  });

  const deleteImageMutation = useMutation({
    mutationFn: (imageId: string) => callAdminApi({ action: "delete_image", userId: imageId }),
    onSuccess: () => {
      toast.success("图片记录已删除");
      queryClient.invalidateQueries({ queryKey: ["admin-images"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const deleteImagesMutation = useMutation({
    mutationFn: (imageIds: string[]) => callAdminApi({ action: "delete_images", imageIds }),
    onSuccess: (_, ids) => {
      toast.success(`已删除 ${ids.length} 张图片记录`);
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ["admin-images"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const images = useMemo(() => (data?.images || []) as AdminImage[], [data]);

  const filteredImages = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return images.filter((image) => {
      const keywordMatched =
        !normalizedKeyword ||
        image.email?.toLowerCase().includes(normalizedKeyword) ||
        image.prompt?.toLowerCase().includes(normalizedKeyword) ||
        image.image_type?.toLowerCase().includes(normalizedKeyword) ||
        image.scene?.toLowerCase().includes(normalizedKeyword);

      const typeMatched = typeFilter === "all" ? true : image.image_type === typeFilter;
      return keywordMatched && typeMatched;
    });
  }, [images, keyword, typeFilter]);

  const mainImageCount = filteredImages.filter((image) => image.image_type === "主图").length;
  const detailImageCount = filteredImages.filter((image) => image.image_type === "详情图").length;
  const recentImageCount = filteredImages.filter((image) => {
    const createdAt = image.created_at ? new Date(image.created_at) : null;
    return createdAt ? Date.now() - createdAt.getTime() <= 24 * 60 * 60 * 1000 : false;
  }).length;

  const allFilteredSelected = filteredImages.length > 0 && filteredImages.every((image) => selectedIds.includes(image.id));

  const downloadImage = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleImageSelection = (imageId: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, imageId])] : current.filter((id) => id !== imageId),
    );
  };

  const toggleSelectAllFiltered = (checked: boolean) => {
    if (checked) {
      setSelectedIds((current) => [...new Set([...current, ...filteredImages.map((image) => image.id)])]);
      return;
    }
    setSelectedIds((current) => current.filter((id) => !filteredImages.find((image) => image.id === id)));
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <FolderOpen className="h-3.5 w-3.5" />
              图片管理
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-foreground">后台图片库</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              查看云端生成结果，按用户和图片类型筛选；遇到异常结果可以直接删除记录。
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative min-w-[220px] max-w-[320px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索邮箱、提示词或图片类型"
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => refetch()}>
              刷新
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTERS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setTypeFilter(item.value)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                typeFilter === item.value
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Image className="h-4 w-4" />
            当前图片数
          </div>
          <div className="mt-3 text-2xl font-semibold text-foreground">{filteredImages.length}</div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">主图数量</div>
          <div className="mt-3 text-2xl font-semibold text-foreground">{mainImageCount}</div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">详情图数量</div>
          <div className="mt-3 text-2xl font-semibold text-foreground">{detailImageCount}</div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">24 小时新增</div>
          <div className="mt-3 text-2xl font-semibold text-primary">{recentImageCount}</div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={allFilteredSelected}
              onCheckedChange={(checked) => toggleSelectAllFiltered(Boolean(checked))}
            />
            <div className="text-sm text-muted-foreground">
              已选 <span className="font-medium text-foreground">{selectedIds.length}</span> 张
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              onClick={() => setSelectedIds([])}
              disabled={selectedIds.length === 0}
            >
              清空选择
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="rounded-xl"
              onClick={() => deleteImagesMutation.mutate(selectedIds)}
              disabled={selectedIds.length === 0 || deleteImagesMutation.isPending}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              批量删除
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-3xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          正在加载图片数据...
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
          {(error as Error).message}
        </div>
      ) : filteredImages.length === 0 ? (
        <div className="rounded-3xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
          暂无匹配图片
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredImages.map((image) => (
            <div key={image.id} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
              <div className="relative">
                <div className="absolute left-3 top-3 z-10 rounded-lg bg-background/90 p-1 shadow-sm">
                  <Checkbox
                    checked={selectedIds.includes(image.id)}
                    onCheckedChange={(checked) => toggleImageSelection(image.id, Boolean(checked))}
                    aria-label={`选择图片 ${image.id}`}
                  />
                </div>
                <button type="button" className="block w-full text-left" onClick={() => setPreviewImage(image)}>
                  <img
                    src={image.image_url}
                    alt={image.prompt || "图片预览"}
                    className="aspect-[4/5] w-full object-cover"
                  />
                </button>

                <div className="absolute left-12 top-3 flex gap-2">
                  {image.image_type && (
                    <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
                      {image.image_type}
                    </span>
                  )}
                  {image.aspect_ratio && (
                    <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11px] text-foreground">
                      {image.aspect_ratio}
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3 p-4">
                <div>
                  <div className="line-clamp-2 text-sm font-medium text-foreground">
                    {image.prompt || "未记录提示词"}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">{image.email}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {image.created_at ? new Date(image.created_at).toLocaleString() : "-"}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setPreviewImage(image)}>
                    <ZoomIn className="mr-1 h-3.5 w-3.5" />
                    预览
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => downloadImage(image.image_url, `admin-image-${image.id}.jpg`)}
                  >
                    <Download className="mr-1 h-3.5 w-3.5" />
                    下载
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => deleteImageMutation.mutate(image.id)}
                    disabled={deleteImageMutation.isPending}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" />
                    删除
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-5xl p-4">
          {previewImage && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8 text-base">{previewImage.prompt || "图片预览"}</DialogTitle>
              </DialogHeader>

              <div className="overflow-hidden rounded-2xl border border-border bg-muted/20">
                <img
                  src={previewImage.image_url}
                  alt={previewImage.prompt || "图片预览"}
                  className="max-h-[78vh] w-full object-contain"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-muted px-2.5 py-1">{previewImage.email}</span>
                  {previewImage.image_type && (
                    <span className="rounded-full bg-muted px-2.5 py-1">{previewImage.image_type}</span>
                  )}
                  {previewImage.aspect_ratio && (
                    <span className="rounded-full bg-muted px-2.5 py-1">{previewImage.aspect_ratio}</span>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => downloadImage(previewImage.image_url, `admin-image-${previewImage.id}.jpg`)}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  下载图片
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminImagesPage;
