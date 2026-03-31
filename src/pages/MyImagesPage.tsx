import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, Trash2, Image as ImageIcon, Cloud, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface ImageRecord {
  id: string;
  image_url: string;
  prompt?: string;
  style?: string;
  scene?: string;
  aspect_ratio?: string;
  created_at: string;
  source?: 'cloud' | 'local';
}

const MyImagesPage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localImages, setLocalImages] = useState<ImageRecord[]>([]);

  // 加载云端图片（已登录用户）
  const { data: cloudImages, isLoading: isLoadingCloud } = useQuery({
    queryKey: ["my-images", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_images")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []).map(img => ({ ...img, source: 'cloud' as const }));
    },
    enabled: !!user,
  });

  // 加载本地图片（所有用户）
  useEffect(() => {
    try {
      const localHistory = JSON.parse(localStorage.getItem('local_image_history') || '[]');
      setLocalImages(localHistory.map((img: any) => ({ ...img, source: 'local' as const })));
    } catch (e) {
      console.error('加载本地历史记录失败:', e);
    }
  }, []);

  // 合并图片列表（云端 + 本地），按时间倒序
  const allImages = [...(cloudImages || []), ...localImages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const isLoading = user ? isLoadingCloud : false;

  // 删除云端图片
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

  // 删除本地图片
  const deleteLocalImage = (id: string) => {
    try {
      const localHistory = JSON.parse(localStorage.getItem('local_image_history') || '[]');
      const updated = localHistory.filter((img: any) => img.id !== id);
      localStorage.setItem('local_image_history', JSON.stringify(updated));
      setLocalImages(updated);
      toast({ title: "已删除本地图片" });
    } catch (e) {
      console.error('删除本地图片失败:', e);
    }
  };

  // 删除图片（根据来源）
  const handleDelete = (image: ImageRecord) => {
    if (image.source === 'cloud') {
      deleteCloudMutation.mutate(image.id);
    } else {
      deleteLocalImage(image.id);
    }
  };

  // 检测是否在移动端
  const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  // 下载图片
  const downloadImage = (url: string, filename: string) => {
    if (isMobile()) {
      window.open(url, '_blank');
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
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
    img.onerror = () => {
      window.open(url, '_blank');
    };
    img.src = url;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-foreground mb-1">{t("myImages.title")}</h1>
        <p className="text-muted-foreground text-sm">
          {t("myImages.subtitle")}
          {localImages.length > 0 && !user && (
            <span className="ml-2 inline-flex items-center text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 px-2 py-0.5 rounded">
              <Smartphone className="w-3 h-3 mr-1" /> 本地存储 {localImages.length} 张
            </span>
          )}
          {user && cloudImages && cloudImages.length > 0 && (
            <span className="ml-2 inline-flex items-center text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
              <Cloud className="w-3 h-3 mr-1" /> 云端 {cloudImages.length} 张
            </span>
          )}
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl animate-shimmer" />
          ))}
        </div>
      ) : allImages.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {allImages.map((img) => (
            <div key={img.id} className="group relative overflow-hidden rounded-xl border border-border bg-card">
              <img src={img.image_url} alt={img.prompt || "Generated"} className="w-full aspect-square object-cover" />
              <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-colors flex items-end justify-between p-3 opacity-0 group-hover:opacity-100">
                <div className="flex gap-2">
                  <Button 
                    variant="secondary" 
                    size="sm"
                    onClick={() => downloadImage(img.image_url, `image-${img.id}.jpg`)}
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(img)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {/* 来源标识 */}
              <div className={`absolute top-2 right-2 text-xs px-2 py-0.5 rounded-md ${
                img.source === 'cloud' 
                  ? 'bg-blue-500/90 text-white' 
                  : 'bg-orange-500/90 text-white'
              }`}>
                {img.source === 'cloud' ? '☁️' : '📱'}
              </div>
              {img.style && (
                <div className="absolute top-2 left-2 bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity">
                  {img.style}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-24">
          <ImageIcon className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">{t("myImages.empty")}</p>
          <Link to="/dashboard/generate">
            <Button variant="hero">{t("dashboard.startGenerating")}</Button>
          </Link>
        </div>
      )}
    </div>
  );
};

export default MyImagesPage;
