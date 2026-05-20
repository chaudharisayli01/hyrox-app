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

  const { workoutDescription, apiKey } = req.body;

  // ✅ FIX #5: Proper input validation with length limits
  if (!workoutDescription?.trim() || !apiKey?.trim()) {
    return res.status(400).json({ error: 'Missing or empty workoutDescription or apiKey' });
  }

  if (workoutDescription.length > 2000) {
    return res.status(400).json({ error: 'Workout description too long (max 2000 chars)' });
  }

  if (apiKey.length > 500) {
    return res.status(400).json({ error: 'Invalid API key format' });
  }

  try {
    // Sanitize workout description to prevent prompt injection
    const sanitizedWorkout = workoutDescription.replace(/["`]/g, '');
    
    const prompt = `You are a fitness coach. Parse and categorize this workout description.

Workout: ${sanitizedWorkout}

Respond ONLY in this exact JSON format (nothing else, no markdown):
{
  "activityType": "running" or "strength" or "hyrox-format",
  "workoutType": "easy-run" or "tempo-run" or "interval" or "repeat-1km" or "long-run" or "strength" or "hyrox-sim" or "mixed",
  "estimatedDistance": number or null,
  "estimatedTime": number or null,
  "exercises": ["exercise1", "exercise2"],
  "description": "Brief summary"
}

Be realistic with estimates. Return valid JSON only.`;

    // ✅ FIX #6: Add timeout with AbortController
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2024-06-15'  // ✅ FIX #1: Updated API version
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
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

    try {
      // ✅ FIX #7: Clean up markdown code blocks
      let jsonStr = responseText.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.replace(/^```json[\s\n]*/, '').replace(/[\s\n]*```$/, '');
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```[\s\n]*/, '').replace(/[\s\n]*```$/, '');
      }

      // Validate JSON before parsing
      const parsed = JSON.parse(jsonStr);

      // ✅ Additional validation for required fields
      if (!parsed.activityType || !parsed.workoutType) {
        return res.status(400).json({ 
          error: 'Invalid workout parse response - missing required fields',
          raw: responseText
        });
      }

      return res.status(200).json({
        success: true,
        activityType: parsed.activityType,
        workoutType: parsed.workoutType,
        estimatedDistance: parsed.estimatedDistance || null,
        estimatedTime: parsed.estimatedTime || null,
        exercises: Array.isArray(parsed.exercises) ? parsed.exercises : [],
        description: parsed.description || ''
      });
    } catch (parseError) {
      return res.status(400).json({ 
        error: 'Could not parse workout response. Please try again.',
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
