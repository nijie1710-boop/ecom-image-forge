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
  
  const API_KEY = 'sk-cp-e6WVIE6k2uQ6FwQRe82XcIj79A-rLfQb0Bz0dqU4shIP9fLsa4aWAUoBwmvQ4zUZhdMitF01u8qAjH6qI4q-LYsZgfLSda4sCVVGWWAIC9K0ji_oT1qLccU';
  
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
        'Authorization': `Bearer ${API_KEY}`,
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
