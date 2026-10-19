import { type ReactNode, type PointerEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import '../styles/analytics.css'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { AreaChart, BarChart, Daily, Donut, Funnel, Heat, TopList, fd } from '../components/Charts'
import { Chip, Empty, Head } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { ChartKey, ITEMS, MEMBER_ITEMS, TITLES, useChartSettings } from '../lib/chartSettings'
import { STATUS_LABEL } from '../lib/types'
import { cn } from '../lib/util'
import { communityOwnerLookup, isCommunityOwnerContribution } from '../lib/contributors'

export function Analytics() {
  return <Gate><Inner /></Gate>
}

/** Swipe-, drag-, and wheel-friendly viewport for chart canvases wider than their cards. */
function ChartViewport({ children, label }: { children: ReactNode; label: string }) {
  const drag = useRef<{ pointerId: number; x: number; left: number; moved: boolean } | null>(null)
  const onWheel = (event: WheelEvent<HTMLDivElement>) => {
    const viewport = event.currentTarget
    const hasHorizontalOverflow = viewport.scrollWidth > viewport.clientWidth + 1
    // Keep normal wheel input scrolling the page. Shift+wheel is a predictable chart-scroll shortcut.
    if (!event.shiftKey || !hasHorizontalOverflow) return
    viewport.scrollLeft += Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
    event.preventDefault()
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Touch and pen retain their native momentum scrolling; mouse users can grab the chart.
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    drag.current = { pointerId: event.pointerId, x: event.clientX, left: event.currentTarget.scrollLeft, moved: false }
    event.currentTarget.classList.add('is-grabbed')
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch {}
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.x
    if (Math.abs(dx) > 3) current.moved = true
    if (current.moved) {
      event.currentTarget.scrollLeft = current.left - dx
      event.preventDefault()
    }
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId === event.pointerId) {
      drag.current = null
      event.currentTarget.classList.remove('is-grabbed')
      try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
    }
  }
  return (
    <div
      className="chs chs--slide-view"
      role="region"
      aria-label={label}
      tabIndex={0}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >{children}</div>
  )
}

/** Reusable roomy view controls for the two charts with long horizontal data. */
function AnalyticsChartCard({
  title, subtitle, children, settings,
}: {
  title: string
  subtitle: string
  children: ReactNode
  settings?: ReactNode
}) {
  const [minimized, setMinimized] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const heading = (dialog = false) => (
    <div className="head analytics-chart-card__head" style={{ marginBottom: 10 }}>
      <div className="analytics-chart-card__title">
        <h3>{title}</h3>
        <p className="dim">{subtitle}</p>
      </div>
      <div className="analytics-chart-card__actions">
        {settings}
        <button
          type="button"
          className="chip analytics-chart-card__icon-button"
          aria-label={minimized ? `Restore ${title} chart` : `Minimize ${title} chart`}
          title={minimized ? 'Restore chart' : 'Minimize chart'}
          onClick={() => { setExpanded(false); setMinimized(value => !value) }}
        ><Icon name={minimized ? 'expand' : 'minimize'} size={15} /></button>
        {dialog ? (
          <button type="button" className="chip analytics-chart-card__icon-button" aria-label={`Close expanded ${title} chart`} title="Return to Analytics" onClick={() => setExpanded(false)}><Icon name="x" size={15} /></button>
        ) : (
          <button type="button" className="chip analytics-chart-card__icon-button" aria-label={`Expand ${title} chart`} title="Expand chart" onClick={() => { setMinimized(false); setExpanded(true) }}><Icon name="expand" size={15} /></button>
        )}
      </div>
    </div>
  )
  const content = <div className="analytics-chart-card__content">{children}</div>
  return (
    <div className={`glass pad analytics-chart-card${minimized ? ' is-minimized' : ''}`}>
      {heading()}
      {!minimized && content}
      {expanded && !minimized && createPortal(
        <div className="analytics-chart-overlay" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setExpanded(false) }}>
          <section className="glass pad analytics-chart-dialog" role="dialog" aria-modal="true" aria-label={`${title} expanded chart`}>
            {heading(true)}
            {content}
          </section>
        </div>,
        document.body,
      )}
    </div>
  )
}

function Inner() {
  const a = useApp()
  const nav = useNavigate()
  const { data: rawData } = a
  const ownedCommunities = useMemo(
    () => rawData.communities.filter(community => !!a.me?.id && community.ownerId === a.me.id),
    [rawData.communities, a.me?.id],
  )
  const data = useMemo(() => {
    if (a.owner) return rawData
    const communityIds = new Set(ownedCommunities.map(c => c.id))
    const ideas = rawData.ideas.filter(i => communityIds.has(i.cid))
    const ideaIds = new Set(ideas.map(i => i.id))
    return {
      ...rawData,
      communities: ownedCommunities,
      ideas,
      reviews: Object.fromEntries(Object.entries(rawData.reviews).filter(([id]) => ideaIds.has(id))),
      promotions: rawData.promotions.filter(p => ideaIds.has(p.ideaId)),
    }
  }, [rawData, a.owner, ownedCommunities])
  const ownersByCommunity = useMemo(() => communityOwnerLookup(data.communities, a.owner ? a.me?.id : undefined), [data.communities, a.owner, a.me?.id])
  const { cs, set, reset } = useChartSettings()
  const [rg, setRg] = useState(30)
  const [open, setOpen] = useState<ChartKey | null>(null)

  const communityIdsKey = useMemo(() => data.communities.map(community => community.id).sort().join('|'), [data.communities])
  const [scopedMembers, setScopedMembers] = useState<Record<string, string[]>>({})
  const [scopedContributors, setScopedContributors] = useState<Record<string, { userId: string; ideas: number; backings: number }[]>>({})
  const [scopedMetricsReady, setScopedMetricsReady] = useState(false)

  useEffect(() => {
    let active = true
    const store = a.backend?.store
    if (!store || !a.me || !communityIdsKey) {
      setScopedMembers({})
      setScopedContributors({})
      setScopedMetricsReady(true)
      return () => { active = false }
    }

    const ids = communityIdsKey.split('|')
    setScopedMetricsReady(false)
    void Promise.all(ids.map(async cid => {
      try {
        const [members, contributors] = await Promise.all([
          store.listCommunityMembers(cid),
          store.listCommunityContributors(cid),
        ])
        return { cid, members, contributors, error: false }
      } catch (error) {
        console.error('Could not load scoped analytics for community:', cid, error)
        return { cid, members: [] as string[], contributors: [] as { userId: string; ideas: number; backings: number }[], error: true }
      }
    })).then(results => {
      if (!active) return
      setScopedMembers(Object.fromEntries(results.map(result => [result.cid, result.members])))
      setScopedContributors(Object.fromEntries(results.map(result => [result.cid, result.contributors])))
      setScopedMetricsReady(results.every(result => !result.error))
    })
    return () => { active = false }
  }, [a.backend, a.me?.id, communityIdsKey])


  const X = useMemo(() => {
    const sc: Record<string, number> = { review: 0, selected: 0, held: 0, declined: 0, promoted: 0 }
    const auth: Record<string, number> = {}, back: Record<string, number> = {}
    let tv = 0

    if (scopedMetricsReady) {
      for (const cid of data.communities.map(community => community.id)) {
        for (const contributor of scopedContributors[cid] || []) {
          auth[contributor.userId] = (auth[contributor.userId] || 0) + contributor.ideas
          back[contributor.userId] = (back[contributor.userId] || 0) + contributor.backings
        }
      }
    } else {
      data.ideas.forEach(idea => {
        if (!isCommunityOwnerContribution(idea, ownersByCommunity)) {
          auth[idea.authorId] = (auth[idea.authorId] || 0) + 1
          back[idea.authorId] = (back[idea.authorId] || 0) + a.votesOf(idea.id)
        }
      })
    }

    data.ideas.forEach(idea => {
      sc[a.statusOf(idea.id)]++
      tv += a.votesOf(idea.id)
    })

    const memberIds = new Set<string>()
    if (scopedMetricsReady) {
      Object.values(scopedMembers).flat().forEach(uid => { if (uid) memberIds.add(uid) })
    } else {
      const communityIds = new Set(data.communities.map(community => community.id))
      Object.entries(data.members).forEach(([uid, memberships]) => {
        if (Object.entries(memberships || {}).some(([cid, joined]) => joined && communityIds.has(cid))) memberIds.add(uid)
      })
    }
    return { sc, auth, back, tv, mem: memberIds.size }
  }, [data, a.statusOf, a.votesOf, ownersByCommunity, scopedMembers, scopedContributors, scopedMetricsReady])

  const daily = (n: number): Daily => {
    const dayMs = 864e5
    const today = new Date().setHours(0, 0, 0, 0)
    const v = Array(n).fill(0) as number[]
    const dt = Array.from({ length: n }, (_, i) => today - (n - 1 - i) * dayMs)
    for (const idea of data.ideas) {
      const index = Math.floor((idea.at - today) / dayMs) + n - 1
      if (index >= 0 && index < n) v[index]++
    }
    return { v, d: dt }
  }
  const dd = useMemo(() => daily(rg), [data.ideas, rg])
  const barRows = () => {
    const o = cs.bar
    const ideaCounts = new Map<string, number>()
    const backingCounts = new Map<string, number>()
    const communityByIdea = new Map<string, string>()
    const promotionCounts = new Map<string, number>()
    const memberCounts = new Map<string, number>()

    for (const idea of data.ideas) {
      communityByIdea.set(idea.id, idea.cid)
      ideaCounts.set(idea.cid, (ideaCounts.get(idea.cid) || 0) + 1)
      backingCounts.set(idea.cid, (backingCounts.get(idea.cid) || 0) + a.votesOf(idea.id))
    }
    for (const promotion of data.promotions) {
      const cid = communityByIdea.get(promotion.ideaId)
      if (cid) promotionCounts.set(cid, (promotionCounts.get(cid) || 0) + 1)
    }
    if (!scopedMetricsReady) {
      for (const memberships of Object.values(data.members)) {
        for (const [cid, joined] of Object.entries(memberships || {})) {
          if (joined) memberCounts.set(cid, (memberCounts.get(cid) || 0) + 1)
        }
      }
    }

    const rows = data.communities.map(c => {
      let v = 0
      if (o.m === 'ideas') v = ideaCounts.get(c.id) || 0
      else if (o.m === 'backs') v = backingCounts.get(c.id) || 0
      else if (o.m === 'members') v = scopedMetricsReady ? (scopedMembers[c.id] || []).length : (memberCounts.get(c.id) || 0)
      else v = promotionCounts.get(c.id) || 0
      return { n: c.name, v }
    })
    if (o.s === 'value') rows.sort((x, y) => y.v - x.v)
    else if (o.s === 'name') rows.sort((x, y) => x.n.localeCompare(y.n))
    return o.n ? rows.slice(0, o.n) : rows
  }
  const donut: [string, number, string][] = [['Ready to share', X.sc.promoted, '#fff'], ['Selected', X.sc.selected, '#d0d0d0'], ['In review', X.sc.review, '#8a8a8a'], ['Held', X.sc.held, '#555'], ['Declined', X.sc.declined, '#333']]
  const funnel: [string, number][] = [['Ideas submitted', data.ideas.length], ['Selected or ready to share', X.sc.selected + X.sc.promoted], ['Ready to share', X.sc.promoted]]
  const src = cs.top.m === 'backs' ? X.back : X.auth
  const topIds = Object.keys(src).sort((x, y) => src[y] - src[x]).slice(0, cs.top.n)

  // Only verified platform roles or actual community ownership should expose
  // owner analytics. Regular members always receive their personal dashboard.
  const hasGlobalAnalyticsAccess = a.platformOwner || a.platformAdmin
  if (!hasGlobalAnalyticsAccess && ownedCommunities.length === 0) return <MemberAnalyticsView />

  function body(g: ChartKey) {
    if (g === 'area') return <ChartViewport label="Ideas per day chart"><AreaChart dd={dd} o={cs.area} /></ChartViewport>
    if (g === 'bar') { const rows = barRows(); return rows.length ? <ChartViewport label="Community comparison chart: Ideas shared, backings, members, or posts prepared to share"><BarChart rows={rows} o={cs.bar as any} /></ChartViewport> : <p className="mut" style={{ marginTop: 18 }}>No communities yet.</p> }
    if (g === 'don') return <Donut items={donut} total={data.ideas.length} o={cs.don} />
    if (g === 'heat') return <Heat ideas={data.ideas} val={cs.heat.val} />
    if (g === 'fun') return <Funnel rows={funnel} o={cs.fun} />
    return <TopList ids={topIds} src={src} nm={a.nm} />
  }
  const card = (g: ChartKey, sub: string) => {
    const settingsButton = <button type="button" className="chip" aria-label={`Chart settings for ${TITLES[g]}`} onClick={() => setOpen(g)}><Icon name="settings" size={14} />Chart settings</button>
    if (g === 'area' || g === 'bar') {
      return <AnalyticsChartCard key={g} title={TITLES[g]} subtitle={sub} settings={settingsButton}>{body(g)}</AnalyticsChartCard>
    }
    return (
      <div className="glass pad" key={g}>
        <div className="head" style={{ marginBottom: 6 }}><div className={g === 'area' ? 'chart-heading-animated' : undefined}><h3>{TITLES[g]}</h3><p className="dim">{sub}</p></div>{settingsButton}</div>
        {body(g)}
      </div>
    )
  }

  function csv() {
    const q = (s: any) => '"' + String(s ?? '').replace(/"/g, '""') + '"'
    const rows = data.ideas.map(i => [q(i.title), q(data.communities.find(c => c.id === i.cid)?.name), q(a.nm(i.authorId)), a.votesOf(i.id), STATUS_LABEL[a.statusOf(i.id)], data.reviews[i.id]?.score ?? '', new Date(i.at).toISOString()].join(','))
    download('quorlyth-ideas.csv', 'text/csv', 'title,community,author,backings,status,score,created\n' + rows.join('\n'))
  }
  async function pdf() {
    const { jsPDF } = await import('jspdf')
    const d = new jsPDF({ unit: 'mm', format: 'a4' }), W = 210, M = 16
    let y = 54
    const T = (s: any, n = 0) => { s = String(s ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, ''); return n && s.length > n ? s.slice(0, n - 1) + '...' : s }
    const ck = (h: number) => { if (y + h > 278) { d.addPage(); y = 20 } }
    d.setFillColor(0, 0, 0); d.rect(0, 0, W, 40, 'F'); d.setTextColor(255, 255, 255); d.setFont('helvetica', 'bold'); d.setFontSize(22); d.text('QUORLYTH', M, 22)
    d.setFont('helvetica', 'normal'); d.setFontSize(10); d.text(T(a.owner ? (data.settings?.name || 'Platform report') : data.communities.length === 1 ? data.communities[0].name : 'My communities report'), M, 30); d.text(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + `   Last ${rg} days`, W - M, 30, { align: 'right' })
    const H1 = (t: string) => { ck(14); d.setTextColor(0, 0, 0); d.setFont('helvetica', 'bold'); d.setFontSize(13); d.text(t, M, y); d.setDrawColor(0, 0, 0); d.setLineWidth(0.3); d.line(M, y + 2, W - M, y + 2); y += 10; d.setFont('helvetica', 'normal') }
    ;[['Ideas in range', dd.v.reduce((x, z) => x + z, 0)], ['Members', X.mem], ['Backings', X.tv], ['Ready to share', data.promotions.length]].forEach((k, i) => { const x = M + i * 45.5; d.setDrawColor(0, 0, 0); d.setLineWidth(0.3); d.roundedRect(x, y, 42, 24, 3, 3); d.setFontSize(8); d.setTextColor(110, 110, 110); d.text(String(k[0]), x + 4, y + 8); d.setFontSize(18); d.setTextColor(0, 0, 0); d.text(String(k[1]), x + 4, y + 19) })
    y += 34; H1('Ideas per day')
    const cw = W - 2 * M - 8, chh = 46, cx = M + 8, mx = Math.max(1, ...dd.v), n = dd.v.length
    d.setDrawColor(200, 200, 200); d.setLineWidth(0.2); for (let g = 0; g <= 4; g++) { const gy = y + (chh * g) / 4; d.line(cx, gy, cx + cw, gy); d.setFontSize(7); d.setTextColor(120, 120, 120); d.text(String(Math.round(mx * (1 - g / 4))), cx - 2, gy + 1, { align: 'right' }) }
    d.setDrawColor(0, 0, 0); d.setLineWidth(0.5); for (let i = 1; i < n; i++) d.line(cx + ((i - 1) / (n - 1)) * cw, y + chh - (dd.v[i - 1] / mx) * chh, cx + (i / (n - 1)) * cw, y + chh - (dd.v[i] / mx) * chh)
    d.setFontSize(7); d.setTextColor(120, 120, 120); ;[0, Math.floor((n - 1) / 2), n - 1].forEach(i => d.text(fd(dd.d[i]), cx + (i / (n - 1 || 1)) * cw, y + chh + 6, { align: i === 0 ? 'left' : i === n - 1 ? 'right' : 'center' }))
    y += chh + 14; H1(cs.bar.m === 'backs' ? 'Backings by community' : cs.bar.m === 'members' ? 'Members by community' : cs.bar.m === 'pub' ? 'Posts prepared to share by community' : 'Ideas by community')
    const rows = barRows(), bm = Math.max(1, ...rows.map(r => r.v))
    rows.forEach(r => { ck(9); d.setFontSize(9); d.setTextColor(0, 0, 0); d.text(T(r.n, 24), M, y + 4); d.setFillColor(0, 0, 0); d.rect(M + 50, y, Math.max((r.v / bm) * 100, 0.8), 5, 'F'); d.text(String(r.v), M + 50 + Math.max((r.v / bm) * 100, 0.8) + 3, y + 4); y += 9 })
    y += 6; H1('Idea status breakdown')
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

  if (a.owner && !rawData.communities.length && !rawData.ideas.length) return <><Head kicker="Analytics" title="Your platform in numbers." /><Empty icon="insight" title="Nothing to measure yet" text="Platform analytics will appear here as communities, members and ideas become active."><button className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/communities')}>Open communities</button></Empty></>

  return (
    <>
      <Head kicker="Analytics" title={a.owner ? 'Your platform in numbers.' : data.communities.length === 1 ? `${data.communities[0].name} in numbers.` : 'Your communities in numbers.'} right={<>{[7, 30, 90].map(d => <span key={d}><Chip on={rg === d} onClick={() => setRg(d)}>{d} days</Chip>{' '}</span>)}<button className="btn" style={{ padding: '9px 20px', marginLeft: 8 }} onClick={csv}><Icon name="publish" size={16} />CSV</button>{' '}<button className="btn p" style={{ padding: '9px 20px' }} onClick={pdf}><Icon name="publish" size={16} />Export PDF</button></>} />
      <div className="grid g4" style={{ marginBottom: 18 }}>
        {([['Ideas in range', dd.v.reduce((x, y) => x + y, 0)], ['Members', X.mem], ['Backings', X.tv], ['Ready to share', data.promotions.length]] as [string, number][]).map(([l, v]) => <div key={l} className="glass pad"><p className="dim">{l}</p><p className="num" style={{ fontSize: 42 }}>{v}</p></div>)}
      </div>
      <div className="grid g32" style={{ marginBottom: 18 }}>{card('area', `Last ${rg} days`)}{card('don', 'By review status')}</div>
      <div style={{ marginBottom: 18 }}>{card('bar', ({ ideas: 'Ideas shared', backs: 'Backings received', members: 'Members', pub: 'Posts prepared to share' } as any)[cs.bar.m])}</div>
      <div className="grid g2" style={{ marginBottom: 18 }}>{card('heat', 'By day and time, all time')}{card('fun', 'Idea progress from submission to share-ready')}</div>
      {card('top', 'Your most active people')}

      {open && (
        <div id="csd" onClick={e => e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('csd-b') ? setOpen(null) : null}>
          <div className="csd-b" />
          <div className="csd-p glass" role="dialog" aria-modal="true" aria-label={"Chart settings for " + TITLES[open]}>
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


/** Personal chart empty states avoid rendering flat, uninformative charts for zero-data periods. */
function PersonalChartEmpty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="member-chart-empty" role="status">
      <span className="member-chart-empty__icon"><Icon name="insight" size={18} /></span>
      <div>
        <h4>{title}</h4>
        <p>{detail}</p>
      </div>
    </div>
  )
}

/** Member analytics shares the same layout and chart components as owner analytics, with member-scoped data. */
function MemberAnalyticsView() {
  const a = useApp()
  const nav = useNavigate()
  const { cs, set, reset } = useChartSettings('member')
  const [rg, setRg] = useState(30)
  const [open, setOpen] = useState<ChartKey | null>(null)
  const memberId = a.me?.id || ''
  const joinedCommunities = useMemo(
    () => a.data.communities.filter(community => a.joined(community.id)),
    [a.data.communities, a.joined],
  )
  const myIdeas = useMemo(
    () => a.data.ideas.filter(idea => idea.authorId === memberId),
    [a.data.ideas, memberId],
  )
  const activityCommunities = useMemo(() => {
    const ids = new Set([...joinedCommunities.map(community => community.id), ...myIdeas.map(idea => idea.cid)])
    return a.data.communities.filter(community => ids.has(community.id))
  }, [a.data.communities, joinedCommunities, myIdeas])
  const activity = useMemo<Daily>(() => {
    const day = 86400000
    const today = new Date().setHours(0, 0, 0, 0)
    const dates: number[] = []
    const values: number[] = []
    for (let offset = rg - 1; offset >= 0; offset -= 1) {
      const timestamp = today - offset * day
      dates.push(timestamp)
      values.push(myIdeas.filter(idea => idea.at >= timestamp && idea.at < timestamp + day).length)
    }
    return { d: dates, v: values }
  }, [rg, myIdeas])

  const countStatus = (status: string) => myIdeas.filter(idea => a.statusOf(idea.id) === status).length
  const statuses: [string, number, string][] = [
    ['In review', countStatus('review'), '#ffffff'],
    ['Selected', countStatus('selected'), '#d0d0d0'],
    ['Held', countStatus('held'), '#777777'],
    ['Declined', countStatus('declined'), '#4f4f4f'],
    ['Ready to share', countStatus('promoted'), '#999999'],
  ]
  const backingsReceived = myIdeas.reduce((sum, idea) => sum + a.votesOf(idea.id), 0)
  const selectedIdeas = myIdeas.filter(idea => ['selected', 'promoted'].includes(a.statusOf(idea.id))).length
  const readyIdeas = countStatus('promoted')
  const ideasInRange = activity.v.reduce((sum, value) => sum + value, 0)
  const effectiveBarMeasure = cs.bar.m === 'backs' ? 'backs' : 'ideas'
  const effectiveTopSort = cs.top.m === 'backs' ? 'backs' : 'ideas'

  function barRows() {
    let rows = activityCommunities.map(community => {
      const communityIdeas = myIdeas.filter(idea => idea.cid === community.id)
      const value = effectiveBarMeasure === 'backs'
        ? communityIdeas.reduce((sum, idea) => sum + a.votesOf(idea.id), 0)
        : communityIdeas.length
      return { n: community.name, v: value }
    })
    if (cs.bar.s === 'value') rows = rows.sort((first, second) => second.v - first.v)
    else if (cs.bar.s === 'name') rows = rows.sort((first, second) => first.n.localeCompare(second.n))
    return cs.bar.n ? rows.slice(0, cs.bar.n) : rows
  }

  const funnelRows: [string, number][] = [
    ['Ideas shared', myIdeas.length],
    ['Selected or ready to share', selectedIdeas],
    ['Ready to share', readyIdeas],
  ]
  const topIdeas = [...myIdeas]
    .sort((first, second) => effectiveTopSort === 'backs'
      ? a.votesOf(second.id) - a.votesOf(first.id) || second.at - first.at
      : second.at - first.at)
    .slice(0, cs.top.n)

  const titles: Record<ChartKey, string> = {
    area: 'Ideas over time',
    bar: effectiveBarMeasure === 'backs' ? 'Backings by community' : 'Ideas by community',
    don: 'Your idea statuses',
    heat: 'When you contribute',
    fun: 'Your idea journey',
    top: effectiveTopSort === 'backs' ? 'Your most backed ideas' : 'Your latest ideas',
  }

  function body(g: ChartKey) {
    if (g === 'area') {
      return ideasInRange > 0
        ? <ChartViewport label="Your ideas per day chart"><AreaChart dd={activity} o={cs.area} /></ChartViewport>
        : <PersonalChartEmpty title={myIdeas.length ? 'No ideas in this period' : 'Your activity starts here'} detail={myIdeas.length ? 'No ideas were submitted in the selected date range. Choose 30 or 90 days to see earlier activity.' : 'Once you share an idea, your day-by-day activity will appear here.'} />
    }
    if (g === 'bar') {
      const rows = barRows()
      if (!activityCommunities.length) return <PersonalChartEmpty title="No communities to compare yet" detail="Join a community, or share an idea in one, to see your personal activity by community." />
      if (!rows.some(row => row.v > 0)) return <PersonalChartEmpty title="Nothing to compare yet" detail={effectiveBarMeasure === 'backs' ? 'Backings received on your ideas will appear here.' : 'Your idea submissions will appear here as you contribute.'} />
      return <ChartViewport label="Your ideas shared and backings by community chart"><BarChart rows={rows} o={{ ...cs.bar, m: effectiveBarMeasure } as any} /></ChartViewport>
    }
    if (g === 'don') return myIdeas.length
      ? <Donut items={statuses} total={myIdeas.length} o={cs.don} />
      : <PersonalChartEmpty title="No idea statuses yet" detail="This chart breaks down the current review status of ideas you have submitted." />
    if (g === 'heat') return myIdeas.length
      ? <div className="member-heat-scroll"><Heat ideas={myIdeas} val={cs.heat.val} /></div>
      : <PersonalChartEmpty title="No contribution pattern yet" detail="After you share ideas, this chart will show the days and times when you contribute." />
    if (g === 'fun') return myIdeas.length
      ? <Funnel rows={funnelRows} o={cs.fun} />
      : <PersonalChartEmpty title="Your idea journey starts here" detail="Share an idea to track how it moves from submission to selection and ready-to-share." />
    if (!topIdeas.length) return <PersonalChartEmpty title="No ideas to rank yet" detail="Your latest and most-backed ideas will appear here after you contribute." />
    const maxBackings = Math.max(1, ...topIdeas.map(idea => a.votesOf(idea.id)))
    return <div className="member-analytics__idea-list">{topIdeas.map((idea, index) => {
      const backings = a.votesOf(idea.id)
      const communityName = a.data.communities.find(community => community.id === idea.cid)?.name || 'Community'
      return (
        <button key={idea.id} className="row rowbtn member-analytics__idea-row" onClick={() => nav('/idea/' + idea.id)}>
          <div className="score" style={{ width: 42, height: 42, fontSize: 14, flexShrink: 0 }}>{effectiveTopSort === 'backs' ? backings : index + 1}</div>
          <div className="t">
            <h3 style={{ fontSize: 15 }}>{idea.title}</h3>
            <p className="dim">{communityName} · {new Date(idea.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>
            {effectiveTopSort === 'backs' && <div className="bar"><i style={{ width: (backings / maxBackings) * 100 + '%' }} /></div>}
          </div>
          <span className="dim member-analytics__idea-backing">{backings} {backings === 1 ? 'backing' : 'backings'}</span>
        </button>
      )
    })}</div>
  }

  const card = (g: ChartKey, sub: string) => {
    const settingsButton = <button type="button" className="chip" aria-label={`Chart settings for ${titles[g]}`} onClick={() => setOpen(g)}><Icon name="settings" size={14} />Chart settings</button>
    if (g === 'area' || g === 'bar') {
      return <AnalyticsChartCard key={g} title={titles[g]} subtitle={sub} settings={settingsButton}>{body(g)}</AnalyticsChartCard>
    }
    return (
      <div className="glass pad" key={g}>
        <div className="head" style={{ marginBottom: 6 }}>
          <div className={g === 'area' ? 'chart-heading-animated' : undefined}><h3>{titles[g]}</h3><p className="dim">{sub}</p></div>
          {settingsButton}
        </div>
        {body(g)}
      </div>
    )
  }

  function csv() {
    const q = (value: any) => '"' + String(value ?? '').replace(/"/g, '""') + '"'
    const rows = myIdeas.map(idea => [
      q(idea.title),
      q(a.data.communities.find(community => community.id === idea.cid)?.name),
      q(a.nm(idea.authorId)),
      a.votesOf(idea.id),
      STATUS_LABEL[a.statusOf(idea.id)],
      a.data.reviews[idea.id]?.score ?? '',
      new Date(idea.at).toISOString(),
    ].join(','))
    download('quorlyth-my-analytics.csv', 'text/csv', 'title,community,author,backings,status,score,created\n' + rows.join('\n'))
  }

  async function pdf() {
    const { jsPDF } = await import('jspdf')
    const d = new jsPDF({ unit: 'mm', format: 'a4' })
    const W = 210, M = 16
    let y = 54
    d.setFillColor(0, 0, 0)
    d.rect(0, 0, W, 40, 'F')
    d.setTextColor(255, 255, 255)
    d.setFont('helvetica', 'bold')
    d.setFontSize(22)
    d.text('QUORLYTH', M, 22)
    d.setFont('helvetica', 'normal')
    d.setFontSize(10)
    d.text('My analytics report', M, 30)
    d.text(new Date().toLocaleDateString() + '   Last ' + rg + ' days', W - M, 30, { align: 'right' })
    const metrics: [string, number][] = [
      ['Ideas in range', ideasInRange],
      ['Communities joined', joinedCommunities.length],
      ['Backings received', backingsReceived],
      ['Ideas selected', selectedIdeas],
    ]
    metrics.forEach(([label, value], index) => {
      const x = M + index * 45.5
      d.setDrawColor(0, 0, 0)
      d.setLineWidth(0.3)
      d.roundedRect(x, y, 42, 24, 3, 3)
      d.setFontSize(7)
      d.setTextColor(110, 110, 110)
      d.text(label, x + 3, y + 8)
      d.setFontSize(17)
      d.setTextColor(0, 0, 0)
      d.text(String(value), x + 3, y + 19)
    })
    y += 36
    d.setFont('helvetica', 'bold')
    d.setFontSize(13)
    d.text('Your ideas', M, y)
    d.setDrawColor(0, 0, 0)
    d.line(M, y + 2, W - M, y + 2)
    y += 10
    d.setFont('helvetica', 'normal')
    d.setFontSize(8)
    const exportIdeas = [...myIdeas].sort((first, second) => second.at - first.at).slice(0, 40)
    exportIdeas.forEach((idea, index) => {
      if (y > 278) {
        d.addPage()
        y = 20
      }
      const communityName = a.data.communities.find(community => community.id === idea.cid)?.name || 'Community'
      const title = String(idea.title || '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '').slice(0, 54)
      d.text(String(index + 1) + '. ' + title, M, y)
      d.text(communityName.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '').slice(0, 22), M + 112, y)
      d.text(String(a.votesOf(idea.id)) + ' backings', W - M, y, { align: 'right' })
      y += 7
    })
    d.save('quorlyth-my-analytics.pdf')
  }

  return (
    <div className="member-analytics">
      <Head kicker="Personal analytics" title="Your activity in numbers." right={<>{[7, 30, 90].map(days => <span key={days}><Chip on={rg === days} onClick={() => setRg(days)}>{days} days</Chip>{' '}</span>)}<button className="btn" style={{ padding: '9px 20px', marginLeft: 8 }} onClick={csv}><Icon name="publish" size={16} />CSV</button>{' '}<button className="btn p" style={{ padding: '9px 20px' }} onClick={pdf}><Icon name="publish" size={16} />Export PDF</button></>} />
      <div className="member-analytics__scope glass">
        <span className="chip"><Icon name="user-round" size={13} />Personal view</span>
        <div>
          <p className="member-analytics__scope-title">Your activity. Your ideas. Your progress.</p>
          <p className="member-analytics__scope-copy">These charts use your own submissions and the backings on those ideas. They do not rank other members or show community-owner performance.</p>
        </div>
      </div>
      <div className="grid g4 member-analytics__stats" style={{ marginBottom: 18 }}>
        {([
          ['Ideas in range', ideasInRange, 'Ideas you submitted in the selected period'],
          ['Communities joined', joinedCommunities.length, 'Communities you currently belong to'],
          ['Backings received', backingsReceived, 'Total support for your ideas'],
          ['Selected or share-ready', selectedIdeas, 'Your ideas selected by a community owner'],
        ] as [string, number, string][]).map(([label, value, detail]) => (
          <div key={label} className="glass pad member-analytics__metric">
            <p className="dim">{label}</p>
            <p className="num" style={{ fontSize: 42 }}>{value}</p>
            <p className="member-analytics__metric-detail">{detail}</p>
          </div>
        ))}
      </div>
      <div className="grid g32 member-analytics__paired" style={{ marginBottom: 18 }}>{card('area', 'Your submissions · last ' + rg + ' days')}{card('don', 'Status of your own ideas')}</div>
      <div style={{ marginBottom: 18 }}>{card('bar', effectiveBarMeasure === 'backs' ? 'Backings on your ideas, by community' : 'Your idea submissions, by community')}</div>
      <div className="grid g2 member-analytics__paired" style={{ marginBottom: 18 }}>{card('heat', 'Timing of your own submissions')}{card('fun', 'Your progress from submission to share-ready')}</div>
      {card('top', effectiveTopSort === 'backs' ? 'Your ideas · most backed first' : 'Your ideas · newest first')}
      {open && (
        <div id="csd" onClick={e => e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('csd-b') ? setOpen(null) : null}>
          <div className="csd-b" />
          <div className="csd-p glass" role="dialog" aria-modal="true" aria-label={"Chart settings for " + titles[open]}>
            <div className="csd-h"><div><p className="dim">Chart settings</p><h3 style={{ fontSize: 22, fontWeight: 300 }}>{titles[open]}</h3></div><button className="chip" onClick={() => setOpen(null)}>Done</button></div>
            <div className="csd-pv"><p className="dim" style={{ marginBottom: 8 }}>Live preview</p>{body(open)}</div>
            <div className="csd-c">
              {MEMBER_ITEMS[open].map(it => {
                const value = open === 'bar' && it[1] === 'm' ? effectiveBarMeasure : open === 'top' && it[1] === 'm' ? effectiveTopSort : (cs[open] as any)[it[1]]
                return it[0] === 't'
                  ? <div key={it[1]} className="csr"><span className="mut">{it[2]}</span><button className={cn('tg', (cs[open] as any)[it[1]] && 'on')} role="switch" aria-checked={!!(cs[open] as any)[it[1]]} aria-label={it[2]} onClick={() => set(open, it[1], !(cs[open] as any)[it[1]])}><i /></button></div>
                  : <div key={it[1]} className="csr"><span className="mut">{it[2]}</span><div className="acts" style={{ margin: 0, gap: 6 }}>{it[3].map(([option, label]) => <Chip key={String(option)} on={String(value) === String(option)} onClick={() => set(open, it[1], option)}>{label}</Chip>)}</div></div>
              })}
            </div>
            <div className="acts"><button className="btn" onClick={() => reset(open)}><Icon name="rotate" size={16} />Reset</button><button className="btn p" onClick={() => setOpen(null)}>Done</button></div>
          </div>
        </div>
      )}
    </div>
  )
}

export function download(name: string, type: string, data: string) {
  const u = URL.createObjectURL(new Blob([data], { type }))
  const l = document.createElement('a')
  l.href = u; l.download = name
  l.style.display = 'none'
  document.body.appendChild(l)
  l.click()
  l.remove()
  // Let the browser start writing the download before releasing the Blob URL.
  window.setTimeout(() => URL.revokeObjectURL(u), 1000)
}
