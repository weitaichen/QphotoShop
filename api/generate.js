const PROMPT =
  'Transform the person in this photo into a cute Q-version chibi cartoon character sticker. ' +
  'Preserve their hairstyle, hair colour, and facial features. ' +
  'Signature chibi style: very big sparkling eyes, simplified round head, short chubby body, ' +
  'cheerful expression. Clean white background. Suitable for use as a LINE messenger sticker.'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { image_b64 } = req.body
  const token = process.env.HF_TOKEN

  if (!token) {
    return res.status(500).json({ message: 'HF_TOKEN 未設定，請在 Vercel 環境變數中加入 HF_TOKEN' })
  }

  try {
    // FLUX.1-Kontext-dev via HuggingFace router → fal-ai provider
    const hfRes = await fetch(
      'https://router.huggingface.co/fal-ai/fal-ai/flux-kontext/dev',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: `data:image/jpeg;base64,${image_b64}`,
          prompt: PROMPT,
          guidance_scale: 3.5,
          num_inference_steps: 28,
        }),
      }
    )

    const data = await hfRes.json()

    if (!hfRes.ok) {
      const msg = data?.error || data?.detail || data?.message || `HuggingFace API error (${hfRes.status})`
      return res.status(hfRes.status).json({ message: msg })
    }

    // fal-ai returns { images: [{ url, content_type, width, height }] }
    const imgUrl = data?.images?.[0]?.url
    if (!imgUrl) {
      return res.status(500).json({ message: 'API 未回傳圖片' })
    }

    // Download the CDN image and return as base64 data URL
    const imgRes = await fetch(imgUrl)
    const imgBuf = await imgRes.arrayBuffer()
    const b64 = Buffer.from(imgBuf).toString('base64')
    const mime = imgRes.headers.get('content-type') || 'image/jpeg'

    res.status(200).json({ image_b64: `data:${mime};base64,${b64}` })
  } catch (e) {
    res.status(500).json({ message: e.message || 'Server error' })
  }
}
