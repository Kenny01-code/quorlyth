import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { Av, Empty, Head, Num } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { when } from '../lib/util'
import { AreaChart } from '../components/Charts'
import { ShareCard } from '../components/ShareCard'
import { askJson } from '../ai/client'
import { useDraftState } from '../lib/useDraftState'

export function Dashboard() {
  return <Gate><Inner /></Gate>
}

function Inner() {
  const a = useApp()
  const nav = useNavigate()
  const { data, owner, me } = a
  const initialSetup = { name: '', firstCommunity: '' }
  const [setupDraft, setSetupDraft, clearSetupDraft] = useDraftState(`q-draft:${a.me?.id}:dashboard-setup`, initialSetup)
  const { name, firstCommunity: c1 } = setupDraft
  const setName = (name: string) => setSetupDraft(d => ({ ...d, name }))
  const setC1 = (firstCommunity: string) => setSetupDraft(d => ({ ...d, firstCommunity }))
  const s = data.settings

  if (!data.ownerId && !owner) return <>
    <Head kicker="Dashboard" title="Your space is being set up." />
    <Empty icon="status" title="Waiting for the owner" text="The owner account needs to sign in before this space is ready." />
  </>

  if (owner && !s) {
    return (
      <>
        <Head kicker="Dashboard" title={`Welcome, ${me!.name.split(' ')[0]}.`} />
        <div className="glass pad" style={{ maxWidth: 640 }}>
          <h3>Set up your space</h3>
          <p className="dim" style={{ marginTop: 4 }}>Setup is saved as a draft on this device.</p>
          <label className="field"><span>Space name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Your name or brand" /></label>
          <label className="field"><span>First community</span><input value={c1} onChange={e => setC1(e.target.value)} placeholder="For example, Behind the scenes" /></label>
          <div className="acts"><button className="btn p" onClick={async () => { if (!name.trim()) return a.toast('Name your space'); if (await a.saveSettings({ name: name.trim() }) && (!c1.trim() || await a.createCommunity({ name: c1.trim() }))) clearSetupDraft(initialSetup) }}>Create my space</button><button className="btn" onClick={() => clearSetupDraft(initialSetup)}>Discard draft</button></div>
        </div>
      </>
    )
  }
  if (!owner && !s) return <><Head kicker="Dashboard" title="Welcome." /><Empty icon="status" title="This space is being set up" text="The owner has not finished setup yet." /></>
  const pending = data.ideas.filter(i => a.statusOf(i.id) === 'review').length
  const ranked = data.ideas.filter(i => data.reviews[i.id]?.score != null && a.statusOf(i.id) === 'review').sort((x, y) => data.reviews[y.id].score! - data.reviews[x.id].score!).slice(0, 3)
  const recent = [...data.ideas].sort((x, y) => y.at - x.at).slice(0, 5)
  const backed = [...data.ideas].map(idea => ({ idea, votes: a.votesOf(idea.id) }))
    .filter(x => x.votes > 0 && a.statusOf(x.idea.id) !== 'declined')
    .sort((x, y) => y.votes - x.votes || y.idea.at - x.idea.at).slice(0, 3)
  const list = ranked.length ? ranked : recent
  const dd = (() => { const d = 864e5, t0 = new Date().setHours(0, 0, 0, 0), v: number[] = [], t: number[] = []; for (let i = 29; i >= 0; i--) { const st = t0 - i * d; v.push(data.ideas.filter(x => x.at >= st && x.at < st + d).length); t.push(st) } return { v, d: t } })()
  const stats: [string, number][] = [['Waiting for review', pending], ['Ideas shared', data.ideas.length], ['Members', Object.keys(data.members).length], ['Ready to share', data.promotions.length]]

  return (
    <>
      <Head kicker={s?.name || 'Your space'} title={owner ? (pending ? `${pending} idea${pending === 1 ? ' is' : 's are'} waiting for you.` : 'You are all caught up.') : `Welcome, ${me!.name.split(' ')[0]}.`}
        right={<button className="btn p" onClick={() => nav(owner ? '/queue' : '/communities')}><Icon name={owner ? 'queue' : 'community'} />{owner ? 'Open review queue' : 'Browse communities'}</button>} />
      {s?.ann && <div className="glass pad" style={{ marginBottom: 18, display: 'flex', gap: 14 }}><Icon name="spark" size={20} /><div><p className="dim">Announcement</p><p style={{ marginTop: 4 }}>{s.ann}</p></div></div>}
      <div className="grid g4" style={{ marginBottom: 18 }}>
        {stats.map(([l, v]) => <div key={l} className="glass pad"><p className="dim">{l}</p><Num n={v} /></div>)}
      </div>
      <div className="grid g32">
      <div className="glass pad"><div className="head" style={{ marginBottom: 10 }}><div><h3>Ideas over time</h3><p className="dim">Last 30 days</p></div>{owner && <button className="chip" onClick={() => nav('/analytics')}>Open analytics</button>}</div>
        {data.ideas.length ? <div className="chs"><AreaChart dd={dd} o={{ sm: true, pts: false, lab: false, avg: false, ma: false, grid: true }} /></div> : <Empty icon="insight" title="No ideas yet" text="Ideas will appear here as members share them." />}</div>
      <div className="glass pad">
        <h3 style={{ marginBottom: 8 }}>{ranked.length ? 'Top picks from QuorlythBot' : 'Latest ideas'}</h3>
        {list.length === 0 && <p className="mut" style={{ padding: '18px 0' }}>Nothing here yet.</p>}
        {list.map(i => {
          const r = data.reviews[i.id]
          return (
            <button key={i.id} className="row rowbtn" onClick={() => nav('/idea/' + i.id)}>
              {r?.score != null ? <div className="score" style={{ width: 46, height: 46, fontSize: 15 }}>{r.score}</div> : <Av id={i.authorId} size={34} />}
              <div className="t"><h3 style={{ fontSize: 15 }}>{i.title}</h3><p className="dim">{a.nm(i.authorId)}, {when(i.at)}</p></div>
            </button>
          )
        })}
      </div></div>
      <div className="glass pad" style={{ marginTop: 18 }}>
        <div className="head" style={{ marginBottom: 8 }}><div><h3>Most backed by members</h3><p className="dim">Community support, separate from AI review scores</p></div><button className="chip" onClick={() => nav('/communities')}>Explore communities</button></div>
        {backed.length ? backed.map(({ idea, votes }) => <button key={idea.id} className="row rowbtn" onClick={() => nav('/idea/' + idea.id)}>
          <div className="score" style={{ width: 42, height: 42, fontSize: 14 }}>{votes}</div>
          <div className="t"><h3 style={{ fontSize: 15 }}>{idea.title}</h3><p className="dim">{data.communities.find(c => c.id === idea.cid)?.name || 'Community'} · {a.nm(idea.authorId)}</p></div>
          <span className="dim">{votes} {votes === 1 ? 'backing' : 'backings'}</span>
        </button>) : <p className="mut" style={{ padding: '14px 0' }}>Member backing will appear here as people support ideas. No popularity is inferred before they do.</p>}
      </div>
      {owner && <Briefing />}
      {owner && <ShareCard title="Your space link" url={location.origin} sub="Share this with the people you want in your space." />}
    </>
  )
}

function Briefing() {
  const a = useApp()
  const [busy, setBusy] = useState(false)
  const [b, setB] = useState<{ summary: string; themes: { name: string; note: string }[]; steps: string[]; at: number } | null>(null)
  useEffect(() => a.backend!.store.subscribe('settings', d => setB(d.find(x => x.id === 'briefing')?.data || null)), [a.backend])
  async function gen() {
    const l = [...a.data.ideas].sort((x, y) => y.at - x.at).slice(0, 40)
    if (!l.length) return a.toast('No ideas to read yet')
    setBusy(true)
    try {
      const o = await askJson<any>(`You are briefing a creator about what their fan community is saying. Read these ideas and return JSON only: {"summary":string (two or three plain sentences),"themes":[{"name":string,"note":string}] (up to 4),"steps":[string] (up to 3 concrete next steps)}. Be honest and specific and do not invent anything not in the ideas.\nIdeas: ${JSON.stringify(l.map(i => ({ title: i.title, details: (i.body || '').slice(0, 300), backers: a.votesOf(i.id), tags: i.tags || [] })))}`)
      await a.backend!.store.set('settings/briefing', { summary: String(o.summary || '').slice(0, 600), themes: (o.themes || []).slice(0, 4), steps: (o.steps || []).slice(0, 3).map(String), at: Date.now() })
      a.toast('Briefing ready')
    } catch (e: any) { a.toast(e.message || 'The briefing could not finish') }
    setBusy(false)
  }
  return (
    <div className="glass pad" style={{ marginTop: 18 }}>
      <div className="head" style={{ marginBottom: 14 }}><div><h3>Community briefing</h3><p className="dim">{b ? 'Generated ' + when(b.at) : 'A summary of what your community is saying'}</p></div>
        <button className={b ? 'btn' : 'btn p'} disabled={busy} onClick={gen}><Icon name="spark" size={16} />{busy ? 'Reading your community...' : b ? 'Refresh' : 'Generate briefing'}</button></div>
      {b ? <><p style={{ marginBottom: 18 }}>{b.summary}</p><div className="grid g2"><div><p className="dim" style={{ marginBottom: 8 }}>Themes</p>{(b.themes || []).map(t => <div key={t.name} className="row" style={{ cursor: 'default', alignItems: 'flex-start' }}><Icon name="tag" /><div className="t"><h3 style={{ fontSize: 15, whiteSpace: 'normal' }}>{t.name}</h3><p className="dim" style={{ whiteSpace: 'normal' }}>{t.note}</p></div></div>)}</div>
        <div><p className="dim" style={{ marginBottom: 8 }}>Suggested next steps</p>{(b.steps || []).map(x => <div key={x} className="row" style={{ cursor: 'default', alignItems: 'flex-start' }}><Icon name="approve" /><div className="t"><p style={{ whiteSpace: 'normal' }}>{x}</p></div></div>)}</div></div></>
        : <p className="mut">{a.data.ideas.length ? 'Generate a briefing to see themes and next steps.' : 'A briefing appears once members share ideas.'}</p>}
    </div>
  )
}
