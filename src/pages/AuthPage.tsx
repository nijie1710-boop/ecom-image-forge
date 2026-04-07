import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { normalizeUserErrorMessage } from "@/lib/error-messages";
import logo from "@/assets/logo.png";

type AuthMode = "login" | "signup" | "reset";

const FEATURE_TAGS = ["AI 智能识别", "多模板排版", "一键生成", "批量导出"];
const OTP_LENGTH = 8;
const OTP_COOLDOWN_SECONDS = 90;

function normalizeAuthError(raw: unknown) {
  const fallback = "系统繁忙，请稍后再试";
  const base = normalizeUserErrorMessage(raw, fallback);
  const rawText =
    typeof raw === "string"
      ? raw
      : raw instanceof Error
        ? raw.message
        : raw && typeof raw === "object"
          ? [raw.message, raw.error, raw.msg, raw.error_code]
              .filter((value): value is string => typeof value === "string")
              .join(" ")
          : "";
  const lower = rawText.toLowerCase();

  if (lower.includes("over_email_send_rate_limit") || lower.includes("email rate limit exceeded")) {
    return "验证码发送过于频繁，请 60 秒后再试";
  }

  if (lower.includes("invalid otp") || lower.includes("otp_expired") || lower.includes("token has expired")) {
    return "验证码有误或已过期，请重新发送最新验证码";
  }

  if (lower.includes("invalid login credentials")) {
    return "邮箱或密码不正确";
  }

  if (lower.includes("email not confirmed")) {
    return "账号尚未完成验证，请先完成注册或使用验证码注册";
  }

  return base || fallback;
}

async function verifyOtpByEmail(email: string, token: string) {
  const attempts: Array<"email" | "signup"> = ["email", "signup"];
  let lastError: unknown = null;

  for (const type of attempts) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type,
    });

    if (!error) return;
    lastError = error;
  }

  throw lastError ?? new Error("验证码有误或已过期，请重新发送最新验证码");
}

export default function AuthPage() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const normalizedEmail = email.trim().toLowerCase();

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setTimeout(() => setCooldown((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    setOtpCode("");
    setPassword("");
    setConfirmPassword("");
    setCodeSent(false);
    setCooldown(0);
    if (mode !== "signup") {
      setDisplayName("");
    }
  }, [mode, normalizedEmail]);

  const pageTitle = useMemo(() => {
    if (mode === "signup") return "注册你的 PicSpark AI 账号";
    if (mode === "reset") return "找回你的 PicSpark AI 密码";
    return "登录你的 PicSpark AI 账号";
  }, [mode]);

  const pageDescription = useMemo(() => {
    if (mode === "signup") return "邮箱验证码仅用于完成注册验证，验证通过后立即设置密码。";
    if (mode === "reset") return "使用邮箱验证码验证身份找回密码，通过后直接设置新密码。";
    return "默认使用邮箱密码登录，验证码登录不再作为主入口。";
  }, [mode]);

  const resetOtpState = () => {
    setOtpCode("");
    setCodeSent(false);
    setCooldown(0);
  };

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    resetOtpState();
  };

  const showError = (raw: unknown) => {
    toast({
      title: "错误",
      description: normalizeAuthError(raw),
      variant: "destructive",
    });
  };

  const ensureEmail = () => {
    if (!normalizedEmail) {
      toast({
        title: "请输入邮箱",
        description: "请先填写邮箱地址。",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const ensurePassword = (requireConfirm = false) => {
    if (!password.trim()) {
      toast({
        title: "请输入密码",
        description: "请先填写密码。",
        variant: "destructive",
      });
      return false;
    }

    if (password.trim().length < 6) {
      toast({
        title: "密码过短",
        description: "密码至少需要 6 位。",
        variant: "destructive",
      });
      return false;
    }

    if (requireConfirm && password !== confirmPassword) {
      toast({
        title: "两次密码不一致",
        description: "请重新确认密码。",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleSendCode = async () => {
    if (!ensureEmail()) return;

    setSendingCode(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalizedEmail,
        options: {
          shouldCreateUser: mode === "signup",
          data: mode === "signup" && displayName.trim() ? { display_name: displayName.trim() } : undefined,
        },
      });

      if (error) throw error;

      setCodeSent(true);
      setCooldown(OTP_COOLDOWN_SECONDS);
      toast({
        title: "验证码已发送",
        description:
          mode === "signup"
            ? `请使用邮箱中的最新 ${OTP_LENGTH} 位验证码完成注册。`
            : `请使用邮箱中的最新 ${OTP_LENGTH} 位验证码重置密码。`,
      });
    } catch (error) {
      showError(error);
    } finally {
      setSendingCode(false);
    }
  };

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ensureEmail() || !ensurePassword(false)) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) throw error;

      toast({
        title: "登录成功",
        description: "正在进入工作台。",
      });
      navigate("/dashboard");
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async () => {
    if (!ensureEmail()) return;
    if (!otpCode.trim()) {
      toast({
        title: "请输入验证码",
        description: `请填写邮箱中收到的最新 ${OTP_LENGTH} 位验证码。`,
        variant: "destructive",
      });
      return;
    }
    if (!ensurePassword(true)) return;

    setSubmitting(true);
    try {
      await verifyOtpByEmail(normalizedEmail, otpCode.trim());

      const { error } = await supabase.auth.updateUser({
        password,
        data: displayName.trim() ? { display_name: displayName.trim() } : undefined,
      });

      if (error) throw error;

      toast({
        title: "注册成功",
        description: "正在进入工作台。",
      });
      navigate("/dashboard");
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!ensureEmail()) return;
    if (!otpCode.trim()) {
      toast({
        title: "请输入验证码",
        description: `请填写邮箱中收到的最新 ${OTP_LENGTH} 位验证码。`,
        variant: "destructive",
      });
      return;
    }
    if (!ensurePassword(true)) return;

    setSubmitting(true);
    try {
      await verifyOtpByEmail(normalizedEmail, otpCode.trim());

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut({ scope: "local" });
      toast({
        title: "密码已重置",
        description: "请使用新密码重新登录。",
      });

      setPassword("");
      setConfirmPassword("");
      setOtpCode("");
      setCodeSent(false);
      setCooldown(0);
      setMode("login");
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
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
          <h1 className="text-4xl font-extrabold leading-tight mb-4 tracking-tight">AI 点燃商品图片创意</h1>
          <p className="text-base leading-relaxed text-white/75 mb-8">
            上传一张商品图，即刻生成电商主图、买家秀、场景图等多种风格，让 AI 成为你的专属摄影师与设计师。
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

        <p className="relative z-10 text-xs text-white/40">© 2026 PicSpark AI · AI-powered e-commerce visual generation platform</p>
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

            <div className="mb-6 grid grid-cols-3 gap-2 rounded-2xl border border-border/70 bg-muted/30 p-1">
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
              <button
                type="button"
                onClick={() => switchMode("reset")}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                  mode === "reset" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                找回密码
              </button>
            </div>

            <div className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">昵称</label>
                  <Input
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="请输入昵称（可选）"
                    className="h-11"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">邮箱</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  required
                  className="h-11"
                />
              </div>

              {mode === "login" ? (
                <form onSubmit={handlePasswordLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">密码</label>
                      <button
                        type="button"
                        onClick={() => switchMode("reset")}
                        className="text-xs text-primary hover:underline"
                      >
                        忘记密码？
                      </button>
                    </div>
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="请输入密码"
                      required
                      minLength={6}
                      className="h-11"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="h-11 w-full bg-gradient-to-r from-primary to-violet-600 font-semibold text-white hover:opacity-90"
                    disabled={submitting}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "邮箱登录"}
                  </Button>
                </form>
              ) : (
                <>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Mail className="h-4 w-4 text-primary" />
                      {mode === "signup" ? "邮箱验证码注册" : "邮箱验证码重置密码"}
                    </div>
                    <p className="mt-2 leading-relaxed">
                      当前邮件验证码一般为 {OTP_LENGTH} 位数字。发送后请使用本次邮件中的最新验证码，旧验证码会失效。
                    </p>
                  </div>

                  <Button
                    type="button"
                    className="h-11 w-full bg-gradient-to-r from-primary to-violet-600 font-semibold text-white hover:opacity-90"
                    disabled={sendingCode || cooldown > 0}
                    onClick={handleSendCode}
                  >
                    {sendingCode ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : cooldown > 0 ? (
                      `请等待 ${cooldown}s`
                    ) : (
                      "发送验证码"
                    )}
                  </Button>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">邮箱验证码</label>
                    <Input
                      value={otpCode}
                      onChange={(event) => setOtpCode(event.target.value.replace(/\s+/g, ""))}
                      placeholder={`请输入 ${OTP_LENGTH} 位验证码`}
                      inputMode="numeric"
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {mode === "signup" ? "设置密码" : "新密码"}
                    </label>
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="至少 6 位字符"
                      minLength={6}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">确认密码</label>
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="再次输入密码"
                      minLength={6}
                      className="h-11"
                    />
                  </div>

                  <Button
                    type="button"
                    className="h-11 w-full bg-gradient-to-r from-primary to-violet-600 font-semibold text-white hover:opacity-90"
                    disabled={submitting || !codeSent}
                    onClick={mode === "signup" ? handleSignup : handleResetPassword}
                  >
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "signup" ? "验证并注册" : "验证并重置密码"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
