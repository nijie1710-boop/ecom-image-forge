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
      const { error } = await supabase
        .from("recharge_orders")
        .update({
          status: tradeStatus ? tradeStatus.toLowerCase() : "pending",
          raw_notify: payload,
          updated_at: new Date().toISOString(),
        })
        .eq("order_no", orderNo);

      if (error) throw error;
      return textResponse(res, 200, "success");
    }

    const { data, error } = await supabase.rpc("apply_recharge_order_payment", {
      p_order_no: orderNo,
      p_trade_no: payload.trade_no || null,
      p_buyer_logon_id: payload.buyer_logon_id || null,
      p_raw_notify: payload,
    });

    if (error) throw error;
    if (!data || data.length === 0) {
      return textResponse(res, 404, "fail");
    }

    return textResponse(res, 200, "success");
  } catch (error) {
    console.error("alipay notify failed:", error instanceof Error ? error.message : error);
    return textResponse(res, 500, "fail");
  }
}
