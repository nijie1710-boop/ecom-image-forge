import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { normalizeUserErrorMessage } from "@/lib/error-messages";

const OTP_TYPES = new Set(["signup", "magiclink", "recovery", "invite", "email_change", "email"]);

export default function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const run = async () => {
      try {
        const code = searchParams.get("code");
        const tokenHash = searchParams.get("token_hash");
        const typeParam = searchParams.get("type") || "";

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          navigate("/dashboard", { replace: true });
          return;
        }

        if (tokenHash && OTP_TYPES.has(typeParam)) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: typeParam as "signup" | "magiclink" | "recovery" | "invite" | "email_change" | "email",
          });
          if (error) throw error;
          navigate(typeParam === "recovery" ? "/auth" : "/dashboard", { replace: true });
          return;
        }

        navigate("/auth", { replace: true });
      } catch (error) {
        toast({
          title: "认证失败",
          description: normalizeUserErrorMessage(error, "当前认证失败，请重新登录或重试。"),
          variant: "destructive",
        });
        navigate("/auth", { replace: true });
      }
    };

    void run();
  }, [navigate, searchParams, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card px-8 py-10 text-center shadow-sm">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <div className="text-lg font-semibold text-foreground">正在处理登录验证</div>
        <p className="max-w-sm text-sm text-muted-foreground">请稍候，系统会自动完成认证并跳转。</p>
      </div>
    </div>
  );
}
