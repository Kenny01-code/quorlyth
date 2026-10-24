import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import '../styles/architecture-live.css'

type HealthState = 'online' | 'connected' | 'configured' | 'browser_fallback' | 'not_configured' | 'needs_attention' | 'degraded' | 'unreachable' | 'unknown'

interface HealthItem { state: HealthState | string; label: string }
interface SystemStatus {
  checkedAt: string
  app: HealthItem
  database: HealthItem
  ai: HealthItem
  voice: HealthItem
  release: { ref: string; sha: string }
}

function healthClass(state?: string): string {
  if (state === 'online' || state === 'connected' || state === 'configured') return 'is-good'
  if (state === 'not_configured' || state === 'needs_attention' || state === 'degraded' || state === 'unreachable') return 'is-warning'
  return 'is-neutral'
}

const JOURNEY = [
  { number: '01', icon: 'audience', title: 'Audience', text: 'Followers arrive with different interests, questions and ideas.', output: 'A place for everyone to begin' },
  { number: '02', icon: 'community', title: 'Communities', text: 'Group people around shared interests so conversations have context.', output: 'Smaller, meaningful spaces' },
  { number: '03', icon: 'idea', title: 'Ideas and collaboration', text: 'Members contribute ideas, discuss them and find ways to work together.', output: 'Community-created opportunities' },
  { number: '04', icon: 'insight', title: 'AI-assisted discovery', text: 'Quorlyth helps summarize and prioritize activity, with reasons people can inspect.', output: 'A clearer creator review queue' },
  { number: '05', icon: 'promote', title: 'Creator decision and action', text: 'The creator chooses what moves forward, then tracks work and prepares promotion with contributor credit.', output: 'Projects, tasks and share-ready drafts' },
]

const LAYERS = [
  { number: '01', title: 'Experience layer', detail: 'The website, dashboards, communities, idea pages, creator review queue, collaboration workspaces and QuorlythBot.' },
  { number: '02', title: 'Identity and shared data', detail: 'Supabase authentication and database records keep community activity connected to the right people and spaces.' },
  { number: '03', title: 'AI and voice services', detail: 'Server-side AI endpoints help review and summarize activity. QuorlythBot can answer in text or use generated speech when the provider is available.' },
  { number: '04', title: 'Workflow automation', detail: 'Triggers can run conditions and actions such as creating an in-app notification, creating a task or calling an HTTPS webhook.' },
]

export function Architecture() {
  const nav = useNavigate()
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null)
  const [statusError, setStatusError] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/architecture-status', { cache: 'no-store', headers: { Accept: 'application/json' } })
      if (!response.ok) throw new Error('The live status endpoint returned ' + response.status)
      const payload = await response.json() as SystemStatus
      if (!payload || !payload.checkedAt || !payload.app || !payload.database) throw new Error('The live status response was incomplete')
      setSystemStatus(payload)
      setStatusError(false)
    } catch {
      // Keep the last verified values visible and tell visitors when a refresh failed.
      setStatusError(true)
    }
  }, [])

  useEffect(() => {
    void refreshStatus()
    const timer = window.setInterval(() => { void refreshStatus() }, 30000)
    return () => window.clearInterval(timer)
  }, [refreshStatus])

  useEffect(() => {
    const page = document.querySelector('.arch-page')
    if (!page || typeof IntersectionObserver === 'undefined') return
    const targets = Array.from(page.querySelectorAll<HTMLElement>('[data-arch-reveal]'))
    page.classList.add('arch-reveal-ready')
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('arch-visible')
          observer.unobserve(entry.target)
        }
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -36px 0px' })
    targets.forEach(target => observer.observe(target))
    return () => observer.disconnect()
  }, [])

  return (
    <article className="arch-page">
      <header className="arch-hero" data-arch-reveal>
        <div className="arch-brand"><Logo size={38} /><span>QUORLYTH / SYSTEM MAP</span></div>
        <span className="arch-kicker"><i /> PUBLIC PRODUCT BLUEPRINT</span>
        <h1>How Quorlyth works.</h1>
        <p className="arch-lead">A shared path from audience activity to ideas worth acting on. This page explains how the product fits together—without exposing private account data or infrastructure secrets.</p>
        <div className="arch-hero-actions">
          <button className="btn p" onClick={() => nav('/demo')}><Icon name="spark" size={16} />Explore the live demo</button>
          <button className="btn" onClick={() => nav('/')}><Icon name="arrow-left" size={16} />Back to Quorlyth</button>
        </div>
        <div className="arch-hero-foot">
          <span><b>THE PRINCIPLE</b> AI helps surface the signal.</span>
          <span><b>THE HUMAN</b> The creator decides what happens next.</span>
        </div>
      </header>

      <section className="arch-section arch-live-section" aria-labelledby="arch-live-title" data-arch-reveal>
        <div className="arch-live-heading">
          <div>
            <span className="arch-overline">LIVE / PRODUCTION SIGNAL</span>
            <h2 id="arch-live-title">The system, as it is now.</h2>
            <p>Live checks are fetched from Quorlyth’s public status endpoint and refreshed automatically. These checks never expose member activity, database records or provider secrets.</p>
          </div>
          <button className="btn arch-refresh" type="button" onClick={() => { void refreshStatus() }}><Icon name="rotate" size={15} /> Recheck systems</button>
        </div>
        <div className="arch-live-grid" aria-live="polite">
          {[
            { key: 'app', title: 'Production app', icon: 'home', fallback: 'Checking the live route…' },
            { key: 'database', title: 'Shared data', icon: 'db', fallback: 'Checking Supabase connectivity…' },
            { key: 'ai', title: 'QuorlythBot brain', icon: 'spark', fallback: 'Checking AI configuration…' },
            { key: 'voice', title: 'Voice engine', icon: 'voice', fallback: 'Checking speech configuration…' },
          ].map(item => {
            const result = systemStatus?.[item.key as 'app' | 'database' | 'ai' | 'voice']
            return <div className="arch-live-card" key={item.key}>
              <div className="arch-live-card-top"><span className="arch-live-icon"><Icon name={item.icon} size={18} /></span><span className={'arch-live-state ' + healthClass(result?.state)}><i />{result?.state ? result.state.replace(/_/g, ' ') : 'checking'}</span></div>
              <h3>{item.title}</h3>
              <p>{result?.label || item.fallback}</p>
            </div>
          })}
        </div>
        <div className="arch-live-meta">
          <span><i className={systemStatus && !statusError ? 'arch-live-dot' : 'arch-live-dot is-stale'} />{statusError ? 'Refresh delayed — last verified values are retained' : 'Automatic check every 30 seconds'}</span>
          <span>Last checked: {systemStatus?.checkedAt ? new Date(systemStatus.checkedAt).toLocaleTimeString() : 'Waiting for first response'}</span>
          <span>Release: {systemStatus?.release?.ref || 'unknown'}{systemStatus?.release?.sha ? ' · ' + systemStatus.release.sha.slice(0, 7) : ''}</span>
        </div>
        <p className="arch-caption">“Configured” means a server-side provider key is present; it is not a promise that every provider request will succeed. Application code changes appear here after the production deployment is ready.</p>
      </section>

      <section className="arch-section" aria-labelledby="arch-journey-title" data-arch-reveal>
        <div className="arch-section-heading">
          <span className="arch-overline">01 / THE PRODUCT FLOW</span>
          <h2 id="arch-journey-title">From followers to action.</h2>
          <p>Each stage creates context for the next, so a good idea is not lost in a busy feed or forgotten in a message thread.</p>
        </div>
        <div className="arch-journey">
          {JOURNEY.map((step, index) => (
            <div className="arch-journey-item" key={step.number} data-arch-reveal>
              <div className="arch-node">
                <span className="arch-number">{step.number}</span>
                <span className="arch-icon"><Icon name={step.icon} size={22} /></span>
              </div>
              <div className="arch-journey-copy">
                <h3>{step.title}</h3>
                <p>{step.text}</p>
                <div className="arch-output"><Icon name="arrow" size={14} /><span>{step.output}</span></div>
              </div>
              {index < JOURNEY.length - 1 && <div className="arch-connector" aria-hidden="true"><b className="arch-down-arrow" aria-hidden="true">↓</b></div>}
            </div>
          ))}
        </div>
      </section>

      <section className="arch-section" aria-labelledby="arch-system-title" data-arch-reveal>
        <div className="arch-section-heading">
          <span className="arch-overline">02 / THE SYSTEM LAYERS</span>
          <h2 id="arch-system-title">One product. Connected layers.</h2>
          <p>The screens people use connect to shared records and server-side intelligence. The layers have different jobs, but work together to keep the creator workflow in one place.</p>
        </div>
        <div className="arch-system">
          <div className="arch-system-cap">
            <span><Icon name="home" size={17} /> THE QUORLYTH EXPERIENCE</span>
            <small>What members and creators interact with</small>
          </div>
          <div className="arch-system-grid">
            <div className="arch-system-module"><Icon name="community" size={21} /><b>Communities</b><span>People and shared interests</span></div>
            <div className="arch-system-module"><Icon name="idea" size={21} /><b>Ideas</b><span>Submissions and discussions</span></div>
            <div className="arch-system-module"><Icon name="queue" size={21} /><b>Creator workspace</b><span>Review, collaboration and action</span></div>
            <div className="arch-system-module"><Icon name="spark" size={21} /><b>QuorlythBot</b><span>Contextual AI assistance</span></div>
          </div>
          <div className="arch-system-link"><span /><b className="arch-down-arrow" aria-hidden="true">↓</b><span /></div>
          <div className="arch-system-band">
            <div><span className="arch-layer-index">A / IDENTITY</span><b>Supabase authentication</b><p>Connect each person to their account and permissions.</p></div>
            <div><span className="arch-layer-index">B / SHARED DATA</span><b>Supabase database</b><p>Store community activity, ideas and work records.</p></div>
          </div>
          <div className="arch-system-link"><span /><b className="arch-down-arrow" aria-hidden="true">↓</b><span /></div>
          <div className="arch-system-grid arch-system-grid--services">
            <div className="arch-system-module"><Icon name="spark" size={21} /><b>AI services</b><span>Summaries and idea review</span></div>
            <div className="arch-system-module"><Icon name="voice" size={21} /><b>Voice services</b><span>Optional generated speech</span></div>
            <div className="arch-system-module"><Icon name="timeline" size={21} /><b>Automation runtime</b><span>Trigger → condition → action</span></div>
          </div>
          <div className="arch-system-cap arch-system-cap--bottom">
            <span><Icon name="private" size={17} /> SECURITY AND OWNERSHIP</span>
            <small>Authenticated access, server-side credentials and data-access rules</small>
          </div>
        </div>
        <p className="arch-caption">This is a high-level map. Provider credentials, private member records and deployment secrets are deliberately not part of a public architecture page.</p>
      </section>

      <section className="arch-section arch-brain-section" aria-labelledby="arch-brain-title" data-arch-reveal">
        <div className="arch-section-heading">
          <span className="arch-overline">03 / QUORLYTHBOT’S BRAIN</span>
          <h2 id="arch-brain-title">Context in. Useful action out.</h2>
          <p>QuorlythBot is designed to reason over the current conversation and the records the signed-in person is allowed to see—not a made-up picture of the community.</p>
        </div>
        <div className="arch-brain-flow">
          <div className="arch-brain-node"><span className="arch-brain-index">01 / RECEIVE</span><span className="arch-brain-glyph"><Icon name="message" size={20} /></span><h3>Understand the request</h3><p>Read the message, current screen and the user’s response preferences.</p></div>
          <div className="arch-brain-link" aria-hidden="true"><span /></div>
          <div className="arch-brain-node"><span className="arch-brain-index">02 / GROUND</span><span className="arch-brain-glyph"><Icon name="db" size={20} /></span><h3>Load permitted context</h3><p>Use the current app records, community scope and authenticated data access.</p></div>
          <div className="arch-brain-link" aria-hidden="true"><span /></div>
          <div className="arch-brain-node"><span className="arch-brain-index">03 / REASON</span><span className="arch-brain-glyph"><Icon name="spark" size={20} /></span><h3>Reason with safeguards</h3><p>Route to an available AI provider, with fallback where configured and instructions against invented facts.</p></div>
          <div className="arch-brain-link" aria-hidden="true"><span /></div>
          <div className="arch-brain-node"><span className="arch-brain-index">04 / RESPOND</span><span className="arch-brain-glyph"><Icon name="voice" size={20} /></span><h3>Answer or prepare action</h3><p>Stream a response, optionally speak it, and request confirmation before consequential changes.</p></div>
        </div>
        <div className="arch-brain-foot"><span><Icon name="rotate" size={17} /><b>Fresh context</b><p>Supabase Realtime refreshes subscribed app data after database changes, and the bot can use updated context on the next request.</p></span><span><Icon name="private" size={17} /><b>Permission-aware</b><p>The server uses the caller’s session and data-access rules. It must not reveal another person’s private records or claim an action succeeded before it does.</p></span></div>
        <p className="arch-caption">This is the real processing design, not a claim that the AI has human consciousness. The live status panel above reports configuration and connectivity separately from answer quality.</p>
      </section>

      <section className="arch-section" aria-labelledby="arch-automation-title" data-arch-reveal">
        <div className="arch-section-heading">
          <span className="arch-overline">04 / WORKFLOW AUTOMATION</span>
          <h2 id="arch-automation-title">Let routine work move itself forward.</h2>
          <p>Automations connect events to useful follow-up actions, so the creator spends less time manually moving information between screens.</p>
        </div>
        <div className="arch-automation-flow">
          <div><span className="arch-flow-label">WHEN</span><Icon name="timeline" size={22} /><b>Trigger</b><p>An idea is created, a task is completed, a workspace is created, or someone runs it manually.</p></div>
          <Icon name="arrow" size={22} />
          <div><span className="arch-flow-label">IF NEEDED</span><Icon name="settings" size={22} /><b>Condition</b><p>Check the workflow's configured filter before continuing.</p></div>
          <Icon name="arrow" size={22} />
          <div><span className="arch-flow-label">THEN</span><Icon name="check" size={22} /><b>Action</b><p>Create a task, save an in-app notification, or send an HTTPS webhook.</p></div>
        </div>
        <div className="arch-status-note">
          <Icon name="info" size={19} />
          <p><b>Current MVP scope:</b> event-triggered workflows run while a Quorlyth session is active. An always-on worker, scheduled runs and retry/delivery monitoring are planned hardening work, not something this version claims to guarantee.</p>
        </div>
      </section>

      <section className="arch-section" aria-labelledby="arch-status-title" data-arch-reveal>
        <div className="arch-section-heading">
          <span className="arch-overline">05 / PRODUCT PRINCIPLES</span>
          <h2 id="arch-status-title">Built around trust and momentum.</h2>
        </div>
        <div className="arch-principles">
          <div><Icon name="member" size={22} /><h3>Creator stays in control</h3><p>AI suggestions support decisions; they do not replace creator judgment.</p></div>
          <div><Icon name="eye" size={22} /><h3>Reasons over mystery scores</h3><p>Idea review is intended to be understandable, not a black box that makes the final call.</p></div>
          <div><Icon name="collab" size={22} /><h3>Credit travels with ideas</h3><p>Contributor attribution remains part of the promotion-preparation workflow.</p></div>
        </div>
      </section>

      <footer className="arch-footer" data-arch-reveal>
        <div><span className="arch-overline">SEE IT IN PRACTICE</span><h2>Ideas deserve a path forward.</h2><p>Explore the demo to follow the experience, or return to the homepage to learn about Quorlyth.</p></div>
        <div className="arch-hero-actions">
          <button className="btn p" onClick={() => nav('/demo')}>Explore the demo <Icon name="arrow-up-right" size={16} /></button>
          <button className="btn" onClick={() => nav('/')}>Home</button>
        </div>
      </footer>
    </article>
  )
}
