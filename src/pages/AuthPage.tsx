import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { normalizeUserErrorMessage } from "@/lib/error-messages";
import logo from "@/assets/logo.png";

type AuthMode = "login" | "signup" | "forgot";

function isMobileInAppBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return [
    "micromessenger",
    "wechat",
    "weibo",
    "qq/",
    "qqbrowser",
    "alipayclient",
    "dingtalk",
    "feishu",
  ].some((keyword) => ua.includes(keyword));
}

function normalizeAuthProxyError(raw: unknown) {
  const base = normalizeUserErrorMessage(raw);
  if (base === "系统繁忙，请稍后再试") {
    return "认证服务当前不可用，请稍后再试";
  }
  return base;
}

async function postAuthJson(path: string, payload: Record<string, unknown>) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      data?.msg ||
      data?.message ||
      data?.error_description ||
      data?.error ||
      "认证请求失败",
    );
  }
  return data;
}

const AuthPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const showError = (raw: unknown) => {
    toast({
      title: t("auth.error", "错误"),
      description: normalizeAuthProxyError(raw),
      variant: "destructive",
    });
  };

  const handleGoogleLogin = async () => {
    if (isMobileInAppBrowser()) {
      toast({
        title: "当前环境不支持 Google 登录",
        description: "请点击右上角在系统浏览器中打开，或直接使用邮箱密码登录。",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) throw error;
    } catch (error) {
      showError(error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        await postAuthJson("/api/auth/reset-password", {
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        });
        toast({
          title: t("auth.resetSent", "重置邮件已发送"),
          description: t("auth.resetSentDesc", "请检查您的邮箱，点击链接重置密码。"),
        });
        setMode("login");
      } else if (mode === "login") {
        const data = await postAuthJson("/api/auth/login", { email, password });
        if (!data?.access_token || !data?.refresh_token) {
          throw new Error("认证服务当前不可用，请稍后再试");
        }
        const { error } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });
        if (error) throw error;
        navigate("/dashboard");
      } else {
        const data = await postAuthJson("/api/auth/signup", {
          email,
          password,
          displayName,
          emailRedirectTo: window.location.origin,
        });

        if (data?.access_token && data?.refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
          });
          if (error) throw error;
        } else {
          toast({
            title: "注册成功",
            description: "请回到登录页完成登录。",
          });
          setMode("login");
        }
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === "forgot"
      ? t("auth.forgotTitle", "重置密码")
      : mode === "signup"
        ? t("auth.signupSubtitle", "注册你的 PicSpark AI 账号")
        : t("auth.loginSubtitle", "登录你的 PicSpark AI 账号");

  const buttonLabel =
    mode === "forgot"
      ? t("auth.sendResetLink", "发送重置链接")
      : mode === "signup"
        ? t("auth.signup", "注册")
        : t("auth.login", "登录");

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="relative hidden lg:flex lg:w-[52%] flex-col justify-between bg-gradient-to-br from-[hsl(250,60%,28%)] via-[hsl(240,50%,22%)] to-[hsl(260,55%,18%)] text-white p-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-violet-500/15 blur-[100px]" />
        <div className="relative z-10 flex items-center gap-3">
          <img src={logo} alt="PicSpark AI" className="h-10 w-10 rounded-xl" />
          <span className="text-xl font-bold tracking-tight">PicSpark AI</span>
        </div>
        <div className="relative z-10 flex-1 flex flex-col justify-center max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight mb-4 tracking-tight">
            AI 点燃商品图片创意
          </h1>
          <p className="text-white/70 text-base leading-relaxed mb-8">
            上传一张商品图，即刻生成电商主图、买家秀、场景图等多种风格。让 AI 成为你的专属摄影师与设计师。
          </p>
          <div className="flex flex-wrap gap-2">
            {["AI 智能识别", "多模板排版", "一键生成", "批量导出"].map((feature) => (
              <span
                key={feature}
                className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 border border-white/10 backdrop-blur-sm"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-white/40 text-xs">
          © 2026 PicSpark AI · AI-powered e-commerce visual generation platform
        </p>
      </div>

      <div className="flex-1 flex flex-col bg-background">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </button>
          <div className="flex items-center gap-1">
            <ThemeSwitcher />
            <LanguageSwitcher variant="hero" />
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">
            <div className="flex flex-col items-center mb-8 lg:mb-10">
              <div className="lg:hidden flex items-center gap-2 mb-3">
                <img src={logo} alt="PicSpark AI" className="h-9 w-9 rounded-xl" />
                <span className="text-xl font-bold text-foreground">PicSpark AI</span>
              </div>
              <h2 className="text-2xl font-bold text-foreground text-center">{title}</h2>
              {mode === "forgot" ? (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  输入您的注册邮箱，我们将发送密码重置链接。
                </p>
              ) : (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  当前认证服务连接异常，邮箱密码登录可能暂时不可用。
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    昵称
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="请输入昵称"
                    className="h-11"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  邮箱
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="h-11"
                />
              </div>

              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      密码
                    </label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-xs text-primary hover:underline"
                      >
                        忘记密码？
                      </button>
                    )}
                  </div>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    required
                    minLength={6}
                    className="h-11"
                  />
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-11 bg-gradient-to-r from-primary to-violet-600 hover:opacity-90 text-white font-semibold"
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : buttonLabel}
              </Button>

              {mode !== "forgot" && (
                <>
                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">或</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 font-medium"
                    onClick={handleGoogleLogin}
                  >
                    <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    Google
                  </Button>
                </>
              )}

              {mode === "forgot" ? (
                <p className="text-center text-sm text-muted-foreground pt-2">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-primary hover:underline font-medium"
                  >
                    返回登录
                  </button>
                </p>
              ) : (
                <p className="text-center text-sm text-muted-foreground pt-2">
                  {mode === "login" ? "还没有账号？" : "已经有账号？"}{" "}
                  <button
                    type="button"
                    onClick={() => setMode(mode === "login" ? "signup" : "login")}
                    className="text-primary hover:underline font-medium"
                  >
                    {mode === "login" ? "注册" : "登录"}
                  </button>
                </p>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
