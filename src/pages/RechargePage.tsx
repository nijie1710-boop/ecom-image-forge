import { useEffect, useMemo, useState } from "react";
import { Coins, CreditCard, History, Loader2, ReceiptText, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

interface BalanceInfo {
  balance: number;
  total_recharged: number;
  total_consumed: number;
  recharge_count?: number;
  consumption_count?: number;
}

interface RechargeRecord {
  id: string;
  amount: number;
  payment_method: string;
  status: string;
  notes?: string | null;
  created_at: string;
  completed_at?: string | null;
}

interface ConsumptionRecord {
  id: string;
  amount: number;
  operation_type: string;
  description?: string | null;
  created_at: string;
}

interface RechargePackage {
  id: string;
  label: string;
  price: number;
  credits: number;
  badge?: string;
  highlight?: boolean;
}

interface CreditRules {
  generation: {
    nanoBanana: number;
    nanoBanana2: number;
    nanoBananaPro: number;
  };
  detail: {
    planning: number;
    nanoBanana: number;
    nanoBanana2: number;
    nanoBananaPro: number;
  };
  translation: {
    basic: number;
    refined: number;
  };
}

function formatDate(dateStr?: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getOperationLabel(type: string) {
  const labels: Record<string, string> = {
    generate_image: "AI 生图",
    generate_copy: "AI 详情页",
    translate_image: "图文翻译",
    manual_adjustment: "手动调整",
  };

  return labels[type] || type || "其他";
}

export default function RechargePage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [packages, setPackages] = useState<RechargePackage[]>([]);
  const [creditRules, setCreditRules] = useState<CreditRules | null>(null);
  const [rechargeHistory, setRechargeHistory] = useState<RechargeRecord[]>([]);
  const [consumptionHistory, setConsumptionHistory] = useState<ConsumptionRecord[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) || null,
    [packages, selectedPackageId],
  );

  useEffect(() => {
    void loadAll();
  }, []);

  async function invokeManageBalance(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("manage-balance", { body });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data;
  }

  async function loadAll() {
    setIsLoading(true);
    try {
      const [balanceResponse, pricingResponse, historyResponse] = await Promise.all([
        invokeManageBalance({ action: "get" }),
        invokeManageBalance({ action: "get_pricing" }),
        invokeManageBalance({ action: "history" }),
      ]);

      setBalance(balanceResponse.balance || null);
      setPackages(pricingResponse.packages || []);
      setCreditRules(pricingResponse.creditRules || null);
      setRechargeHistory(historyResponse.recharges || []);
      setConsumptionHistory(historyResponse.consumptions || []);
      setSelectedPackageId((current) => {
        if (current) return current;
        const highlighted = pricingResponse.packages?.find((item: RechargePackage) => item.highlight);
        return highlighted?.id || pricingResponse.packages?.[0]?.id || "";
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载充值中心失败，请稍后再试。");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePurchase() {
    if (!selectedPackage) {
      toast.error("请先选择一个充值套餐。");
      return;
    }

    setIsPurchasing(true);
    try {
      const response = await invokeManageBalance({
        action: "purchase_package",
        packageId: selectedPackage.id,
        paymentMethod: "auto_credit",
        notes: `购买${selectedPackage.label}`,
      });

      toast.success(`充值成功，已到账 ${selectedPackage.credits} 积分。`);
      setBalance((current) =>
        current
          ? {
              ...current,
              balance: response.result?.new_balance ?? current.balance + selectedPackage.credits,
              total_recharged: current.total_recharged + selectedPackage.credits,
            }
          : current,
      );
      await loadAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "充值失败，请稍后再试。");
    } finally {
      setIsPurchasing(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="overflow-hidden border-none bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500 text-white shadow-lg">
        <CardContent className="p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5" />
                充值中心
              </div>
              <h1 className="mt-3 text-3xl font-semibold">给你的创作额度快速补给</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">
                充值套餐与扣费规则直接来自后台系统配置。当前版本支持站内自动到账，购买成功后会立即增加积分并写入充值历史。
              </p>
            </div>
            <div className="grid min-w-[260px] gap-3 rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center justify-between text-sm text-white/80">
                <span>当前可用积分</span>
                <Coins className="h-4 w-4" />
              </div>
              <div className="text-4xl font-bold">{balance?.balance ?? 0}</div>
              <div className="grid grid-cols-2 gap-3 text-xs text-white/80">
                <div className="rounded-2xl bg-black/10 p-3">
                  <div>累计充值</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {balance?.total_recharged ?? 0}
                  </div>
                </div>
                <div className="rounded-2xl bg-black/10 p-3">
                  <div>累计消耗</div>
                  <div className="mt-1 text-lg font-semibold text-white">
                    {balance?.total_consumed ?? 0}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-3xl border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CreditCard className="h-5 w-5 text-primary" />
              充值套餐
            </CardTitle>
            <CardDescription>选择套餐后点击购买，积分会立即自动入账。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {packages.map((pkg) => {
                const active = selectedPackageId === pkg.id;
                const unitPrice = pkg.credits > 0 ? (pkg.price / pkg.credits).toFixed(3) : "-";

                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPackageId(pkg.id)}
                    className={`rounded-3xl border p-5 text-left transition-all ${
                      active
                        ? "border-primary bg-primary/5 shadow-sm ring-2 ring-primary/15"
                        : "border-border bg-card hover:border-primary/30 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-foreground">{pkg.label}</div>
                        <div className="mt-1 text-sm text-muted-foreground">到账 {pkg.credits} 积分</div>
                      </div>
                      {pkg.badge ? (
                        <Badge variant={pkg.highlight ? "default" : "outline"}>{pkg.badge}</Badge>
                      ) : null}
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-3xl font-bold text-foreground">¥ {pkg.price}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          约 ¥ {unitPrice} / 积分
                        </div>
                      </div>
                      {active ? <Badge>已选中</Badge> : null}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="rounded-3xl border border-dashed border-primary/25 bg-primary/5 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">当前已选</div>
                  <div className="mt-1 text-2xl font-semibold text-foreground">
                    {selectedPackage ? `${selectedPackage.label} · ${selectedPackage.credits} 积分` : "请选择一个充值套餐"}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    购买后系统会自动加积分并写入充值记录，后续接入真实支付回调时也可以继续复用这条入账链路。
                  </div>
                </div>
                <Button
                  size="lg"
                  className="min-w-[200px] rounded-2xl"
                  onClick={handlePurchase}
                  disabled={!selectedPackage || isPurchasing}
                >
                  {isPurchasing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                  立即充值
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ReceiptText className="h-5 w-5 text-primary" />
              扣费规则
            </CardTitle>
            <CardDescription>下面的积分规则来自后台系统配置，便于你后续按模型和功能统一调价。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-3xl border border-border bg-muted/30 p-4">
              <div className="text-sm font-medium text-foreground">AI 生图</div>
              <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Nano Banana</span>
                  <Badge variant="outline">{creditRules?.generation.nanoBanana ?? 0} 积分 / 张</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Nano Banana 2</span>
                  <Badge variant="outline">{creditRules?.generation.nanoBanana2 ?? 0} 积分 / 张</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Nano Banana Pro</span>
                  <Badge variant="outline">{creditRules?.generation.nanoBananaPro ?? 0} 积分 / 张</Badge>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-muted/30 p-4">
              <div className="text-sm font-medium text-foreground">AI 详情页</div>
              <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>方案策划</span>
                  <Badge variant="outline">{creditRules?.detail.planning ?? 0} 积分 / 次</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Nano Banana</span>
                  <Badge variant="outline">{creditRules?.detail.nanoBanana ?? 0} 积分 / 屏</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Nano Banana 2</span>
                  <Badge variant="outline">{creditRules?.detail.nanoBanana2 ?? 0} 积分 / 屏</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Nano Banana Pro</span>
                  <Badge variant="outline">{creditRules?.detail.nanoBananaPro ?? 0} 积分 / 屏</Badge>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border bg-muted/30 p-4">
              <div className="text-sm font-medium text-foreground">图文翻译</div>
              <div className="mt-3 grid gap-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>基础翻译</span>
                  <Badge variant="outline">{creditRules?.translation.basic ?? 0} 积分 / 张</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>精修翻译</span>
                  <Badge variant="outline">{creditRules?.translation.refined ?? 0} 积分 / 张</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-3xl border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <History className="h-5 w-5 text-primary" />
            积分流水
          </CardTitle>
          <CardDescription>包含最近充值与消费记录，方便你核对自动入账是否正常。</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="recharge" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="recharge">充值记录</TabsTrigger>
              <TabsTrigger value="consumption">消费记录</TabsTrigger>
            </TabsList>

            <TabsContent value="recharge" className="space-y-3">
              {rechargeHistory.length ? (
                rechargeHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        +{item.amount} 积分 · {item.payment_method || "自动充值"}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.notes || "已完成充值入账"}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{item.status === "completed" ? "已完成" : item.status}</div>
                      <div className="mt-1">{formatDate(item.completed_at || item.created_at)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                  暂无充值记录，购买任意套餐后会自动出现在这里。
                </div>
              )}
            </TabsContent>

            <TabsContent value="consumption" className="space-y-3">
              {consumptionHistory.length ? (
                consumptionHistory.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        -{Math.abs(item.amount)} 积分 · {getOperationLabel(item.operation_type)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {item.description || "系统自动扣费"}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <div>{formatDate(item.created_at)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                  暂无消费记录，开始创作后系统会自动记账。
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
