import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Coins, CreditCard, History, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface BalanceInfo {
  balance: number;
  total_recharged: number;
  total_consumed: number;
  recharge_count: number;
  consumption_count: number;
}

interface RechargeRecord {
  id: string;
  amount: number;
  payment_method: string;
  status: string;
  notes: string;
  created_at: string;
  completed_at: string;
}

interface ConsumptionRecord {
  id: string;
  amount: number;
  operation_type: string;
  description: string;
  created_at: string;
}

const RECHARGE_PACKAGES = [
  { amount: 50, coins: 50, label: "50积分", price: "¥50", popular: false },
  { amount: 100, coins: 110, label: "110积分", price: "¥100", popular: true, bonus: "多送10积分" },
  { amount: 200, coins: 230, label: "230积分", price: "¥200", popular: false, bonus: "多送30积分" },
  { amount: 500, coins: 600, label: "600积分", price: "¥500", popular: false, bonus: "多送100积分" },
];

const COST_PER_IMAGE = 1; // 每张图消耗1积分

export default function RechargePage() {
  const { t } = useTranslation();
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [rechargeHistory, setRechargeHistory] = useState<RechargeRecord[]>([]);
  const [consumptionHistory, setConsumptionHistory] = useState<ConsumptionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<typeof RECHARGE_PACKAGES[0] | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [activeTab, setActiveTab] = useState<"recharge" | "history">("recharge");

  useEffect(() => {
    loadBalance();
    loadHistory();
  }, []);

  const loadBalance = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("请先登录");
        return;
      }

      const { data, error } = await supabase.functions.invoke("manage-balance", {
        body: { action: "get" },
      });

      if (error) throw error;
      setBalance(data.balance);
    } catch (err: any) {
      console.error("加载余额失败:", err);
      toast.error("加载余额失败");
    } finally {
      setIsLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.functions.invoke("manage-balance", {
        body: { action: "history" },
      });

      if (error) throw error;
      setRechargeHistory(data.recharges || []);
      setConsumptionHistory(data.consumptions || []);
    } catch (err: any) {
      console.error("加载历史记录失败:", err);
    }
  };

  const handleRecharge = async (pkg: typeof RECHARGE_PACKAGES[0]) => {
    setSelectedPackage(pkg);
    setShowQR(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedPackage) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("请先登录");
        return;
      }

      // 调用充值接口（这里需要管理员审核后才能到账）
      const { error } = await supabase.functions.invoke("manage-balance", {
        body: {
          action: "recharge",
          amount: selectedPackage.coins,
          paymentMethod: "wechat",
          notes: `申请充值${selectedPackage.coins}积分`,
        },
      });

      if (error) throw error;

      toast.success("充值申请已提交！请联系客服确认转账后加积分");
      setShowQR(false);
      setSelectedPackage(null);
      loadBalance();
      loadHistory();
    } catch (err: any) {
      toast.error(err.message || "提交失败");
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getOperationLabel = (type: string) => {
    const labels: Record<string, string> = {
      generate_image: "生成图片",
      generate_copy: "生成文案",
      translate_image: "翻译图片",
      manual_adjustment: "手动调整",
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    );
  }

  // ========== 诊断信息（部署排查用）==========
  const BUILD_TAG = "diag-2026-03-28-01";
  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "未设置";
  const PROJECT_REF = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || "解析失败";
  const ORIGIN = typeof window !== "undefined" ? window.location.origin : "N/A";

  return (
    <div className="space-y-6 p-4 max-w-4xl mx-auto">
      {/* 诊断信息卡片（临时排查用） */}
      <div style={{ background: "#1a1a2e", color: "#00ff88", padding: "12px 16px", borderRadius: "8px", fontFamily: "monospace", fontSize: "13px" }}>
        <div style={{ fontWeight: "bold", marginBottom: "6px", color: "#ff6b6b" }}>🔍 部署诊断信息</div>
        <div>Build Tag : {BUILD_TAG}</div>
        <div>Supabase URL : {SUPABASE_URL}</div>
        <div>Project Ref : {PROJECT_REF}</div>
        <div>Origin : {ORIGIN}</div>
      </div>

      {/* 余额卡片 */}
      <Card className="bg-gradient-to-r from-purple-600 to-blue-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm">当前积分余额</p>
              <p className="text-4xl font-bold">{balance?.balance || 0}</p>
              <p className="text-purple-100 text-sm mt-2">
                已累计充值 {balance?.total_recharged || 0} 积分 · 已消耗 {balance?.total_consumed || 0} 积分
              </p>
            </div>
            <Coins className="w-16 h-16 text-purple-200" />
          </div>
        </CardContent>
      </Card>

      {/* 费用说明 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-gray-600">
            <strong>积分规则：</strong>生成1张图片消耗{COST_PER_IMAGE}积分，余额不足时将无法生成新图片。
          </p>
        </CardContent>
      </Card>

      {/* Tab 切换 */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab("recharge")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "recharge"
              ? "text-purple-600 border-b-2 border-purple-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          充值积分
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "history"
              ? "text-purple-600 border-b-2 border-purple-600"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          充值记录
        </button>
      </div>

      {/* 充值选项 */}
      {activeTab === "recharge" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {RECHARGE_PACKAGES.map((pkg) => (
              <Card
                key={pkg.amount}
                className={`cursor-pointer transition-all hover:shadow-lg ${
                  pkg.popular ? "ring-2 ring-purple-500" : ""
                }`}
                onClick={() => handleRecharge(pkg)}
              >
                <CardContent className="p-4 text-center">
                  {pkg.popular && (
                    <span className="inline-block px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full mb-2">
                      最受欢迎
                    </span>
                  )}
                  <p className="text-2xl font-bold text-purple-600">{pkg.coins}</p>
                  <p className="text-sm text-gray-500">积分</p>
                  <p className="text-lg font-semibold mt-2">{pkg.price}</p>
                  {pkg.bonus && (
                    <p className="text-xs text-green-600 mt-1">{pkg.bonus}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 支付说明 */}
          <Card className="bg-gray-50">
            <CardContent className="p-4">
              <h3 className="font-semibold mb-2">充值方式</h3>
              <p className="text-sm text-gray-600 mb-2">1. 选择您要充值的积分套餐</p>
              <p className="text-sm text-gray-600 mb-2">2. 点击"联系客服转账"获取收款二维码</p>
              <p className="text-sm text-gray-600 mb-3">3. 转账成功后联系客服，积分会在1小时内到账</p>
              <p className="text-xs text-gray-500">
                <strong>客服微信：</strong>扫码页面底部二维码或搜索微信号
              </p>
            </CardContent>
          </Card>

          {/* 二维码弹窗 */}
          {showQR && selectedPackage && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <Card className="max-w-md w-full">
                <CardHeader>
                  <CardTitle>扫码支付</CardTitle>
                  <CardDescription>
                    充值 <strong className="text-purple-600">{selectedPackage.coins}</strong> 积分
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 微信收款码 */}
                  <div className="bg-gray-100 rounded-lg p-8 text-center">
                    <p className="text-gray-500 text-sm mb-4">请扫描下方微信收款码付款</p>
                    <div className="w-48 h-48 mx-auto bg-white rounded-lg flex items-center justify-center border">
                      <img src="/wechat-pay-qr.jpg" alt="微信收款码" className="w-full h-full object-contain rounded-lg" />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">微信支付</p>
                  </div>

                  <div className="text-center text-sm text-gray-600">
                    <p>支付 <strong className="text-purple-600">{selectedPackage.price}</strong> = {selectedPackage.coins} 积分</p>
                    {selectedPackage.bonus && (
                      <p className="text-green-600 mt-1">{selectedPackage.bonus}</p>
                    )}
                  </div>

                  <div className="bg-yellow-50 p-3 rounded-lg text-sm text-yellow-800">
                    <p>⚠️ 转账后请截图保留凭证</p>
                    <p>然后点击"已转账，联系客服"确认</p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowQR(false);
                        setSelectedPackage(null);
                      }}
                    >
                      取消
                    </Button>
                    <Button
                      className="flex-1 bg-purple-600 hover:bg-purple-700"
                      onClick={handleConfirmPayment}
                    >
                      已转账，联系客服
                    </Button>
                  </div>

                  <p className="text-center text-sm text-gray-500">
                    客服确认后积分会自动到账
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      {/* 充值记录 */}
      {activeTab === "history" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">充值记录</CardTitle>
            </CardHeader>
            <CardContent>
              {rechargeHistory.length === 0 ? (
                <p className="text-gray-500 text-center py-8">暂无充值记录</p>
              ) : (
                <div className="space-y-3">
                  {rechargeHistory.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between py-3 border-b last:border-0"
                    >
                      <div>
                        <p className="font-medium">+{record.amount} 积分</p>
                        <p className="text-sm text-gray-500">{formatDate(record.created_at)}</p>
                        {record.notes && (
                          <p className="text-xs text-gray-400">{record.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            record.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : record.status === "pending"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {record.status === "completed" ? "已完成" : "处理中"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">消费记录</CardTitle>
            </CardHeader>
            <CardContent>
              {consumptionHistory.filter(r => r.operation_type !== 'manual_adjustment').length === 0 ? (
                <p className="text-gray-500 text-center py-8">暂无消费记录</p>
              ) : (
                <div className="space-y-3">
                  {consumptionHistory
                    .filter(r => r.operation_type !== 'manual_adjustment')
                    .map((record) => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between py-3 border-b last:border-0"
                      >
                        <div>
                          <p className="font-medium">{getOperationLabel(record.operation_type)}</p>
                          <p className="text-sm text-gray-500">{formatDate(record.created_at)}</p>
                          {record.description && (
                            <p className="text-xs text-gray-400">{record.description}</p>
                          )}
                        </div>
                        <span className="text-red-600 font-medium">
                          -{Math.abs(record.amount)} 积分
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
