import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CreditCard, Plus, RefreshCw, Search, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { callAdminApi, type UserWithBalance } from "@/lib/admin-api";

const QUICK_AMOUNTS = [50, 100, 200, 500];
const USER_FILTERS = [
  { value: "all", label: "全部用户" },
  { value: "active", label: "活跃用户" },
  { value: "low", label: "低余额" },
  { value: "new", label: "近 7 天注册" },
] as const;

const AdminPage = () => {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [filter, setFilter] = useState<(typeof USER_FILTERS)[number]["value"]>("all");
  const [rechargeDialog, setRechargeDialog] = useState<{
    open: boolean;
    user: UserWithBalance | null;
  }>({
    open: false,
    user: null,
  });
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeNotes, setRechargeNotes] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => callAdminApi({ action: "list_users" }),
  });

  const addCreditsMutation = useMutation({
    mutationFn: (params: { userId: string; amount: number; notes: string }) =>
      callAdminApi({
        action: "add_credits",
        userId: params.userId,
        amount: params.amount,
        notes: params.notes,
      }),
    onSuccess: () => {
      toast.success("充值成功");
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setRechargeDialog({ open: false, user: null });
      setRechargeAmount("");
      setRechargeNotes("");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const users: UserWithBalance[] = data?.users || [];

  const filteredUsers = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    const now = Date.now();
    return [...users]
      .filter((user) => {
        const keywordMatched =
          !normalizedKeyword ||
          user.email?.toLowerCase().includes(normalizedKeyword) ||
          user.user_id.toLowerCase().includes(normalizedKeyword);

        const isActive = Number(user.total_recharged || 0) > 0 || Number(user.total_consumed || 0) > 0;
        const isLowBalance = Number(user.balance || 0) <= 3;
        const createdAt = user.created_at_auth || user.created_at;
        const isNew = createdAt ? now - new Date(createdAt).getTime() <= 7 * 24 * 60 * 60 * 1000 : false;

        const filterMatched =
          filter === "all" ||
          (filter === "active" && isActive) ||
          (filter === "low" && isLowBalance) ||
          (filter === "new" && isNew);

        return keywordMatched && filterMatched;
      })
      .sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
  }, [users, keyword, filter]);

  const totalBalance = users.reduce((sum, user) => sum + Number(user.balance || 0), 0);
  const totalRecharged = users.reduce((sum, user) => sum + Number(user.total_recharged || 0), 0);
  const totalConsumed = users.reduce((sum, user) => sum + Number(user.total_consumed || 0), 0);
  const lowBalanceUsers = users.filter((user) => Number(user.balance || 0) <= 3).length;
  const activeUsers = users.filter(
    (user) => Number(user.total_recharged || 0) > 0 || Number(user.total_consumed || 0) > 0,
  ).length;

  const handleRecharge = () => {
    const amount = Number(rechargeAmount);
    if (!rechargeDialog.user || !amount || amount <= 0) {
      toast.error("请输入有效的充值积分");
      return;
    }

    addCreditsMutation.mutate({
      userId: rechargeDialog.user.user_id,
      amount,
      notes: rechargeNotes,
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <Shield className="h-3.5 w-3.5" />
              用户与积分
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-foreground">管理员用户中心</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              查看所有用户的积分余额、累计充值和累计消耗，并支持管理员手动补充积分。
            </p>
          </div>

          <div className="flex gap-2">
            <div className="relative min-w-[220px] max-w-[320px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索邮箱或用户 ID"
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
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            用户总数
          </div>
          <div className="mt-3 text-2xl font-semibold text-foreground">{users.length}</div>
          <div className="mt-1 text-xs text-muted-foreground">其中活跃用户 {activeUsers} 位</div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            用户余额合计
          </div>
          <div className="mt-3 text-2xl font-semibold text-primary">{totalBalance}</div>
          <div className="mt-1 text-xs text-muted-foreground">低余额用户 {lowBalanceUsers} 位</div>
        </div>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CreditCard className="h-4 w-4" />
            累计充值 / 消耗
          </div>
          <div className="mt-3 text-2xl font-semibold text-foreground">
            {totalRecharged} <span className="text-base text-muted-foreground">/ {totalConsumed}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="text-sm font-semibold text-foreground">用户筛选</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {USER_FILTERS.map((item) => (
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
        </div>

        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <AlertTriangle className="h-4 w-4 text-primary" />
            运营提醒
          </div>
          <div className="mt-3 text-sm leading-6 text-muted-foreground">
            低余额用户更容易在生成或翻译时中断，建议优先筛选“低余额”并用快捷充值额度处理常见补偿场景。
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-5 py-4">
          <div className="text-lg font-semibold text-foreground">用户列表</div>
          <div className="mt-1 text-sm text-muted-foreground">
            共 {filteredUsers.length} 位用户，按余额从高到低排序。
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[840px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">邮箱</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">用户 ID</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">当前余额</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">累计充值</th>
                <th className="px-5 py-3 text-right text-xs font-medium text-muted-foreground">累计消耗</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">注册时间</th>
                <th className="px-5 py-3 text-center text-xs font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    正在加载用户数据...
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-destructive">
                    {(error as Error).message}
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted-foreground">
                    没有匹配到用户
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.user_id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-5 py-4 text-sm text-foreground">{user.email || "未绑定邮箱"}</td>
                    <td className="px-5 py-4 font-mono text-xs text-muted-foreground">{user.user_id}</td>
                    <td className="px-5 py-4 text-right text-sm font-medium text-primary">{user.balance || 0}</td>
                    <td className="px-5 py-4 text-right text-sm text-muted-foreground">{user.total_recharged || 0}</td>
                    <td className="px-5 py-4 text-right text-sm text-muted-foreground">{user.total_consumed || 0}</td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {user.created_at ? new Date(user.created_at).toLocaleString() : "-"}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => {
                          setRechargeDialog({ open: true, user });
                          setRechargeAmount("");
                          setRechargeNotes("");
                        }}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        补充积分
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog
        open={rechargeDialog.open}
        onOpenChange={(open) => setRechargeDialog({ open, user: open ? rechargeDialog.user : null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>给用户充值积分</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-2xl bg-muted/50 p-3 text-sm">
              <div className="font-medium text-foreground">{rechargeDialog.user?.email}</div>
              <div className="mt-1 text-muted-foreground">当前余额：{rechargeDialog.user?.balance || 0} 积分</div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">充值数量</label>
              <Input
                type="number"
                placeholder="输入积分数量"
                value={rechargeAmount}
                onChange={(event) => setRechargeAmount(event.target.value)}
                min={1}
              />
              <div className="flex flex-wrap gap-2">
                {QUICK_AMOUNTS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition hover:border-primary/20 hover:text-foreground"
                    onClick={() => setRechargeAmount(String(amount))}
                  >
                    +{amount}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">备注</label>
              <Input
                placeholder="例如：售后补发、人工加赠"
                value={rechargeNotes}
                onChange={(event) => setRechargeNotes(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRechargeDialog({ open: false, user: null })}>
              取消
            </Button>
            <Button onClick={handleRecharge} disabled={addCreditsMutation.isPending}>
              {addCreditsMutation.isPending ? "处理中..." : "确认充值"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPage;
