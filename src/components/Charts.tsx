import { useId } from 'react'
import { Av } from './ui'

export interface Daily { v: number[]; d: number[] }
export const fd = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export interface AreaOpts { sm: boolean; pts: boolean; lab: boolean; avg: boolean; ma: boolean; grid: boolean }
export function AreaChart({ dd, o }: { dd: Daily; o: AreaOpts }) {
  const id = useId().replace(/:/g, '')
  const v = dd.v, W = 760, H = 300, L = 40, R = 12, T = 18, B = 32, pw = W - L - R, ph = H - T - B
  const mx = Math.max(1, ...v), mr = Math.ceil(mx * 1.15) || 1, n = v.length
  const X = (i: number) => L + (n > 1 ? i / (n - 1) : 0.5) * pw, Y = (y: number) => T + ph - (y / mr) * ph
  const pts = v.map((y, i) => [X(i), Y(y)])
  const path = (p: number[][]) => {
    if (!o.sm) return p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ')
    let d = 'M' + p[0][0].toFixed(1) + ' ' + p[0][1].toFixed(1)
    for (let i = 1; i < p.length; i++) { const m = (p[i - 1][0] + p[i][0]) / 2; d += ` C${m.toFixed(1)} ${p[i - 1][1].toFixed(1)} ${m.toFixed(1)} ${p[i][1].toFixed(1)} ${p[i][0].toFixed(1)} ${p[i][1].toFixed(1)}` }
    return d
  }
  const line = path(pts)
  const avg = v.reduce((x, y) => x + y, 0) / (n || 1)
  const ma = v.map((_, i) => { const w = v.slice(Math.max(0, i - 6), i + 1); return [X(i), Y(w.reduce((x, y) => x + y, 0) / w.length)] })
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 520, height: 'auto', display: 'block' }} role="img" aria-label="Ideas per day">
      <defs><linearGradient id={'af' + id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".3" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(g => { const yy = T + (ph * g) / 4; return <g key={g}>{o.grid && <line x1={L} x2={W - R} y1={yy} y2={yy} stroke="rgba(255,255,255,.08)" />}<text x={L - 8} y={yy + 4} textAnchor="end" fill="#6b6b6b" fontSize="11">{Math.round(mr * (1 - g / 4))}</text></g> })}
      {[0, 1, 2, 3, 4].map(k => { const i = Math.round((k * (n - 1)) / 4); return <text key={k} x={X(i)} y={H - 8} textAnchor="middle" fill="#6b6b6b" fontSize="11">{fd(dd.d[i])}</text> })}
      <path d={`${line} L${X(n - 1)} ${T + ph} L${X(0)} ${T + ph}Z`} fill={`url(#af${id})`} />
      <path d={line} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,.6))' }} />
      {o.avg && <><line x1={L} x2={W - R} y1={Y(avg)} y2={Y(avg)} stroke="#a8a8a8" strokeDasharray="5 5" /><text x={W - R} y={Y(avg) - 6} textAnchor="end" fill="#a8a8a8" fontSize="11">avg {avg.toFixed(1)}</text></>}
      {o.ma && <path d={path(ma)} fill="none" stroke="#a8a8a8" strokeWidth="1.5" strokeDasharray="2 5" />}
      {pts.map((p, i) => <g key={i}>{o.pts && <circle cx={p[0]} cy={p[1]} r="3.2" fill="#000" stroke="#fff" strokeWidth="1.5"><title>{fd(dd.d[i])}: {v[i]}</title></circle>}{o.lab && (n <= 31 || v[i] === mx) && v[i] > 0 && <text x={p[0]} y={p[1] - 9} textAnchor="middle" fill="#e4e4e4" fontSize="11">{v[i]}</text>}</g>)}
    </svg>
  )
}

export interface BarOpts { m: string; o: 'v' | 'h'; s: string; n: number; lab: boolean; grid: boolean; avg: boolean; pct: boolean }
export function BarChart({ rows, o }: { rows: { n: string; v: number }[]; o: BarOpts }) {
  const W = 760, tot = rows.reduce((a, r) => a + r.v, 0), mx = Math.max(1, ...rows.map(r => r.v)), avg = tot / (rows.length || 1)
  const lab = (r: { v: number }) => (o.lab ? (o.pct && tot ? Math.round((r.v / tot) * 100) + '%' : r.v) : '')
  if (o.o === 'h') {
    const rh = 46, H = rows.length * rh + 34, L = 140, pw = W - L - 70
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 520, height: 'auto', display: 'block' }} role="img" aria-label="Bar chart">
        <defs><linearGradient id="bgh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#555" /><stop offset="1" stopColor="#fff" /></linearGradient></defs>
        {[0, 1, 2, 3, 4].map(g => { const x = L + (pw * g) / 4; return <g key={g}>{o.grid && <line x1={x} x2={x} y1={6} y2={H - 24} stroke="rgba(255,255,255,.08)" />}<text x={x} y={H - 6} textAnchor="middle" fill="#6b6b6b" fontSize="11">{Math.round((mx * g) / 4)}</text></g> })}
        {rows.map((r, i) => { const y = i * rh + 8, w = Math.max((r.v / mx) * pw, 3); return <g key={i} className="bvh"><title>{r.n}: {r.v}</title><text x={L - 12} y={y + rh / 2 - 2} textAnchor="end" fill="#a8a8a8" fontSize="12">{r.n.slice(0, 18)}</text><rect className="bv" style={{ ['--i' as any]: i }} x={L} y={y + 6} width={w} height={rh - 22} rx="8" fill="url(#bgh)" opacity=".92" />{o.lab && <text x={L + w + 10} y={y + rh / 2 - 2} fill="#e4e4e4" fontSize="12">{lab(r)}</text>}</g> })}
        {o.avg && <><line x1={L + (avg / mx) * pw} x2={L + (avg / mx) * pw} y1={4} y2={H - 24} stroke="#fff" strokeDasharray="5 5" opacity=".6" /><text x={L + (avg / mx) * pw} y={H - 12} textAnchor="middle" fill="#fff" fontSize="11" opacity=".8">avg {avg.toFixed(1)}</text></>}
      </svg>
    )
  }
  const H = 340, L = 44, B = 56, T = 28, pw = W - L - 12, ph = H - T - B, bw = Math.min(64, (pw / (rows.length || 1)) * 0.62)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 520, height: 'auto', display: 'block' }} role="img" aria-label="Bar chart">
      <defs><linearGradient id="bgv" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor="#555" /><stop offset="1" stopColor="#fff" /></linearGradient></defs>
      {[0, 1, 2, 3, 4].map(g => { const y = T + (ph * g) / 4; return <g key={g}>{o.grid && <line x1={L} x2={W - 12} y1={y} y2={y} stroke="rgba(255,255,255,.08)" />}<text x={L - 8} y={y + 4} textAnchor="end" fill="#6b6b6b" fontSize="11">{Math.round(mx * (1 - g / 4))}</text></g> })}
      {rows.map((r, i) => { const cx = L + (pw * (i + 0.5)) / rows.length, h = Math.max((r.v / mx) * ph, 3); return <g key={i} className="bvh"><title>{r.n}: {r.v}</title><rect className="bv" style={{ ['--i' as any]: i }} x={cx - bw / 2} y={T + ph - h} width={bw} height={h} rx="10" fill="url(#bgv)" opacity=".92" />{o.lab && <text x={cx} y={T + ph - h - 8} textAnchor="middle" fill="#e4e4e4" fontSize="12">{lab(r)}</text>}<text x={cx} y={H - B + 22} textAnchor="middle" fill="#a8a8a8" fontSize="12">{r.n.slice(0, 12)}</text></g> })}
      {o.avg && <><line x1={L} x2={W - 12} y1={T + ph - (avg / mx) * ph} y2={T + ph - (avg / mx) * ph} stroke="#fff" strokeDasharray="5 5" opacity=".6" /><text x={W - 12} y={T + ph - (avg / mx) * ph - 6} textAnchor="end" fill="#fff" fontSize="11" opacity=".8">avg {avg.toFixed(1)}</text></>}
    </svg>
  )
}

export function Donut({ items, total, o }: { items: [string, number, string][]; total: number; o: { pct: boolean; tot: boolean } }) {
  const t = total || 1
  let off = 0
  return (
    <div style={{ textAlign: 'center' }}>
      <svg viewBox="0 0 42 42" width="190" height="190" style={{ margin: '14px 0', maxWidth: '100%' }}>
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="rgba(255,255,255,.06)" strokeWidth="2.2" />
        {items.map(([n, c, col]) => { const p = (c / t) * 100, q = off; off += p; return p ? <circle key={n} cx="21" cy="21" r="15.9155" fill="none" stroke={col} strokeWidth="2.2" strokeDasharray={`${Math.max(p - 1, 0.1)} ${101 - p}`} strokeDashoffset={-q} transform="rotate(-90 21 21)"><title>{n}: {c}</title></circle> : null })}
        {o.tot && <text x="21" y="22.5" textAnchor="middle" fill="#fff" fontSize="6" fontWeight="200">{total}</text>}
      </svg>
      <div style={{ display: 'grid', gap: 8, textAlign: 'left' }}>
        {items.map(([n, c, col]) => <div key={n} className="dim" style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: col, marginRight: 8 }} />{n}</span><span>{c}{o.pct ? ` (${Math.round((c / t) * 100)}%)` : ''}</span></div>)}
      </div>
    </div>
  )
}

export function Heat({ ideas, val }: { ideas: { at: number }[]; val: boolean }) {
  const hm = Array.from({ length: 7 }, () => Array(12).fill(0))
  ideas.forEach(i => { const d = new Date(i.at); if (isNaN(d.getTime())) return; hm[(d.getDay() + 6) % 7][Math.floor(d.getHours() / 2)]++ })
  const hx = Math.max(1, ...hm.flat())
  const DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return (
    <div className="hm2"><span />{[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22].map(h => <span key={h} style={{ textAlign: 'center' }}>{h}</span>)}
      {hm.map((r, i) => <div key={i} style={{ display: 'contents' }}><span>{DN[i]}</span>{r.map((v, j) => <i key={j} title={`${v} ideas`} style={{ ['--a' as any]: (0.05 + (v / hx) * 0.6).toFixed(2) }}>{val && v ? v : ''}</i>)}</div>)}
    </div>
  )
}

export function Funnel({ rows, o }: { rows: [string, number][]; o: { pct: boolean; rel: boolean } }) {
  const fm = Math.max(1, ...rows.map(r => r[1]))
  return <>{rows.map((r, i) => {
    const pc = o.rel ? (i && rows[i - 1][1] ? Math.round((r[1] / rows[i - 1][1]) * 100) : 100) : rows[0][1] ? Math.round((r[1] / rows[0][1]) * 100) : 0
    return <div key={r[0]} style={{ marginTop: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mut">{r[0]}</span><span>{r[1]}{o.pct && <span className="dim"> {pc}%</span>}</span></div><div className="bar" style={{ height: 6 }}><i style={{ width: (r[1] / fm) * 100 + '%' }} /></div></div>
  })}</>
}

export function TopList({ ids, src, nm }: { ids: string[]; src: Record<string, number>; nm: (id: string) => string }) {
  if (!ids.length) return <p className="mut" style={{ padding: '18px 0' }}>No contributions yet.</p>
  const top = Math.max(1, src[ids[0]])
  return <>{ids.map((u, i) => <div key={u} className="row" style={{ cursor: 'default' }}><span className="dim" style={{ width: 16 }}>{i + 1}</span><Av id={u} size={30} /><div className="t"><h3 style={{ fontSize: 15 }}>{nm(u)}</h3><div className="bar"><i style={{ width: (src[u] / top) * 100 + '%' }} /></div></div><span>{src[u]}</span></div>)}</>
}
