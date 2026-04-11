import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type OrderAction = "create" | "list" | "status";

interface OrderRequest {
  action: OrderAction;
  packageId?: string;
  origin?: string;
  scene?: "mobile" | "pc";
  orderNo?: string;
}

interface RechargePackage {
  id: string;
  label: string;
  price: number;
  credits: number;
  badge?: string;
  highlight?: boolean;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getDefaultPackages(): RechargePackage[] {
  return [
    { id: "starter", label: "体验包", price: 19.9, credits: 200, badge: "适合试用" },
    { id: "growth", label: "常用包", price: 49.9, credits: 520, badge: "推荐", highlight: true },
    { id: "pro", label: "进阶包", price: 99, credits: 1080, badge: "更省单价" },
    { id: "business", label: "商用包", price: 199, credits: 2280, badge: "高频创作" },
  ];
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

async function importPrivateKey(privateKeyPem: string) {
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(toPemBody(privateKeyPem)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function rsaSign(content: string, privateKeyPem: string) {
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(content));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

function createSignContent(params: Record<string, string>) {
  return Object.keys(params)
    .filter((key) => key !== "sign" && params[key] !== "" && params[key] !== undefined)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function formatTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
}

function detectScene(userAgent: string | null, preferred?: "mobile" | "pc") {
  if (preferred) return preferred;
  const text = String(userAgent || "").toLowerCase();
  return /iphone|android|mobile|ipad|harmonyos/.test(text) ? "mobile" : "pc";
}

function normalizeOrigin(origin?: string | null) {
  const raw = String(origin || "").trim();
  if (!raw) return "";

  try {
    const url = new URL(raw);
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

function createOrderNo(userId: string) {
  const compact = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `PS${compact}${userId.replace(/-/g, "").slice(0, 8)}${random}`;
}

async function getPackages(supabase: ReturnType<typeof createClient>) {
  const defaults = getDefaultPackages();
  const { data } = await supabase.from("admin_settings").select("value").eq("key", "recharge_packages").maybeSingle();
  return (data?.value as RechargePackage[] | undefined) || defaults;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return json({ error: "支付系统配置缺失，请联系管理员。" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "未登录，请先登录" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, serviceKey);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "未登录，请先登录" }, 401);
    }

    const body = (await req.json().catch(() => ({}))) as OrderRequest;
    const action = body.action;

    if (action === "list") {
      const { data, error } = await supabase
        .from("recharge_orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return json({ orders: data || [] });
    }

    if (action === "status") {
      if (!body.orderNo) {
        return json({ error: "缺少订单号" }, 400);
      }
      const { data, error } = await supabase
        .from("recharge_orders")
        .select("*")
        .eq("order_no", body.orderNo)
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "订单不存在" }, 404);
      return json({ order: data });
    }

    if (action !== "create") {
      return json({ error: "不支持的支付操作" }, 400);
    }

    if (!body.packageId) {
      return json({ error: "请选择充值套餐" }, 400);
    }

    const appId = Deno.env.get("ALIPAY_APP_ID");
    const privateKey = Deno.env.get("ALIPAY_PRIVATE_KEY");
    const gateway = Deno.env.get("ALIPAY_GATEWAY_URL") || "https://openapi.alipay.com/gateway.do";
    const configuredAppUrl = normalizeOrigin(Deno.env.get("APP_URL"));
    const configuredNotifyUrl = Deno.env.get("ALIPAY_NOTIFY_URL");
    const configuredReturnUrl = normalizeOrigin(Deno.env.get("ALIPAY_RETURN_URL"));

    if (!appId || !privateKey) {
      return json({ error: "支付宝商户配置未完成，请先配置 APP_ID 和私钥。" }, 500);
    }
    if (!configuredAppUrl) {
      return json({ error: "支付系统 APP_URL 未配置，请联系管理员。" }, 500);
    }

    const packages = await getPackages(supabase);
    const selectedPackage = packages.find((item) => item.id === body.packageId);
    if (!selectedPackage) {
      return json({ error: "充值套餐不存在，请刷新页面后重试。" }, 400);
    }

    const scene = detectScene(req.headers.get("user-agent"), body.scene);
    const origin =
      normalizeOrigin(body.origin) ||
      normalizeOrigin(req.headers.get("origin")) ||
      configuredReturnUrl ||
      configuredAppUrl;
    const orderNo = createOrderNo(user.id);
    const notifyUrl = configuredNotifyUrl || `${supabaseUrl}/functions/v1/alipay-notify`;
    const returnUrl = `${origin}/dashboard/recharge?payment_status=return&order_no=${orderNo}`;
    const method = scene === "mobile" ? "alipay.trade.wap.pay" : "alipay.trade.page.pay";
    const productCode = scene === "mobile" ? "QUICK_WAP_WAY" : "FAST_INSTANT_TRADE_PAY";

    const subject = `${selectedPackage.label} - ${selectedPackage.credits}积分`;
    const bizContent = JSON.stringify({
      out_trade_no: orderNo,
      total_amount: Number(selectedPackage.price).toFixed(2),
      subject,
      product_code: productCode,
    });

    const params: Record<string, string> = {
      app_id: appId,
      method,
      format: "JSON",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: formatTimestamp(),
      version: "1.0",
      notify_url: notifyUrl,
      return_url: returnUrl,
      biz_content: bizContent,
    };

    const signContent = createSignContent(params);
    const sign = await rsaSign(signContent, privateKey);

    const { error: orderError } = await supabase.from("recharge_orders").insert({
      user_id: user.id,
      order_no: orderNo,
      package_id: selectedPackage.id,
      package_label: selectedPackage.label,
      amount: selectedPackage.price,
      credits: selectedPackage.credits,
      payment_channel: scene === "mobile" ? "alipay_wap" : "alipay_page",
      status: "pending",
      subject,
      notes: `创建支付宝订单：${selectedPackage.label}`,
    });

    if (orderError) throw orderError;

    const search = new URLSearchParams({ ...params, sign });
    return json({
      order: {
        order_no: orderNo,
        amount: selectedPackage.price,
        credits: selectedPackage.credits,
        status: "pending",
      },
      payUrl: `${gateway}?${search.toString()}`,
      scene,
    });
  } catch (error) {
    console.error("alipay-order failed:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "创建支付订单失败，请稍后再试。",
      },
      500,
    );
  }
});
