/**
 * Draws the source image scaled to fit a canvas (contain), returns fit info.
 */
export function fitImageToCanvas(img, canvas) {
  const W = canvas.width, H = canvas.height
  const ctx = canvas.getContext('2d')
  const scale = Math.min(W / img.width, H / img.height)
  const dw = img.width * scale, dh = img.height * scale
  const dx = (W - dw) / 2, dy = (H - dh) / 2
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#faf2f8'
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(img, dx, dy, dw, dh)
  return { scale, dx, dy, w: dw, h: dh }
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('圖片載入失敗：' + src))
    im.src = src
  })
}

/**
 * Composites a cropped photo with a frame overlay.
 * Tries to load /public/frames/frameN.png (green-screen template).
 * Falls back to a programmatic decorative border if the PNG isn't found.
 *
 * @param {HTMLCanvasElement} croppedCanvas - already cropped (forceRect) photo
 * @param {number} styleIdx - 0/1/2
 * @param {Array} frameCfg - [{ slogan, col }, ...]
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function compositeFrame(croppedCanvas, styleIdx, frameCfg) {
  try {
    const frameImg = await loadImg(`/frames/frame${styleIdx}.png`)
    return composeWithPng(croppedCanvas, frameImg, styleIdx, frameCfg)
  } catch {
    return drawFallbackFrame(croppedCanvas, styleIdx, frameCfg)
  }
}

function composeWithPng(src, frameImg, styleIdx, frameCfg) {
  const W = frameImg.width, H = frameImg.height
  // Remove green-screen: detect green pixels → transparent, measure opening
  const fc = document.createElement('canvas'); fc.width = W; fc.height = H
  const fx = fc.getContext('2d'); fx.drawImage(frameImg, 0, 0)
  const id = fx.getImageData(0, 0, W, H), d = id.data
  let minX = W, minY = H, maxX = 0, maxY = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4
    if (d[o + 1] > 110 && d[o + 1] - d[o] > 40 && d[o + 1] - d[o + 2] > 40) {
      d[o + 3] = 0
      if (x < minX) minX = x; if (x > maxX) maxX = x
      if (y < minY) minY = y; if (y > maxY) maxY = y
    }
  }
  fx.putImageData(id, 0, 0)
  const hw = Math.max(1, maxX - minX), hh = Math.max(1, maxY - minY)

  const out = document.createElement('canvas'); out.width = W; out.height = H
  const ctx = out.getContext('2d')
  const s = Math.max(hw / src.width, hh / src.height)
  const pw = src.width * s, ph = src.height * s
  ctx.drawImage(src, minX + (hw - pw) / 2, minY + (hh - ph) / 2, pw, ph)
  ctx.drawImage(fc, 0, 0)

  // Slogan overlay
  const es = frameCfg[styleIdx]?.slogan
  if (es) {
    let efs = Math.round(W * 0.046)
    const setF = () => { ctx.font = `900 ${efs}px 'PingFang TC','Microsoft JhengHei',sans-serif` }
    setF()
    while (ctx.measureText(es).width > W * 0.78 && efs > 12) { efs--; setF() }
    const ey = H * 0.945
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.28)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2
    ctx.lineWidth = Math.max(4, efs * 0.28); ctx.strokeStyle = '#fff'; ctx.strokeText(es, W / 2, ey)
    ctx.restore()
    const g = ctx.createLinearGradient(0, ey - efs * 0.62, 0, ey + efs * 0.62)
    g.addColorStop(0, '#f7df8c'); g.addColorStop(.5, '#dcad3e'); g.addColorStop(1, '#b07f1c')
    ctx.fillStyle = g; ctx.fillText(es, W / 2, ey)
  }
  return out
}

function drawFallbackFrame(src, styleIdx, frameCfg) {
  const SIZE = 1080
  const out = document.createElement('canvas'); out.width = SIZE; out.height = SIZE
  const ctx = out.getContext('2d')

  const themeColors = [
    { bg: '#1a2a5e', border: '#c8a660', text: '#fff' },
    { bg: '#fff8e1', border: '#e8602f', text: '#333' },
    { bg: '#0d2137', border: '#33b7e6', text: '#fff' },
  ]
  const { bg, border } = themeColors[styleIdx] || themeColors[0]

  ctx.fillStyle = bg
  ctx.fillRect(0, 0, SIZE, SIZE)

  const pad = Math.round(SIZE * 0.06)
  const s = Math.max((SIZE - pad * 2) / src.width, (SIZE - pad * 2) / src.height)
  const pw = src.width * s, ph = src.height * s
  ctx.drawImage(src, pad + ((SIZE - pad * 2) - pw) / 2, pad + ((SIZE - pad * 2) - ph) / 2, pw, ph)

  const bw = Math.round(SIZE * 0.025)
  ctx.strokeStyle = border
  ctx.lineWidth = bw
  ctx.strokeRect(bw / 2, bw / 2, SIZE - bw, SIZE - bw)
  ctx.strokeRect(bw * 2.5, bw * 2.5, SIZE - bw * 5, SIZE - bw * 5)

  const es = frameCfg[styleIdx]?.slogan || ''
  if (es) {
    let efs = Math.round(SIZE * 0.046)
    const setF = () => { ctx.font = `900 ${efs}px 'PingFang TC','Microsoft JhengHei',sans-serif` }
    setF()
    while (ctx.measureText(es).width > SIZE * 0.78 && efs > 12) { efs--; setF() }
    const ey = SIZE * 0.945
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.lineWidth = Math.max(4, efs * 0.28); ctx.strokeStyle = '#fff'; ctx.strokeText(es, SIZE / 2, ey)
    const g = ctx.createLinearGradient(0, ey - efs * 0.62, 0, ey + efs * 0.62)
    g.addColorStop(0, '#f7df8c'); g.addColorStop(.5, '#dcad3e'); g.addColorStop(1, '#b07f1c')
    ctx.fillStyle = g; ctx.fillText(es, SIZE / 2, ey)
  }

  return out
}

const SS = 512

/**
 * Renders a chibi image with sticker text overlay.
 * @param {HTMLImageElement} chibi
 * @param {{ txt: string, tcol: string, name?: boolean }} style
 * @param {string} enName
 * @returns {HTMLCanvasElement}
 */
export function renderSticker(chibi, style, enName = '') {
  const c = document.createElement('canvas'); c.width = SS; c.height = SS
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, SS, SS)

  const s = Math.min(SS / chibi.width, SS / chibi.height)
  const w = chibi.width * s, h = chibi.height * s

  try {
    const tmp = document.createElement('canvas'); tmp.width = chibi.width; tmp.height = chibi.height
    const tctx = tmp.getContext('2d'); tctx.drawImage(chibi, 0, 0)
    const p = tctx.getImageData(4, chibi.height - 4, 1, 1).data
    ctx.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`
    ctx.fillRect(0, 0, SS, SS)
  } catch (_) {}

  ctx.drawImage(chibi, (SS - w) / 2, (SS - h) / 2 - 14, w, h)

  // Text label
  let fs = 96
  const setF = () => { ctx.font = `900 ${fs}px 'PingFang TC','Microsoft JhengHei',sans-serif` }
  setF()
  while (ctx.measureText(style.txt).width > SS * 0.92 && fs > 20) { fs -= 2; setF() }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
  ctx.lineWidth = 18; ctx.strokeStyle = '#fff'; ctx.strokeText(style.txt, SS / 2, SS - 60)
  ctx.fillStyle = style.tcol; ctx.fillText(style.txt, SS / 2, SS - 60)

  // English name (optional, top-left)
  const name = (enName || '').trim()
  if (style.name && name) {
    const nm = name.replace(/\b\w/g, m => m.toUpperCase())
    let nf = 44
    const NF = () => { ctx.font = `700 italic ${nf}px 'Snell Roundhand','Apple Chancery','Brush Script MT',cursive` }
    NF()
    while (ctx.measureText(nm).width > SS * 0.46 && nf > 20) { nf--; NF() }
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'
    ctx.save()
    ctx.shadowColor = 'rgba(110,74,18,.40)'; ctx.shadowBlur = 7; ctx.shadowOffsetY = 2
    ctx.lineWidth = 11; ctx.strokeStyle = '#fff'; ctx.strokeText(nm, 24, 44)
    ctx.restore()
    ctx.lineWidth = 3.5; ctx.strokeStyle = '#6b4a12'; ctx.strokeText(nm, 24, 44)
    const g = ctx.createLinearGradient(0, 44 - nf * 0.55, 0, 44 + nf * 0.55)
    g.addColorStop(0, '#f6dc88'); g.addColorStop(.5, '#d8ab3c'); g.addColorStop(1, '#b07f1c')
    ctx.fillStyle = g; ctx.fillText(nm, 24, 44)
  }
  return c
}
