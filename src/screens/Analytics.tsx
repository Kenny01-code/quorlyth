import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { jsPDF } from 'jspdf'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { AreaChart, BarChart, Daily, Donut, Funnel, Heat, TopList, fd } from '../components/Charts'
import { Chip, Empty, Head } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { ChartKey, ITEMS, TITLES, useChartSettings } from '../lib/chartSettings'
import { STATUS_LABEL } from '../lib/types'
import { cn } from '../lib/util'

export function Analytics() {
  return <Gate owner><Inner /></Gate>
}

function Inner() {
  const a = useApp()
  const nav = useNavigate()
  const { data } = a
  const { cs, set, reset } = useChartSettings()
  const [rg, setRg] = useState(30)
  const [open, setOpen] = useState<ChartKey | null>(null)

  const X = useMemo(() => {
    const sc: Record<string, number> = { review: 0, selected: 0, held: 0, declined: 0, promoted: 0 }
    const auth: Record<string, number> = {}, back: Record<string, number> = {}
    let tv = 0
    data.ideas.forEach(i => { sc[a.statusOf(i.id)]++; auth[i.authorId] = (auth[i.authorId] || 0) + 1; back[i.authorId] = (back[i.authorId] || 0) + a.votesOf(i.id) })
    Object.values(data.votes).forEach(v => Object.values(v).forEach(x => x && tv++))
    return { sc, auth, back, tv, mem: Object.keys(data.members).length }
  }, [data])

  const daily = (n: number): Daily => {
    const d = 864e5, t0 = new Date().setHours(0, 0, 0, 0), v: number[] = [], dt: number[] = []
    for (let i = n - 1; i >= 0; i--) { const s = t0 - i * d; v.push(data.ideas.filter(x => x.at >= s && x.at < s + d).length); dt.push(s) }
    return { v, d: dt }
  }
  const dd = daily(rg)
  const barRows = () => {
    const o = cs.bar
    let rows = data.communities.map(c => {
      let v = 0
      if (o.m === 'ideas') v = data.ideas.filter(i => i.cid === c.id).length
      else if (o.m === 'backs') data.ideas.forEach(i => { if (i.cid === c.id) v += a.votesOf(i.id) })
      else if (o.m === 'members') v = Object.keys(data.members).filter(u => data.members[u]?.[c.id]).length
      else v = data.promotions.filter(p => data.ideas.find(i => i.id === p.ideaId)?.cid === c.id).length
      return { n: c.name, v }
    })
    if (o.s === 'value') rows.sort((x, y) => y.v - x.v); else if (o.s === 'name') rows.sort((x, y) => x.n.localeCompare(y.n))
    return o.n ? rows.slice(0, o.n) : rows
  }
  const donut: [string, number, string][] = [['Promoted', X.sc.promoted, '#fff'], ['Selected', X.sc.selected, '#d0d0d0'], ['In review', X.sc.review, '#8a8a8a'], ['Held', X.sc.held, '#555'], ['Declined', X.sc.declined, '#333']]
  const funnel: [string, number][] = [['Members', X.mem], ['Contributors', Object.keys(X.auth).length], ['Ideas', data.ideas.length], ['Selected', X.sc.selected + X.sc.promoted], ['Published', data.promotions.length]]
  const src = cs.top.m === 'backs' ? X.back : X.auth
  const topIds = Object.keys(src).sort((x, y) => src[y] - src[x]).slice(0, cs.top.n)

  function body(g: ChartKey) {
    if (g === 'area') return <div className="chs"><AreaChart dd={dd} o={cs.area} /></div>
    if (g === 'bar') { const rows = barRows(); return rows.length ? <div className="chs"><BarChart rows={rows} o={cs.bar as any} /></div> : <p className="mut" style={{ marginTop: 18 }}>No communities yet.</p> }
    if (g === 'don') return <Donut items={donut} total={data.ideas.length} o={cs.don} />
    if (g === 'heat') return <Heat ideas={data.ideas} val={cs.heat.val} />
    if (g === 'fun') return <Funnel rows={funnel} o={cs.fun} />
    return <TopList ids={topIds} src={src} nm={a.nm} />
  }
  const card = (g: ChartKey, sub: string) => (
    <div className="glass pad">
      <div className="head" style={{ marginBottom: 6 }}><div><h3>{TITLES[g]}</h3><p className="dim">{sub}</p></div><button className="chip" onClick={() => setOpen(g)}><Icon name="settings" size={14} />Chart settings</button></div>
      {body(g)}
    </div>
  )

  function csv() {
    const q = (s: any) => '"' + String(s ?? '').replace(/"/g, '""') + '"'
    const rows = data.ideas.map(i => [q(i.title), q(data.communities.find(c => c.id === i.cid)?.name), q(a.nm(i.authorId)), a.votesOf(i.id), STATUS_LABEL[a.statusOf(i.id)], data.reviews[i.id]?.score ?? '', new Date(i.at).toISOString()].join(','))
    download('quorlyth-ideas.csv', 'text/csv', 'title,community,author,backings,status,score,created\n' + rows.join('\n'))
  }
  function pdf() {
    const d = new jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 16
    let y = 54
    const T = (s: any, n = 0) => { s = String(s ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, ''); return n && s.length > n ? s.slice(0, n - 1) + '...' : s }
    const ck = (h: number) => { if (y + h > 278) { d.addPage(); y = 20 } }
    d.setFillColor(0, 0, 0); d.rect(0, 0, W, 40, 'F'); d.setTextColor(255, 255, 255); d.setFont('helvetica', 'bold'); d.setFontSize(22); d.text('QUORLYTH', M, 22)
    d.setFont('helvetica', 'normal'); d.setFontSize(10); d.text(T(data.settings?.name || 'Community report'), M, 30); d.text(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + `   Last ${rg} days`, W - M, 30, { align: 'right' })
    const H1 = (t: string) => { ck(14); d.setTextColor(0, 0, 0); d.setFont('helvetica', 'bold'); d.setFontSize(13); d.text(t, M, y); d.setDrawColor(0, 0, 0); d.setLineWidth(0.3); d.line(M, y + 2, W - M, y + 2); y += 10; d.setFont('helvetica', 'normal') }
    ;[['Ideas in range', dd.v.reduce((x, z) => x + z, 0)], ['Members', X.mem], ['Backings', X.tv], ['Published', data.promotions.length]].forEach((k, i) => { const x = M + i * 45.5; d.setDrawColor(0, 0, 0); d.setLineWidth(0.3); d.roundedRect(x, y, 42, 24, 3, 3); d.setFontSize(8); d.setTextColor(110, 110, 110); d.text(String(k[0]), x + 4, y + 8); d.setFontSize(18); d.setTextColor(0, 0, 0); d.text(String(k[1]), x + 4, y + 19) })
    y += 34; H1('Ideas per day')
    const cw = W - 2 * M - 8, chh = 46, cx = M + 8, mx = Math.max(1, ...dd.v), n = dd.v.length
    d.setDrawColor(200, 200, 200); d.setLineWidth(0.2); for (let g = 0; g <= 4; g++) { const gy = y + (chh * g) / 4; d.line(cx, gy, cx + cw, gy); d.setFontSize(7); d.setTextColor(120, 120, 120); d.text(String(Math.round(mx * (1 - g / 4))), cx - 2, gy + 1, { align: 'right' }) }
    d.setDrawColor(0, 0, 0); d.setLineWidth(0.5); for (let i = 1; i < n; i++) d.line(cx + ((i - 1) / (n - 1)) * cw, y + chh - (dd.v[i - 1] / mx) * chh, cx + (i / (n - 1)) * cw, y + chh - (dd.v[i] / mx) * chh)
    d.setFontSize(7); d.setTextColor(120, 120, 120); ;[0, Math.floor((n - 1) / 2), n - 1].forEach(i => d.text(fd(dd.d[i]), cx + (i / (n - 1 || 1)) * cw, y + chh + 6, { align: i === 0 ? 'left' : i === n - 1 ? 'right' : 'center' }))
    y += chh + 14; H1('Ideas by community')
    const rows = barRows(), bm = Math.max(1, ...rows.map(r => r.v))
    rows.forEach(r => { ck(9); d.setFontSize(9); d.setTextColor(0, 0, 0); d.text(T(r.n, 24), M, y + 4); d.setFillColor(0, 0, 0); d.rect(M + 50, y, Math.max((r.v / bm) * 100, 0.8), 5, 'F'); d.text(String(r.v), M + 50 + Math.max((r.v / bm) * 100, 0.8) + 3, y + 4); y += 9 })
    y += 6; H1('Idea pipeline')
    donut.forEach(r => { ck(8); d.setFontSize(9); d.setTextColor(0, 0, 0); d.text(r[0], M, y + 4); d.text(String(r[1]), M + 50, y + 4); d.text(data.ideas.length ? Math.round((r[1] / data.ideas.length) * 100) + '%' : '0%', M + 70, y + 4); y += 7 })
    y += 6; H1('Top contributors')
    Object.keys(X.auth).sort((p, q) => X.auth[q] - X.auth[p]).slice(0, 10).forEach((u, i) => { ck(8); d.setFontSize(9); d.setTextColor(0, 0, 0); d.text(String(i + 1), M, y + 4); d.text(T(a.nm(u), 30), M + 8, y + 4); d.text(X.auth[u] + ' ideas', M + 90, y + 4); d.text(X.back[u] + ' backings', M + 120, y + 4); y += 7 })
    y += 6; H1('Ideas')
    d.setFontSize(8); d.setTextColor(110, 110, 110); d.text('Title', M, y); d.text('Community', M + 86, y); d.text('Author', M + 118, y); d.text('Backs', M + 150, y); d.text('Status', M + 162, y); y += 5
    ;[...data.ideas].sort((p, q) => a.votesOf(q.id) - a.votesOf(p.id)).slice(0, 30).forEach(i => { ck(7); d.setFontSize(8); d.setTextColor(0, 0, 0); d.text(T(i.title, 48), M, y); d.text(T(data.communities.find(c => c.id === i.cid)?.name, 16), M + 86, y); d.text(T(a.nm(i.authorId), 16), M + 118, y); d.text(String(a.votesOf(i.id)), M + 150, y); d.text(STATUS_LABEL[a.statusOf(i.id)], M + 162, y); y += 6 })
    const np = d.getNumberOfPages()
    for (let p = 1; p <= np; p++) { d.setPage(p); d.setFontSize(8); d.setTextColor(120, 120, 120); d.text('Quorlyth report', M, 290); d.text(`Page ${p} of ${np}`, W - M, 290, { align: 'right' }) }
    d.save('quorlyth-report.pdf')
  }

  if (!data.ideas.length && !X.mem) return <><Head kicker="Analytics" title="Your community in numbers." /><Empty icon="insight" title="Nothing to measure yet" text="Charts appear once members join and share ideas."><button className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/communities')}>Open communities</button></Empty></>

  return (
    <>
      <Head kicker="Analytics" title="Your community in numbers." right={<>{[7, 30, 90].map(d => <span key={d}><Chip on={rg === d} onClick={() => setRg(d)}>{d} days</Chip>{' '}</span>)}<button className="btn" style={{ padding: '9px 20px', marginLeft: 8 }} onClick={csv}><Icon name="publish" size={16} />CSV</button>{' '}<button className="btn p" style={{ padding: '9px 20px' }} onClick={pdf}><Icon name="publish" size={16} />Export PDF</button></>} />
      <div className="grid g4" style={{ marginBottom: 18 }}>
        {([['Ideas in range', dd.v.reduce((x, y) => x + y, 0)], ['Members', X.mem], ['Backings', X.tv], ['Published', data.promotions.length]] as [string, number][]).map(([l, v]) => <div key={l} className="glass pad"><p className="dim">{l}</p><p className="num" style={{ fontSize: 42 }}>{v}</p></div>)}
      </div>
      <div className="grid g32" style={{ marginBottom: 18 }}>{card('area', `Last ${rg} days`)}{card('don', 'By review status')}</div>
      <div style={{ marginBottom: 18 }}>{card('bar', ({ ideas: 'Ideas shared', backs: 'Backings received', members: 'Members', pub: 'Posts published' } as any)[cs.bar.m])}</div>
      <div className="grid g2" style={{ marginBottom: 18 }}>{card('heat', 'By day and time, all time')}{card('fun', 'How people move through your space')}</div>
      {card('top', 'Your most active people')}

      {open && (
        <div id="csd" onClick={e => e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('csd-b') ? setOpen(null) : null}>
          <div className="csd-b" />
          <div className="csd-p glass" role="dialog" aria-label="Chart settings">
            <div className="csd-h"><div><p className="dim">Chart settings</p><h3 style={{ fontSize: 22, fontWeight: 300 }}>{TITLES[open]}</h3></div><button className="chip" onClick={() => setOpen(null)}>Done</button></div>
            <div className="csd-pv"><p className="dim" style={{ marginBottom: 8 }}>Live preview</p>{body(open)}</div>
            <div className="csd-c">
              {ITEMS[open].map(it => it[0] === 't'
                ? <div key={it[1]} className="csr"><span className="mut">{it[2]}</span><button className={cn('tg', (cs[open] as any)[it[1]] && 'on')} role="switch" aria-checked={!!(cs[open] as any)[it[1]]} aria-label={it[2]} onClick={() => set(open, it[1], !(cs[open] as any)[it[1]])}><i /></button></div>
                : <div key={it[1]} className="csr"><span className="mut">{it[2]}</span><div className="acts" style={{ margin: 0, gap: 6 }}>{it[3].map(([v, l]) => <Chip key={String(v)} on={String((cs[open] as any)[it[1]]) === String(v)} onClick={() => set(open, it[1], v)}>{l}</Chip>)}</div></div>)}
            </div>
            <div className="acts"><button className="btn" onClick={() => reset(open)}><Icon name="rotate" size={16} />Reset</button><button className="btn p" onClick={() => setOpen(null)}>Done</button></div>
          </div>
        </div>
      )}
    </>
  )
}

export function download(name: string, type: string, data: string) {
  const u = URL.createObjectURL(new Blob([data], { type }))
  const l = document.createElement('a'); l.href = u; l.download = name; l.click(); URL.revokeObjectURL(u)
}
