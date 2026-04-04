import { Navigate } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, adminLoading } = useAuth();

  if (loading || adminLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-xl font-semibold text-foreground">无权访问后台</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            当前账号没有管理员权限，无法进入管理后台。
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
