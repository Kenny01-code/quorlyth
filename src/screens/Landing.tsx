import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { Orbit } from '../components/Orbit'
import { Bar } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { useReveal } from '../lib/hooks'
import { useEffect, useState } from 'react'

const HERO_COPIES = [
  {
    headline: 'Turn your fanbase into a source of ideas.',
    support: 'Bring your audience together, surface the ideas that matter with AI, and choose what gets promoted. Every selected contribution stays credited.',
  },
  {
    headline: 'Bring your community’s best ideas forward.',
    support: 'Gather fans around shared interests, let explainable AI surface promising contributions, and decide what deserves to be promoted.',
  },
  {
    headline: 'Your audience has more to offer.',
    support: 'Turn scattered reactions into thoughtful communities, collaborative ideas, and creator-led decisions that keep contributors credited.',
  },
  {
    headline: 'From followers to ideas worth sharing.',
    support: 'Give your audience a place to build together, see why ideas stand out, and choose which contributions move forward with credit intact.',
  },
  {
    headline: 'Let your fans help shape what comes next.',
    support: 'Organise the people who care, review ideas with clear AI reasoning, and promote the ones you choose while preserving contributor credit.',
  },
]

const WORDS = ['Communities', 'Ideas', 'Collaboration', 'Surfacing', 'Selection', 'Promotion', 'Credit', 'Reach']
const STAGES = [['audience', 'Followers', 'Everyone who shows up'], ['community', 'Communities', 'Grouped by interest'], ['idea', 'Ideas', 'Shared and built on'], ['surface', 'Surfacing', 'Ranked with reasons'], ['promote', 'Promotion', 'You choose, then publish']]
const STEPS = [
  ['audience', 'Followers', 'Everyone who shows up arrives unsorted. Quorlyth gives every person a place to land.', 'Share your space link with your audience.'],
  ['community', 'Communities', 'Fans gather around what they love, so every conversation has a clear purpose.', 'Create a community for each interest.'],
  ['idea', 'Ideas', 'Members share ideas and build on each other, and every contribution stays attributed.', 'Members post ideas and discuss them.'],
  ['surface', 'Surfacing', 'QuorlythBot reads every idea, scores it, and explains the score in plain language.', 'Run an AI review from the queue.'],
  ['promote', 'Promotion', 'You choose. The idea becomes a post, with contributors credited.', 'Select an idea and publish it.'],
]
const FEATURES = [['rank', 'Ranked with reasons', 'Every score comes with a plain explanation.'], ['contribute', 'Credit built in', 'Contributors stay attached to the share-ready post.'], ['private', 'Private by default', 'Your space is only open to the people you share it with.'], ['status', 'Calm by design', 'No noise. Just what needs your attention.'], ['member', 'Your voice stays yours', 'The AI suggests. You decide, always.'], ['audience', 'Made to grow', 'From a handful of fans to a large community.']]

export function Landing() {
  const nav = useNavigate()
  const { me, data, enterDemo } = useApp()
  const [copyIndex, setCopyIndex] = useState(0)
  const rotatingCopy = HERO_COPIES[copyIndex]

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      setCopyIndex(index => (index + 1) % HERO_COPIES.length)
    }, 5800)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const detail = { page_path: window.location.pathname }
    window.dispatchEvent(new CustomEvent('quorlyth:conversion', { detail: { event: 'landing_view', ...detail } }))
    const analyticsWindow = window as Window & { gtag?: (command: string, eventName: string, parameters?: Record<string, unknown>) => void }
    analyticsWindow.gtag?.('event', 'landing_view', detail)
  }, [])
  useReveal()
  const w = { o: data.settings?.wo ?? 40, f: data.settings?.wf ?? 25, r: data.settings?.wr ?? 35 }
  const ws = [...WORDS, ...WORDS]
  return (
    <>
      <div className="hero" id="top">
        <Orbit />
        <div className="hmark"><i className="hh" /><Logo size={72} breathe /></div>
        <span className="chip"><Icon name="spark" size={14} />An operating system for fanbases</span>
        <h1 key={rotatingCopy.headline} className="hero-title hero-copy-enter">{rotatingCopy.headline}</h1>
        <p key={rotatingCopy.support} className="hero-copy hero-copy-enter">{rotatingCopy.support}</p>
        <div className="hero-actions">
          <button className="btn p" onClick={() => {
            window.dispatchEvent(new CustomEvent('quorlyth:conversion', { detail: { event: 'demo_start', page_path: '/' } }))
            const analyticsWindow = window as Window & { gtag?: (command: string, eventName: string, parameters?: Record<string, unknown>) => void }
            analyticsWindow.gtag?.('event', 'demo_start', { page_path: '/' })
            enterDemo()
            nav('/dashboard')
          }}>
            <Icon name="spark" size={16} />Explore the demo
          </button>
          <a className="btn" href="#how-it-works" onClick={() => {
            window.dispatchEvent(new CustomEvent('quorlyth:conversion', { detail: { event: 'how_it_works_click', page_path: '/' } }))
            const analyticsWindow = window as Window & { gtag?: (command: string, eventName: string, parameters?: Record<string, unknown>) => void }
            analyticsWindow.gtag?.('event', 'how_it_works_click', { page_path: '/' })
          }}>See how it works</a>
        </div>
        <p className="hero-note">Explore with sample data. No account needed.</p>
        <i className="hz" />
      </div>
      <div className="mq"><div>{ws.map((x, i) => <span key={i} style={{ display: 'contents' }}><span>{x}</span><Icon name="audience" size={14} /></span>)}</div></div>
      <section className="product-preview rv" aria-labelledby="preview-heading">
        <div className="preview-copy">
          <p className="eyebrow">INSIDE QUORLYTH</p>
          <h2 id="preview-heading">From a fan's idea to a creator's decision.</h2>
          <p className="mut">See how an idea is reviewed with clear reasons, selected by a creator, and prepared for promotion with contributor credit intact.</p>
        </div>
        <div className="glass preview-card">
          <div className="preview-topline">
            <span className="chip">Illustrative demo</span>
            <span className="dim">Idea review</span>
          </div>
          <h3>What should our community build next?</h3>
          <p className="mut">A community-led concept, ready for review.</p>
          <div className="preview-divider" />
          <div className="preview-detail"><span className="dim">AI assessment</span><span>Reasons explained</span></div>
          <div className="preview-detail"><span className="dim">Final selection</span><span>Creator decides</span></div>
          <div className="preview-detail"><span className="dim">Promotion</span><span>Contributor credit retained</span></div>
        </div>
      </section>
      <div className="grid g5">
        {STAGES.map(([ic, t, d]) => <div key={t} className="glass pad lift" style={{ padding: '22px 18px', borderRadius: 20 }}><div style={{ marginBottom: 34 }}><Icon name={ic} size={26} /></div><h3>{t}</h3><p className="dim">{d}</p></div>)}
      </div>
      <div className="sec rv" id="how-it-works"><h2>From a crowd to a choice.</h2><p className="mut">Five quiet steps turn a following into something you can steer.</p>
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
      <div className="sec rv">
        <div className="glass cta lift">
          <div className="hmark" style={{ marginTop: -20 }}><i className="hh" /><Logo size={72} breathe /></div>
          <h2>Ready to build with your community?</h2>
          <p className="mut" style={{ margin: '14px auto 30px', maxWidth: 440 }}>Start with the demo, see how ideas move forward, and decide when you are ready to create your own space.</p>
          <div className="acts">
            <button className="btn p" onClick={() => {
              window.dispatchEvent(new CustomEvent('quorlyth:conversion', { detail: { event: me ? 'dashboard_open' : 'signup_start', page_path: '/' } }))
              const analyticsWindow = window as Window & { gtag?: (command: string, eventName: string, parameters?: Record<string, unknown>) => void }
              analyticsWindow.gtag?.('event', me ? 'dashboard_open' : 'signup_start', { page_path: '/' })
              nav(me ? '/dashboard' : '/signin')
            }}>{me ? 'Open your dashboard' : 'Get started'}</button>
            {!me && <button className="btn" onClick={() => { enterDemo(); nav('/dashboard') }}>Explore the demo</button>}
          </div>
        </div>
        <footer className="ft" aria-label="Site footer">
          <a className="footer-brand" href="/" aria-label="Quorlyth home">QUORLYTH</a>
          <span className="dim footer-description">Built for creators and their communities.</span>
          <nav className="footer-links" aria-label="Legal links">
            <a href="/privacy">Privacy</a>
            <a href="/terms">Terms</a>
          </nav>
          <span className="dim footer-copyright">© {new Date().getFullYear()} Quorlyth</span>
        </footer>
      </div>
    </>
  )
}
