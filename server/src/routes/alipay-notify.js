import { Router } from "express";
import crypto from "crypto";
import pool from "../db/pool.js";

const router = Router();

/**
 * Verify Alipay RSA2 (SHA256WithRSA) signature.
 */
function verifyAlipaySignature(params, publicKey) {
  const sign = params.sign;
  const signType = params.sign_type || "RSA2";
  if (!sign) return false;

  // Build sorted string excluding sign and sign_type
  const sorted = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type" && params[k] !== "" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  let publicKeyPem = publicKey;
  if (!publicKeyPem.includes("-----BEGIN")) {
    publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${publicKeyPem}\n-----END PUBLIC KEY-----`;
  }

  try {
    const algorithm = signType === "RSA2" ? "RSA-SHA256" : "RSA-SHA1";
    const verify = crypto.createVerify(algorithm);
    verify.update(sorted);
    return verify.verify(publicKeyPem, sign, "base64");
  } catch (err) {
    console.error("[alipay-notify] Signature verification error:", err.message);
    return false;
  }
}

/**
 * POST /api/alipay-notify
 *
 * Alipay sends form-urlencoded async notifications here after payment.
 * No auth required — Alipay calls this directly.
 * We verify the RSA signature, then call apply_recharge_order_payment().
 */
router.post("/", async (req, res) => {
  try {
    const params = req.body;
    const orderNo = params.out_trade_no;
    const tradeNo = params.trade_no;
    const tradeStatus = params.trade_status;
    const buyerLogonId = params.buyer_logon_id || params.buyer_id || "";

    console.info(`[alipay-notify] Received: order=${orderNo} trade=${tradeNo} status=${tradeStatus}`);

    // ── 1. Verify signature ──────────────────────────────────────────
    const alipayPublicKey = process.env.ALIPAY_PUBLIC_KEY;
    if (!alipayPublicKey) {
      console.error("[alipay-notify] ALIPAY_PUBLIC_KEY not configured");
      return res.status(500).send("fail");
    }

    if (!verifyAlipaySignature(params, alipayPublicKey)) {
      console.warn("[alipay-notify] Signature verification FAILED for order:", orderNo);
      return res.status(400).send("fail");
    }

    console.info(`[alipay-notify] Signature verified for order: ${orderNo}`);

    // ── 2. Only process successful payments ──────────────────────────
    if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
      // Other statuses (WAIT_BUYER_PAY, TRADE_CLOSED) — acknowledge but don't process
      console.info(`[alipay-notify] Ignoring status ${tradeStatus} for order: ${orderNo}`);
      return res.send("success");
    }

    // ── 3. Check if already processed (idempotent) ───────────────────
    const existing = await pool.query(
      "SELECT status FROM recharge_orders WHERE order_no = $1",
      [orderNo]
    );

    if (existing.rows.length === 0) {
      console.warn(`[alipay-notify] Order not found: ${orderNo}`);
      return res.send("success"); // Return success so Alipay stops retrying
    }

    if (existing.rows[0].status === "paid") {
      console.info(`[alipay-notify] Order already paid, skipping: ${orderNo}`);
      return res.send("success");
    }

    // ── 4. Apply payment: update order + add balance (atomic) ────────
    const result = await pool.query(
      "SELECT * FROM apply_recharge_order_payment($1, $2, $3, $4)",
      [orderNo, tradeNo, buyerLogonId, JSON.stringify(params)]
    );

    const row = result.rows[0];
    if (row) {
      console.info(
        `[alipay-notify] Payment applied: order=${orderNo} user=${row.user_id} credits=${row.credits} new_balance=${row.new_balance}`
      );
    } else {
      console.warn(`[alipay-notify] apply_recharge_order_payment returned no rows for: ${orderNo}`);
    }

    // ── 5. Return "success" to Alipay ────────────────────────────────
    return res.send("success");
  } catch (err) {
    console.error("[alipay-notify] Error:", err);
    // Return "fail" so Alipay will retry
    return res.status(500).send("fail");
  }
});

export default router;
