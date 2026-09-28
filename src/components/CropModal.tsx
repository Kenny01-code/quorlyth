import { useEffect, useRef, useState } from 'react'
import { Icon } from '../lib/Icon'

/** Circular photo crop: drag to move, slider to zoom, rotate. Returns a 256px JPEG data URL. */
export function CropModal({ file, onCancel, onSave }: { file: File; onCancel: () => void; onSave: (dataUrl: string) => Promise<boolean> }) {
  const cv = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const st = useRef({ s: 1, x: 0, y: 0, r: 0 })
  const [zoom, setZoom] = useState(100)
  const [saving, setSaving] = useState(false)
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const u = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => { URL.revokeObjectURL(u); setImg(i) }
    i.src = u
  }, [file])

  const scale = (im: HTMLImageElement) => {
    const q = st.current, w = q.r % 2 ? im.height : im.width, h = q.r % 2 ? im.width : im.height
    return Math.max(300 / w, 300 / h) * q.s
  }
  const clampPos = (im: HTMLImageElement) => {
    const q = st.current, s = scale(im), w = (q.r % 2 ? im.height : im.width) * s, h = (q.r % 2 ? im.width : im.height) * s
    const mx = Math.max(0, (w - 300) / 2), my = Math.max(0, (h - 300) / 2)
    q.x = Math.max(-mx, Math.min(mx, q.x)); q.y = Math.max(-my, Math.min(my, q.y))
  }
  const draw = (c: HTMLCanvasElement, size: number, mask: boolean) => {
    if (!img) return
    const x = c.getContext('2d')!, q = st.current, k = size / 300
    x.fillStyle = '#000'; x.fillRect(0, 0, size, size)
    x.save(); x.translate(size / 2 + q.x * k, size / 2 + q.y * k); x.rotate(q.r * Math.PI / 2)
    const s = scale(img) * k; x.scale(s, s); x.drawImage(img, -img.width / 2, -img.height / 2); x.restore()
    if (mask) {
      x.fillStyle = 'rgba(0,0,0,.62)'; x.beginPath(); x.rect(0, 0, size, size); x.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2, true); x.fill('evenodd')
      x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1.5; x.beginPath(); x.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2); x.stroke()
    }
  }
  const redraw = () => { if (cv.current) draw(cv.current, 300, true) }
  useEffect(redraw, [img])

  const save = async () => {
    if (!img || saving) return
    setSaving(true)
    try {
      let dataUrl = ''
      for (const size of [256, 192, 128]) {
        const o = document.createElement('canvas'); o.width = o.height = size; draw(o, size, false)
        for (const quality of [0.78, 0.66, 0.54]) {
          dataUrl = o.toDataURL('image/jpeg', quality)
          if (dataUrl.length <= 96_000) break
        }
        if (dataUrl.length <= 96_000) break
      }
      await onSave(dataUrl)
    } finally { setSaving(false) }
  }

  return (
    <div id="crop" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="cb glass" style={{ padding: 24, textAlign: 'center', maxWidth: 380 }}>
        <h3>Crop your photo</h3>
        <p className="dim" style={{ margin: '6px 0 16px' }}>Drag to move and use the slider to zoom.</p>
        <canvas ref={cv} width={300} height={300} style={{ width: '100%', maxWidth: 320, aspectRatio: '1', touchAction: 'none', borderRadius: 20, cursor: 'grab' }}
          onPointerDown={e => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId) }}
          onPointerMove={e => { if (!drag.current || !img) return; const k = 300 / e.currentTarget.getBoundingClientRect().width; st.current.x += (e.clientX - drag.current.x) * k; st.current.y += (e.clientY - drag.current.y) * k; drag.current = { x: e.clientX, y: e.clientY }; clampPos(img); redraw() }}
          onPointerUp={() => (drag.current = null)} />
        <input type="range" min={100} max={400} value={zoom} aria-label="Zoom" style={{ display: 'block', margin: '22px auto 0', maxWidth: 320 }}
          onChange={e => { setZoom(+e.target.value); st.current.s = +e.target.value / 100; img && clampPos(img); redraw() }} />
        <div className="acts" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => { st.current.r = (st.current.r + 1) % 4; img && clampPos(img); redraw() }}><Icon name="rotate" size={16} />Rotate</button>
          <button className="btn" onClick={() => { st.current = { s: 1, x: 0, y: 0, r: 0 }; setZoom(100); redraw() }}>Reset</button>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn p" disabled={saving || !img} onClick={save}>{saving ? 'Saving...' : 'Save photo'}</button>
        </div>
      </div>
    </div>
  )
}
