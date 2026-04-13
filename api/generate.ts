export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { prompt, aspect_ratio, n, image_base64 } = req.body;
  const vercelEnv = String(process.env.VERCEL_ENV || process.env.NODE_ENV || '').toLowerCase();
  const apiKey =
    process.env.MINIMAX_API_KEY ||
    (vercelEnv === 'production'
      ? process.env.PRODUCTION_MINIMAX_API_KEY
      : process.env.STAGING_MINIMAX_API_KEY);

  if (!String(apiKey || '').trim()) {
    return res.status(503).json({
      error: 'MINIMAX_API_KEY_MISSING',
      message: `MiniMax API key is not configured for ${vercelEnv || 'current'} environment`,
    });
  }
  
  try {
    // Build request body
    const requestBody: any = {
      model: 'image-01',
      prompt,
      aspect_ratio: aspect_ratio || '1:1',
      n: n || 1,
      response_format: 'url',
    };
    
    // Add image if provided - use input_image for product reference
    if (image_base64) {
      requestBody.image_base64 = image_base64;
    }
    
    const response = await fetch('https://api.minimax.chat/v1/image_generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
