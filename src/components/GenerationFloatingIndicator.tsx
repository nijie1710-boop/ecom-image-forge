import { useContext, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  StopCircle,
  X,
} from "lucide-react";
import { GenerationContext } from "@/contexts/GenerationContext";
import { errorHintFromMessage, normalizeUserErrorMessage } from "@/lib/error-messages";

function targetPath(kind: "copy" | "image" | "detail") {
  return kind === "detail" ? "/dashboard/detail-design" : "/dashboard/generate";
}

export function GenerationFloatingIndicator() {
  const ctx = useContext(GenerationContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visibleJobs = useMemo(() => {
    if (!ctx) return [];
    return ctx.jobs.filter((job) => !dismissed.has(job.id));
  }, [ctx, dismissed]);

  if (!ctx || !visibleJobs.length) {
    return null;
  }

  const latestJob = visibleJobs[0];
  const normalizedError =
    latestJob.status === "error"
      ? normalizeUserErrorMessage(latestJob.error, "本次任务失败，请稍后重试。")
      : null;
  const errorHint = normalizedError ? errorHintFromMessage(normalizedError) : null;

  const dismiss = (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    if (latestJob.status !== "running") {
      ctx.clearJob(id);
    }
  };

  const handleViewResult = () => {
    const target = targetPath(latestJob.kind);

    if (latestJob.kind === "detail") {
      sessionStorage.setItem("detail-design-focus-results", "1");
    }

    if (location.pathname !== target) {
      navigate(target);
    } else if (latestJob.kind === "detail") {
      document.getElementById("detail-results")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }

    dismiss(latestJob.id);
  };

  const progress = latestJob.total
    ? Math.max(6, Math.min(100, (latestJob.current / latestJob.total) * 100))
    : 0;

  const finishedLabel =
    latestJob.kind === "detail"
      ? `已完成 ${latestJob.results.length} 屏详情图`
      : `已完成 ${latestJob.results.length} 张图片`;

  return (
    <div className="fixed bottom-20 right-4 z-[60] w-full max-w-xs animate-in slide-in-from-bottom-4 duration-300 md:bottom-6">
      <div className="rounded-xl border border-border bg-card p-3.5 shadow-xl backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">
            {latestJob.status === "running" ? (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            ) : latestJob.status === "done" ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <AlertCircle className="h-5 w-5 text-destructive" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium text-foreground">
                {latestJob.status === "running" && latestJob.step}
                {latestJob.status === "done" && finishedLabel}
                {latestJob.status === "error" && "任务失败"}
                {latestJob.status === "canceled" && "任务已取消"}
              </p>
              <button
                onClick={() => dismiss(latestJob.id)}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {latestJob.status === "running" && (
              <>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {latestJob.current}/{latestJob.total}，切换页面不会中断。
                </p>
              </>
            )}

            {normalizedError && (
              <div className="mt-1 text-xs leading-5 text-destructive">
                <div>{normalizedError}</div>
                {errorHint && <div className="mt-1 text-muted-foreground">{errorHint}</div>}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {latestJob.status === "running" ? (
                <button
                  type="button"
                  onClick={() => ctx.cancelJob(latestJob.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 bg-destructive/5 px-2.5 py-1 text-xs font-medium text-destructive transition hover:bg-destructive/10"
                >
                  <StopCircle className="h-3.5 w-3.5" />
                  取消任务
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleViewResult}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <Sparkles className="h-3 w-3" />
                  查看结果
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
