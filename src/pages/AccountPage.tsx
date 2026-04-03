import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, Image as ImageIcon, LogOut, ChevronRight, User } from "lucide-react";
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
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [localImages, setLocalImages] = useState<HistoryImage[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  const { data: cloudImages } = useQuery({
    queryKey: ["my-images", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_images")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(4);

      if (error) throw error;

      return (data || []).map((img) => ({
        ...img,
        source: "cloud" as const,
      })) as HistoryImage[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    try {
      const localHistory = JSON.parse(localStorage.getItem("local_image_history") || "[]");
      setLocalImages(
        localHistory.slice(0, 4).map((img: any) => ({
          ...img,
          source: "local" as const,
        })),
      );
    } catch (error) {
      console.error("加载本地图片记录失败:", error);
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
        console.error("加载余额失败:", error);
      }
    };

    void loadBalance();
  }, [user]);

  const recentImages = [...(cloudImages || []), ...localImages]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 4);

  const totalImages = (cloudImages?.length || 0) + localImages.length;

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user!.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const getUserEmail = () => {
    if (!user) return "未绑定";
    return user.email || "未绑定";
  };

  const getDisplayName = () => {
    if (profile?.display_name) return profile.display_name;
    if (user?.email) return user.email.split("@")[0];
    return "未设置";
  };

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-8">
        <h1 className="mb-1 font-display text-2xl font-bold text-foreground">
          {t("account.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("account.subtitle")}</p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ImageIcon className="h-5 w-5 text-primary" />
            <h2 className="font-display font-semibold text-card-foreground">我的图片</h2>
            {totalImages > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                {totalImages} 张
              </span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/images")}>
            查看全部 <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>

        {recentImages.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {recentImages.map((img) => (
              <div
                key={img.id}
                className="relative aspect-square overflow-hidden rounded-lg bg-muted"
              >
                <img src={img.image_url} alt="" className="h-full w-full object-cover" />
                <div
                  className={`absolute right-1 top-1 rounded px-1.5 py-0.5 text-xs ${
                    img.source === "cloud"
                      ? "bg-blue-500/90 text-white"
                      : "bg-orange-500/90 text-white"
                  }`}
                >
                  {img.source === "cloud" ? "云端" : "本地"}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-muted-foreground">还没有生成过图片</p>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-6 flex items-center gap-3">
          <User className="h-5 w-5 text-primary" />
          <h2 className="font-display font-semibold text-card-foreground">
            {t("account.profile")}
          </h2>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border py-2">
            <span className="text-sm text-muted-foreground">{t("account.name")}</span>
            <span className="text-sm font-medium text-card-foreground">{getDisplayName()}</span>
          </div>
          <div className="flex items-center justify-between border-b border-border py-2">
            <span className="text-sm text-muted-foreground">{t("account.email")}</span>
            <span className="text-sm font-medium text-card-foreground">{getUserEmail()}</span>
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="font-display font-semibold text-card-foreground">我的积分</h2>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-card-foreground">
              当前余额：<span className="font-bold text-purple-600">{balance || 0}</span> 积分
            </p>
            <p className="text-sm text-muted-foreground">
              生成图片和翻译图片会消耗积分，余额不足时将无法继续使用高成本能力。
            </p>
          </div>
          <Button variant="hero" size="sm" onClick={() => navigate("/dashboard/recharge")}>
            去充值
          </Button>
        </div>
      </div>

      <Button
        variant="outline"
        className="w-full text-destructive hover:text-destructive"
        onClick={handleSignOut}
      >
        <LogOut className="mr-2 h-4 w-4" />
        {t("auth.logout")}
      </Button>
    </div>
  );
};

export default AccountPage;
