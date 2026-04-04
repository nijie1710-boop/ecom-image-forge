import { useQuery } from "@tanstack/react-query";
import { CreditCard, FolderOpen, ImagePlus, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { callAdminApi, type UserWithBalance } from "@/lib/admin-api";
import { WorkspaceSection, WorkspaceStatGrid } from "@/components/workspace/WorkspaceBlocks";

const AdminHome = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-users-overview"],
    queryFn: () => callAdminApi({ action: "list_users" }),
  });

  const users = (data?.users || []) as UserWithBalance[];
  const totalBalance = users.reduce((sum, user) => sum + Number(user.balance || 0), 0);
  const totalRecharged = users.reduce((sum, user) => sum + Number(user.total_recharged || 0), 0);
  const totalConsumed = users.reduce((sum, user) => sum + Number(user.total_consumed || 0), 0);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
          管理概览
        </div>
        <h1 className="mt-3 text-2xl font-semibold text-foreground">后台总览</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          这里先放第一版后台入口和核心指标，后面可以继续补任务管理、图片审核、配置管理和系统统计。
        </p>
      </div>

      <WorkspaceSection
        title="核心指标"
        description="第一版优先展示用户与积分数据，方便管理员快速进入日常处理。"
      >
        {isLoading ? (
          <div className="text-sm text-muted-foreground">正在加载后台数据...</div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {(error as Error).message}
          </div>
        ) : (
          <WorkspaceStatGrid
            items={[
              { label: "总用户数", value: String(users.length) },
              { label: "用户余额合计", value: String(totalBalance) },
              { label: "累计充值", value: String(totalRecharged) },
              { label: "累计消耗", value: String(totalConsumed) },
            ]}
          />
        )}
      </WorkspaceSection>

      <div className="grid gap-4 lg:grid-cols-3">
        <Link to="/admin/users" className="block">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-foreground">用户与积分</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              查看用户列表、余额、累计充值与累计消耗，并支持管理员手动充值。
            </p>
          </div>
        </Link>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ImagePlus className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">任务与生成</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            后续可以在这里补任务排查、失败统计、模型使用情况和重试管理。
          </p>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <FolderOpen className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-foreground">图片与计费</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            后续可以扩展图片审核、来源追踪、费用统计、套餐配置和功能开关。
          </p>
        </div>
      </div>

      <WorkspaceSection
        title="第一版建议"
        description="管理后台已经能独立进入，后续最值得补的是任务管理、图片管理和系统配置。"
      >
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              icon: CreditCard,
              title: "先把积分流程管起来",
              desc: "优先把用户余额、充值和异常补发流程做好，最容易立刻派上用场。",
            },
            {
              icon: ImagePlus,
              title: "补任务排查",
              desc: "加失败任务、模型报错和用户最近生成记录，会让后台更像真正运维台。",
            },
            {
              icon: FolderOpen,
              title: "补配置中心",
              desc: "把默认模型、默认分辨率、价格和功能开关逐步搬到后台控制。",
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
