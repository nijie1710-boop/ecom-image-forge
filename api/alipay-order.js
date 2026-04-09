import {
  appendQueryParams,
  buildEnvErrorMessage,
  createAdminClient,
  createOrderNo,
  formatAlipayTimestamp,
  getMissingEnv,
  getPaymentPackages,
  getRequiredOrderEnv,
  handleOptions,
  parseJsonBody,
  requireUserFromRequest,
  respondJson,
  signAlipayParams,
} from "./payments/_shared.js";

async function loadPackages(supabase) {
  const fallback = getPaymentPackages();
  const { data, error } = await supabase
    .from("admin_settings")
    .select("value")
    .eq("key", "recharge_packages")
    .maybeSingle();

  if (error) return fallback;
  return Array.isArray(data?.value) && data.value.length > 0 ? data.value : fallback;
}

function getAction(body) {
  return String(body?.action || "").trim();
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return respondJson(res, 405, {
      error: "METHOD_NOT_ALLOWED",
      message: "仅支持 POST 请求",
    });
  }

  try {
    const body = await parseJsonBody(req);
    const action = getAction(body);
    const supabase = createAdminClient();
    const user = await requireUserFromRequest(req);

    if (action === "list") {
      const { data, error } = await supabase
        .from("recharge_orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return respondJson(res, 200, { orders: data || [] });
    }

    if (action === "status") {
      const orderNo = String(body?.orderNo || "").trim();
      if (!orderNo) {
        return respondJson(res, 400, {
          error: "ORDER_NO_REQUIRED",
          message: "缺少订单号",
        });
      }

      const { data, error } = await supabase
        .from("recharge_orders")
        .select("*")
        .eq("order_no", orderNo)
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return respondJson(res, 404, {
          error: "ORDER_NOT_FOUND",
          message: "订单不存在",
        });
      }

      return respondJson(res, 200, { order: data });
    }

    if (action !== "create") {
      return respondJson(res, 400, {
        error: "INVALID_ACTION",
        message: "不支持的支付操作",
      });
    }

    const requiredEnv = getRequiredOrderEnv();
    const missingEnv = getMissingEnv(requiredEnv);
    if (missingEnv.length > 0) {
      return respondJson(res, 500, {
        error: "PAYMENT_ENV_MISSING",
        message: buildEnvErrorMessage(missingEnv),
      });
    }

    const packageId = String(body?.packageId || "").trim();
    if (!packageId) {
      return respondJson(res, 400, {
        error: "PACKAGE_REQUIRED",
        message: "请选择充值套餐",
      });
    }

    const packages = await loadPackages(supabase);
    const selectedPackage = packages.find((item) => item.id === packageId);
    if (!selectedPackage) {
      return respondJson(res, 400, {
        error: "PACKAGE_NOT_FOUND",
        message: "充值套餐不存在，请刷新页面后重试",
      });
    }

    const orderNo = createOrderNo(user.id);
    const subject = `${selectedPackage.label} - ${selectedPackage.credits} 积分`;
    const bizContent = JSON.stringify({
      out_trade_no: orderNo,
      total_amount: Number(selectedPackage.price).toFixed(2),
      subject,
      product_code: "FAST_INSTANT_TRADE_PAY",
    });

    const params = {
      app_id: requiredEnv.ALIPAY_APP_ID,
      method: "alipay.trade.page.pay",
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: formatAlipayTimestamp(),
      version: "1.0",
      notify_url: requiredEnv.ALIPAY_NOTIFY_URL,
      return_url: appendQueryParams(requiredEnv.ALIPAY_RETURN_URL, {
        payment_status: "return",
        order_no: orderNo,
      }),
      biz_content: bizContent,
    };

    const sign = signAlipayParams(params, requiredEnv.ALIPAY_PRIVATE_KEY);

    const { error: insertError } = await supabase.from("recharge_orders").insert({
      user_id: user.id,
      order_no: orderNo,
      package_id: selectedPackage.id,
      package_label: selectedPackage.label,
      amount: selectedPackage.price,
      credits: selectedPackage.credits,
      payment_channel: "alipay_page",
      status: "pending",
      subject,
      notes: `创建支付宝电脑网站支付订单：${selectedPackage.label}`,
    });

    if (insertError) throw insertError;

    const search = new URLSearchParams({ ...params, sign });
    return respondJson(res, 200, {
      order: {
        order_no: orderNo,
        amount: selectedPackage.price,
        credits: selectedPackage.credits,
        status: "pending",
        package_id: selectedPackage.id,
      },
      payUrl: `${requiredEnv.ALIPAY_GATEWAY}?${search.toString()}`,
    });
  } catch (error) {
    const status = Number(error?.status || 500);
    return respondJson(res, status, {
      error: status === 401 ? "UNAUTHORIZED" : "ALIPAY_ORDER_FAILED",
      message: error instanceof Error ? error.message : "创建支付订单失败，请稍后再试",
    });
  }
}
