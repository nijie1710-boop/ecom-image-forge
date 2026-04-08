import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Shield,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type HistoryImage = {
  id: string;
  image_url: string;
  created_at: string;
  source: "cloud" | "local";
};

type BalanceInfo = {
  balance: number;
  total_recharged: number;
  total_consumed: number;
  recharge_count?: number;
  consumption_count?: number;
};

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, signOut, isAdmin, loading } = useAuth();
  const [localImages, setLocalImages] = useState<HistoryImage[]>([]);
  const [isSigningOut, setIsSigningOut] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("local_image_history") || "[]";
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      setLocalImages(
        parsed.slice(0, 4).map((item) => ({
          id: String(item.id || crypto.randomUUID()),
          image_url: String(item.image_url || ""),
          created_at: String(item.created_at || new Date().toISOString()),
          source: "local",
        })),
      );
    } catch (error) {
      console.error("load local image history failed:", error);
      setLocalImages([]);
    }
  }, []);

  const cloudImagesQuery = useQuery({
    queryKey: ["account-images", user?.id],
    enabled: !loading && Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_images")
        .select("id,image_url,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(4);

      if (error) throw error;

      return (data || []).map((item) => ({
        ...item,
        source: "cloud" as const,
      }));
    },
  });

  const profileQuery = useQuery({
    queryKey: ["account-profile", user?.id],
    enabled: !loading && Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user!.id)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const balanceQuery = useQuery({
    queryKey: ["account-balance", user?.id],
    enabled: !loading && Boolean(user?.id),
    retry: 1,
    queryFn: async (): Promise<BalanceInfo> => {
      const { data, error } = await supabase.functions.invoke("manage-balance", {
        body: { action: "get" },
      });

      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));

      return (
        data?.balance || {
          balance: 0,
          total_recharged: 0,
          total_consumed: 0,
          recharge_count: 0,
          consumption_count: 0,
        }
      );
    },
  });

  const recentImages = useMemo(() => {
    return [...(cloudImagesQuery.data || []), ...localImages]
      .filter((item) => item.image_url)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, 4);
  }, [cloudImagesQuery.data, localImages]);

  const handleRefresh = async () => {
    try {
      await Promise.all([cloudImagesQuery.refetch(), profileQuery.refetch(), balanceQuery.refetch()]);
      toast.success("账户信息已刷新");
    } catch (error) {
      console.error("refresh account page failed:", error);
      toast.error("刷新失败，请稍后再试");
    }
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;

    try {
      setIsSigningOut(true);
      await signOut();
      toast.success("已退出登录");
      navigate("/auth", { replace: true });
    } catch (error) {
      console.error("sign out failed:", error);
      toast.error("退出登录失败，请稍后再试");
      setIsSigningOut(false);
    }
  };

  const displayName = profileQuery.data?.display_name || user?.email?.split("@")[0] || "未设置";
  const email = user?.email || "未绑定邮箱";
  const totalImages = (cloudImagesQuery.data?.length || 0) + localImages.length;
  const balance = balanceQuery.data;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">账户设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            查看个人资料、最近图片和当前积分余额。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void handleRefresh()}>
            刷新数据
          </Button>
          <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" />
            )}
            退出登录
          </Button>
        </div>
      </div>

      <Card className="mb-6 rounded-3xl border border-border shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2 text-primary">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">我的图片</CardTitle>
              <CardDescription>最近生成或保存的图片会显示在这里。</CardDescription>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/images")}>
            查看全部
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {cloudImagesQuery.isLoading ? (
            <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : recentImages.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {recentImages.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted text-left"
                  onClick={() => navigate("/dashboard/images")}
                >
                  <img
                    src={image.image_url}
                    alt="最近生成的图片"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <span
                    className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      image.source === "cloud" ? "bg-blue-500/90 text-white" : "bg-orange-500/90 text-white"
                    }`}
                  >
                    {image.source === "cloud" ? "云端" : "本地"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
              还没有图片记录，去创作页开始生成吧。
            </div>
          )}

          <div className="mt-4 text-xs text-muted-foreground">当前共记录 {totalImages} 张图片</div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-3xl border border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">个人资料</CardTitle>
                <CardDescription>查看当前登录账号与权限信息。</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
              <span className="text-muted-foreground">姓名</span>
              <span className="font-medium text-foreground">{displayName}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
              <span className="text-muted-foreground">邮箱</span>
              <span className="font-medium text-foreground">{email}</span>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-border px-4 py-3">
              <span className="text-muted-foreground">账户角色</span>
              <div className="flex items-center gap-2">
                {isAdmin ? <Shield className="h-4 w-4 text-primary" /> : null}
                <span className="font-medium text-foreground">{isAdmin ? "管理员" : "普通用户"}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">我的积分</CardTitle>
                <CardDescription>高成本生成能力会优先消耗账户积分。</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-2xl border border-border bg-muted/20 p-5">
              <div className="text-sm text-muted-foreground">当前余额</div>
              <div className="mt-2 text-4xl font-bold text-foreground">
                {balanceQuery.isLoading ? (
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                ) : (
                  <>
                    {balance?.balance ?? 0}
                    <span className="ml-2 text-lg font-medium text-primary">积分</span>
                  </>
                )}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border px-4 py-3">
                  <div className="text-xs text-muted-foreground">累计充值</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{balance?.total_recharged ?? 0}</div>
                </div>
                <div className="rounded-2xl border border-border px-4 py-3">
                  <div className="text-xs text-muted-foreground">累计消费</div>
                  <div className="mt-1 text-lg font-semibold text-foreground">{balance?.total_consumed ?? 0}</div>
                </div>
              </div>
              {balanceQuery.error ? (
                <p className="mt-4 text-sm text-destructive">积分信息加载失败，请点击刷新数据重试。</p>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  生成图片和图文翻译会消耗积分，余额不足时请先充值后继续使用。
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => navigate("/dashboard/recharge")}>去充值</Button>
              {isAdmin ? (
                <Button variant="outline" onClick={() => navigate("/admin/users")}>
                  管理后台
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
