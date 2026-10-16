import { useEffect, useMemo, useState } from 'react'
import '../styles/analytics.css'
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
import { communityOwnerLookup, isCommunityOwnerContribution } from '../lib/contributors'

export function Analytics() {
  return <Gate><Inner /></Gate>
}

function Inner() {
  const a = useApp()
  const nav = useNavigate()
  const { data: rawData } = a
  const ownedCommunities = useMemo(() => rawData.communities.filter(c => a.ownsCommunity(c.id)), [rawData.communities, a.ownsCommunity])
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
  const donut: [string, number, string][] = [['Ready to share', X.sc.promoted, '#fff'], ['Selected', X.sc.selected, '#d0d0d0'], ['In review', X.sc.review, '#8a8a8a'], ['Held', X.sc.held, '#555'], ['Declined', X.sc.declined, '#333']]
  const funnel: [string, number][] = [['Members', X.mem], ['Contributors', Object.keys(X.auth).length], ['Ideas', data.ideas.length], ['Selected', X.sc.selected + X.sc.promoted], ['Ready to share', data.promotions.length]]
  const src = cs.top.m === 'backs' ? X.back : X.auth
  const topIds = Object.keys(src).sort((x, y) => src[y] - src[x]).slice(0, cs.top.n)

  if (!a.owner && ownedCommunities.length === 0) return <MemberAnalyticsView />

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
    d.setFont('helvetica', 'normal'); d.setFontSize(10); d.text(T(a.owner ? (data.settings?.name || 'Platform report') : data.communities.length === 1 ? data.communities[0].name : 'My communities report'), M, 30); d.text(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + `   Last ${rg} days`, W - M, 30, { align: 'right' })
    const H1 = (t: string) => { ck(14); d.setTextColor(0, 0, 0); d.setFont('helvetica', 'bold'); d.setFontSize(13); d.text(t, M, y); d.setDrawColor(0, 0, 0); d.setLineWidth(0.3); d.line(M, y + 2, W - M, y + 2); y += 10; d.setFont('helvetica', 'normal') }
    ;[['Ideas in range', dd.v.reduce((x, z) => x + z, 0)], ['Members', X.mem], ['Backings', X.tv], ['Ready to share', data.promotions.length]].forEach((k, i) => { const x = M + i * 45.5; d.setDrawColor(0, 0, 0); d.setLineWidth(0.3); d.roundedRect(x, y, 42, 24, 3, 3); d.setFontSize(8); d.setTextColor(110, 110, 110); d.text(String(k[0]), x + 4, y + 8); d.setFontSize(18); d.setTextColor(0, 0, 0); d.text(String(k[1]), x + 4, y + 19) })
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

  if (a.owner && !rawData.communities.length && !rawData.ideas.length) return <><Head kicker="Analytics" title="Your platform in numbers." /><Empty icon="insight" title="Nothing to measure yet" text="Platform analytics will appear here as communities, members and ideas become active."><button className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/communities')}>Open communities</button></Empty></>

  return (
    <>
      <Head kicker="Analytics" title={a.owner ? 'Your platform in numbers.' : data.communities.length === 1 ? `${data.communities[0].name} in numbers.` : 'Your communities in numbers.'} right={<>{[7, 30, 90].map(d => <span key={d}><Chip on={rg === d} onClick={() => setRg(d)}>{d} days</Chip>{' '}</span>)}<button className="btn" style={{ padding: '9px 20px', marginLeft: 8 }} onClick={csv}><Icon name="publish" size={16} />CSV</button>{' '}<button className="btn p" style={{ padding: '9px 20px' }} onClick={pdf}><Icon name="publish" size={16} />Export PDF</button></>} />
      <div className="grid g4" style={{ marginBottom: 18 }}>
        {([['Ideas in range', dd.v.reduce((x, y) => x + y, 0)], ['Members', X.mem], ['Backings', X.tv], ['Ready to share', data.promotions.length]] as [string, number][]).map(([l, v]) => <div key={l} className="glass pad"><p className="dim">{l}</p><p className="num" style={{ fontSize: 42 }}>{v}</p></div>)}
      </div>
      <div className="grid g32" style={{ marginBottom: 18 }}>{card('area', `Last ${rg} days`)}{card('don', 'By review status')}</div>
      <div style={{ marginBottom: 18 }}>{card('bar', ({ ideas: 'Ideas shared', backs: 'Backings received', members: 'Members', pub: 'Posts prepared to share' } as any)[cs.bar.m])}</div>
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


/** Member analytics uses only the signed-in member's own ideas and participation. */
function MemberAnalyticsView() {
  const a = useApp()
  const nav = useNavigate()
  const [range, setRange] = useState(30)
  const { cs } = useChartSettings()
  const memberId = a.me?.id || ''
  const joinedCommunities = useMemo(
    () => a.data.communities.filter(community => a.joined(community.id)),
    [a.data.communities, a.joined],
  )
  const myIdeas = useMemo(
    () => a.data.ideas.filter(idea => idea.authorId === memberId),
    [a.data.ideas, memberId],
  )
  const activity = useMemo<Daily>(() => {
    const day = 86400000
    const today = new Date().setHours(0, 0, 0, 0)
    const dates: number[] = []
    const values: number[] = []
    for (let offset = range - 1; offset >= 0; offset -= 1) {
      const timestamp = today - offset * day
      dates.push(timestamp)
      values.push(myIdeas.filter(idea => idea.at >= timestamp && idea.at < timestamp + day).length)
    }
    return { d: dates, v: values }
  }, [range, myIdeas])
  const statuses = useMemo(() => {
    const count = (status: string) => myIdeas.filter(idea => a.statusOf(idea.id) === status).length
    return [
      ['In review', count('review'), '#bcbcbc'],
      ['Selected', count('selected'), '#eeeeee'],
      ['Held', count('held'), '#777777'],
      ['Declined', count('declined'), '#4f4f4f'],
      ['Ready to share', count('promoted'), '#ffffff'],
    ] as [string, number, string][]
  }, [myIdeas, a.statusOf])
  const backingsReceived = myIdeas.reduce((sum, idea) => sum + a.votesOf(idea.id), 0)
  const selectedIdeas = myIdeas.filter(idea => ['selected', 'promoted'].includes(a.statusOf(idea.id))).length
  const recentIdeas = [...myIdeas].sort((first, second) => (second.at || 0) - (first.at || 0)).slice(0, 5)
  const contributionsByCommunity = joinedCommunities.map(community => ({
    community,
    ideas: myIdeas.filter(idea => idea.cid === community.id),
  })).sort((first, second) => second.ideas.length - first.ideas.length || first.community.name.localeCompare(second.community.name))

  return (
    <section className="member-analytics-page">
      <Head kicker="MEMBER ANALYTICS" title="Your progress, at a glance." right={<div className="member-analytics-range" aria-label="Choose activity range">{[7, 30, 90].map(days => <Chip key={days} on={range === days} onClick={() => setRange(days)}>{days} days</Chip>)}</div>} />
      <div className="member-analytics-stats">
        <article className="glass pad member-analytics-stat"><span className="member-analytics-stat-icon"><Icon name="users" size={17} /></span><p>Communities joined</p><strong>{joinedCommunities.length}</strong><small>Your current memberships</small></article>
        <article className="glass pad member-analytics-stat"><span className="member-analytics-stat-icon"><Icon name="idea" size={17} /></span><p>Ideas contributed</p><strong>{myIdeas.length}</strong><small>Ideas submitted by you</small></article>
        <article className="glass pad member-analytics-stat"><span className="member-analytics-stat-icon"><Icon name="spark" size={17} /></span><p>Backings received</p><strong>{backingsReceived}</strong><small>Support on your ideas</small></article>
        <article className="glass pad member-analytics-stat"><span className="member-analytics-stat-icon"><Icon name="check" size={17} /></span><p>Ideas selected</p><strong>{selectedIdeas}</strong><small>Selected or ready to share</small></article>
      </div>
      <div className="member-analytics-chart-grid">
        <article className="glass pad member-analytics-card">
          <div className="member-analytics-card-head"><div><p className="dim">YOUR CONTRIBUTIONS</p><h3>Ideas over time</h3></div><span>{activity.v.reduce((sum, value) => sum + value, 0)} submitted</span></div>
          <div className="member-analytics-chart-frame">{activity.v.some(value => value > 0) ? <AreaChart dd={activity} o={cs.area} /> : <div className="member-analytics-empty-chart"><Icon name="insight" size={23} /><b>No submissions in this range</b><span>Your own idea activity will appear here when you contribute.</span></div>}</div>
        </article>
        <article className="glass pad member-analytics-card">
          <div className="member-analytics-card-head"><div><p className="dim">YOUR IDEAS</p><h3>Review status</h3></div><span>{myIdeas.length} total</span></div>
          {myIdeas.length ? <div className="member-analytics-donut"><Donut items={statuses} total={myIdeas.length} o={cs.don} /></div> : <div className="member-analytics-empty-chart"><Icon name="insight" size={23} /><b>Your status breakdown starts here</b><span>Share an idea to see how it moves through review.</span></div>}
        </article>
      </div>
      <div className="member-analytics-lists">
        <article className="glass pad member-analytics-card">
          <div className="member-analytics-card-head"><div><p className="dim">PARTICIPATION</p><h3>Where you contribute</h3></div><span>{joinedCommunities.length} communities</span></div>
          {contributionsByCommunity.length ? <div className="member-analytics-community-list">{contributionsByCommunity.slice(0, 6).map(({ community, ideas }) => <div className="member-analytics-community-row" key={community.id}><span className="member-analytics-community-mark"><Icon name="users" size={15} /></span><div className="member-analytics-community-copy"><b>{community.name}</b><small>{ideas.length ? ideas.length + ' of your ideas' : 'No ideas submitted here yet'}</small></div><strong>{ideas.length}</strong></div>)}</div> : <div className="member-analytics-inline-empty"><b>You have not joined a community yet.</b><span>Explore communities to start following ideas and meeting collaborators.</span><button className="btn" onClick={() => nav('/communities')}>Explore communities <Icon name="arrow" size={15} /></button></div>}
        </article>
        <article className="glass pad member-analytics-card">
          <div className="member-analytics-card-head"><div><p className="dim">RECENT ACTIVITY</p><h3>Your latest ideas</h3></div><span>Last 5</span></div>
          {recentIdeas.length ? <div className="member-analytics-recent-list">{recentIdeas.map(idea => <div className="member-analytics-recent-row" key={idea.id}><span className="member-analytics-recent-mark"><Icon name="idea" size={15} /></span><div className="member-analytics-recent-copy"><b>{idea.title}</b><small>{a.data.communities.find(community => community.id === idea.cid)?.name || 'Community'} · {new Date(idea.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></div><span className="member-analytics-status">{STATUS_LABEL[a.statusOf(idea.id)] || 'In review'}</span></div>)}</div> : <div className="member-analytics-inline-empty"><b>Your first idea is still ahead of you.</b><span>Contribute something useful to a community and track its progress here.</span><button className="btn" onClick={() => nav('/communities')}>Find a community <Icon name="arrow" size={15} /></button></div>}
        </article>
      </div>
      <section className="member-analytics-locked" aria-labelledby="member-analytics-locked-title">
        <div className="member-analytics-locked-heading"><span className="member-analytics-lock-icon"><Icon name="lock" size={18} /></span><div><p className="dim">COMMUNITY OWNER INSIGHTS</p><h3 id="member-analytics-locked-title">Unlock analytics for your own community</h3><p>These wider community visuals become available when you create or manage a community. Your member view stays focused on your own activity.</p></div></div>
        <div className="member-analytics-locked-grid">
          <div className="member-analytics-locked-card"><div className="member-analytics-mini-bars"><i /><i /><i /><i /><i /></div><b>Community growth</b><span>Membership and participation trends</span><em><Icon name="lock" size={12} /> Owner access</em></div>
          <div className="member-analytics-locked-card"><div className="member-analytics-mini-funnel"><i /><i /><i /></div><b>Review funnel</b><span>Ideas, selections and promotion readiness</span><em><Icon name="lock" size={12} /> Owner access</em></div>
          <div className="member-analytics-locked-card"><div className="member-analytics-mini-people"><i /><i /><i /><i /></div><b>Contributor insights</b><span>Activity across your community members</span><em><Icon name="lock" size={12} /> Owner access</em></div>
        </div>
        <div className="member-analytics-locked-footer"><span>Build a space of your own to unlock the full analytics workspace.</span><button className="btn p" onClick={() => nav('/communities')}>Create a community <Icon name="plus" size={15} /></button></div>
      </section>
    </section>
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
