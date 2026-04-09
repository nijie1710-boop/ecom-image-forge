/**
 * 此 Edge Function 已停用。
 *
 * 支付宝异步通知（notify_url）统一由 Vercel API Route 处理：
 *   /api/alipay-notify  →  api/alipay-notify.js
 *
 * 请在支付宝开放平台和环境变量 ALIPAY_NOTIFY_URL 中
 * 将回调地址指向 Vercel 部署的 /api/alipay-notify。
 *
 * 如果此函数仍部署在 Supabase，请在 Supabase 控制台手动删除它：
 *   Dashboard → Edge Functions → alipay-notify → Delete
 */
Deno.serve(() => {
  return new Response("此回调入口已停用，请检查 ALIPAY_NOTIFY_URL 配置。", {
    status: 410,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
});
