import { handleOptions, parseJsonBody, proxySupabaseAuth } from "./_shared.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, redirectTo } = await parseJsonBody(req);
  if (!email) {
    return res.status(400).json({ error: "Missing email" });
  }

  try {
    await proxySupabaseAuth(res, "/auth/v1/recover", {
      email,
      redirect_to: redirectTo,
    });
  } catch (error) {
    res.status(502).json({
      error: "AUTH_PROXY_FAILED",
      message: error?.message || "Reset password proxy request failed",
    });
  }
}
