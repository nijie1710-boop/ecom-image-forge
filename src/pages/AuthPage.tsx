import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { normalizeUserErrorMessage } from "@/lib/error-messages";
import logo from "@/assets/logo.png";

type AuthMode = "login" | "signup";
type AuthMethod = "code" | "password";

const FEATURE_TAGS = ["AI 智能识别", "多模板排版", "一键生成", "批量导出"];

function normalizeAuthError(raw: unknown) {
  return normalizeUserErrorMessage(raw, "系统繁忙，请稍后再试");
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useState<AuthMode>("login");
  const [method, setMethod] = useState<AuthMethod>("code");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [submittingPassword, setSubmittingPassword] = useState(false);

  const pageTitle = useMemo(() => {
    if (mode === "signup") {
      return "注册你的 PicSpark AI 账号";
    }
    return "登录你的 PicSpark AI 账号";
  }, [mode]);

  const pageDescription = useMemo(() => {
    if (method === "code") {
      return mode === "signup"
        ? "输入邮箱后发送验证码，填入验证码即可完成注册并登录。"
        : "输入邮箱后发送验证码，填入验证码即可安全登录。";
    }
    return mode === "signup"
      ? "使用邮箱和密码注册。若后续切换设备，也可改用验证码登录。"
      : "使用邮箱和密码登录。若不想点邮件链接，也可以切换到验证码登录。";
  }, [method, mode]);

  const resetAuthFields = () => {
    setPassword("");
    setOtpCode("");
    setCodeSent(false);
    setSendingCode(false);
    setVerifyingCode(false);
    setSubmittingPassword(false);
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setDisplayName("");
    resetAuthFields();
  };

  const switchMethod = (nextMethod: AuthMethod) => {
    setMethod(nextMethod);
    resetAuthFields();
  };

  const showError = (raw: unknown) => {
    toast({
      title: "错误",
      description: normalizeAuthError(raw),
      variant: "destructive",
    });
  };

  const validateEmail = () => {
    if (!email.trim()) {
      toast({
        title: "请输入邮箱",
        description: "发送验证码或登录前，请先填写邮箱地址。",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleSendCode = async () => {
    if (!validateEmail()) return;

    setSendingCode(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: mode === "signup",
          data: mode === "signup" && displayName.trim() ? { display_name: displayName.trim() } : undefined,
        },
      });

      if (error) throw error;

      setCodeSent(true);
      toast({
        title: "验证码已发送",
        description: "请检查你的邮箱，并输入收到的验证码完成登录。",
      });
    } catch (error) {
      showError(error);
    } finally {
      setSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!validateEmail()) return;

    if (!otpCode.trim()) {
      toast({
        title: "请输入验证码",
        description: "请填写邮箱里收到的验证码。",
        variant: "destructive",
      });
      return;
    }

    setVerifyingCode(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: otpCode.trim(),
        type: "email",
      });

      if (error) throw error;

      toast({
        title: mode === "signup" ? "注册成功" : "登录成功",
        description: "正在进入工作台。",
      });
      navigate("/dashboard");
    } catch (error) {
      showError(error);
    } finally {
      setVerifyingCode(false);
    }
  };

  const handlePasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateEmail()) return;

    setSubmittingPassword(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: displayName.trim() ? { display_name: displayName.trim() } : undefined,
          },
        });

        if (error) throw error;

        if (!data.session) {
          toast({
            title: "注册成功",
            description: "账号已创建成功，你现在可以直接使用邮箱密码登录。",
          });
        }
      }

      toast({
        title: mode === "signup" ? "注册成功" : "登录成功",
        description: "正在进入工作台。",
      });
      navigate("/dashboard");
    } catch (error) {
      showError(error);
    } finally {
      setSubmittingPassword(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-background">
      <div className="relative hidden lg:flex lg:w-[52%] flex-col justify-between overflow-hidden bg-gradient-to-br from-[hsl(248,56%,28%)] via-[hsl(242,52%,23%)] to-[hsl(256,58%,18%)] p-10 text-white">
        <div className="absolute -top-28 -left-20 h-80 w-80 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-violet-500/15 blur-[100px]" />

        <div className="relative z-10 flex items-center gap-3">
          <img src={logo} alt="PicSpark AI" className="h-10 w-10 rounded-xl" />
          <span className="text-xl font-bold tracking-tight">PicSpark AI</span>
        </div>

        <div className="relative z-10 flex-1 max-w-md flex flex-col justify-center">
          <h1 className="text-4xl font-extrabold leading-tight mb-4 tracking-tight">
            AI 点燃商品图片创意
          </h1>
          <p className="text-base leading-relaxed text-white/75 mb-8">
            上传一张商品图，即刻生成电商主图、买家秀、场景图等多种素材，让 AI 成为你的专属摄影师与设计师。
          </p>
          <div className="flex flex-wrap gap-2">
            {FEATURE_TAGS.map((feature) => (
              <span
                key={feature}
                className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur-sm"
              >
                {feature}
              </span>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-xs text-white/40">
          © 2026 PicSpark AI · AI-powered e-commerce visual generation platform
        </p>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-between p-4">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </button>
          <div className="flex items-center gap-1">
            <ThemeSwitcher />
            <LanguageSwitcher variant="hero" />
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex flex-col items-center lg:mb-10">
              <div className="mb-3 flex items-center gap-2 lg:hidden">
                <img src={logo} alt="PicSpark AI" className="h-9 w-9 rounded-xl" />
                <span className="text-xl font-bold text-foreground">PicSpark AI</span>
              </div>

              <h2 className="text-center text-2xl font-bold text-foreground">{pageTitle}</h2>
              <p className="mt-2 text-center text-sm text-muted-foreground">{pageDescription}</p>
            </div>

            <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => switchMode("login")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  mode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                登录
              </button>
              <button
                type="button"
                onClick={() => switchMode("signup")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  mode === "signup" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                注册
              </button>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-border/70 bg-muted/20 p-1">
              <button
                type="button"
                onClick={() => switchMethod("code")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  method === "code"
                    ? "bg-gradient-to-r from-primary to-violet-600 text-white shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                邮箱验证码
              </button>
              <button
                type="button"
                onClick={() => switchMethod("password")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  method === "password" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                邮箱密码
              </button>
            </div>

            <div className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    昵称
                  </label>
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="请输入昵称（可选）"
                    className="h-11"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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

              {method === "code" ? (
                <>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Mail className="h-4 w-4 text-primary" />
                      邮箱验证码登录 / 注册
                    </div>
                    <p className="mt-2 leading-relaxed">
                      发送验证码后，直接输入验证码即可完成登录或注册，不再依赖点击邮件里的跳转链接。
                    </p>
                  </div>

                  <Button
                    type="button"
                    className="h-11 w-full bg-gradient-to-r from-primary to-violet-600 font-semibold text-white hover:opacity-90"
                    disabled={sendingCode}
                    onClick={handleSendCode}
                  >
                    {sendingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : codeSent ? "重新发送验证码" : "发送验证码"}
                  </Button>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      邮箱验证码
                    </label>
                    <Input
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      placeholder="请输入 6 位验证码"
                      className="h-11"
                    />
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full font-medium"
                    disabled={verifyingCode || !codeSent}
                    onClick={handleVerifyCode}
                  >
                    {verifyingCode ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signup" ? "验证并注册" : "验证并登录"}
                  </Button>
                </>
              ) : (
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      密码
                    </label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "至少 6 位密码" : "请输入密码"}
                      required
                      minLength={6}
                      className="h-11"
                    />
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      邮箱密码登录
                    </div>
                    <p className="mt-2 leading-relaxed">
                      如果你更习惯传统方式，也可以继续使用邮箱密码登录。后续仍可切换回验证码模式。
                    </p>
                  </div>

                  <Button
                    type="submit"
                    className="h-11 w-full bg-gradient-to-r from-primary to-violet-600 font-semibold text-white hover:opacity-90"
                    disabled={submittingPassword}
                  >
                    {submittingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signup" ? "注册并登录" : "登录"}
                  </Button>
                </form>
              )}

              <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 p-4 text-xs leading-relaxed text-muted-foreground">
                Google 登录当前未启用。若你在手机或微信内打开页面，建议优先使用邮箱验证码登录。
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
