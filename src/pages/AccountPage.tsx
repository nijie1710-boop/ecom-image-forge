import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Coins, Image as ImageIcon, Loader2, LogOut, Shield, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeUserErrorMessage } from "@/lib/error-messages";

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
  recharge_count: number;
  consumption_count: number;
};

const EMPTY_BALANCE: BalanceInfo = {
  balance: 0,
  total_recharged: 0,
  total_consumed: 0,
  recharge_count: 0,
  consumption_count: 0,
};

async function loadBalanceFallback(userId: string): Promise<BalanceInfo> {
  const [balanceResp, rechargeResp, consumptionResp] = await Promise.all([
    supabase.from("user_balances").select("balance,total_recharged,total_consumed").eq("user_id", userId).maybeSingle(),
    supabase.from("recharge_records").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("consumption_records").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  if (balanceResp.error) throw balanceResp.error;
  if (rechargeResp.error) throw rechargeResp.error;
  if (consumptionResp.error) throw consumptionResp.error;

  return {
    balance: Number(balanceResp.data?.balance || 0),
    total_recharged: Number(balanceResp.data?.total_recharged || 0),
    total_consumed: Number(balanceResp.data?.total_consumed || 0),
    recharge_count: Number(rechargeResp.count || 0),
    consumption_count: Number(consumptionResp.count || 0),
  };
}

async function loadCloudImages(userId: string): Promise<HistoryImage[]> {
  const { data, error } = await supabase
    .from("generated_images")
    .select("id,image_url,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) throw error;

  return (data || []).map((item) => ({
    ...item,
    source: "cloud" as const,
  }));
}

async function loadProfileDisplayName(userId: string): Promise<string> {
  const { data, error } = await supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();

  if (!error) return data?.display_name || "";

  const message = String(error.message || "");
  const isMissingProfilesTable = error.code === "42P01" || /profiles/i.test(message) || /not found/i.test(message);
  if (isMissingProfilesTable) {
    console.warn("profiles table is unavailable; using auth user metadata as account display fallback:", {
      code: error.code,
      message,
    });
    return "";
  }

  throw error;
}

async function loadBalanceInfo(userId: string): Promise<BalanceInfo> {
  try {
    const { data, error: invokeError } = await supabase.functions.invoke("manage-balance", { body: { action: "get" } });
    if (invokeError) throw invokeError;
    if (data?.error) throw new Error(String(data.error));
    return { ...EMPTY_BALANCE, ...(data?.balance || {}) } as BalanceInfo;
  } catch (invokeError) {
    console.warn("manage-balance get failed, fallback to direct tables:", invokeError);
    return loadBalanceFallback(userId);
  }
}

function readLocalImages(): HistoryImage[] {
  try {
    const raw = localStorage.getItem("local_image_history") || "[]";
    const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
    return parsed
      .slice(0, 12)
      .map((item) => ({
        id: String(item.id || crypto.randomUUID()),
        image_url: String(item.image_url || ""),
        created_at: String(item.created_at || new Date().toISOString()),
        source: "local" as const,
      }))
      .filter((item) => item.image_url);
  } catch (error) {
    console.error("load local image history failed:", error);
    return [];
  }
}

export default function AccountPage() {
  const navigate = useNavigate();
  const { user, signOut, isAdmin, loading } = useAuth();
  const [cloudImages, setCloudImages] = useState<HistoryImage[]>([]);
  const [localImages, setLocalImages] = useState<HistoryImage[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [balance, setBalance] = useState<BalanceInfo>(EMPTY_BALANCE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const refresh = async () => {
    if (!user?.id) {
      setCloudImages([]);
      setLocalImages(readLocalImages());
      setDisplayName("");
      setBalance(EMPTY_BALANCE);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const local = readLocalImages();
    const [imagesResult, profileResult, balanceResult] = await Promise.allSettled([
      loadCloudImages(user.id),
      loadProfileDisplayName(user.id),
      loadBalanceInfo(user.id),
    ]);

    setLocalImages(local);

    if (imagesResult.status === "fulfilled") {
      setCloudImages(imagesResult.value);
    } else {
      console.error("load account cloud images failed:", imagesResult.reason);
      setCloudImages([]);
    }

    if (profileResult.status === "fulfilled") {
      setDisplayName(profileResult.value);
    } else {
      console.error("load account profile failed:", profileResult.reason);
      setDisplayName("");
    }

    if (balanceResult.status === "fulfilled") {
      setBalance(balanceResult.value);
    } else {
      console.error("load account balance failed:", balanceResult.reason);
      setBalance(EMPTY_BALANCE);
    }

    const blockingFailure =
      imagesResult.status === "rejected" &&
      profileResult.status === "rejected" &&
      balanceResult.status === "rejected";

    if (blockingFailure) {
      setError(normalizeUserErrorMessage(balanceResult.reason, "账户信息加载失败，请稍后再试"));
    } else if (balanceResult.status === "rejected") {
      setError("积分信息暂时加载失败，其他账户信息已正常显示。");
    } else {
      setError(null);
    }

    setIsLoading(false);
    return;

    try {
      const local = readLocalImages();
      const [imagesResp, profileResp, balanceResp] = await Promise.all([
        supabase.from("generated_images").select("id,image_url,created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(8),
        supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
        supabase.functions
          .invoke("manage-balance", { body: { action: "get" } })
          .then(({ data, error: invokeError }) => {
            if (invokeError) throw invokeError;
            if (data?.error) throw new Error(String(data.error));
            return { ...EMPTY_BALANCE, ...(data?.balance || {}) } as BalanceInfo;
          })
          .catch(async (invokeError) => {
            console.warn("manage-balance get failed, fallback to direct tables:", invokeError);
            return loadBalanceFallback(user.id);
          }),
      ]);

      if (imagesResp.error) throw imagesResp.error;
      if (profileResp.error) throw profileResp.error;

      setLocalImages(local);
      setCloudImages(
        (imagesResp.data || []).map((item) => ({
          ...item,
          source: "cloud" as const,
        })),
      );
      setDisplayName(profileResp.data?.display_name || "");
      setBalance(balanceResp);
    } catch (loadError) {
      console.error("load account page failed:", loadError);
      setError(normalizeUserErrorMessage(loadError, "账户信息加载失败，请稍后再试"));
      setLocalImages(readLocalImages());
      setCloudImages([]);
      setBalance(EMPTY_BALANCE);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    void refresh();
  }, [loading, user?.id]);

  const handleSignOut = async () => {
    if (isSigningOut) return;

    try {
      setIsSigningOut(true);
      await signOut();
      toast.success("已退出登录");
      navigate("/auth", { replace: true });
    } catch (signOutError) {
      console.error("sign out failed:", signOutError);
      toast.error("退出登录失败，请稍后再试");
      setIsSigningOut(false);
    }
  };

  const recentImages = useMemo(
    () =>
      [...cloudImages, ...localImages]
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 4),
    [cloudImages, localImages],
  );

  const resolvedDisplayName = displayName || user?.email?.split("@")[0] || "未设置";
  const email = user?.email || "未绑定邮箱";
  const totalImages = cloudImages.length + localImages.length;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">账户设置</h1>
          <p className="mt-1 text-sm text-muted-foreground">查看个人资料、最近图片和积分余额。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void refresh()} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            刷新数据
          </Button>
          <Button variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
            退出登录
          </Button>
        </div>
      </div>

      {error ? (
        <Card className="mb-6 border border-destructive/30 bg-destructive/5 shadow-none">
          <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

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
          {isLoading ? (
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
                  <img src={image.image_url} alt="最近生成的图片" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
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
          <p className="mt-4 text-sm text-muted-foreground">当前共记录 {totalImages} 张图片。</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.9fr]">
        <Card className="rounded-3xl border border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                <User className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">个人资料</CardTitle>
                <CardDescription>查看当前登录账号和权限信息。</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-border bg-background">
              <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm">
                <span className="text-muted-foreground">姓名</span>
                <span className="font-medium text-foreground">{resolvedDisplayName}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border px-4 py-3 text-sm">
                <span className="text-muted-foreground">邮箱</span>
                <span className="font-medium text-foreground">{email}</span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-muted-foreground">账户角色</span>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                    isAdmin ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isAdmin ? <Shield className="mr-1 h-3.5 w-3.5" /> : null}
                  {isAdmin ? "管理员" : "普通用户"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border shadow-sm">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                <Coins className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg">我的积分</CardTitle>
                <CardDescription>高成本生成功能会优先消耗账户积分。</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-sm text-muted-foreground">当前余额</div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-4xl font-bold text-foreground">{balance.balance}</span>
                <span className="pb-1 text-sm font-medium text-primary">积分</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">生成图片和图文翻译会消耗积分，余额不足时请先充值后再继续使用。</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="text-sm text-muted-foreground">累计充值</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{balance.total_recharged}</div>
                <div className="mt-1 text-xs text-muted-foreground">共 {balance.recharge_count} 笔到账记录</div>
              </div>
              <div className="rounded-2xl border border-border bg-muted/20 p-4">
                <div className="text-sm text-muted-foreground">累计消费</div>
                <div className="mt-2 text-2xl font-semibold text-foreground">{balance.total_consumed}</div>
                <div className="mt-1 text-xs text-muted-foreground">共 {balance.consumption_count} 笔消费记录</div>
              </div>
            </div>

            <Button className="w-full" onClick={() => navigate("/dashboard/recharge")}>
              去充值
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
