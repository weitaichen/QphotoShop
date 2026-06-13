<template>
  <div>
    <header>
      <h1>🎓 成功大學・118 新生營 Q 圖</h1>
      <p>拍照或上傳 → 選裁切框 → 一鍵生成 8 張成大新生 Q 版貼圖</p>
    </header>

    <div class="wrap">

      <!-- STEP 1: 取得照片 -->
      <div class="card">
        <h2><span class="step">1</span> 拍照或上傳照片</h2>
        <div class="btn-row">
          <button class="btn" @click="openCamera">📷 開啟相機</button>
          <button class="btn sec" @click="triggerUpload">🖼️ 上傳照片</button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="onFileChange" />
        <video v-show="cameraActive" ref="videoEl" class="camera-video" autoplay playsinline muted></video>
        <div v-show="cameraActive" class="btn-row mt-12">
          <button class="btn pur" @click="capturePhoto">✨ 拍下這張</button>
          <button class="btn sec" @click="stopCamera">取消</button>
        </div>
        <p v-if="cameraError" class="hint mt-8" style="color:#c0392b">{{ cameraError }}</p>
      </div>

      <!-- STEP 2: 裁切 -->
      <div class="card">
        <h2><span class="step">2</span> 選裁切比例框</h2>

        <div v-if="!hasPhoto" class="empty">先拍照或上傳照片，這裡就會出現裁切畫面 👆</div>

        <template v-else>
          <div ref="stageWrap" class="stage-wrap">
            <canvas ref="stageCanvas" class="stage-canvas"></canvas>
            <div
              ref="cropBoxEl"
              class="crop-box"
              :class="{ circle: cropShape === 'circle' }"
              :style="cropBoxStyle"
              @pointerdown.prevent="onCropPointerDown"
            >
              <div class="crop-handle" @pointerdown.prevent.stop="onHandlePointerDown"></div>
            </div>
          </div>

          <div class="chips">
            <button
              v-for="r in ratios"
              :key="r.value"
              class="chip"
              :class="{ on: cropRatio === r.ratio && cropShape === r.shape }"
              @click="setRatio(r)"
            >
              <span class="ic">{{ r.icon }}</span>{{ r.label }}
            </button>
          </div>
          <p class="hint">拖曳方框移動位置，拉右下角圓點調整大小</p>

          <div class="chips">
            <button
              v-for="f in frames"
              :key="f.style"
              class="chip"
              :class="{ on: frameStyle === f.style }"
              @click="frameStyle = f.style"
            >
              <span class="ic">{{ f.icon }}</span>{{ f.label }}
            </button>
          </div>

          <div class="btn-row mt-12">
            <button class="btn sec" :disabled="compositing" @click="generateFrame">
              <span v-if="compositing" class="spin"></span>
              {{ compositing ? '合成中…' : '🖼️ 產生相框照片' }}
            </button>
          </div>

          <div v-if="framedDataUrl" class="frame-preview-wrap">
            <img :src="framedDataUrl" />
            <p class="hint">手機可長按圖片 →「加入照片」，或按下方按鈕儲存／分享</p>
            <button class="btn mt-8" @click="saveFrame">📥 儲存／分享相框照片</button>
          </div>
        </template>
      </div>

      <!-- STEP 3: 貼圖 -->
      <div class="card">
        <h2><span class="step">3</span> 生成 Q 版貼圖</h2>
        <input
          v-model="enName"
          class="name-input"
          type="text"
          placeholder="輸入英文名字（選填，僅 +1／收到 會標示）"
          maxlength="16"
        />
        <div class="chips">
          <button
            v-for="n in [4, 8]"
            :key="n"
            class="chip"
            :class="{ on: stickerCount === n }"
            @click="stickerCount = n"
          >{{ n }} 張</button>
        </div>
        <div class="btn-row mt-8">
          <button class="btn pur" :disabled="!hasPhoto || generating" @click="makeStickers">
            <span v-if="generating" class="spin"></span>
            {{ generating ? `生成中… ${genDone}/${stickerCount}` : `🪄 用 AI 生成 ${stickerCount} 張 Q 版貼圖` }}
          </button>
        </div>

        <div v-if="stickerCells.length" class="sticker-grid">
          <div v-for="(cell, i) in stickerCells" :key="i" class="sticker">
            <template v-if="cell.loading">
              <span class="spin" style="border-color:#f6a;border-top-color:transparent"></span>
            </template>
            <template v-else-if="cell.error">
              <div style="position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#c0392b;font-size:12px;padding:8px;line-height:1.4">
                ⚠️ 失敗<br>{{ cell.error.slice(0, 46) }}
              </div>
            </template>
            <template v-else-if="cell.src">
              <img :src="cell.src" />
              <button class="dl" @click="downloadSticker(i)">⬇</button>
            </template>
          </div>
        </div>

        <div v-if="anyStickers" class="btn-row mt-12">
          <button class="btn" @click="downloadAll">📥 全部存到相簿</button>
        </div>
      </div>

    </div>

    <footer>照片會傳送到 Google Gemini 生成 Q 版人物 · 僅供成功大學 118 級新生營使用</footer>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { compositeFrame, fitImageToCanvas, renderSticker } from './utils/canvas.js'
import { generateStickers } from './utils/gemini.js'

// ── STATE ──────────────────────────────────────────────────
const fileInput = ref(null)
const videoEl   = ref(null)
const stageWrap = ref(null)
const stageCanvas = ref(null)
const cropBoxEl = ref(null)

const cameraActive = ref(false)
const cameraError  = ref('')
let stream = null

const hasPhoto   = ref(false)
const enName     = ref('')
const frameStyle = ref(0)
const compositing = ref(false)
const framedDataUrl = ref('')
let lastFrameCanvas = null

const stickerCount = ref(8)
const stickerCells = ref([])
const generating   = ref(false)
const genDone      = ref(0)

// Crop state (CSS-pixel space relative to stageWrap)
const cropBox  = ref({ l: 0, t: 0, w: 0, h: 0 })
const cropRatio = ref(1)
const cropShape = ref('rect')

let imgEl   = null
let fit     = { scale: 1, dx: 0, dy: 0, w: 0, h: 0 }

// ── DATA ───────────────────────────────────────────────────
const ratios = [
  { ratio: 1,    shape: 'rect',   icon: '⬛', label: '方形 1:1' },
  { ratio: 0.75, shape: 'rect',   icon: '▯',  label: '直式 3:4' },
  { ratio: 1,    shape: 'circle', icon: '⚪', label: '圓形頭像' },
]
const frames = [
  { style: 0, icon: '🏛️', label: '成大傳承' },
  { style: 1, icon: '☀️', label: '青春活力' },
  { style: 2, icon: '🚀', label: '未來創新' },
]

// ── COMPUTED ───────────────────────────────────────────────
const cropBoxStyle = computed(() => ({
  left:   cropBox.value.l + 'px',
  top:    cropBox.value.t + 'px',
  width:  cropBox.value.w + 'px',
  height: cropBox.value.h + 'px',
}))

const anyStickers = computed(() => stickerCells.value.some(c => c.src))

// ── CAMERA ─────────────────────────────────────────────────
async function openCamera() {
  cameraError.value = ''
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
    cameraActive.value = true
    await nextTick()
    videoEl.value.srcObject = stream
    await videoEl.value.play()
  } catch (e) {
    cameraError.value = '無法開啟相機：' + (e.message || '請確認已授予相機權限')
    cameraActive.value = false
  }
}
function stopCamera() {
  stream?.getTracks().forEach(t => t.stop())
  stream = null
  cameraActive.value = false
}
function capturePhoto() {
  const v = videoEl.value
  const c = document.createElement('canvas')
  c.width = v.videoWidth; c.height = v.videoHeight
  c.getContext('2d').drawImage(v, 0, 0)
  loadPhotoSrc(c.toDataURL('image/png'))
  stopCamera()
}
function triggerUpload() { fileInput.value.value = ''; fileInput.value.click() }
function onFileChange(e) {
  const f = e.target.files?.[0]; if (!f) return
  const r = new FileReader()
  r.onload = ev => loadPhotoSrc(ev.target.result)
  r.readAsDataURL(f)
}

// ── LOAD IMAGE ─────────────────────────────────────────────
function loadPhotoSrc(src) {
  const im = new Image()
  im.onload = () => {
    imgEl = im
    hasPhoto.value = true
    framedDataUrl.value = ''
    nextTick(() => { drawStage(); resetCropBox() })
  }
  im.src = src
}

// ── STAGE CANVAS ───────────────────────────────────────────
function drawStage() {
  const wrap = stageWrap.value, canvas = stageCanvas.value
  const W = wrap.clientWidth, H = wrap.clientHeight
  canvas.width = W; canvas.height = H
  fit = fitImageToCanvas(imgEl, canvas)
}
function resetCropBox() {
  const W = stageWrap.value.clientWidth, H = stageWrap.value.clientHeight
  let bw, bh
  const availW = fit.w, availH = fit.h
  if (cropRatio.value <= 1) {
    bh = availH * 0.9; bw = bh * cropRatio.value
    if (bw > availW * 0.9) { bw = availW * 0.9; bh = bw / cropRatio.value }
  } else {
    bw = availW * 0.9; bh = bw / cropRatio.value
  }
  cropBox.value = {
    l: (W - bw) / 2,
    t: (H - bh) / 2,
    w: bw,
    h: bh,
  }
}
function setRatio(r) {
  cropRatio.value = r.ratio
  cropShape.value = r.shape
  nextTick(resetCropBox)
}

// ── POINTER DRAG / RESIZE ──────────────────────────────────
let drag = null
function onCropPointerDown(e) {
  const b = cropBox.value
  drag = { mode: 'move', sx: e.clientX, sy: e.clientY, l: b.l, t: b.t, w: b.w, h: b.h }
  cropBoxEl.value.setPointerCapture(e.pointerId)
  cropBoxEl.value.addEventListener('pointermove', onCropPointerMove)
  cropBoxEl.value.addEventListener('pointerup', onCropPointerUp)
}
function onHandlePointerDown(e) {
  const b = cropBox.value
  drag = { mode: 'resize', sx: e.clientX, sy: e.clientY, l: b.l, t: b.t, w: b.w, h: b.h }
  cropBoxEl.value.setPointerCapture(e.pointerId)
  cropBoxEl.value.addEventListener('pointermove', onCropPointerMove)
  cropBoxEl.value.addEventListener('pointerup', onCropPointerUp)
}
function onCropPointerMove(e) {
  if (!drag) return
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy
  const W = stageWrap.value.clientWidth, H = stageWrap.value.clientHeight
  if (drag.mode === 'move') {
    cropBox.value = {
      l: Math.max(0, Math.min(drag.l + dx, W - drag.w)),
      t: Math.max(0, Math.min(drag.t + dy, H - drag.h)),
      w: drag.w,
      h: drag.h,
    }
  } else {
    let w = Math.max(50, drag.w + dx)
    let h = w / cropRatio.value
    w = Math.min(w, W - drag.l); h = Math.min(h, H - drag.t)
    w = Math.min(w, h * cropRatio.value); h = w / cropRatio.value
    cropBox.value = { l: drag.l, t: drag.t, w, h }
  }
}
function onCropPointerUp() {
  drag = null
  cropBoxEl.value?.removeEventListener('pointermove', onCropPointerMove)
  cropBoxEl.value?.removeEventListener('pointerup', onCropPointerUp)
}

// ── CROP HELPER ────────────────────────────────────────────
function getCroppedCanvas(size, forceRect = false) {
  const b = cropBox.value
  const sx = (b.l - fit.dx) / fit.scale
  const sy = (b.t - fit.dy) / fit.scale
  const sw = b.w / fit.scale
  const sh = b.h / fit.scale
  const ow = size ?? Math.round(sw)
  const oh = size ? Math.round(size / cropRatio.value) : Math.round(sh)
  const out = document.createElement('canvas')
  out.width = ow; out.height = oh
  const ctx = out.getContext('2d')
  const clipCircle = cropShape.value === 'circle' && !forceRect
  if (clipCircle) {
    ctx.save(); ctx.beginPath()
    ctx.arc(ow / 2, oh / 2, Math.min(ow, oh) / 2, 0, Math.PI * 2); ctx.clip()
  }
  ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, ow, oh)
  if (clipCircle) ctx.restore()
  return out
}

// ── FRAME GENERATION ───────────────────────────────────────
const FRAME_CONFIG = [
  { slogan: '窮 理 致 知',       col: '#c8a660' },
  { slogan: '青春成大・活力全開', col: '#e8602f' },
  { slogan: '共 創 未 來',       col: '#33b7e6' },
]

async function generateFrame() {
  compositing.value = true
  try {
    const canvas = await compositeFrame(getCroppedCanvas(undefined, true), frameStyle.value, FRAME_CONFIG)
    lastFrameCanvas = canvas
    framedDataUrl.value = canvas.toDataURL('image/png')
  } catch (e) {
    alert('相框合成失敗：' + (e.message || e))
  } finally {
    compositing.value = false
  }
}

function saveFrame() {
  if (!lastFrameCanvas) return
  shareOrDownload(lastFrameCanvas, '成大新生營相框照片.png')
}

// ── STICKER GENERATION ─────────────────────────────────────
const STICKER_STYLES = [
  { txt: 'ok',       tcol: '#9d2235', name: true  },
  { txt: '+1',       tcol: '#1f8f5f', name: true  },
  { txt: '收到',     tcol: '#e8902f'               },
  { txt: '我要參加', tcol: '#c0392b'               },
  { txt: '謝謝學長', tcol: '#17489e'               },
  { txt: '謝謝學姊', tcol: '#17489e'               },
  { txt: '衝啊',     tcol: '#c0392b'               },
  { txt: '想睡',     tcol: '#7c5cc4'               },
]

let stickerCanvases = []

async function makeStickers() {
  if (!hasPhoto.value) return
  generating.value = true
  genDone.value = 0
  const N = stickerCount.value
  const srcDataUrl = getCroppedCanvas(512).toDataURL('image/jpeg', 0.9)

  stickerCells.value = Array.from({ length: N }, () => ({ loading: true, src: '', error: '' }))
  stickerCanvases = new Array(N).fill(null)

  let next = 0
  const CONC = 2
  async function worker() {
    while (next < N) {
      const i = next++
      try {
        const imgs = await generateStickers(srcDataUrl, 1)
        const chibi = await loadImg(imgs[0])
        const c = renderSticker(chibi, STICKER_STYLES[i], enName.value)
        stickerCanvases[i] = c
        stickerCells.value[i] = { loading: false, src: c.toDataURL('image/png'), error: '' }
      } catch (e) {
        stickerCells.value[i] = { loading: false, src: '', error: e.message || String(e) }
      }
      genDone.value++
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONC, N) }, () => worker()))
  generating.value = false
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => rej(new Error('圖片載入失敗'))
    im.src = src
  })
}

async function downloadSticker(i) {
  const c = stickerCanvases[i]; if (!c) return
  shareOrDownload(c, `貼圖_${i + 1}_${STICKER_STYLES[i].txt}.png`)
}

async function downloadAll() {
  const files = []
  for (let i = 0; i < stickerCanvases.length; i++) {
    const c = stickerCanvases[i]; if (!c) continue
    const blob = await new Promise(r => c.toBlob(r, 'image/png'))
    if (blob) files.push(new File([blob], `貼圖_${i + 1}_${STICKER_STYLES[i].txt}.png`, { type: 'image/png' }))
  }
  if (!files.length) return
  if (navigator.canShare?.({ files })) {
    try { await navigator.share({ files, title: '成功大學 118 新生營 Q 版貼圖' }); return }
    catch (e) { if (e?.name === 'AbortError') return }
  }
  for (const f of files) {
    const url = URL.createObjectURL(f)
    const a = document.createElement('a'); a.href = url; a.download = f.name
    document.body.appendChild(a); a.click(); a.remove()
    await new Promise(r => setTimeout(r, 300))
    URL.revokeObjectURL(url)
  }
}

async function shareOrDownload(canvas, name) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'))
  if (!blob) return
  const file = new File([blob], name, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return }
    catch (e) { if (e?.name === 'AbortError') return }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

onUnmounted(() => stopCamera())
</script>
