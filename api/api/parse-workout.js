export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { workoutDescription, apiKey } = req.body;

  if (!workoutDescription || !apiKey) {
    return res.status(400).json({ error: 'Missing workoutDescription or apiKey' });
  }

  try {
    const prompt = `Parse this workout description and categorize it: "${workoutDescription}"

Respond ONLY in this JSON format (nothing else, no markdown):
{
  "activityType": "running" or "strength" or "hyrox-format",
  "workoutType": "easy-run" or "tempo-run" or "interval" or "repeat-1km" or "long-run" or "strength" or "hyrox-sim" or "mixed",
  "estimatedDistance": number (in km, null if not applicable),
  "estimatedTime": number (in minutes, null if not applicable),
  "exercises": ["exercise1", "exercise2"],
  "description": "Brief description"
}

Be realistic with estimates.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      return res.status(response.status).json({ 
        error: errorData.error?.message || 'API request failed' 
      });
    }

    const data = await response.json();
    
    if (data.content && data.content[0] && data.content[0].text) {
      const responseText = data.content[0].text;
      
      try {
        // Clean up the response (remove markdown if present)
        let jsonStr = responseText.trim();
        if (jsonStr.startsWith('```json')) {
          jsonStr = jsonStr.replace(/^```json\n/, '').replace(/\n```$/, '');
        } else if (jsonStr.startsWith('```')) {
          jsonStr = jsonStr.replace(/^```\n/, '').replace(/\n```$/, '');
        }
        
        const parsed = JSON.parse(jsonStr);
        
        return res.status(200).json({
          success: true,
          ...parsed
        });
      } catch (parseError) {
        return res.status(400).json({ 
          error: 'Could not parse workout response',
          raw: responseText
        });
      }
    } else {
      return res.status(500).json({ 
        error: 'Unexpected response from API' 
      });
    }
  } catch (error) {
    return res.status(500).json({ 
      error: error.message 
    });
  }
}
