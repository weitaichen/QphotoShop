export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { image_b64, index } = req.body
  const key = process.env.GEMINI_API_KEY  // 伺服器端，瀏覽器永遠看不到

  if (!key) {
    return res.status(500).json({ message: 'API key not configured' })
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: 'Generate a cute Q-version (chibi) cartoon character sticker based on this photo. ' +
                  'Big expressive eyes, simplified cute features, rounded head. ' +
                  'White or transparent background. Like a LINE messenger sticker.'
              },
              { inline_data: { mime_type: 'image/jpeg', data: image_b64 } }
            ]
          }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
        })
      }
    )

    const data = await response.json()
    if (!response.ok) {
      return res.status(response.status).json({ message: data?.error?.message || 'Gemini error' })
    }

    const part = data?.candidates?.[0]?.content?.parts?.find(p => p.inline_data)
    if (!part) return res.status(500).json({ message: 'No image returned from Gemini' })

    res.status(200).json({
      image_b64: `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`
    })
  } catch (e) {
    res.status(500).json({ message: e.message || 'Server error' })
  }
}
