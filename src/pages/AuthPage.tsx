import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import logo from "@/assets/logo.png";

type AuthMode = "login" | "signup" | "forgot";

const AuthPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast({
          title: t("auth.resetSent", "重置邮件已发送"),
          description: t("auth.resetSentDesc", "请检查您的邮箱，点击链接重置密码。"),
        });
        setMode("login");
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/dashboard");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw loginError;
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({
        title: t("auth.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    if (mode === "forgot") return t("auth.forgotTitle", "重置密码");
    if (mode === "signup") return t("auth.signupSubtitle");
    return t("auth.loginSubtitle");
  };

  const getButtonLabel = () => {
    if (mode === "forgot") return t("auth.sendResetLink", "发送重置链接");
    if (mode === "signup") return t("auth.signup");
    return t("auth.login");
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ---- Left: Brand Cover ---- */}
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
            上传一张商品图，即刻生成电商主图、买家秀、场景图等多种风格。
            让 AI 成为你的专属摄影师与设计师。
          </p>
          <div className="flex flex-wrap gap-2">
            {["AI 智能识别", "多模板排版", "一键生成", "批量导出"].map((f) => (
              <span key={f} className="px-3 py-1 rounded-full text-xs font-medium bg-white/10 border border-white/10 backdrop-blur-sm">
                {f}
              </span>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-white/40 text-xs">
          © 2026 PicSpark AI · AI-powered e-commerce visual generation platform
        </p>
      </div>

      {/* ---- Right: Auth Form ---- */}
      <div className="flex-1 flex flex-col bg-background">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("nav.features", "返回首页")}
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
              <h2 className="text-2xl font-bold text-foreground text-center">{getTitle()}</h2>
              {mode === "forgot" && (
                <p className="text-sm text-muted-foreground mt-2 text-center">
                  {t("auth.forgotDesc", "输入您的注册邮箱，我们将发送密码重置链接。")}
                </p>
              )}
              {mode !== "forgot" && (
                <p className="text-sm text-muted-foreground mt-1 lg:hidden text-center">
                  AI 点燃商品图片创意
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {t("auth.displayName")}
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t("auth.displayNamePlaceholder")}
                    className="h-11"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("auth.email")}
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
                      {t("auth.password")}
                    </label>
                    {mode === "login" && (
                      <button
                        type="button"
                        onClick={() => setMode("forgot")}
                        className="text-xs text-primary hover:underline"
                      >
                        {t("auth.forgotPassword", "忘记密码？")}
                      </button>
                    )}
                  </div>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : getButtonLabel()}
              </Button>

              {mode !== "forgot" && (
                <>
                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        {t("auth.orContinueWith", "或")}
                      </span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 font-medium"
                    onClick={async () => {
                      const { error } = await lovable.auth.signInWithOAuth("google", {
                        redirect_uri: window.location.origin,
                      });
                      if (error) {
                        toast({
                          title: t("auth.error"),
                          description: error.message,
                          variant: "destructive",
                        });
                      }
                    }}
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
                    {t("auth.backToLogin", "返回登录")}
                  </button>
                </p>
              ) : (
                <p className="text-center text-sm text-muted-foreground pt-2">
                  {mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
                  <button
                    type="button"
                    onClick={() => setMode(mode === "login" ? "signup" : "login")}
                    className="text-primary hover:underline font-medium"
                  >
                    {mode === "login" ? t("auth.signup") : t("auth.login")}
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
