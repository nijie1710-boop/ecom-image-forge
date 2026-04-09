import {
  buildEnvErrorMessage,
  createAdminClient,
  getMissingEnv,
  getRequiredNotifyEnv,
  handleOptions,
  parseFormEncoded,
  parseRawBody,
  verifyAlipaySignature,
} from "./payments/_shared.js";

function textResponse(res, status, body) {
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.status(status).send(body);
}

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return textResponse(res, 405, "method not allowed");
  }

  try {
    const requiredEnv = getRequiredNotifyEnv();
    const missingEnv = getMissingEnv(requiredEnv);
    if (missingEnv.length > 0) {
      return textResponse(res, 500, buildEnvErrorMessage(missingEnv));
    }

    const rawBody = await parseRawBody(req);
    const payload = parseFormEncoded(rawBody);
    const sign = String(payload.sign || "");

    if (!sign) {
      return textResponse(res, 400, "fail");
    }

    const verified = verifyAlipaySignature(payload, sign, requiredEnv.ALIPAY_PUBLIC_KEY);
    if (!verified) {
      return textResponse(res, 400, "fail");
    }

    if (String(payload.app_id || "") !== requiredEnv.ALIPAY_APP_ID) {
      return textResponse(res, 400, "fail");
    }

    const orderNo = String(payload.out_trade_no || "").trim();
    if (!orderNo) {
      return textResponse(res, 400, "fail");
    }

    const tradeStatus = String(payload.trade_status || "").trim();
    const paid = tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED";
    const supabase = createAdminClient();

    if (!paid) {
      // 幂等：只在状态确实变化时才写库，避免重复通知反复更新
      const { data: existing } = await supabase
        .from("recharge_orders")
        .select("status")
        .eq("order_no", orderNo)
        .maybeSingle();

      const newStatus = tradeStatus ? tradeStatus.toLowerCase() : "pending";
      if (existing && existing.status !== newStatus && existing.status !== "paid") {
        const { error } = await supabase
          .from("recharge_orders")
          .update({
            status: newStatus,
            raw_notify: payload,
            updated_at: new Date().toISOString(),
          })
          .eq("order_no", orderNo);

        if (error) throw error;
      }

      // 不管订单是否存在都返回 success，避免支付宝无限重试
      return textResponse(res, 200, "success");
    }

    // 校验通知金额与订单金额一致，防止篡改
    const { data: orderRow } = await supabase
      .from("recharge_orders")
      .select("amount")
      .eq("order_no", orderNo)
      .maybeSingle();

    if (!orderRow) {
      // 订单不存在，告知支付宝已收到，不再重试
      return textResponse(res, 200, "success");
    }

    const notifyAmount = Number(payload.total_amount || 0);
    const orderAmount = Number(orderRow.amount || 0);
    if (Math.abs(notifyAmount - orderAmount) > 0.01) {
      console.error(`alipay notify amount mismatch: notify=${notifyAmount} order=${orderAmount} order_no=${orderNo}`);
      return textResponse(res, 400, "fail");
    }

    const { data, error } = await supabase.rpc("apply_recharge_order_payment", {
      p_order_no: orderNo,
      p_trade_no: payload.trade_no || null,
      p_buyer_logon_id: payload.buyer_logon_id || null,
      p_raw_notify: payload,
    });

    if (error) throw error;
    if (!data || data.length === 0) {
      // RPC 返回空 = 订单已处理（幂等），告知支付宝成功
      return textResponse(res, 200, "success");
    }

    return textResponse(res, 200, "success");
  } catch (error) {
    console.error("alipay notify failed:", error instanceof Error ? error.message : error);
    return textResponse(res, 500, "fail");
  }
}
