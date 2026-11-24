import { useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import { Projects } from './Projects'
import { StandaloneWorkspaceList } from './StandaloneWorkspaces'
import { Collaborations } from './Collaborations'
import { QuorlythGlyph } from '../components/QuorlythGlyph'
import '../styles/work-hub.css'

type WorkView = 'projects' | 'workspaces' | 'collaborations'

const VIEWS: Array<{ id: WorkView; label: string; description: string }> = [
  { id: 'projects', label: 'Projects', description: 'Turn selected ideas into deliverable outcomes.' },
  { id: 'workspaces', label: 'Workspaces', description: 'Run independent projects, tasks and evidence.' },
  { id: 'collaborations', label: 'Collaborations', description: 'Find teammates, track applications and work together.' },
]

export function Work({ onBuild }: { onBuild: (prompt: string) => void }) {
  const [params, setParams] = useSearchParams()
  const [buildPrompt, setBuildPrompt] = useState('')
  const requested = params.get('view') as WorkView | null
  const active = VIEWS.some(view => view.id === requested) ? requested as WorkView : 'projects'
  const current = VIEWS.find(view => view.id === active)!

  const choose = (view: WorkView) => {
    const next = new URLSearchParams(params)
    next.set('view', view)
    next.delete('idea')
    setParams(next, { replace: true })
  }

  return (
    <div className="work-hub">
      <section className="work-hub__intro">
        <div className="work-hub__copy">
          <p className="work-hub__eyebrow">THE QUORLYTH WORK SYSTEM</p>
          <h1>Ideas become outcomes.</h1>
          <p>Projects, independent workspaces and community collaborations now live under one Work destination. Your existing rooms, tasks, evidence and team access stay intact.</p>
        </div>
        <form className="work-hub__build-panel" onSubmit={event => { event.preventDefault(); const prompt = buildPrompt.trim(); if (prompt) onBuild(prompt) }}>
          <label htmlFor="work-build-prompt">What do you want to build?</label>
          <textarea
            id="work-build-prompt"
            value={buildPrompt}
            onChange={event => setBuildPrompt(event.target.value)}
            onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); const prompt = buildPrompt.trim(); if (prompt) onBuild(prompt) } }}
            rows={2}
            maxLength={2400}
            placeholder="Describe an outcome, a project, a campaign, a workflow, or something you want Quorlyth to organise…"
          />
          <div className="work-hub__build-actions">
            <button type="button" className="work-hub__surprise" onClick={() => setBuildPrompt('Review my current projects, workspaces and collaborations using only records I am allowed to access. Find one high-impact improvement, explain why it matters, and prepare a coordinated execution plan with exact targets and a review preview. Preserve existing records. Do not publish externally or activate automations until I approve.')}>
              <QuorlythGlyph name="idea" size={14} />
              <span>Surprise me</span>
            </button>
            <button type="submit" className="btn p work-hub__build" disabled={!buildPrompt.trim()}>
              <QuorlythGlyph name="brand" size={16} />
              <span>Build with QuorlythBot</span>
              <QuorlythGlyph name="arrow-up-right" size={14} />
            </button>
          </div>
          <p className="work-hub__build-hint">QuorlythBot plans against your real permissions, shows its progress, and prepares a preview. External publishing and high-impact changes still need your approval.</p>
        </form>
      </section>
      <div className="work-hub__nav" role="tablist" aria-label="Work areas">
        {VIEWS.map(view => (
          <button key={view.id} type="button" role="tab" aria-selected={active === view.id} className={active === view.id ? 'is-active' : ''} onClick={() => choose(view.id)}>
            <span>{view.label}</span><small>{view.description}</small>
          </button>
        ))}
      </div>
      <div className="work-hub__content" role="tabpanel" aria-label={current.label}>
        {active === 'projects' ? <Projects /> : active === 'workspaces' ? <StandaloneWorkspaceList /> : <Collaborations />}
      </div>
    </div>
  )
}
