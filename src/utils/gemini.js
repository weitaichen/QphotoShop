/**
 * Generates a Q-version chibi sticker by calling our own backend proxy.
 * The Gemini API key lives in the server (Vercel env var GEMINI_API_KEY),
 * never exposed to the browser.
 *
 * @param {string} imageDataUrl - base64 data URL of the cropped photo
 * @param {number} count - number of stickers to generate
 * @returns {Promise<string[]>} array of base64 image data URLs
 */
export async function generateStickers(imageDataUrl, count) {
  const base64Data = imageDataUrl.split(',')[1]

  const results = []
  for (let i = 0; i < count; i++) {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_b64: base64Data, index: i })
    })

    const txt = await res.text()
    let json
    try { json = JSON.parse(txt) } catch { throw new Error(`伺服器忙線 (HTTP ${res.status})，重試中`) }
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)

    results.push(json.image_b64)
  }
  return results
}
