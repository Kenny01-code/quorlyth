import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useApp } from '../data/AppProvider'
import { BotIcon as Icon } from './BotIcon'
import type { BusinessProfile } from './config'
import { useBotData } from './useBotData'

type OperatingView = 'intelligence' | 'work' | 'network'
type ProfileField = keyof BusinessProfile

const EMPTY_PROFILE: BusinessProfile = {
  name: '', industry: '', offer: '', audience: '', goal: '', constraint: '',
}

const FIELD_COPY: Array<{ key: ProfileField; label: string; placeholder: string; multiline?: boolean }> = [
  { key: 'name', label: 'Business or organisation', placeholder: 'The name people know you by' },
  { key: 'industry', label: 'Industry', placeholder: 'For example, fashion, education, software or consulting' },
  { key: 'offer', label: 'What do you offer?', placeholder: 'Products, services or outcomes customers pay you for', multiline: true },
  { key: 'audience', label: 'Who do you serve?', placeholder: 'Your best-fit customers, members or audience', multiline: true },
  { key: 'goal', label: 'Your most important goal', placeholder: 'The result you want to achieve next', multiline: true },
  { key: 'constraint', label: 'What's slowing you down?', placeholder: 'The biggest current bottleneck', multiline: true },
]

function profileFrom(value?: Partial<BusinessProfile>): BusinessProfile {
  return { ...EMPTY_PROFILE, ...(value && typeof value === 'object' ? value : {}) }
}

function formatDate(value?: number | null) {
  if (!value || !Number.isFinite(Number(value))) return 'Date not recorded'
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(Number(value)))
}

function Metric({ icon, label, value, hint, onClick }: { icon: string; label: string; value: number | string; hint: string; onClick?: () => void }) {
  return (
    <button type="button" className="qbot-os-metric" onClick={onClick} disabled={!onClick}>
      <span className="qbot-os-metric-icon"><Icon name={icon} size={17} /></span>
      <span className="qbot-os-metric-copy"><small>{label}</small><strong>{value}</strong><em>{hint}</em></span>
      {onClick && <Icon name="arrow-up-right" size={15} />}
    </button>
  )
}

function Tile({ icon, eyebrow, title, description, meta, action, onClick, tone = 'default' }: {
  icon: string; eyebrow: string; title: string; description: string; meta?: string; action: string; onClick: () => void; tone?: 'default' | 'accent' | 'quiet'
}) {
  return (
    <button type="button" className={'qbot-os-tile is-' + tone} onClick={onClick}>
      <span className="qbot-os-tile-top"><i><Icon name={icon} size={18} /></i><small>{eyebrow}</small></span>
      <strong>{title}</strong>
      <span className="qbot-os-tile-description">{description}</span>
      <span className="qbot-os-tile-bottom">{meta && <small>{meta}</small>}<b>{action}<Icon name="arrow-up-right" size={14} /></b></span>
    </button>
  )
}

export function BotOperatingViews({ view, bd, onAsk, onNavigate }: {
  view: OperatingView
  bd: ReturnType<typeof useBotData>
  onAsk: (prompt: string) => void
  onNavigate: (path: string) => void
}) {
  const a = useApp()
  const [profile, setProfile] = useState<BusinessProfile>(() => profileFrom(bd.settings.businessProfile))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setProfile(profileFrom(bd.settings.businessProfile))
  }, [a.me?.id, bd.settings.businessProfile])

  const accessibleCommunities = useMemo(
    () => a.data.communities.filter(community => a.ownsCommunity(community.id) || a.joined(community.id) || a.canManageCommunity(community.id)),
    [a.data.communities, a.me?.id, a.platformAdmin, a.owner],
  )
  const communityIds = useMemo(() => new Set(accessibleCommunities.map(community => community.id)), [accessibleCommunities])
  const accessibleIdeas = useMemo(
    () => a.data.ideas.filter(idea => communityIds.has(idea.cid) || idea.authorId === a.me?.id),
    [a.data.ideas, communityIds, a.me?.id],
  )
  const ideaIds = useMemo(() => new Set(accessibleIdeas.map(idea => idea.id)), [accessibleIdeas])
  const projects = Object.values(a.data.projects || {})
  const activeProjects = projects.filter(project => project.status === 'active')
  const pendingIdeas = accessibleIdeas.filter(idea => a.statusOf(idea.id) === 'review')
  const openMilestones = a.data.milestones.filter(milestone => milestone.status !== 'done' && (projects.some(project => project.id === milestone.projectId && accessibleIdeas.some(idea => idea.id === project.ideaId))))
  const overdueMilestones = openMilestones.filter(milestone => !!milestone.dueAt && Number(milestone.dueAt) < Date.now())
  const pendingEvidence = a.data.workSubmissions.filter(submission => submission.status === 'submitted' && ideaIds.has(submission.ideaId))
  const visibleCollaborations = a.data.volunteers.filter(application => ideaIds.has(application.ideaId))
  const pendingCollaborations = visibleCollaborations.filter(application => application.status === 'pending')
  const acceptedCollaborations = visibleCollaborations.filter(application => application.status === 'accepted')
  const visibleMemberIds = Object.entries(a.data.members || {})
    .filter(([, memberships]) => Object.entries(memberships || {}).some(([communityId, joined]) => communityIds.has(communityId) && joined === true))
    .map(([userId]) => userId)
    .filter(userId => userId !== a.me?.id)

  const activity = useMemo(() => {
    const entries = [
      ...accessibleIdeas.map(idea => ({ id: 'idea:' + idea.id, icon: 'idea', title: 'Idea submitted', detail: idea.title, at: Number(idea.at) || 0, source: 'Community' })),
      ...a.data.milestones.filter(milestone => projects.some(project => project.id === milestone.projectId && ideaIds.has(project.ideaId))).map(milestone => ({ id: 'milestone:' + milestone.id, icon: 'status', title: 'Milestone updated', detail: milestone.title, at: Number(milestone.updatedAt || milestone.at) || 0, source: 'Work' })),
      ...a.data.workSubmissions.filter(submission => ideaIds.has(submission.ideaId)).map(submission => ({ id: 'evidence:' + submission.id, icon: 'file', title: 'Evidence submitted', detail: submission.summary || 'A deliverable was submitted for review', at: Number(submission.submittedAt) || 0, source: 'Evidence' })),
      ...visibleCollaborations.map(application => ({ id: 'collab:' + application.id, icon: 'users', title: 'Collaboration request', detail: a.data.ideas.find(idea => idea.id === application.ideaId)?.title || 'Community collaboration', at: Number(application.at) || 0, source: 'Network' })),
    ]
    return entries.filter(entry => entry.at > 0).sort((first, second) => second.at - first.at).slice(0, 8)
  }, [accessibleIdeas, a.data.milestones, a.data.workSubmissions, projects, ideaIds, visibleCollaborations, a.data.ideas])

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (!a.me) {
      a.toast('Sign in to save your private business context.')
      return
    }
    setSaving(true)
    try {
      const saved = await bd.saveSettings({ businessProfile: profile })
      a.toast(saved ? 'Business context saved privately to your Quorlyth profile.' : 'Your business context could not be saved. Check your connection and retry.')
    } finally {
      setSaving(false)
    }
  }

  const askForBusinessReview = () => onAsk(
    'Give me a grounded business and product health review using my saved business context and only the Quorlyth records and connected sources you can actually access. Separate verified facts from my stated goals and assumptions. Identify the three highest-value opportunities or risks, explain the evidence behind each, recommend the next actions, and tell me which data sources are missing. Do not invent revenue, profit, conversion rates, customer counts or market research.',
  )

  if (view === 'intelligence') {
    const signals = [
      overdueMilestones.length ? { icon: 'calendar', title: overdueMilestones.length + ' overdue work item' + (overdueMilestones.length === 1 ? '' : 's'), detail: 'Unfinished milestones have passed their recorded due date.', action: () => onNavigate('/work?view=projects') } : null,
      pendingEvidence.length ? { icon: 'file', title: pendingEvidence.length + ' evidence submission' + (pendingEvidence.length === 1 ? '' : 's') + ' awaiting review', detail: 'Submitted work is waiting for a permitted reviewer.', action: () => onNavigate('/work?view=projects') } : null,
      pendingIdeas.length ? { icon: 'lightbulb', title: pendingIdeas.length + ' idea' + (pendingIdeas.length === 1 ? '' : 's') + ' awaiting review', detail: 'Community ideas are still marked as in review.', action: () => onNavigate('/queue') } : null,
      pendingCollaborations.length ? { icon: 'users', title: pendingCollaborations.length + ' collaboration request' + (pendingCollaborations.length === 1 ? '' : 's') + ' pending', detail: 'A collaborator is waiting for a response.', action: () => onNavigate('/work?view=collaborations') } : null,
    ].filter(Boolean) as Array<{ icon: string; title: string; detail: string; action: () => void }>

    return (
      <div className="qbot-os-view">
        <div className="qbot-os-heading">
          <div><span className="qbot-os-eyebrow"><i /><span>QUORLYTH INTELLIGENCE</span></span><h2>Your business, in context.</h2><p>Signals from the Quorlyth data you can currently access, connected to the goals you choose to share.</p></div>
          <button type="button" className="qbot-os-primary" onClick={askForBusinessReview}><Icon name="spark" size={16} />Review my business <Icon name="arrow-up-right" size={14} /></button>
        </div>

        <div className="qbot-os-section-label"><span>LIVE QUORLYTH PULSE</span><small>Based on accessible records</small></div>
        <div className="qbot-os-metrics">
          <Metric icon="folder" label="Active projects" value={activeProjects.length} hint="In your visible ideas" onClick={() => onNavigate('/work?view=projects')} />
          <Metric icon="list" label="Open milestones" value={openMilestones.length} hint="Not yet completed" onClick={() => onNavigate('/work?view=projects')} />
          <Metric icon="lightbulb" label="Ideas in review" value={pendingIdeas.length} hint="Waiting for a decision" onClick={() => onNavigate('/queue')} />
          <Metric icon="file" label="Evidence pending" value={pendingEvidence.length} hint="Submitted for review" onClick={() => onNavigate('/work?view=projects')} />
        </div>

        <div className="qbot-os-two-column">
          <section className="qbot-os-panel">
            <div className="qbot-os-panel-heading"><div><span className="qbot-os-eyebrow">PRIORITY SIGNALS</span><h3>Worth your attention</h3></div><span className="qbot-os-counter">{signals.length}</span></div>
            {signals.length ? <div className="qbot-os-signal-list">{signals.map(signal => <button type="button" key={signal.title} className="qbot-os-signal" onClick={signal.action}><i><Icon name={signal.icon} size={16} /></i><span><b>{signal.title}</b><small>{signal.detail}</small></span><Icon name="arrow-up-right" size={14} /></button>)}</div> : <div className="qbot-os-empty"><Icon name="check-circle" size={19} /><span><b>No urgent signals in the current records.</b><small>Quorlyth will not invent problems to fill this space.</small></span></div>}
          </section>

          <section className="qbot-os-panel qbot-os-revenue-note">
            <span className="qbot-os-eyebrow">COMMERCIAL VISIBILITY</span>
            <h3>Know what's driving growth.</h3>
            <p>Revenue, profit, conversion, customer acquisition and sales pipeline are not yet available from the current Quorlyth records. Connect the relevant business sources before treating those metrics as facts.</p>
            <button type="button" className="qbot-os-text-action" onClick={() => onAsk('Which business data sources should I connect to let you measure revenue, customer acquisition, conversion, retention and pipeline accurately? Explain the best next integrations for my saved business context, and distinguish existing Quorlyth data from information that is not connected yet.')}>Plan my data connections <Icon name="arrow-up-right" size={14} /></button>
          </section>
        </div>

        <section className="qbot-os-panel qbot-os-business-panel">
          <div className="qbot-os-panel-heading"><div><span className="qbot-os-eyebrow">PERSISTENT BUSINESS CONTEXT</span><h3>Teach Quorlyth what you're building.</h3><p>This stays private in your account and helps future conversations start with the right context.</p></div><span className="qbot-os-private"><Icon name="lock" size={13} /> PRIVATE</span></div>
          <form className="qbot-os-profile-form" onSubmit={event => { void saveProfile(event) }}>
            {FIELD_COPY.map(field => <label key={field.key} className="qbot-os-field"><span>{field.label}</span>{field.multiline ? <textarea rows={2} maxLength={240} value={profile[field.key]} onChange={event => setProfile(current => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} /> : <input maxLength={100} value={profile[field.key]} onChange={event => setProfile(current => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} />}</label>)}
            <div className="qbot-os-form-footer"><small>These are your stated details, not verified business metrics.</small><button type="submit" className="qbot-os-primary" disabled={saving}>{saving ? 'Saving…' : 'Save business context'} <Icon name="check" size={14} /></button></div>
          </form>
        </section>

        <section className="qbot-os-panel">
          <div className="qbot-os-panel-heading"><div><span className="qbot-os-eyebrow">RECENT ACTIVITY</span><h3>What's moving</h3></div><span className="qbot-os-live-label"><i /> LIVE RECORDS</span></div>
          {activity.length ? <div className="qbot-os-activity-list">{activity.map(item => <div className="qbot-os-activity" key={item.id}><i><Icon name={item.icon} size={15} /></i><span><b>{item.title}</b><small>{item.detail}</small></span><span className="qbot-os-activity-meta"><b>{item.source}</b><small>{formatDate(item.at)}</small></span></div>)}</div> : <div className="qbot-os-empty"><Icon name="activity" size={18} /><span><b>No recent activity to show yet.</b><small>New ideas, milestones, evidence and collaboration updates will appear here when recorded.</small></span></div>}
        </section>
      </div>
    )
  }

  if (view === 'work') {
    return (
      <div className="qbot-os-view">
        <div className="qbot-os-heading">
          <div><span className="qbot-os-eyebrow"><i /><span>QUORLYTH WORK SYSTEM</span></span><h2>Turn direction into delivery.</h2><p>Move from ideas to organised projects, evidence, collaborations and repeatable execution.</p></div>
          <button type="button" className="qbot-os-primary" onClick={() => onAsk('Review my current Quorlyth projects, milestones, workspaces and collaborations. Identify the most valuable next outcome, create a practical execution plan with exact existing targets, and prepare any permitted internal actions for my review. Do not invent records or publish externally.') }><Icon name="spark" size={16} />Plan my next move <Icon name="arrow-up-right" size={14} /></button>
        </div>
        <div className="qbot-os-tile-grid">
          <Tile icon="folder" eyebrow="PROJECTS" title="Ideas into projects" description="Track selected ideas, active milestones and the work required to ship them." meta={activeProjects.length + ' active · ' + openMilestones.length + ' open milestones'} action="Open projects" onClick={() => onNavigate('/work?view=projects')} tone="accent" />
          <Tile icon="file" eyebrow="DELIVERY" title="Evidence and review" description="See submitted deliverables, acceptance criteria and decisions awaiting a reviewer." meta={pendingEvidence.length + ' awaiting review'} action="Review delivery" onClick={() => onAsk('Review the evidence submissions visible to my account. Summarise what is awaiting review, map each item to its milestone criteria, and prepare the next review actions. Do not approve or reject evidence without my explicit review decision.')} />
          <Tile icon="users" eyebrow="COLLABORATION" title="People and teamwork" description="Coordinate applications, teammates, milestones and shared execution." meta={visibleCollaborations.length + ' visible collaboration requests'} action="Open collaborations" onClick={() => onNavigate('/work?view=collaborations')} />
          <Tile icon="workflow" eyebrow="AUTOMATION" title="Work that runs itself" description="Turn recurring events into reviewed workflows for notifications, task creation and supported integrations." meta="Draft, review and activate" action="Open automations" onClick={() => onNavigate('/automations')} />
          <Tile icon="lightbulb" eyebrow="IDEA PIPELINE" title="Community demand" description="Understand what people are asking for before committing time and resources." meta={accessibleIdeas.length + ' accessible ideas'} action="Explore ideas" onClick={() => onNavigate('/communities')} />
          <Tile icon="chart" eyebrow="GROWTH" title="Measure what matters" description="Inspect current platform trends and identify where better measurement is needed." meta="Platform activity, not fabricated revenue" action="Open growth" onClick={() => onNavigate('/growth')} tone="quiet" />
        </div>
      </div>
    )
  }

  const collaboratorMap = new Map<string, { name: string; status: string; idea: string; count: number }>()
  for (const application of visibleCollaborations) {
    const name = a.nm(application.applicantId)
    const existing = collaboratorMap.get(application.applicantId)
    if (existing) existing.count += 1
    else collaboratorMap.set(application.applicantId, {
      name, status: application.status,
      idea: accessibleIdeas.find(idea => idea.id === application.ideaId)?.title || 'Community collaboration',
      count: 1,
    })
  }
  const collaborators = [...collaboratorMap.entries()].slice(0, 8)
  const connectedPeople = [...new Set(visibleMemberIds)].slice(0, 8)

  return (
    <div className="qbot-os-view">
      <div className="qbot-os-heading">
        <div><span className="qbot-os-eyebrow"><i /><span>QUORLYTH NETWORK</span></span><h2>Build with the right people.</h2><p>Discover collaboration potential inside the communities and projects you can currently access.</p></div>
        <button type="button" className="qbot-os-primary" onClick={() => onAsk('Review the Quorlyth communities, ideas and collaboration requests that I am authorised to see. Identify people and teams whose stated interests or applications suggest a useful collaboration, explain the evidence and suggest respectful next steps. Do not infer private interests or send invitations or messages.') }><Icon name="network" size={16} />Find opportunities <Icon name="arrow-up-right" size={14} /></button>
      </div>

      <div className="qbot-os-metrics">
        <Metric icon="community" label="Communities" value={accessibleCommunities.length} hint="Visible to your account" onClick={() => onNavigate('/communities')} />
        <Metric icon="users" label="Visible members" value={connectedPeople.length} hint="In accessible communities" />
        <Metric icon="handshake" label="Accepted collaborators" value={acceptedCollaborations.length} hint="Within visible ideas" onClick={() => onNavigate('/work?view=collaborations')} />
        <Metric icon="clock" label="Pending requests" value={pendingCollaborations.length} hint="Awaiting a decision" onClick={() => onNavigate('/work?view=collaborations')} />
      </div>

      <div className="qbot-os-two-column">
        <section className="qbot-os-panel">
          <div className="qbot-os-panel-heading"><div><span className="qbot-os-eyebrow">COLLABORATION MATCHES</span><h3>People already engaging</h3><p>Based on visible collaboration applications, not hidden personal data.</p></div></div>
          {collaborators.length ? <div className="qbot-os-people-list">{collaborators.map(([id, person]) => <div className="qbot-os-person" key={id}><span className="qbot-os-avatar">{person.name.trim().slice(0, 1).toUpperCase() || 'M'}</span><span><b>{person.name}</b><small>{person.idea}{person.count > 1 ? ' · ' + person.count + ' requests' : ''}</small></span><em className={'is-' + person.status}>{person.status.replace('_', ' ')}</em></div>)}</div> : <div className="qbot-os-empty"><Icon name="users" size={18} /><span><b>No collaboration applications in the accessible records.</b><small>Explore communities and projects to create opportunities for people to work together.</small></span></div>}
        </section>
        <section className="qbot-os-panel">
          <div className="qbot-os-panel-heading"><div><span className="qbot-os-eyebrow">YOUR COMMUNITY GRAPH</span><h3>Where you already belong</h3></div></div>
          {accessibleCommunities.length ? <div className="qbot-os-community-list">{accessibleCommunities.slice(0, 8).map(community => {
            const members = Object.values(a.data.members || {}).filter(record => record?.[community.id] === true).length
            return <button type="button" key={community.id} onClick={() => onNavigate('/communities/' + community.id)}><i><Icon name="community" size={15} /></i><span><b>{community.name}</b><small>{members} visible member records</small></span><Icon name="arrow-up-right" size={14} /></button>
          })}</div> : <div className="qbot-os-empty"><Icon name="community" size={18} /><span><b>Your network is ready to grow.</b><small>Join or create a community to start building useful connections.</small></span></div>}
        </section>
      </div>
      <section className="qbot-os-panel qbot-os-network-note">
        <span className="qbot-os-eyebrow">NEXT EVOLUTION</span>
        <h3>From community connections to commercial opportunities.</h3>
        <p>External customer discovery, investor matching, professional introductions and partner research need dedicated, permissioned data sources. This view currently uses Quorlyth's accessible community and collaboration records; it does not pretend to have a global contact database.</p>
        <button type="button" className="qbot-os-text-action" onClick={() => onAsk('Help me define a safe and useful networking strategy for my business. Use my saved business context and accessible Quorlyth activity. Tell me what external sources and consent controls would be needed to discover potential customers, collaborators, creators, suppliers and investors accurately. Do not invent contacts.')}>Design my networking strategy <Icon name="arrow-up-right" size={14} /></button>
      </section>
    </div>
  )
}
