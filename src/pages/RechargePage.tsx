import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Coins,
  CreditCard,
  ExternalLink,
  History,
  Loader2,
  ReceiptText,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getAppOrigin } from "@/lib/app-config";

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

interface RechargeOrder {
  id: string;
  order_no: string;
  package_id: string;
  package_label?: string | null;
  amount: number;
  credits: number;
  payment_channel: string;
  status: string;
  subject?: string | null;
  trade_no?: string | null;
  buyer_logon_id?: string | null;
  created_at: string;
  paid_at?: string | null;
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
    detail_generation: "AI 详情页逐屏生成",
    detail_planning: "AI 详情页策划",
    translate_image: "图文翻译",
    manual_adjustment: "手动调整",
    image_generation: "AI 生图",
  };
  return labels[type] || type || "其他";
}

function getOrderStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "待支付",
    paid: "已支付",
    closed: "已关闭",
    wait_buyer_pay: "待支付",
    trade_success: "已支付",
    trade_finished: "已支付",
  };
  return labels[String(status || "").toLowerCase()] || status || "未知";
}

function getOrderStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "paid" || normalized === "trade_success" || normalized === "trade_finished") return "default";
  if (normalized === "pending" || normalized === "wait_buyer_pay") return "secondary";
  if (normalized === "closed" || normalized === "failed") return "destructive";
  return "outline";
}

export default function RechargePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [packages, setPackages] = useState<RechargePackage[]>([]);
  const [creditRules, setCreditRules] = useState<CreditRules | null>(null);
  const [rechargeHistory, setRechargeHistory] = useState<RechargeRecord[]>([]);
  const [consumptionHistory, setConsumptionHistory] = useState<ConsumptionRecord[]>([]);
  const [orders, setOrders] = useState<RechargeOrder[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const successToastShownRef = useRef(false);

  const returnedOrderNo = searchParams.get("order_no") || "";
  const returnedStatus = searchParams.get("payment_status") || "";

  const selectedPackage = useMemo(
    () => packages.find((item) => item.id === selectedPackageId) || null,
    [packages, selectedPackageId],
  );

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!returnedOrderNo || returnedStatus !== "return") return;
    let cancelled = false;

    async function pollOrder() {
      setIsPolling(true);

      for (let attempt = 0; attempt < 10 && !cancelled; attempt += 1) {
        try {
          const data = await invokePaymentApi({ action: "status", orderNo: returnedOrderNo });
          const order = data.order as RechargeOrder | undefined;

          if (order) {
            setOrders((current) => {
              const others = current.filter((item) => item.order_no !== order.order_no);
              return [order, ...others].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
            });
          }

          if (order?.status === "paid") {
            await loadAll();
            if (!successToastShownRef.current) {
              successToastShownRef.current = true;
              toast.success(`支付成功，已到账 ${order.credits} 积分`);
            }
            const next = new URLSearchParams(searchParams);
            next.delete("payment_status");
            next.delete("order_no");
            setSearchParams(next, { replace: true });
            break;
          }
        } catch (error) {
          if (attempt === 0) {
            toast.error(error instanceof Error ? error.message : "订单状态查询失败，请稍后刷新重试");
          }
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!cancelled) setIsPolling(false);
    }

    void pollOrder();

    return () => {
      cancelled = true;
    };
  }, [returnedOrderNo, returnedStatus, searchParams, setSearchParams]);

  async function invokeManageBalance(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("manage-balance", { body });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data;
  }

  async function invokePaymentApi(body: Record<string, unknown>) {
    const { data, error } = await supabase.functions.invoke("alipay-order", { body });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data;
  }

  async function loadAll() {
    setIsLoading(true);
    try {
      const [balanceResponse, pricingResponse, historyResponse, ordersResponse] = await Promise.all([
        invokeManageBalance({ action: "get" }),
        invokeManageBalance({ action: "get_pricing" }),
        invokeManageBalance({ action: "history" }),
        invokePaymentApi({ action: "list" }),
      ]);

      setBalance(balanceResponse.balance || null);
      setPackages(pricingResponse.packages || []);
      setCreditRules(pricingResponse.creditRules || null);
      setRechargeHistory(historyResponse.recharges || []);
      setConsumptionHistory(historyResponse.consumptions || []);
      setOrders(ordersResponse.orders || []);
      setSelectedPackageId((current) => {
        if (current) return current;
        const highlighted = pricingResponse.packages?.find((item: RechargePackage) => item.highlight);
        return highlighted?.id || pricingResponse.packages?.[0]?.id || "";
      });
    } catch (error) {
      console.error("load recharge center failed:", error);
      toast.error(error instanceof Error ? error.message : "加载充值中心失败，请稍后再试");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePurchase() {
    if (!selectedPackage) {
      toast.error("请先选择一个充值套餐");
      return;
    }

    setIsPurchasing(true);
    try {
      const scene = /iphone|android|mobile|ipad|harmonyos/i.test(window.navigator.userAgent) ? "mobile" : "pc";
      const response = await invokePaymentApi({
        action: "create",
        packageId: selectedPackage.id,
        origin: getAppOrigin(),
        scene,
      });

      const payUrl = String(response.payUrl || "");
      if (!payUrl) {
        throw new Error("支付链接创建失败，请稍后再试");
      }

      toast.success("订单已创建，正在跳转支付宝支付");
      window.location.href = payUrl;
    } catch (error) {
      console.error("create payment order failed:", error);
      toast.error(error instanceof Error ? error.message : "创建支付订单失败，请稍后再试");
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
                积分充值中心
              </div>
              <h1 className="mt-3 text-3xl font-semibold">支付成功后自动到账积分</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/85">
                当前页面已经切换为真实支付流程：先创建支付宝订单，支付成功并收到回调后再自动加积分，
                不再支持点击后直接到账。
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
                  <div className="mt-1 text-lg font-semibold text-white">{balance?.total_recharged ?? 0}</div>
                </div>
                <div className="rounded-2xl bg-black/10 p-3">
                  <div>累计消费</div>
                  <div className="mt-1 text-lg font-semibold text-white">{balance?.total_consumed ?? 0}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {returnedOrderNo ? (
        <Card className="rounded-3xl border border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium text-foreground">正在查询支付结果</div>
              <div className="mt-1 text-sm text-muted-foreground">
                订单号：{returnedOrderNo}
                {isPolling ? "，支付宝回调处理中..." : ""}
              </div>
            </div>
            <Button variant="outline" onClick={() => void loadAll()}>
              刷新订单状态
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-3xl border border-border shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CreditCard className="h-5 w-5 text-primary" />
              充值套餐
            </CardTitle>
            <CardDescription>
              选择套餐后跳转支付宝支付，只有支付成功并收到回调后才会增加积分。
            </CardDescription>
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
                      {pkg.badge ? <Badge variant={pkg.highlight ? "default" : "outline"}>{pkg.badge}</Badge> : null}
                    </div>
                    <div className="mt-5 flex items-end justify-between gap-3">
                      <div>
                        <div className="text-3xl font-bold text-foreground">¥ {pkg.price}</div>
                        <div className="mt-1 text-xs text-muted-foreground">约 ¥ {unitPrice} / 积分</div>
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
                    点击后将跳转支付宝网站支付页面。支付完成回到本站后，系统会自动查询订单状态并到账积分。
                  </div>
                </div>
                <Button
                  size="lg"
                  className="min-w-[220px] rounded-2xl"
                  onClick={handlePurchase}
                  disabled={!selectedPackage || isPurchasing}
                >
                  {isPurchasing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  前往支付宝支付
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
            <CardDescription>当前积分规则来自后台系统配置，可随时调整。</CardDescription>
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
            支付与积分流水
          </CardTitle>
          <CardDescription>上方是支付宝订单，下方是积分到账记录和消费记录。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">最近订单</div>
            {orders.length ? (
              orders.map((order) => (
                <div
                  key={order.id}
                  className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {order.package_label || order.package_id} · ¥ {order.amount}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      订单号：{order.order_no} · 支付方式：{order.payment_channel}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right text-xs text-muted-foreground">
                    <Badge variant={getOrderStatusVariant(order.status)}>{getOrderStatusLabel(order.status)}</Badge>
                    <div>{formatDate(order.paid_at || order.created_at)}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                暂无支付宝订单，选择套餐后会在这里显示支付状态。
              </div>
            )}
          </div>

          <Tabs defaultValue="recharge" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="recharge">到账记录</TabsTrigger>
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
                  暂无到账记录，支付完成后会自动出现在这里。
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
