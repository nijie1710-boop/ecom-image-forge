import { handleOptions, parseJsonBody, proxySupabaseAuth } from "./_shared.js";

export default async function handler(req, res) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { email, password, displayName, emailRedirectTo } = await parseJsonBody(req);
  if (!email || !password) {
    return res.status(400).json({ error: "Missing email or password" });
  }

  try {
    await proxySupabaseAuth(res, "/auth/v1/signup", {
      email,
      password,
      data: displayName ? { display_name: displayName } : undefined,
      email_redirect_to: emailRedirectTo,
    });
  } catch (error) {
    res.status(error?.status || 502).json({
      error: error?.code || "AUTH_PROXY_FAILED",
      message: error?.message || "Signup proxy request failed",
    });
  }
}
