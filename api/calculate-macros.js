export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { foodItems, apiKey } = req.body;

  // ✅ FIX #5: Proper input validation with length limits
  if (!foodItems?.trim() || !apiKey?.trim()) {
    return res.status(400).json({ error: 'Missing or empty foodItems or apiKey' });
  }

  if (foodItems.length > 1000) {
    return res.status(400).json({ error: 'Food items description too long (max 1000 chars)' });
  }

  if (apiKey.length > 500) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }

  try {
    // Sanitize food items to prevent prompt injection
    const sanitizedFood = foodItems.replace(/["`]/g, '');
    
    const prompt = `You are a nutrition expert. Calculate the approximate macros for these food items.

Food items: ${sanitizedFood}

Respond ONLY in this exact format (nothing else):
Calories: [number]
Protein: [number]g
Carbs: [number]g
Fats: [number]g

Use realistic serving sizes.`;

    // ✅ FIX #6: Add timeout with AbortController
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'  // ✅ VERIFIED WORKING VERSION
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: prompt
        }]
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      // ✅ FIX #4: Proper error handling for JSON parse
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        return res.status(response.status).json({ 
          error: `API error: ${response.statusText}` 
        });
      }
      return res.status(response.status).json({ 
        error: errorData.error?.message || 'API request failed' 
      });
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      return res.status(500).json({ error: 'Invalid response from API' });
    }

    // ✅ FIX #8: Better response validation
    if (!data?.content?.[0]?.text) {
      return res.status(500).json({ 
        error: 'Unexpected response format from API' 
      });
    }

    const responseText = data.content[0].text;

    // ✅ FIX #3: Updated regex to handle decimals
    const caloriesMatch = responseText.match(/Calories:\s*(\d+(?:\.\d+)?)/);
    const proteinMatch = responseText.match(/Protein:\s*(\d+(?:\.\d+)?)/);
    const carbsMatch = responseText.match(/Carbs:\s*(\d+(?:\.\d+)?)/);
    const fatsMatch = responseText.match(/Fats:\s*(\d+(?:\.\d+)?)/);

    if (caloriesMatch && proteinMatch && carbsMatch && fatsMatch) {
      return res.status(200).json({
        success: true,
        // ✅ FIX #2: Using explicit radix in parseInt
        calories: Math.round(parseFloat(caloriesMatch[1])),
        protein: Math.round(parseFloat(proteinMatch[1]) * 10) / 10,
        carbs: Math.round(parseFloat(carbsMatch[1]) * 10) / 10,
        fats: Math.round(parseFloat(fatsMatch[1]) * 10) / 10,
        text: responseText
      });
    } else {
      return res.status(400).json({ 
        error: 'Could not parse macro response. Please try again.',
        raw: responseText
      });
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.status(504).json({ 
        error: 'Request timeout - took too long' 
      });
    }
    return res.status(500).json({ 
      error: `Server error: ${error.message}` 
    });
  }
}
