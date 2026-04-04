import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, RefreshCw, Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { callAdminApi, type AdminTask } from "@/lib/admin-api";

const FILTERS = ["全部", "AI 生图", "AI 详情页", "图文翻译", "手动调整"] as const;

const statusClassMap: Record<string, string> = {
  已完成: "bg-emerald-500/10 text-emerald-600",
  已退款: "bg-amber-500/10 text-amber-600",
  已补发: "bg-sky-500/10 text-sky-600",
  已记录: "bg-muted text-muted-foreground",
};

const AdminTasksPage = () => {
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("全部");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-tasks"],
    queryFn: () => callAdminApi({ action: "list_tasks" }),
  });

  const tasks = (data?.tasks || []) as AdminTask[];

  const filteredTasks = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return tasks.filter((task) => {
      const filterMatched = filter === "全部" ? true : task.task_type === filter;
      const keywordMatched =
        !normalizedKeyword ||
        task.email?.toLowerCase().includes(normalizedKeyword) ||
        task.user_id.toLowerCase().includes(normalizedKeyword) ||
        task.description?.toLowerCase().includes(normalizedKeyword);

      return filterMatched && keywordMatched;
    });
  }, [tasks, filter, keyword]);

  const totalCredits = filteredTasks.reduce((sum, task) => sum + Number(task.credits || 0), 0);

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
              第一版先基于积分消费记录汇总最近任务，方便你排查用户最近做了什么、什么时候做的、消耗了多少积分。
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
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">当前筛选消耗</div>
          <div className="mt-3 text-2xl font-semibold text-primary">{totalCredits}</div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm text-muted-foreground">最近任务类型</div>
          <div className="mt-3 text-lg font-semibold text-foreground">
            {filteredTasks[0]?.task_type || "暂无记录"}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`rounded-full border px-3 py-1.5 text-sm transition ${
                filter === item
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="text-lg font-semibold text-foreground">最近任务</div>
          <div className="mt-1 text-sm text-muted-foreground">优先展示最近 200 条消费记录。</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">用户</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">任务类型</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">状态</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">积分变动</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">描述</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">时间</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    正在加载任务记录...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-destructive">
                    {(error as Error).message}
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    暂无匹配任务
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => (
                  <tr key={task.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-4">
                      <div className="text-sm text-foreground">{task.email}</div>
                      <div className="mt-1 font-mono text-[11px] text-muted-foreground">{task.user_id}</div>
                    </td>
                    <td className="px-5 py-4 text-sm text-foreground">{task.task_type}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          statusClassMap[task.status] || "bg-muted text-muted-foreground"
                        }`}
                      >
                        {task.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-sm font-medium text-primary">
                      {task.amount > 0 ? `+${task.amount}` : task.amount}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{task.description || "-"}</td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {task.created_at ? new Date(task.created_at).toLocaleString() : "-"}
                    </td>
                  </tr>
                ))
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
            <div className="text-sm font-semibold text-foreground">第一版说明</div>
            <div className="mt-1 text-sm leading-6 text-muted-foreground">
              当前任务管理先基于消费记录汇总展示，适合先排查用户最近做了哪些生成与翻译操作。后面如果你愿意，我可以继续给你补真正的任务表、失败重试和任务详情。
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminTasksPage;
