import { GenerationContext } from "@/contexts/GenerationContext";
import { Link } from "react-router-dom";
import { Loader2, CheckCircle2, AlertCircle, X, Sparkles } from "lucide-react";
import { useState, useContext } from "react";

export function GenerationFloatingIndicator() {
  const ctx = useContext(GenerationContext);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  if (!ctx) return null;
  const { jobs, clearJob } = ctx;

  const visibleJobs = jobs.filter(
    (j) => !dismissed.has(j.id) && (j.status === "running" || j.status === "done" || j.status === "error")
  );

  if (visibleJobs.length === 0) return null;

  const latestJob = visibleJobs[0];

  const handleDismiss = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    if (latestJob.status !== "running") clearJob(id);
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 z-[60] max-w-xs w-full animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-card border border-border rounded-xl shadow-xl p-3.5 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          {latestJob.status === "running" && (
            <div className="mt-0.5 flex-shrink-0">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
            </div>
          )}
          {latestJob.status === "done" && (
            <div className="mt-0.5 flex-shrink-0">
              <CheckCircle2 className="h-5 w-5 text-primary" />
            </div>
          )}
          {latestJob.status === "error" && (
            <div className="mt-0.5 flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-foreground truncate">
                {latestJob.status === "running" && `${latestJob.step}...`}
                {latestJob.status === "done" && `已生成 ${latestJob.results.length} 张图片`}
                {latestJob.status === "error" && "生成失败"}
              </p>
              <button
                onClick={() => handleDismiss(latestJob.id)}
                className="flex-shrink-0 p-0.5 rounded hover:bg-muted transition-colors"
              >
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>

            {latestJob.status === "running" && (
              <div className="mt-2">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${Math.max(5, (latestJob.current / latestJob.total) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {latestJob.current}/{latestJob.total} · 切换页面不会中断
                </p>
              </div>
            )}

            {latestJob.status === "done" && (
              <Link
                to="/dashboard/generate"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                onClick={() => handleDismiss(latestJob.id)}
              >
                <Sparkles className="h-3 w-3" />
                查看结果
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
