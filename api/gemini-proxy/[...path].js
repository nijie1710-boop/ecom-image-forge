/**
 * Vercel Serverless Function — Gemini API reverse proxy.
 *
 * Runs in Vercel's US-East region (iad1), bypassing the Google Gemini
 * geo-block that affects the Hong Kong backend server.
 *
 * The backend sets GEMINI_BASE_URL to point here, so all Gemini API
 * calls are transparently proxied through this function.
 */

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  // CORS — allow calls from the backend server
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  // Build path from the catch-all segments
  const pathSegments = req.query.path;
  if (!pathSegments || pathSegments.length === 0) {
    return res.status(400).json({ error: "Missing API path" });
  }

  const targetPath = Array.isArray(pathSegments)
    ? pathSegments.join("/")
    : pathSegments;

  // Preserve query string (contains the API key, etc.)
  const qsIndex = req.url.indexOf("?");
  const queryString = qsIndex >= 0 ? req.url.substring(qsIndex) : "";

  const targetUrl = `https://generativelanguage.googleapis.com/${targetPath}${queryString}`;

  try {
    const fetchOptions = {
      method: req.method,
      headers: { "Content-Type": "application/json" },
    };

    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      fetchOptions.body =
        typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const upstream = await fetch(targetUrl, fetchOptions);

    // Stream the response back
    const contentType =
      upstream.headers.get("content-type") || "application/json";
    res.status(upstream.status);
    res.setHeader("Content-Type", contentType);

    const data = await upstream.arrayBuffer();
    res.send(Buffer.from(data));
  } catch (err) {
    console.error("[gemini-proxy] error:", err);
    res.status(502).json({
      error: "PROXY_ERROR",
      message: err.message || "Failed to reach Gemini API",
    });
  }
}
