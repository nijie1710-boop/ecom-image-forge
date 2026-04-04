import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  CreditCard,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Shield,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

type HistoryImage = {
  id: string;
  image_url: string;
  created_at: string;
  source: "cloud" | "local";
};

const AccountPage = () => {
  const navigate = useNavigate();
  const { user, signOut, isAdmin } = useAuth();
  const [localImages, setLocalImages] = useState<HistoryImage[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const { data: cloudImages } = useQuery({
    queryKey: ["account-images", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_images")
        .select("id,image_url,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(4);

      if (error) throw error;

      return (data || []).map((image) => ({
        ...image,
        source: "cloud" as const,
      }));
    },
  });

  const { data: profile } = useQuery({
    queryKey: ["account-profile", user?.id],
    enabled: Boolean(user?.id),
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

  useEffect(() => {
    try {
      const localHistory = JSON.parse(localStorage.getItem("local_image_history") || "[]");
      setLocalImages(
        (localHistory || []).slice(0, 4).map((image: any) => ({
          id: image.id,
          image_url: image.image_url,
          created_at: image.created_at,
          source: "local" as const,
        })),
      );
    } catch (error) {
      console.error("load local image history failed:", error);
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    const loadBalance = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const token = session?.access_token;
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

        const response = await fetch(`${supabaseUrl}/functions/v1/manage-balance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || ""}`,
          },
          body: JSON.stringify({ action: "get" }),
        });

        const data = await response.json();
        if (data?.balance?.balance !== undefined) {
          setBalance(data.balance.balance);
        }
      } catch (error) {
        console.error("load balance failed:", error);
      }
    };

    void loadBalance();
  }, [user]);

  const recentImages = useMemo(() => {
    return [...(cloudImages || []), ...localImages]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 4);
  }, [cloudImages, localImages]);

  const totalImages = (cloudImages?.length || 0) + localImages.length;
  const displayName = profile?.display_name || user?.email?.split("@")[0] || "未设置";
  const email = user?.email || "未绑定邮箱";

  const handleSignOut = async () => {
    if (isSigningOut) return;

    try {
      setIsSigningOut(true);
      await signOut();
      toast.success("已退出登录");
      navigate("/auth", { replace: true });

      window.setTimeout(() => {
        if (window.location.pathname !== "/auth") {
          window.location.replace("/auth");
        }
      }, 120);
    } catch (error) {
      console.error("sign out failed:", error);
      toast.error("退出登录失败，请稍后重试");
      setIsSigningOut(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">账户设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理你的个人资料、图片记录和积分余额。</p>
      </div>

      <div className="mb-6 rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2 text-primary">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-card-foreground">我的图片</h2>
              <p className="text-xs text-muted-foreground">最近生成和本地保存的图片会显示在这里。</p>
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/images")}>
            查看全部
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>

        {recentImages.length > 0 ? (
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
                  alt="最近图片"
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <span
                  className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    image.source === "cloud"
                      ? "bg-blue-500/90 text-white"
                      : "bg-orange-500/90 text-white"
                  }`}
                >
                  {image.source === "cloud" ? "云端" : "本地"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            还没有生成过图片，去工作台开始第一张吧。
          </div>
        )}

        <div className="mt-4 text-xs text-muted-foreground">当前共记录 {totalImages} 张图片</div>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2 text-primary">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-card-foreground">个人资料</h2>
              <p className="text-xs text-muted-foreground">查看当前登录账号和权限信息。</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3 text-sm">
              <span className="text-muted-foreground">姓名</span>
              <span className="font-medium text-card-foreground">{displayName}</span>
            </div>
            <div className="flex items-center justify-between gap-4 border-b border-border pb-3 text-sm">
              <span className="text-muted-foreground">邮箱</span>
              <span className="font-medium text-card-foreground">{email}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">账户角色</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {isAdmin && <Shield className="h-3.5 w-3.5" />}
                {isAdmin ? "管理员" : "普通用户"}
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-2 text-primary">
              <CreditCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold text-card-foreground">我的积分</h2>
              <p className="text-xs text-muted-foreground">高成本生成能力会优先消耗账户积分。</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <div className="text-sm text-muted-foreground">当前余额</div>
            <div className="mt-1 text-3xl font-bold text-foreground">
              {balance ?? 0}
              <span className="ml-2 text-base font-medium text-primary">积分</span>
            </div>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">
              生成图片和图文翻译会消耗积分，余额不足时请先充值后再继续使用。
            </p>
          </div>

          <div className="mt-4 flex gap-3">
            <Button className="flex-1" onClick={() => navigate("/dashboard/recharge")}>
              去充值
            </Button>
            {isAdmin && (
              <Button variant="outline" className="flex-1" onClick={() => navigate("/admin")}>
                进入后台
              </Button>
            )}
          </div>
        </section>
      </div>

      <Button
        variant="outline"
        className="w-full border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
        onClick={handleSignOut}
        disabled={isSigningOut}
      >
        {isSigningOut ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <LogOut className="mr-2 h-4 w-4" />
        )}
        {isSigningOut ? "正在退出..." : "退出登录"}
      </Button>
    </div>
  );
};

export default AccountPage;
