import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Coins, CreditCard, ExternalLink, Loader2, ReceiptText, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { getAppOrigin } from "@/lib/app-config";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeUserErrorMessage } from "@/lib/error-messages";
import { isSelfHosted, apiPost } from "@/lib/api-client";

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
  payment_method?: string | null;
  notes?: string | null;
  created_at: string;
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
  generation: Record<string, number>;
  detail: Record<string, number>;
  translation: Record<string, number>;
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

const DEFAULT_PACKAGES: RechargePackage[] = [
  { id: "starter", label: "体验包", price: 19.9, credits: 200, badge: "适合试用" },
  { id: "growth", label: "常用包", price: 49.9, credits: 520, badge: "推荐", highlight: true },
  { id: "pro", label: "进阶包", price: 99, credits: 1080, badge: "单价更省" },
  { id: "business", label: "商用包", price: 199, credits: 2280, badge: "高频创作" },
];

const DEFAULT_RULES: CreditRules = {
  generation: { nanoBanana: 5, nanoBanana2: 7, nanoBananaPro: 12 },
  detail: { planning: 1, nanoBanana: 7, nanoBanana2: 9, nanoBananaPro: 14 },
  translation: { nanoBanana2: 7, nanoBananaPro: 12 },
};

/* ── 完整积分扣费明细表（与 detail-credits.ts 一致） ──────────── */
const PRICING_SECTIONS: {
  title: string;
  unit: string;
  note?: string;
  cols: string[];
  rows: { model: string; values: (number | string)[] }[];
}[] = [
  {
    title: "AI 主图",
    unit: "积分/张",
    cols: ["1K", "2K", "4K"],
    rows: [
      { model: "Nano Banana",     values: [5,  "-", "-"] },
      { model: "Nano Banana 2",   values: [7,  9,   14] },
      { model: "Nano Banana Pro", values: [12, 14,  24] },
    ],
  },
  {
    title: "AI 详情图",
    unit: "积分/屏",
    note: "方案策划固定 1 积分/次",
    cols: ["1K", "2K", "4K"],
    rows: [
      { model: "Nano Banana",     values: [7,  "-", "-"] },
      { model: "Nano Banana 2",   values: [9,  14,  18] },
      { model: "Nano Banana Pro", values: [14, 16,  30] },
    ],
  },
  {
    title: "图文翻译",
    unit: "积分/张",
    cols: ["1K", "2K", "4K"],
    rows: [
      { model: "Nano Banana 2",   values: [7,  9,  14] },
      { model: "Nano Banana Pro", values: [12, 14, 24] },
    ],
  },
];

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
    generate_image: "AI 主图",
    image_generation: "AI 主图",
    detail_generation: "AI 详情图逐屏生成",
    detail_planning: "AI 详情图方案策划",
    generate_copy: "AI 文案",
    translate_image: "图文翻译",
    manual_adjustment: "手动调整",
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

const PRICING_CACHE_KEY = "picspark_pricing_cache_v1";
const PRICING_CACHE_TTL_MS = 30 * 60 * 1000;

function readCachedPricing(): { packages: RechargePackage[]; creditRules: CreditRules } | null {
  try {
    const raw = localStorage.getItem(PRICING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      ts: number;
      packages: RechargePackage[];
      creditRules: CreditRules;
    };
    if (!parsed.ts || Date.now() - parsed.ts > PRICING_CACHE_TTL_MS) return null;
    if (!Array.isArray(parsed.packages) || parsed.packages.length === 0) return null;
    return { packages: parsed.packages, creditRules: parsed.creditRules };
  } catch {
    return null;
  }
}

function writeCachedPricing(packages: RechargePackage[], creditRules: CreditRules) {
  try {
    localStorage.setItem(
      PRICING_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), packages, creditRules }),
    );
  } catch { /* ignore quota errors */ }
}

async function loadBalanceFallback(userId: string): Promise<BalanceInfo> {
  if (isSelfHosted) {
    // In self-hosted mode, the manage-balance API is the primary path, fallback is meaningless
    throw new Error("Balance API unavailable");
  }
  const [balanceResp, rechargeResp, consumptionResp] = await Promise.all([
    supabase.from("user_balances").select("balance,total_recharged,total_consumed").eq("user_id", userId).maybeSingle(),
    supabase.from("recharge_records").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase.from("consumption_records").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  if (balanceResp.error) throw balanceResp.error;
  if (rechargeResp.error) throw rechargeResp.error;
  if (consumptionResp.error) throw consumptionResp.error;

  return {
    balance: Number(balanceResp.data?.balance || 0),
    total_recharged: Number(balanceResp.data?.total_recharged || 0),
    total_consumed: Number(balanceResp.data?.total_consumed || 0),
    recharge_count: Number(rechargeResp.count || 0),
    consumption_count: Number(consumptionResp.count || 0),
  };
}

async function loadHistoryFallback(userId: string) {
  if (isSelfHosted) {
    throw new Error("History API unavailable");
  }
  const [rechargesResp, consumptionsResp] = await Promise.all([
    supabase.from("recharge_records").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    supabase.from("consumption_records").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
  ]);

  if (rechargesResp.error) throw rechargesResp.error;
  if (consumptionsResp.error) throw consumptionsResp.error;

  return {
    recharges: (rechargesResp.data || []) as RechargeRecord[],
    consumptions: (consumptionsResp.data || []) as ConsumptionRecord[],
  };
}

async function loadPricingFallback() {
  if (isSelfHosted) {
    return { packages: DEFAULT_PACKAGES, creditRules: DEFAULT_RULES };
  }
  try {
    const { data, error } = await supabase.from("admin_settings").select("key,value").in("key", ["recharge_packages", "credit_rules"]);
    if (error) throw error;

    const map = new Map((data || []).map((row) => [row.key, row.value]));
    return {
      packages: (map.get("recharge_packages") as RechargePackage[] | undefined) || DEFAULT_PACKAGES,
      creditRules: (map.get("credit_rules") as CreditRules | undefined) || DEFAULT_RULES,
    };
  } catch (error) {
    console.warn("load pricing fallback failed, use defaults:", error);
    return { packages: DEFAULT_PACKAGES, creditRules: DEFAULT_RULES };
  }
}

export default function RechargePage() {
  const { user, loading: authLoading } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [packages, setPackages] = useState<RechargePackage[]>(DEFAULT_PACKAGES);
  const [, setCreditRules] = useState<CreditRules>(DEFAULT_RULES);
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

  const invokeManageBalance = useCallback(async (body: Record<string, unknown>) => {
    if (isSelfHosted) {
      const resp = await apiPost<Record<string, unknown>>("manage-balance", body);
      if (!resp.ok) throw new Error(resp.rawText || "manage-balance failed");
      if (resp.data?.error) throw new Error(String(resp.data.error));
      return resp.data;
    }

    const { data, error } = await supabase.functions.invoke("manage-balance", { body });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data;
  }, []);

  const invokePaymentApi = useCallback(async (body: Record<string, unknown>) => {
    if (isSelfHosted) {
      const resp = await apiPost<Record<string, unknown>>("alipay-order", body);
      if (!resp.ok) throw new Error(resp.rawText || "支付接口暂时不可用，请稍后再试");
      if (resp.data?.error) throw new Error(String(resp.data.message || resp.data.error));
      return resp.data;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error("未登录，请先登录");
    }

    const response = await fetch("/api/alipay-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      data = { error: text || "PAYMENT_API_FAILED" };
    }

    if (!response.ok) {
      throw new Error(String(data?.message || data?.error || "支付接口暂时不可用，请稍后再试"));
    }

    if (data?.error) throw new Error(String(data.message || data.error));
    return data;
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      const ordersResponse = await invokePaymentApi({ action: "list" });
      setOrders((ordersResponse.orders || []) as RechargeOrder[]);
    } catch (paymentError) {
      // 静默失败：仅打印日志，不再在界面上展示告警；未产生订单时直接显示空状态
      console.error("load payment orders failed:", paymentError);
      setOrders([]);
    }
  }, [invokePaymentApi]);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;

    setIsLoading(true);
    setLoadError(null);

    // Hydrate packages from cache first so card layout stops showing defaults stale
    const cached = readCachedPricing();
    if (cached) {
      setPackages(cached.packages);
      setCreditRules(cached.creditRules);
      setSelectedPackageId((current) => {
        if (current) return current;
        const highlighted = cached.packages.find((item) => item.highlight);
        return highlighted?.id || cached.packages[0]?.id || DEFAULT_PACKAGES[0].id;
      });
    }

    // Fire all four requests in parallel; each updates its own slice as it returns,
    // so the balance card stops showing "-" the moment `get` resolves — no waiting
    // for the slowest call. Errors are isolated per-slice.
    const pricingPromise = invokeManageBalance({ action: "get_pricing" })
      .catch(() => loadPricingFallback())
      .then((pricingResponse) => {
        const resolvedPackages =
          pricingResponse.settings?.recharge_packages ||
          pricingResponse.packages ||
          DEFAULT_PACKAGES;
        const resolvedRules =
          pricingResponse.settings?.credit_rules ||
          pricingResponse.creditRules ||
          DEFAULT_RULES;
        setPackages(resolvedPackages as RechargePackage[]);
        setCreditRules(resolvedRules as CreditRules);
        setSelectedPackageId((current) => {
          if (current) return current;
          const pkgs = resolvedPackages as RechargePackage[];
          const highlighted = pkgs.find((item: RechargePackage) => item.highlight);
          return highlighted?.id || pkgs[0]?.id || DEFAULT_PACKAGES[0].id;
        });
        writeCachedPricing(resolvedPackages as RechargePackage[], resolvedRules as CreditRules);
      });

    const balancePromise = invokeManageBalance({ action: "get" })
      .then((response) => (response.balance || null) as BalanceInfo | null)
      .catch(() => loadBalanceFallback(user.id))
      .then((balanceResponse) => {
        setBalance(balanceResponse || null);
      });

    const historyPromise = invokeManageBalance({ action: "history" })
      .catch(() => loadHistoryFallback(user.id))
      .then((historyResponse) => {
        setRechargeHistory((historyResponse.recharges || []) as RechargeRecord[]);
        setConsumptionHistory((historyResponse.consumptions || []) as ConsumptionRecord[]);
      });

    const ordersPromise = loadOrders();

    try {
      await Promise.all([pricingPromise, balancePromise, historyPromise, ordersPromise]);
    } catch (error) {
      console.error("load recharge center failed:", error);
      const message = normalizeUserErrorMessage(error, "充值中心加载失败，请稍后再试");
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [invokeManageBalance, loadOrders, user?.id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setIsLoading(false);
      setLoadError("请先登录后查看充值和积分记录");
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

          if (order?.status === "paid" || order?.status === "trade_success" || order?.status === "trade_finished") {
            if (!successToastShownRef.current) {
              toast.success("支付成功，积分已到账");
              successToastShownRef.current = true;
            }
            await loadAll();
            break;
          }
        } catch (statusError) {
          console.warn("poll payment status failed:", statusError);
        }

        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!cancelled) {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete("order_no");
        nextParams.delete("payment_status");
        setSearchParams(nextParams, { replace: true });

        if (!successToastShownRef.current) {
          toast.warning("暂未检测到支付结果，请稍后刷新页面查看积分是否到账，或联系客服。");
        }
      }

      setIsPolling(false);
    }

    void pollOrder();

    return () => {
      cancelled = true;
    };
  }, [invokePaymentApi, loadAll, returnedOrderNo, returnedStatus, searchParams, setSearchParams, user?.id]);

  const handlePurchase = async () => {
    if (!user?.id || !selectedPackage) {
      toast.error("请选择充值套餐后再继续");
      return;
    }

    try {
      setIsPurchasing(true);
      const response = await invokePaymentApi({
        action: "create",
        packageId: selectedPackage.id,
        returnUrl: `${getAppOrigin()}/dashboard/recharge?payment_status=return`,
      });

      if (!response?.payUrl) {
        throw new Error("未获取到支付宝支付链接");
      }

      const payUrl = new URL(String(response.payUrl));
      if (!payUrl.hostname.endsWith("alipay.com") && !payUrl.hostname.endsWith("alipaydev.com")) {
        throw new Error("支付链接域名异常，请联系客服");
      }
      window.location.href = payUrl.toString();
    } catch (error) {
      console.error("create purchase order failed:", error);
      toast.error(normalizeUserErrorMessage(error, "创建支付订单失败，请稍后再试"));
    } finally {
      setIsPurchasing(false);
    }
  };

  const totalOrderCount = orders.length;
  const paidOrderCount = orders.filter((item) => ["paid", "trade_success", "trade_finished"].includes(String(item.status).toLowerCase())).length;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">充值中心</h1>
        <p className="mt-1 text-sm text-muted-foreground">选择充值套餐、查看支付状态和积分流水。支付成功后系统会自动到账。</p>
      </div>

      {loadError ? (
        <Card className="mb-6 border border-destructive/30 bg-destructive/5 shadow-none">
          <CardContent className="p-4 text-sm text-destructive">{loadError}</CardContent>
        </Card>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <Card className="rounded-3xl border border-border shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">当前余额</div>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-4xl font-bold text-foreground">{balance?.balance ?? "-"}</span>
              <span className="pb-1 text-sm font-medium text-primary">积分</span>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border border-border shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">累计充值</div>
            <div className="mt-3 text-3xl font-bold text-foreground">{balance?.total_recharged ?? "-"}</div>
          </CardContent>
        </Card>
        <Card className="rounded-3xl border border-border shadow-sm">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">累计消费</div>
            <div className="mt-3 text-3xl font-bold text-foreground">{balance?.total_consumed ?? "-"}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <CreditCard className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">充值套餐</CardTitle>
                  <CardDescription>先使用管理员手动加积分或支付宝网站支付，后续可继续扩展更多支付方式。</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {packages.map((pkg) => {
                const isSelected = pkg.id === selectedPackageId;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedPackageId(pkg.id)}
                    className={`rounded-3xl border p-5 text-left transition ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-sm"
                        : "border-border bg-background hover:border-primary/40 hover:bg-muted/20"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-foreground">{pkg.label}</div>
                        <div className="mt-2 text-3xl font-bold text-foreground">
                          {pkg.price}
                          <span className="ml-1 text-base font-medium text-muted-foreground">元</span>
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">到账 {pkg.credits} 积分</div>
                      </div>
                      {pkg.badge ? <Badge variant={pkg.highlight ? "default" : "secondary"}>{pkg.badge}</Badge> : null}
                    </div>
                  </button>
                );
              })}

              <div className="md:col-span-2">
                <Button className="w-full" size="lg" onClick={handlePurchase} disabled={isPurchasing || isPolling || !selectedPackage}>
                  {isPurchasing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {isPurchasing ? "正在创建支付订单..." : "去支付宝支付"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <Coins className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">积分扣费规则</CardTitle>
                  <CardDescription>不同功能、模型和分辨率对应不同的积分消耗，下表展示完整明细。</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {PRICING_SECTIONS.map((section) => (
                <div key={section.title} className="rounded-2xl border border-border bg-muted/20 overflow-hidden">
                  <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-muted/30">
                    <span className="font-medium text-foreground">{section.title}</span>
                    <Badge variant="secondary" className="text-xs">{section.unit}</Badge>
                    {section.note && <span className="text-xs text-muted-foreground">({section.note})</span>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="px-4 py-2.5 text-left font-medium">模型</th>
                          {section.cols.map((col) => (
                            <th key={col} className="px-4 py-2.5 text-center font-medium whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, idx) => (
                          <tr key={row.model} className={idx < section.rows.length - 1 ? "border-b border-border/50" : ""}>
                            <td className="px-4 py-2.5 text-foreground whitespace-nowrap">{row.model}</td>
                            {row.values.map((val, ci) => (
                              <td key={section.cols[ci]} className="px-4 py-2.5 text-center tabular-nums">
                                {val === "-" ? (
                                  <span className="text-muted-foreground/40">-</span>
                                ) : (
                                  <span className="font-medium text-foreground">{val}</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
              <div className="text-xs text-muted-foreground leading-relaxed">
                Nano Banana 仅支持 1K 分辨率，"-" 表示该分辨率不可选。实际扣费以操作时页面显示为准。
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-3xl border border-border shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <ReceiptText className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">支付与积分流水</CardTitle>
                  <CardDescription>上方是支付订单，下方是积分到账记录和消费记录。</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-medium text-foreground">最近订单</div>
                  <div className="text-xs text-muted-foreground">共 {totalOrderCount} 笔，已支付 {paidOrderCount} 笔</div>
                </div>

                {orders.length > 0 ? (
                  <div className="space-y-3">
                    {orders.slice(0, 5).map((order) => (
                      <div key={order.id} className="rounded-2xl border border-border bg-muted/10 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-medium text-foreground">{order.subject || order.package_label || order.package_id}</div>
                            <div className="mt-1 text-xs text-muted-foreground">订单号：{order.order_no}</div>
                          </div>
                          <Badge variant={getOrderStatusVariant(order.status)}>{getOrderStatusLabel(order.status)}</Badge>
                        </div>
                        <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
                          <div>金额：{order.amount} 元</div>
                          <div>积分：{order.credits}</div>
                          <div>创建时间：{formatDate(order.created_at)}</div>
                          <div>支付时间：{formatDate(order.paid_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                    暂无支付宝订单，选择套餐后会在这里显示支付状态。
                  </div>
                )}
              </div>

              <Tabs defaultValue="recharges" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="recharges">到账记录</TabsTrigger>
                  <TabsTrigger value="consumptions">消费记录</TabsTrigger>
                </TabsList>

                <TabsContent value="recharges" className="mt-4">
                  {rechargeHistory.length > 0 ? (
                    <div className="space-y-3">
                      {rechargeHistory.slice(0, 10).map((record) => (
                        <div key={record.id} className="rounded-2xl border border-border bg-muted/10 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-foreground">+{record.amount} 积分</div>
                            <Badge variant="default">已到账</Badge>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            <div>时间：{formatDate(record.created_at)}</div>
                            <div>方式：{record.payment_method || "后台手动补充"}</div>
                            {record.notes && <div>备注：{record.notes}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                      暂无到账记录，充值成功后会显示在这里。
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="consumptions" className="mt-4">
                  {consumptionHistory.length > 0 ? (
                    <div className="space-y-3">
                      {consumptionHistory.slice(0, 10).map((record) => (
                        <div key={record.id} className="rounded-2xl border border-border bg-muted/10 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-medium text-foreground">-{record.amount} 积分</div>
                            <Badge variant="outline">{getOperationLabel(record.operation_type)}</Badge>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            <div>说明：{record.description || "系统自动扣费"}</div>
                            <div>时间：{formatDate(record.created_at)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                      暂无消费记录，开始创作后系统会自动记账。
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <Card className="rounded-3xl border border-border shadow-sm">
            <CardContent className="flex items-start justify-between gap-4 p-5">
              <div>
                <div className="font-medium text-foreground">支付成功后未自动跳回？</div>
                <p className="mt-1 text-sm text-muted-foreground">可以返回账户中心或重新打开本页，系统会自动拉取最新积分和订单状态。</p>
              </div>
              <Button variant="outline" onClick={() => window.open(`${getAppOrigin()}/dashboard/account`, "_blank")}>
                账户中心
                <ExternalLink className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
