import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { User, CreditCard, LogOut, Image as ImageIcon, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const AccountPage = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [localImages, setLocalImages] = useState<any[]>([]);
  const [balance, setBalance] = useState<number | null>(null);

  // 获取云端图片
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
      return (data || []).map(img => ({ ...img, source: 'cloud' as const }));
    },
    enabled: !!user,
  });

  // 加载本地图片（显示最新4张）
  useEffect(() => {
    try {
      const localHistory = JSON.parse(localStorage.getItem('local_image_history') || '[]');
      setLocalImages(localHistory.slice(0, 4).map((img: any) => ({ ...img, source: 'local' as const })));
    } catch (e) {
      console.error('加载本地历史记录失败:', e);
    }
  }, []);

  // 加载余额
  useEffect(() => {
    if (!user) return;
    const loadBalance = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-balance`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || ""}`,
          },
          body: JSON.stringify({ action: "get" }),
        });
        const data = await response.json();
        console.log("[余额调试] response.ok:", response.ok, "data:", data);
        if (data?.balance?.balance !== undefined) {
          setBalance(data.balance.balance);
        }
      } catch (e) {
        console.error("[余额调试] 异常:", e);
      }
    };
    loadBalance();
  }, [user]);

  // 合并图片（最新4张）
  const recentImages = [...(cloudImages || []), ...localImages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ).slice(0, 4);

  const totalImages = (cloudImages?.length || 0) + localImages.length;

  // 查询用户资料
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

  // 兼容处理 user?.email
  const getUserEmail = () => {
    if (!user) return "未绑定";
    return user.email || "未绑定";
  };

  const getDisplayName = () => {
    if (profile && profile.display_name) return profile.display_name;
    if (user && user.email) return user.email.split('@')[0];
    return "未设置";
  };

  // ========== 诊断信息（部署排查用）==========
  const BUILD_TAG = "diag-2026-03-28-01";
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "未设置";
  const PROJECT_REF = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || "解析失败";
  const ORIGIN = typeof window !== "undefined" ? window.location.origin : "N/A";

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* 诊断信息卡片（临时排查用） */}
      <div style={{ background: "#1a1a2e", color: "#00ff88", padding: "12px 16px", borderRadius: "8px", fontFamily: "monospace", fontSize: "13px", marginBottom: "16px" }}>
        <div style={{ fontWeight: "bold", marginBottom: "6px", color: "#ff6b6b" }}>🔍 部署诊断信息</div>
        <div>Build Tag : {BUILD_TAG}</div>
        <div>Supabase URL : {SUPABASE_URL}</div>
        <div>Project Ref : {PROJECT_REF}</div>
        <div>Origin : {ORIGIN}</div>
      </div>

      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-foreground mb-1">{t("account.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("account.subtitle")}</p>
      </div>

      {/* 我的图片入口 - 展示缩略图*/}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <ImageIcon className="h-5 w-5 text-primary" />
            <h2 className="font-display font-semibold text-card-foreground">我的图片</h2>
            {totalImages > 0 && (
              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{totalImages}张</span>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/images')}>
            查看全部 <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        
        {recentImages.length > 0 ? (
          <div className="grid grid-cols-4 gap-2">
            {recentImages.map((img) => (
              <div key={img.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                <img src={img.image_url} alt="" className="w-full h-full object-cover" />
                <div className={`absolute top-1 right-1 text-xs px-1.5 py-0.5 rounded ${
                  img.source === 'cloud' ? 'bg-blue-500/90 text-white' : 'bg-orange-500/90 text-white'
                }`}>
                  {img.source === 'cloud' ? '☁️' : '📱'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">还没有生成过图片</p>
        )}
      </div>

      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="h-5 w-5 text-primary" />
          <h2 className="font-display font-semibold text-card-foreground">{t("account.profile")}</h2>
        </div>
        <div className="space-y-4">
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">{t("account.name")}</span>
            <span className="text-sm text-card-foreground font-medium">{getDisplayName()}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-border">
            <span className="text-sm text-muted-foreground">{t("account.email")}</span>
            <span className="text-sm text-card-foreground font-medium">{getUserEmail()}</span>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="font-display font-semibold text-card-foreground">我的积分</h2>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-card-foreground">当前余额：<span className="text-purple-600 font-bold">{balance || 0}</span> 积分</p>
            <p className="text-sm text-muted-foreground">生成图片消耗积分，余额不足将无法生成</p>
          </div>
          <Button variant="hero" size="sm" onClick={() => navigate('/dashboard/recharge')}>去充值</Button>
        </div>
      </div>

      <Button variant="outline" className="w-full text-destructive hover:text-destructive" onClick={handleSignOut}>
        <LogOut className="h-4 w-4 mr-2" />
        {t("auth.logout")}
      </Button>
    </div>
  );
};

export default AccountPage;
