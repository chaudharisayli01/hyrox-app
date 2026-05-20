export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { foodItems, apiKey } = req.body;

  if (!foodItems || !apiKey) {
    return res.status(400).json({ error: 'Missing foodItems or apiKey' });
  }

  try {
    const prompt = `Calculate the approximate macros for: ${foodItems}

Please provide ONLY the following format (nothing else):
Calories: [number]
Protein: [number]g
Carbs: [number]g
Fats: [number]g

Be realistic and based on typical serving sizes.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 200,
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
      
      // Parse the response
      const caloriesMatch = responseText.match(/Calories:\s*(\d+)/);
      const proteinMatch = responseText.match(/Protein:\s*(\d+)/);
      const carbsMatch = responseText.match(/Carbs:\s*(\d+)/);
      const fatsMatch = responseText.match(/Fats:\s*(\d+)/);

      if (caloriesMatch && proteinMatch && carbsMatch && fatsMatch) {
        return res.status(200).json({
          success: true,
          calories: parseInt(caloriesMatch[1]),
          protein: parseInt(proteinMatch[1]),
          carbs: parseInt(carbsMatch[1]),
          fats: parseInt(fatsMatch[1]),
          text: responseText
        });
      } else {
        return res.status(400).json({ 
          error: 'Could not parse macro response' 
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
