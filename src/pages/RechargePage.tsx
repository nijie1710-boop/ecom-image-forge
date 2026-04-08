import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useAuth } from "@/contexts/AuthContext";

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
    detail_planning: "AI 详情页方案策划",
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
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
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

  const loadAll = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setLoadError(null);

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

      try {
        const ordersResponse = await invokePaymentApi({ action: "list" });
        setOrders(ordersResponse.orders || []);
        setOrderError(null);
      } catch (error) {
        console.error("load payment orders failed:", error);
        setOrders([]);
        setOrderError(error instanceof Error ? error.message : "支付订单暂时不可用");
      }
    } catch (error) {
      console.error("load recharge center failed:", error);
      const message = error instanceof Error ? error.message : "加载充值中心失败，请稍后再试";
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setIsLoading(false);
      setLoadError("请先登录后查看充值与积分记录");
      return;
    }
    void loadAll();
  }, [authLoading, user?.id, loadAll]);

  useEffect(() => {
    if (!returnedOrderNo || returnedStatus !== "return" || !user?.id) return;

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
          console.error("poll order failed:", error);
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
  }, [returnedOrderNo, returnedStatus, user?.id, loadAll, searchParams, setSearchParams]);

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
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-2 inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
                积分充值中心
              </div>
              <h1 className="text-3xl font-bold">支付与积分流水</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/90">
                充值套餐、支付订单、积分到账记录和消费流水都会汇总在这里。
              </p>
            </div>
            <div className="grid min-w-[260px] grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <div className="text-white/80">当前余额</div>
                <div className="mt-2 text-3xl font-semibold">{balance?.balance ?? 0}</div>
              </div>
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <div className="text-white/80">累计消费</div>
                <div className="mt-2 text-3xl font-semibold">{balance?.total_consumed ?? 0}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {loadError ? (
        <Card className="border border-destructive/30 bg-destructive/5 shadow-none">
          <CardContent className="p-4 text-sm text-destructive">{loadError}</CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>充值套餐</CardTitle>
                  <CardDescription>支付成功后，积分会自动到账并可立即用于创作。</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {packages.map((item) => {
                const isSelected = item.id === selectedPackageId;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`rounded-3xl border p-5 text-left transition ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                    onClick={() => setSelectedPackageId(item.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold text-foreground">{item.label}</h3>
                          {item.badge ? <Badge variant="secondary">{item.badge}</Badge> : null}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.credits} 积分</p>
                      </div>
                      {item.highlight ? <Badge>推荐</Badge> : null}
                    </div>
                    <div className="mt-6 flex items-end gap-1">
                      <span className="text-3xl font-bold text-foreground">¥{item.price}</span>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>积分规则</CardTitle>
                  <CardDescription>按模型和功能消耗积分，先看清再充更划算。</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border p-4">
                <div className="mb-2 text-sm font-medium text-foreground">AI 生图</div>
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                  <div>Nano Banana：{creditRules?.generation.nanoBanana ?? 0} 积分/张</div>
                  <div>Nano Banana 2：{creditRules?.generation.nanoBanana2 ?? 0} 积分/张</div>
                  <div>Nano Banana Pro：{creditRules?.generation.nanoBananaPro ?? 0} 积分/张</div>
                </div>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <div className="mb-2 text-sm font-medium text-foreground">AI 详情页</div>
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>方案策划：{creditRules?.detail.planning ?? 0} 积分/次</div>
                  <div>Nano Banana：{creditRules?.detail.nanoBanana ?? 0} 积分/屏</div>
                  <div>Nano Banana 2：{creditRules?.detail.nanoBanana2 ?? 0} 积分/屏</div>
                  <div>Nano Banana Pro：{creditRules?.detail.nanoBananaPro ?? 0} 积分/屏</div>
                </div>
              </div>
              <div className="rounded-2xl border border-border p-4">
                <div className="mb-2 text-sm font-medium text-foreground">图文翻译</div>
                <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                  <div>基础翻译：{creditRules?.translation.basic ?? 0} 积分/张</div>
                  <div>精修翻译：{creditRules?.translation.refined ?? 0} 积分/张</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>余额总览</CardTitle>
                  <CardDescription>支付成功后系统会自动刷新到账积分。</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border bg-muted/20 p-5">
                <div className="text-sm text-muted-foreground">当前可用积分</div>
                <div className="mt-2 text-4xl font-bold text-foreground">{balance?.balance ?? 0}</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border px-4 py-3">
                    <div className="text-xs text-muted-foreground">累计充值</div>
                    <div className="mt-1 text-lg font-semibold text-foreground">
                      {balance?.total_recharged ?? 0}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-border px-4 py-3">
                    <div className="text-xs text-muted-foreground">累计消费</div>
                    <div className="mt-1 text-lg font-semibold text-foreground">
                      {balance?.total_consumed ?? 0}
                    </div>
                  </div>
                </div>
              </div>

              <Button className="w-full" size="lg" onClick={() => void handlePurchase()} disabled={!selectedPackage || isPurchasing}>
                {isPurchasing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在创建支付订单
                  </>
                ) : (
                  <>
                    去支付宝支付
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
              <p className="text-xs leading-6 text-muted-foreground">
                仅在支付宝支付成功后自动加积分。若支付后页面未刷新，可稍后返回此页查看到账状态。
              </p>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <ReceiptText className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>支付与积分流水</CardTitle>
                  <CardDescription>上方是支付宝订单，下方是积分到账记录和消费记录。</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="mb-3 text-sm font-medium text-foreground">最近订单</div>
                  {orderError ? (
                    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                      {orderError}
                    </div>
                  ) : orders.length > 0 ? (
                    <div className="space-y-3">
                      {orders.slice(0, 5).map((order) => (
                        <div key={order.id} className="rounded-2xl border border-border p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="font-medium text-foreground">{order.package_label || order.subject || "积分订单"}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                订单号：{order.order_no}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={getOrderStatusVariant(order.status)}>
                                {getOrderStatusLabel(order.status)}
                              </Badge>
                              <span className="text-sm font-semibold text-foreground">¥{order.amount}</span>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                            <div>积分：{order.credits}</div>
                            <div>时间：{formatDate(order.created_at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                      暂无支付宝订单，选择套餐后会在这里显示支付状态。
                    </div>
                  )}
                </div>

                <Tabs defaultValue="recharge" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-muted/40">
                    <TabsTrigger value="recharge">到账记录</TabsTrigger>
                    <TabsTrigger value="consumption">消费记录</TabsTrigger>
                  </TabsList>

                  <TabsContent value="recharge" className="mt-4">
                    {rechargeHistory.length > 0 ? (
                      <div className="space-y-3">
                        {rechargeHistory.slice(0, 8).map((item) => (
                          <div key={item.id} className="rounded-2xl border border-border p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium text-foreground">+{item.amount} 积分</div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {item.notes || item.payment_method}
                                </div>
                              </div>
                              <div className="text-right">
                                <Badge variant="secondary">{item.status}</Badge>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {formatDate(item.completed_at || item.created_at)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        暂无到账记录，支付成功后会自动显示。
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="consumption" className="mt-4">
                    {consumptionHistory.length > 0 ? (
                      <div className="space-y-3">
                        {consumptionHistory.slice(0, 10).map((item) => (
                          <div key={item.id} className="rounded-2xl border border-border p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <div className="font-medium text-foreground">
                                  -{item.amount} 积分 · {getOperationLabel(item.operation_type)}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {item.description || "系统自动扣费"}
                                </div>
                              </div>
                              <div className="text-xs text-muted-foreground">{formatDate(item.created_at)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                        暂无消费记录，开始创作后系统会自动记账。
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </CardContent>
          </Card>

          {isPolling ? (
            <Card className="border border-primary/20 bg-primary/5 shadow-none">
              <CardContent className="flex items-center gap-3 p-4 text-sm text-primary">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在确认支付宝支付结果，请稍候…
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
