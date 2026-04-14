/**
 * Vercel Serverless Function — Gemini API reverse proxy.
 *
 * Runs in Vercel's US-East region (iad1), bypassing the Google Gemini
 * geo-block that affects the Hong Kong backend server.
 *
 * The backend POSTs { url, body } here, and this function forwards
 * the request to the actual Gemini API endpoint.
 */

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, body } = req.body || {};

  if (!url || !url.includes("generativelanguage.googleapis.com")) {
    return res.status(400).json({
      error: "INVALID_REQUEST",
      message: "Missing or invalid Gemini API URL",
    });
  }

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

    const data = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.send(data);
  } catch (err) {
    console.error("[gemini-proxy] error:", err);
    res.status(502).json({
      error: "PROXY_ERROR",
      message: err.message || "Failed to reach Gemini API",
    });
  }
}
