import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clipboard,
  ExternalLink,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { callAdminApi, type AdminTask } from "@/lib/admin-api";

const TASK_FILTERS = [
  { value: "all", label: "全部" },
  { value: "generate_image", label: "AI 生图" },
  { value: "generate_copy", label: "AI 详情页" },
  { value: "translate_image", label: "图文翻译" },
  { value: "manual_adjustment", label: "手动调整" },
] as const;

const STATUS_FILTERS = [
  { value: "all", label: "全部状态" },
  { value: "completed", label: "已消耗" },
  { value: "refunded", label: "已退款" },
  { value: "credited", label: "已补充" },
  { value: "recorded", label: "已记录" },
] as const;

const TASK_TYPE_LABELS: Record<string, string> = {
  generate_image: "AI 生图",
  generate_copy: "AI 详情页",
  translate_image: "图文翻译",
  manual_adjustment: "手动调整",
  unknown: "其他任务",
};

const STATUS_META: Record<
  string,
  { label: string; className: string; summary: string }
> = {
  completed: {
    label: "已消耗",
    className: "bg-emerald-500/10 text-emerald-700",
    summary: "这条记录已经成功写入消费流水。",
  },
  refunded: {
    label: "已退款",
    className: "bg-amber-500/10 text-amber-700",
    summary: "这条任务已经完成退款或冲销处理。",
  },
  credited: {
    label: "已补充",
    className: "bg-sky-500/10 text-sky-700",
    summary: "这条记录来自人工补积分或系统补偿。",
  },
  recorded: {
    label: "已记录",
    className: "bg-muted text-muted-foreground",
    summary: "这条任务已记录，但当前没有更细的执行状态。",
  },
};

const ADMIN_GENERATE_RETRY_DRAFT_KEY = "admin-generate-retry-draft";

function normalizeTaskType(task: AdminTask) {
  return TASK_TYPE_LABELS[task.operation_type] || task.task_type || "其他任务";
}

function normalizeTaskStatus(task: AdminTask) {
  if (task.operation_type === "manual_adjustment" && (task.description || "").includes("退款")) {
    return "refunded";
  }
  if ((task.amount || 0) < 0) return "completed";
  if ((task.amount || 0) > 0) return "credited";
  return "recorded";
}

function getRetryPath(task: AdminTask) {
  switch (task.operation_type) {
    case "generate_image":
      return "/dashboard/generate";
    case "generate_copy":
      return "/dashboard/detail-design";
    case "translate_image":
      return "/dashboard/translate";
    default:
      return null;
  }
}

function buildTaskSummary(task: AdminTask) {
  return [
    `任务类型：${normalizeTaskType(task)}`,
    `状态：${STATUS_META[normalizeTaskStatus(task)]?.label || "已记录"}`,
    `用户邮箱：${task.email}`,
    `用户 ID：${task.user_id}`,
    `积分变动：${task.amount > 0 ? `+${task.amount}` : task.amount}`,
    `描述：${task.description || "无"}`,
    `时间：${task.created_at ? new Date(task.created_at).toLocaleString() : "-"}`,
  ].join("\n");
}

async function toDataUrlFromRemoteImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("重试草稿准备失败，无法读取参考图片。");
  }
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("重试草稿准备失败，图片转换异常。"));
    reader.readAsDataURL(blob);
  });
}

const AdminTasksPage = () => {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<(typeof TASK_FILTERS)[number]["value"]>("all");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]["value"]>("all");
  const [selectedTask, setSelectedTask] = useState<AdminTask | null>(null);
  const [retryingTaskId, setRetryingTaskId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-tasks"],
    queryFn: () => callAdminApi({ action: "list_tasks" }),
  });

  const tasks = useMemo(() => (data?.tasks || []) as AdminTask[], [data]);

  const filteredTasks = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return tasks.filter((task) => {
      const matchesFilter = filter === "all" ? true : task.operation_type === filter;
      const matchesStatus = statusFilter === "all" ? true : normalizeTaskStatus(task) === statusFilter;
      const matchesKeyword =
        !normalizedKeyword ||
        task.email?.toLowerCase().includes(normalizedKeyword) ||
        task.user_id.toLowerCase().includes(normalizedKeyword) ||
        task.description?.toLowerCase().includes(normalizedKeyword);

      return matchesFilter && matchesStatus && matchesKeyword;
    });
  }, [tasks, filter, statusFilter, keyword]);

  const totalCredits = filteredTasks.reduce((sum, task) => sum + Math.abs(Number(task.credits || 0)), 0);
  const latestTaskType = filteredTasks[0] ? normalizeTaskType(filteredTasks[0]) : "暂无记录";
  const completedCount = filteredTasks.filter((task) => normalizeTaskStatus(task) === "completed").length;
  const refundedCount = filteredTasks.filter((task) => normalizeTaskStatus(task) === "refunded").length;
  const creditedCount = filteredTasks.filter((task) => normalizeTaskStatus(task) === "credited").length;

  const handleCopySummary = async (task: AdminTask) => {
    try {
      await navigator.clipboard.writeText(buildTaskSummary(task));
      toast.success("任务摘要已复制，可以直接发给运营或技术排查。");
    } catch {
      toast.error("复制失败，请稍后再试。");
    }
  };

  const handleOpenRetry = (task: AdminTask) => {
    const retryPath = getRetryPath(task);
    if (!retryPath) return;
    void handleCopySummary(task);
    navigate(retryPath);
    toast.success("已复制任务摘要，并跳转到对应工具页。");
  };

  const handleCreateRetryDraft = async (task: AdminTask) => {
    if (!task.retry_supported || !task.retry_image_url) {
      toast.error("当前这条任务还没有可直接重建的重试素材。");
      return;
    }

    setRetryingTaskId(task.id);
    try {
      const uploadedImage = await toDataUrlFromRemoteImage(task.retry_image_url);
      sessionStorage.setItem(
        ADMIN_GENERATE_RETRY_DRAFT_KEY,
        JSON.stringify({
          uploadedImages: [uploadedImage],
          productBrief: task.description || "",
          textPrompt: task.retry_scene || task.retry_prompt || "",
          styleReferenceText: task.retry_style || "",
          imageType: task.retry_image_type || "主图",
          selectedRatio: task.retry_aspect_ratio || "3:4",
          textLanguage: "zh",
        }),
      );
      navigate("/dashboard/generate");
      toast.success("已创建后台重试草稿，并带你回到 AI 生图页。");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建重试草稿失败");
    } finally {
      setRetryingTaskId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <ListChecks className="h-3.5 w-3.5" />
              任务管理
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-foreground">后台任务列表</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              先用消费流水汇总最近任务，快速判断用户最近做了什么、什么时候做的、消耗了多少积分。需要时可以点开详情并快速回到对应工具重新发起。
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative min-w-[220px] max-w-[320px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索邮箱、用户 ID 或任务描述"
                className="pl-9"
              />
            </div>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={() => refetch()}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              刷新
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">当前任务数</div>
          <div className="mt-3 text-2xl font-semibold text-foreground">{filteredTasks.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">最近 200 条消费记录范围内</div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">当前筛选消耗</div>
          <div className="mt-3 text-2xl font-semibold text-primary">{totalCredits}</div>
          <div className="mt-1 text-xs text-muted-foreground">按当前筛选条件汇总积分变动</div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">最近任务类型</div>
          <div className="mt-3 text-lg font-semibold text-foreground">{latestTaskType}</div>
          <div className="mt-1 text-xs text-muted-foreground">有助于快速判断最近的用户动作</div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-semibold text-foreground">任务类型筛选</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {TASK_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  filter === item.value
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="mt-4 text-sm font-semibold text-foreground">记录状态筛选</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setStatusFilter(item.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  statusFilter === item.value
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-semibold text-foreground">状态汇总</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { label: "已消耗", value: completedCount },
              { label: "已退款", value: refundedCount },
              { label: "已补充", value: creditedCount },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border bg-background p-4">
                <div className="text-xs text-muted-foreground">{item.label}</div>
                <div className="mt-2 text-xl font-semibold text-foreground">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="text-lg font-semibold text-foreground">最近任务</div>
          <div className="mt-1 text-sm text-muted-foreground">优先展示最近 200 条消费记录。</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">用户</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">任务类型</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">状态</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">积分变动</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">描述</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">时间</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    正在加载任务记录...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-destructive">
                    {(error as Error).message}
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    暂无匹配任务
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const normalizedStatus = normalizeTaskStatus(task);
                  const statusMeta = STATUS_META[normalizedStatus] || STATUS_META.recorded;
                  const retryPath = getRetryPath(task);

                  return (
                    <tr key={task.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-4">
                        <div className="text-sm text-foreground">{task.email}</div>
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground">{task.user_id}</div>
                      </td>
                      <td className="px-5 py-4 text-sm text-foreground">{normalizeTaskType(task)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right text-sm font-medium text-primary">
                        {task.amount > 0 ? `+${task.amount}` : task.amount}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{task.description || "-"}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {task.created_at ? new Date(task.created_at).toLocaleString() : "-"}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setSelectedTask(task)}>
                            查看详情
                          </Button>
                          {task.retry_supported && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void handleCreateRetryDraft(task)}
                              disabled={retryingTaskId === task.id}
                              className="gap-1"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              {retryingTaskId === task.id ? "准备中..." : "后台重试"}
                            </Button>
                          )}
                          {retryPath && (
                            <Button size="sm" onClick={() => handleOpenRetry(task)} className="gap-1">
                              <ExternalLink className="h-3.5 w-3.5" />
                              前往工具
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <div className="text-sm font-semibold text-foreground">当前阶段说明</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              这版后台任务仍然是基于消费流水来汇总，所以已经支持查看详情、复制任务摘要和快速回到对应工具重新发起，
              但还不是“真正的任务调度队列”。后面如果你愿意，我们可以继续补独立任务表、失败原因和一键重试。
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="max-w-2xl">
          {selectedTask && (
            <>
              <DialogHeader>
                <DialogTitle>任务详情</DialogTitle>
                <DialogDescription>
                  先核对这条任务的用户、时间、积分和描述，再决定是否需要回到对应工具重新发起。
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-xs text-muted-foreground">用户邮箱</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{selectedTask.email}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-xs text-muted-foreground">任务类型</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{normalizeTaskType(selectedTask)}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-xs text-muted-foreground">状态</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {STATUS_META[normalizeTaskStatus(selectedTask)]?.label || "已记录"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="text-xs text-muted-foreground">积分变动</div>
                  <div className="mt-1 text-sm font-medium text-foreground">
                    {selectedTask.amount > 0 ? `+${selectedTask.amount}` : selectedTask.amount}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4 md:col-span-2">
                  <div className="text-xs text-muted-foreground">用户 ID</div>
                  <div className="mt-1 break-all font-mono text-xs text-foreground">{selectedTask.user_id}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4 md:col-span-2">
                  <div className="text-xs text-muted-foreground">任务描述</div>
                  <div className="mt-1 text-sm leading-6 text-foreground">{selectedTask.description || "无"}</div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4 md:col-span-2">
                  <div className="text-xs text-muted-foreground">当前说明</div>
                  <div className="mt-1 text-sm leading-6 text-foreground">
                    {STATUS_META[normalizeTaskStatus(selectedTask)]?.summary || "这条任务当前只有基础记录。"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4 md:col-span-2">
                  <div className="text-xs text-muted-foreground">重试能力</div>
                  <div className="mt-1 text-sm leading-6 text-foreground">
                    {selectedTask.retry_supported
                      ? "当前支持后台重试：会基于这条任务关联的结果图自动创建 AI 生图草稿，并直接带回工具页。"
                      : "当前没有足够的原始素材可在后台直接重建，因此仍建议先复制摘要，再回到对应工具重新发起。"}
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4 md:col-span-2">
                  <div className="text-xs text-muted-foreground">创建时间</div>
                  <div className="mt-1 text-sm text-foreground">
                    {selectedTask.created_at ? new Date(selectedTask.created_at).toLocaleString() : "-"}
                  </div>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <div className="text-xs text-muted-foreground">
                  当前“重试”会先复制任务摘要，再回到对应工具重新发起，不会直接在后台重跑旧任务。
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void handleCopySummary(selectedTask)}>
                    <Clipboard className="mr-2 h-4 w-4" />
                    复制摘要
                  </Button>
                  {selectedTask.retry_supported && (
                    <Button
                      variant="outline"
                      onClick={() => void handleCreateRetryDraft(selectedTask)}
                      disabled={retryingTaskId === selectedTask.id}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      {retryingTaskId === selectedTask.id ? "准备重试..." : "后台重试"}
                    </Button>
                  )}
                  {getRetryPath(selectedTask) && (
                    <Button onClick={() => handleOpenRetry(selectedTask)}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      前往工具重试
                    </Button>
                  )}
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTasksPage;
