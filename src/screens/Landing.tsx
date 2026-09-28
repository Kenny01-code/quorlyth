import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { Orbit } from '../components/Orbit'
import { Bar } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { useReveal, useTypewriter } from '../lib/hooks'
import { useEffect, useState } from 'react'

const HEADLINES = ['Your fans, in order.', 'Every idea, heard.', 'Many voices, one direction.', 'Where ideas earn their place.', 'Followers become a community.', 'Quiet power, loudly shared.']
const SUBS = ['QuorlythBot turns a crowd of followers into communities that think with you.', 'The best ideas rise. You choose which ones the world sees.', 'Every contributor credited. Every idea given a fair hearing.']
const STAGES = [['audience', 'Followers', 'Everyone who shows up'], ['community', 'Communities', 'Grouped by interest'], ['idea', 'Ideas', 'Shared and built on'], ['surface', 'Surfacing', 'Ranked with reasons'], ['promote', 'Promotion', 'You choose, then publish']]
const STEPS = [
  ['audience', 'Followers', 'Everyone who shows up arrives unsorted. Quorlyth gives every person a place to land.', 'Share your space link with your audience.'],
  ['community', 'Communities', 'Fans gather around what they love, so every conversation has a clear purpose.', 'Create a community for each interest.'],
  ['idea', 'Ideas', 'Members share ideas and build on each other, and every contribution stays attributed.', 'Members post ideas and discuss them.'],
  ['surface', 'Surfacing', 'QuorlythBot reads every idea, scores it, and explains the score in plain language.', 'Run an AI review from the queue.'],
  ['promote', 'Promotion', 'You choose. The idea becomes a post, with contributors credited.', 'Select an idea and publish it.'],
]
const FEATURES = [['rank', 'Ranked with reasons', 'Every score comes with a plain explanation.'], ['contribute', 'Credit built in', 'Contributors stay attached to the share-ready post.'], ['private', 'Private by default', 'Your space is only open to the people you share it with.'], ['status', 'Calm by design', 'No noise. Just what needs your attention.'], ['member', 'Your voice stays yours', 'The AI suggests. You decide, always.'], ['audience', 'Made to grow', 'From a handful of fans to a large community.']]
const WORDS = ['Communities', 'Ideas', 'Collaboration', 'Surfacing', 'Selection', 'Promotion', 'Credit', 'Reach']

function Words({ list }: { list: string[] }) {
  const [k, setK] = useState(0)
  const [fo, setFo] = useState(false)
  useEffect(() => { const t = setTimeout(() => { setFo(true); setTimeout(() => { setK(x => x + 1); setFo(false) }, 600) }, 5600); return () => clearTimeout(t) }, [k])
  return <p className={'mut' + (fo ? ' fo' : '')} style={{ minHeight: '3.6em' }}>{list[k % list.length].split(' ').map((w, i) => <span key={k + '-' + i} className="wd" style={{ ['--i' as any]: i, marginRight: '0.28em' }}>{w}</span>)}</p>
}

export function Landing() {
  const nav = useNavigate()
  const { me, data, enterDemo } = useApp()
  const typed = useTypewriter(HEADLINES)
  useReveal()
  const w = { o: data.settings?.wo ?? 40, f: data.settings?.wf ?? 25, r: data.settings?.wr ?? 35 }
  const ws = [...WORDS, ...WORDS]
  return (
    <>
      <div className="hero">
        <Orbit />
        <div className="hmark"><i className="hh" /><Logo size={72} breathe /></div>
        <span className="chip"><Icon name="spark" size={14} />An operating system for fanbases</span>
        <h1 style={{ marginTop: 28, minHeight: '2.1em' }}>{typed}<span className="cr" /></h1>
        <Words list={SUBS} />
        <button className="btn p" onClick={() => nav(me ? '/dashboard' : '/signin')}>{me ? 'Open dashboard' : 'Get started'}</button>{' '}
        {!me && <button className="btn" onClick={() => { enterDemo(); nav('/dashboard') }}><Icon name="spark" size={15} />Try Demo</button>}{' '}
        {!me && <button className="btn" onClick={() => nav('/signin')}>Sign in</button>}
        <i className="hz" />
      </div>
      <div className="mq"><div>{ws.map((x, i) => <span key={i} style={{ display: 'contents' }}><span>{x}</span><Icon name="audience" size={14} /></span>)}</div></div>
      <div className="grid g5">
        {STAGES.map(([ic, t, d]) => <div key={t} className="glass pad lift" style={{ padding: '22px 18px', borderRadius: 20 }}><div style={{ marginBottom: 34 }}><Icon name={ic} size={26} /></div><h3>{t}</h3><p className="dim">{d}</p></div>)}
      </div>
      <div className="sec rv"><h2>From a crowd to a choice.</h2><p className="mut">Five quiet steps turn a following into something you can steer.</p>
        <div className="tl">{STEPS.map(([ic, t, d, what], i) => (
          <div key={t} className="ts rv" style={{ ['--d' as any]: i * 0.05 + 's' }}><div className="nd"><Icon name={ic} size={20} /></div>
            <div><h3>{t}</h3><p className="mut">{d}</p></div>
            <div className="glass pad" style={{ padding: 22 }}><p className="dim">What you do</p><p style={{ marginTop: 6 }}>{what}</p></div></div>
        ))}</div></div>
      <div className="sec rv"><h2>How the AI reads an idea.</h2><p className="mut">Three signals, weighted the way you choose in settings.</p>
        <div className="grid g3" style={{ marginTop: 40 }}>{([['Originality', 'How fresh the idea is compared with what already exists.', w.o], ['Feasibility', 'How realistic it is to deliver with the time and tools you have.', w.f], ['Audience relevance', 'How closely it matches what your community cares about.', w.r]] as [string, string, number][]).map(([t, d, v]) => (
          <div key={t} className="glass pad lift"><h3>{t}</h3><p className="dim" style={{ margin: '8px 0 22px' }}>{d}</p><div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="dim">Weight</span><span>{v}%</span></div><Bar value={v} /></div>
        ))}</div></div>
      <div className="sec rv"><h2>Made quietly, built to last.</h2>
        <div className="grid g3" style={{ marginTop: 40 }}>{FEATURES.map(([ic, t, d], i) => <div key={t} className="glass pad lift rv" style={{ ['--d' as any]: (i % 3) * 0.08 + 's' }}><div style={{ marginBottom: 46 }}><Icon name={ic} size={28} /></div><h3>{t}</h3><p className="dim" style={{ marginTop: 6 }}>{d}</p></div>)}</div></div>
      <div className="sec rv"><p className="mani">A following is a crowd.<br />A community is a room<br />full of ideas.</p></div>
      <div className="sec rv"><div className="glass cta lift"><div className="hmark" style={{ marginTop: -20 }}><i className="hh" /><Logo size={72} breathe /></div>
        <h2>Bring order to your fans.</h2><p className="mut" style={{ margin: '14px auto 30px', maxWidth: 420 }}>Request access to join a space, or sign in if you already have it.</p>
        <div className="acts"><button className="btn p" onClick={() => me ? nav('/access') : (enterDemo(), nav('/dashboard'))}>{me ? 'Request access' : 'Explore Demo Space'}</button><button className="btn" onClick={() => nav('/signin')}>Sign in</button></div></div>
        <div className="ft"><span>Quorlyth</span><span className="dim">Built for creators and their communities</span></div></div>
    </>
  )
}
