import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function textResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function toPemBody(pem: string) {
  return String(pem || "")
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
}

function base64ToBytes(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function importPublicKey(publicKeyPem: string) {
  return crypto.subtle.importKey(
    "spki",
    base64ToBytes(toPemBody(publicKeyPem)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

function createSignContent(params: Record<string, string>) {
  return Object.keys(params)
    .filter((key) => key !== "sign" && key !== "sign_type" && params[key] !== "" && params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

async function verifySign(params: Record<string, string>, sign: string, publicKeyPem: string) {
  const key = await importPublicKey(publicKeyPem);
  const content = createSignContent(params);
  const signature = base64ToBytes(sign);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, new TextEncoder().encode(content));
}

async function ensureBalanceRow(supabase: ReturnType<typeof createClient>, userId: string) {
  const { error } = await supabase.from("user_balances").insert({
    user_id: userId,
    balance: 0,
    total_recharged: 0,
    total_consumed: 0,
  });

  if (error && !String(error.message || "").includes("duplicate key")) {
    throw error;
  }
}

async function applyRecharge(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  credits: number,
  paymentMethod: string,
  notes: string,
) {
  await ensureBalanceRow(supabase, userId);

  const { data: balanceRow, error: balanceError } = await supabase
    .from("user_balances")
    .select("balance,total_recharged")
    .eq("user_id", userId)
    .single();

  if (balanceError) throw balanceError;

  const nextBalance = Number(balanceRow.balance || 0) + credits;
  const nextRecharged = Number(balanceRow.total_recharged || 0) + credits;
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("user_balances")
    .update({
      balance: nextBalance,
      total_recharged: nextRecharged,
      updated_at: now,
    })
    .eq("user_id", userId);
  if (updateError) throw updateError;

  const { error: insertError } = await supabase.from("recharge_records").insert({
    user_id: userId,
    amount: credits,
    payment_method: paymentMethod,
    status: "completed",
    notes,
    completed_at: now,
  });
  if (insertError) throw insertError;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return textResponse("method not allowed", 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const appId = Deno.env.get("ALIPAY_APP_ID");
    const publicKey = Deno.env.get("ALIPAY_PUBLIC_KEY");

    if (!supabaseUrl || !serviceKey || !appId || !publicKey) {
      return textResponse("fail", 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const raw = await req.text();
    const search = new URLSearchParams(raw);
    const sign = search.get("sign") || "";

    const params = Object.fromEntries(search.entries());
    const verified = await verifySign(params, sign, publicKey);
    if (!verified) {
      console.error("alipay-notify verify sign failed");
      return textResponse("fail", 400);
    }

    if ((params.app_id || "") !== appId) {
      console.error("alipay-notify app id mismatch");
      return textResponse("fail", 400);
    }

    const orderNo = params.out_trade_no;
    if (!orderNo) return textResponse("fail", 400);

    const { data: order, error: orderError } = await supabase
      .from("recharge_orders")
      .select("*")
      .eq("order_no", orderNo)
      .maybeSingle();

    if (orderError || !order) {
      console.error("alipay-notify order missing", orderError);
      return textResponse("fail", 404);
    }

    if (order.status === "paid") {
      return textResponse("success");
    }

    const tradeStatus = params.trade_status || "";
    const paid = tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED";

    if (!paid) {
      const { error: pendingUpdateError } = await supabase
        .from("recharge_orders")
        .update({
          status: tradeStatus ? tradeStatus.toLowerCase() : "pending",
          raw_notify: params,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id);
      if (pendingUpdateError) throw pendingUpdateError;
      return textResponse("success");
    }

    await applyRecharge(
      supabase,
      order.user_id,
      Number(order.credits || 0),
      order.payment_channel || "alipay_page",
      `支付宝订单 ${order.order_no}`,
    );

    const { error: updateOrderError } = await supabase
      .from("recharge_orders")
      .update({
        status: "paid",
        trade_no: params.trade_no || null,
        buyer_logon_id: params.buyer_logon_id || null,
        paid_at: new Date().toISOString(),
        raw_notify: params,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (updateOrderError) throw updateOrderError;

    return textResponse("success");
  } catch (error) {
    console.error("alipay-notify failed:", error);
    return textResponse("fail", 500);
  }
});
