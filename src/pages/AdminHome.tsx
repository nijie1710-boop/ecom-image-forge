import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CreditCard,
  FolderOpen,
  ImagePlus,
  ListChecks,
  TrendingUp,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { callAdminApi, type AdminImage, type AdminTask, type UserWithBalance } from "@/lib/admin-api";
import { WorkspaceSection, WorkspaceStatGrid } from "@/components/workspace/WorkspaceBlocks";

const AdminHome = () => {
  const usersQuery = useQuery({
    queryKey: ["admin-users-overview"],
    queryFn: () => callAdminApi({ action: "list_users" }),
  });

  const tasksQuery = useQuery({
    queryKey: ["admin-tasks-overview"],
    queryFn: () => callAdminApi({ action: "list_tasks" }),
  });

  const imagesQuery = useQuery({
    queryKey: ["admin-images-overview"],
    queryFn: () => callAdminApi({ action: "list_images" }),
  });

  const users = useMemo(() => (usersQuery.data?.users || []) as UserWithBalance[], [usersQuery.data]);
  const tasks = useMemo(() => (tasksQuery.data?.tasks || []) as AdminTask[], [tasksQuery.data]);
  const images = useMemo(() => (imagesQuery.data?.images || []) as AdminImage[], [imagesQuery.data]);

  const totalBalance = users.reduce((sum, user) => sum + Number(user.balance || 0), 0);
  const totalRecharged = users.reduce((sum, user) => sum + Number(user.total_recharged || 0), 0);
  const totalConsumed = users.reduce((sum, user) => sum + Number(user.total_consumed || 0), 0);
  const activeUsers = users.filter(
    (user) => Number(user.total_recharged || 0) > 0 || Number(user.total_consumed || 0) > 0,
  ).length;
  const lowBalanceUsers = users.filter((user) => Number(user.balance || 0) <= 3).length;
  const todayTaskCount = tasks.filter((task) => {
    const createdAt = task.created_at ? new Date(task.created_at) : null;
    const now = new Date();
    return createdAt ? createdAt.toDateString() === now.toDateString() : false;
  }).length;
  const latestTask = tasks[0];
  const imageCount24h = images.filter((image) => {
    const createdAt = image.created_at ? new Date(image.created_at) : null;
    return createdAt ? Date.now() - createdAt.getTime() <= 24 * 60 * 60 * 1000 : false;
  }).length;

  const isLoading = usersQuery.isLoading || tasksQuery.isLoading || imagesQuery.isLoading;
  const error = usersQuery.error || tasksQuery.error || imagesQuery.error;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          后台总览
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">管理后台总览</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          先把用户、任务和图片三条主线串起来，方便你每天快速判断平台运行状态，再逐步补系统配置和运营工具。
        </p>
      </div>

      <WorkspaceSection title="核心指标" description="先聚焦用户、任务和图片三条主线，后台就能承接最常用的日常排查。">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">正在加载后台数据...</div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : (
          <WorkspaceStatGrid
            items={[
              { label: "用户总数", value: String(users.length) },
              { label: "活跃用户", value: String(activeUsers) },
              { label: "今日任务数", value: String(todayTaskCount) },
              { label: "24 小时图片数", value: String(imageCount24h) },
              { label: "用户余额合计", value: String(totalBalance) },
              { label: "累计充值", value: String(totalRecharged) },
              { label: "累计消耗", value: String(totalConsumed) },
            ]}
          />
        )}
      </WorkspaceSection>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" />
            今日运营概览
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs text-muted-foreground">低余额用户</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{lowBalanceUsers}</div>
              <div className="mt-1 text-xs text-muted-foreground">余额小于等于 3 分，适合优先关注。</div>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs text-muted-foreground">最近任务类型</div>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {latestTask?.task_type || "暂无任务"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {latestTask?.email ? `最近操作用户：${latestTask.email}` : "还没有可展示的最近任务。"}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-xs text-muted-foreground">图片库规模</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{images.length}</div>
              <div className="mt-1 text-xs text-muted-foreground">后台当前可见的云端图片总数。</div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <AlertTriangle className="h-4 w-4 text-primary" />
            运营提醒
          </div>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-sm font-medium text-foreground">先处理低余额用户</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                当前有 {lowBalanceUsers} 位用户余额偏低，容易在生成或翻译时中断，可以优先在“用户与积分”里补发或引导充值。
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-sm font-medium text-foreground">优先追最近任务</div>
              <div className="mt-1 text-sm leading-6 text-muted-foreground">
                最近任务和图片已经都接入后台入口。排查问题时，建议先看任务，再对照图片管理判断结果是否异常。
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Link to="/admin/users" className="block">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">用户与积分</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              查看用户列表、余额、累计充值与累计消耗，并支持管理员手动补充积分。
            </p>
          </div>
        </Link>

        <Link to="/admin/tasks" className="block">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ListChecks className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">任务管理</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              查看最近的 AI 生图、AI 详情页和图文翻译任务，快速判断用户最近做了什么。
            </p>
          </div>
        </Link>

        <Link to="/admin/images" className="block">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FolderOpen className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">图片管理</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              后台查看所有生成图片，按用户、类型和时间筛选，也可以直接预览和删除异常结果。
            </p>
          </div>
        </Link>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ImagePlus className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">系统配置</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            下一阶段可以继续补默认模型、默认分辨率、价格规则和功能开关，让后台更像完整运营面板。
          </p>
        </div>
      </div>

      <WorkspaceSection title="下一步建议" description="后台第一版已经能独立进入，接下来最值得补的是下面三块。">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              icon: CreditCard,
              title: "把积分流程管起来",
              desc: "优先把用户余额、充值和异常补发流程做好，最容易立刻派上用场。",
            },
            {
              icon: ImagePlus,
              title: "把图片管理补扎实",
              desc: "把生成结果、来源、所属任务和异常图统一纳入后台，会更方便排查用户问题。",
            },
            {
              icon: FolderOpen,
              title: "逐步补系统配置",
              desc: "把默认模型、默认分辨率、价格和功能开关逐步搬到后台配置里。",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-2xl border border-border bg-background p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="mt-3 text-sm font-semibold text-foreground">{item.title}</div>
                <div className="mt-1 text-sm leading-6 text-muted-foreground">{item.desc}</div>
              </div>
            );
          })}
        </div>
      </WorkspaceSection>
    </div>
  );
};

export default AdminHome;
