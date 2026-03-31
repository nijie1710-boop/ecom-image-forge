import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, CreditCard, Plus, RefreshCw, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface UserWithBalance {
  user_id: string;
  email: string;
  balance: number;
  total_recharged: number;
  total_consumed: number;
  created_at: string;
}

const AdminPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [rechargeDialog, setRechargeDialog] = useState<{ open: boolean; user: UserWithBalance | null }>({
    open: false,
    user: null,
  });
  const [rechargeAmount, setRechargeAmount] = useState("");
  const [rechargeNotes, setRechargeNotes] = useState("");

  const callAdminApi = async (body: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token || ""}`,
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  };

  const { data: usersData, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => callAdminApi({ action: "list_users" }),
    enabled: !!user,
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

  const handleRecharge = () => {
    const amount = Number(rechargeAmount);
    if (!rechargeDialog.user || !amount || amount <= 0) {
      toast.error("请输入有效的充值金额");
      return;
    }
    addCreditsMutation.mutate({
      userId: rechargeDialog.user.user_id,
      amount,
      notes: rechargeNotes,
    });
  };

  const users: UserWithBalance[] = usersData?.users || [];

  if (error) {
    const errMsg = (error as Error).message;
    if (errMsg.includes("管理员")) {
      return (
        <div className="p-6 max-w-4xl mx-auto text-center">
          <Shield className="h-16 w-16 text-destructive mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-foreground mb-2">无权访问</h1>
          <p className="text-muted-foreground">您没有管理员权限，无法查看此页面。</p>
        </div>
      );
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            管理员后台
          </h1>
          <p className="text-muted-foreground text-sm mt-1">查看和管理所有用户的积分余额</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-1" />
          刷新
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <Users className="h-4 w-4" />
            总用户数
          </div>
          <p className="text-2xl font-bold text-foreground">{users.length}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <CreditCard className="h-4 w-4" />
            总充值积分
          </div>
          <p className="text-2xl font-bold text-primary">
            {users.reduce((sum, u) => sum + (u.total_recharged || 0), 0)}
          </p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
            <CreditCard className="h-4 w-4" />
            总消耗积分
          </div>
          <p className="text-2xl font-bold text-orange-500">
            {users.reduce((sum, u) => sum + (u.total_consumed || 0), 0)}
          </p>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">邮箱</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">当前余额</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">总充值</th>
                <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">总消耗</th>
                <th className="text-center text-xs font-medium text-muted-foreground px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">加载中...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-muted-foreground">暂无用户</td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.user_id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm text-foreground">{u.email}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-primary">{u.balance || 0}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{u.total_recharged || 0}</td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">{u.total_consumed || 0}</td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRechargeDialog({ open: true, user: u });
                          setRechargeAmount("");
                          setRechargeNotes("");
                        }}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        充值
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recharge Dialog */}
      <Dialog open={rechargeDialog.open} onOpenChange={(open) => setRechargeDialog({ open, user: open ? rechargeDialog.user : null })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>给用户充值积分</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm text-muted-foreground">用户</label>
              <p className="text-sm font-medium text-foreground">{rechargeDialog.user?.email}</p>
              <p className="text-xs text-muted-foreground">当前余额：{rechargeDialog.user?.balance || 0} 积分</p>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">充值数量</label>
              <Input
                type="number"
                placeholder="输入积分数量"
                value={rechargeAmount}
                onChange={(e) => setRechargeAmount(e.target.value)}
                min={1}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">备注（可选）</label>
              <Input
                placeholder="充值原因"
                value={rechargeNotes}
                onChange={(e) => setRechargeNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRechargeDialog({ open: false, user: null })}>取消</Button>
            <Button onClick={handleRecharge} disabled={addCreditsMutation.isPending}>
              {addCreditsMutation.isPending ? "充值中..." : "确认充值"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPage;
