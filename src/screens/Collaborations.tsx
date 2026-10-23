import { FormEvent, useEffect, useState } from 'react'
import type { Comment, WorkAttachment } from '../lib/types'
import { useNavigate, useParams } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Av, Head } from '../components/ui'
import { MilestoneBoard } from '../components/MilestoneBoard'
import { QuorlythGlyph } from '../components/QuorlythGlyph'
import { useApp, useComments } from '../data/AppProvider'
import { when } from '../lib/util'
import { AIProjectPlan, generateProjectPlan } from '../ai/projectPlan'
import { isPastDateInput, minimumDateInput, PAST_DATE_MESSAGE } from '../lib/workspaceDates'


type WorkspaceTab = 'overview' | 'plan' | 'evidence' | 'team'

const dateInput = (timestamp?: number | null) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
}
const dateEnd = (value: string) => {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day, 23, 59, 59, 999)
  return Number.isFinite(date.getTime()) ? date.getTime() : null
}
const dateLabel = (timestamp?: number | null) => timestamp ? new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export function Collaborations() {
  return <Gate><CollaborationList /></Gate>
}

function CollaborationList() {
  const a = useApp()
  const nav = useNavigate()
  const myId = a.me?.id
  const manageableCommunityIds = new Set(a.data.communities.filter(c => a.canManageCommunity(c.id)).map(c => c.id))
  const manageableIdeaIds = new Set(a.data.ideas.filter(idea => manageableCommunityIds.has(idea.cid)).map(idea => idea.id))
  const canReviewAny = manageableCommunityIds.size > 0

  const incoming = a.data.volunteers
    .filter(application => application.status === 'pending' && manageableIdeaIds.has(application.ideaId))
    .sort((x, y) => y.at - x.at)
  const incomingIdeaIds = [...new Set(incoming.map(application => application.ideaId))]
  const myApplications = a.data.volunteers
    .filter(application => application.applicantId === myId)
    .sort((x, y) => y.at - x.at)

  const items = a.data.ideas.filter(idea => {
    const accepted = a.data.volunteers.some(v => v.ideaId === idea.id && v.applicantId === myId && v.status === 'accepted')
    const hasAcceptedTeam = a.data.volunteers.some(v => v.ideaId === idea.id && v.status === 'accepted')
    const isIdeaAuthor = idea.authorId === myId
    const projectExists = !!a.data.projects[idea.id]
    // Accepted collaborators, idea creators, and community managers need to be
    // able to find a workspace even if an older approval left setup incomplete.
    return accepted
      || (isIdeaAuthor && (projectExists || hasAcceptedTeam))
      || (a.canManageCommunity(idea.cid) && (projectExists || hasAcceptedTeam))
  }).sort((x, y) => (a.data.projects[y.id]?.updatedAt || a.data.projects[y.id]?.at || 0) - (a.data.projects[x.id]?.updatedAt || a.data.projects[x.id]?.at || 0))

  return <>
    <Head kicker="Collaboration" title="Work together, in one place." />
    <p className="mut" style={{ maxWidth: 760, marginBottom: 20 }}>
      This is the shared-work area—not the place where applications start. Apply from an idea, get accepted by its community manager, then use the workspace to plan tasks, update milestones, and discuss progress.
    </p>

    <div className="glass pad" style={{ marginBottom: 18 }}>
      <div className="head" style={{ marginBottom: 16 }}>
        <div><h3 style={{ fontSize: 20 }}>How to get started</h3><p className="mut" style={{ marginTop: 4 }}>Follow the path that matches your role.</p></div>
        <span className="chip"><QuorlythGlyph name="workspace" size={14} />Collaboration guide</span>
      </div>
      <div className="grid g2">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <span className="score" style={{ width: 38, height: 38, fontSize: 14 }}>01</span>
          <div style={{ minWidth: 0 }}>
            <h3>For members: apply to help</h3>
            <p className="mut" style={{ marginTop: 5 }}>Browse communities, open an idea, join its community if needed, and select “Apply to collaborate.” Your request and its status will appear below.</p>
            <button className="btn" style={{ marginTop: 10 }} onClick={() => nav('/communities')}><QuorlythGlyph name="community" size={15} />Browse communities and ideas</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <span className="score" style={{ width: 38, height: 38, fontSize: 14 }}>02</span>
          <div style={{ minWidth: 0 }}>
            <h3>For community managers: accept a teammate</h3>
            <p className="mut" style={{ marginTop: 5 }}>Open the Review queue, choose an idea, find “Collaboration applications,” and accept a pending applicant. Acceptance creates the shared project workspace automatically.</p>
            {canReviewAny && <button className="btn p" style={{ marginTop: 10 }} onClick={() => nav('/queue')}><QuorlythGlyph name="review" size={15} />Review applications{incoming.length ? ' (' + incoming.length + ')' : ''}</button>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <span className="score" style={{ width: 38, height: 38, fontSize: 14 }}>03</span>
          <div style={{ minWidth: 0 }}>
            <h3>Plan the work</h3>
            <p className="mut" style={{ marginTop: 5 }}>Open an active collaboration, read the project brief, add milestones with clear outcomes, and mark steps as in progress or done.</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, minWidth: 0 }}>
          <span className="score" style={{ width: 38, height: 38, fontSize: 14 }}>04</span>
          <div style={{ minWidth: 0 }}>
            <h3>Keep decisions together</h3>
            <p className="mut" style={{ marginTop: 5 }}>Use Idea discussion for updates, questions, and decisions. Community managers can edit the project brief from Project settings.</p>
          </div>
        </div>
      </div>
    </div>

    {incomingIdeaIds.length > 0 && <div className="glass pad" style={{ marginBottom: 18 }}>
      <div className="head" style={{ marginBottom: 10 }}>
        <div><h3 style={{ fontSize: 20 }}>Applications waiting for your review</h3><p className="mut" style={{ marginTop: 4 }}>These are for ideas in communities you manage.</p></div>
        <span className="chip">{incoming.length} pending</span>
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        {incomingIdeaIds.map(ideaId => {
          const idea = a.data.ideas.find(item => item.id === ideaId)
          if (!idea) return null
          const community = a.data.communities.find(item => item.id === idea.cid)
          const applications = incoming.filter(item => item.ideaId === ideaId)
          return <div key={ideaId} className="reason" style={{ margin: 0, gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <p className="dim">{community?.name || 'Community'}</p>
              <h3 style={{ marginTop: 4, overflowWrap: 'anywhere' }}>{idea.title}</h3>
              <p className="mut" style={{ marginTop: 4 }}>{applications.length} applicant{applications.length === 1 ? '' : 's'} waiting for a decision</p>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
                {applications.slice(0, 3).map(application => <span className="chip" key={application.id}><Av id={application.applicantId} size={20} />{a.nm(application.applicantId)}</span>)}
                {applications.length > 3 && <span className="chip">+{applications.length - 3} more</span>}
              </div>
            </div>
            <button className="btn p" onClick={() => nav('/queue?idea=' + encodeURIComponent(ideaId))}><QuorlythGlyph name="complete" size={15} />Review</button>
          </div>
        })}
      </div>
    </div>}

    <div className="glass pad" style={{ marginBottom: 18 }}>
      <div className="head" style={{ marginBottom: 12 }}>
        <div><h3 style={{ fontSize: 20 }}>Your applications</h3><p className="mut" style={{ marginTop: 4 }}>Track requests you have sent to join someone else's idea.</p></div>
        <span className="chip">{myApplications.length}</span>
      </div>
      {!myApplications.length ? <p className="mut">No applications sent yet. Browse ideas in your communities, open one you want to help with, and select “Apply to collaborate.”</p> : <div style={{ display: 'grid', gap: 10 }}>
        {myApplications.map(application => {
          const idea = a.data.ideas.find(item => item.id === application.ideaId)
          if (!idea) return null
          const community = a.data.communities.find(item => item.id === idea.cid)
          const statusLabel = application.status === 'pending' ? 'Awaiting review' : application.status === 'accepted' ? 'Accepted' : 'Declined'
          return <div key={application.id} className="reason" style={{ margin: 0, gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center' }}>
            <div style={{ minWidth: 0 }}>
              <p className="dim">{community?.name || 'Community'}</p>
              <h3 style={{ marginTop: 4, overflowWrap: 'anywhere' }}>{idea.title}</h3>
              {application.message && <p className="mut" style={{ marginTop: 4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{application.message}</p>}
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 8 }}>
                <span className={'chip' + (application.status === 'accepted' ? ' on' : '')}>{statusLabel}</span>
                <span className="dim">Submitted {when(application.at) || 'recently'}</span>
              </div>
              {application.status === 'declined' && <p className="mut" style={{ marginTop: 5, fontSize: 12 }}>You can review the idea and reapply if the opportunity is still open.</p>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => nav('/idea/' + idea.id)}><QuorlythGlyph name="idea" size={15} />View idea</button>
              {application.status === 'accepted' && <button className="btn p" onClick={() => nav('/collaboration/' + idea.id)}><QuorlythGlyph name="workspace" size={15} />Open workspace</button>}
            </div>
          </div>
        })}
      </div>}
    </div>

    <div style={{ display: 'grid', gap: 12 }}>
      <div className="head" style={{ marginBottom: 2 }}>
        <div><h3 style={{ fontSize: 22 }}>Active collaboration spaces</h3><p className="mut" style={{ marginTop: 4 }}>Your accepted projects and the shared workspaces connected to them.</p></div>
        <span className="chip">{items.length} spaces</span>
      </div>
      {!items.length ? <div className="glass cent">
        <QuorlythGlyph name="workspace" size={30} />
        <h3>No active collaboration spaces yet</h3>
        <p className="mut" style={{ maxWidth: 520 }}>
          {canReviewAny
            ? 'Accept a pending application in the Review queue to create a workspace for an idea in a community you manage. You can also apply to help with ideas in other communities.'
            : 'Your workspace appears after a community manager accepts one of your collaboration applications. Start by finding an idea you would genuinely like to help build.'}
        </p>
        <div className="acts" style={{ justifyContent: 'center', marginTop: 8 }}>
          <button className="btn p" onClick={() => nav('/communities')}><QuorlythGlyph name="community" size={15} />Find ideas</button>
          {canReviewAny && <button className="btn" onClick={() => nav('/queue')}><QuorlythGlyph name="review" size={15} />Open review queue</button>}
          <button className="btn" onClick={() => nav('/me')}><QuorlythGlyph name="profile" size={15} />My ideas</button>
        </div>
      </div> : <div style={{ display: 'grid', gap: 14, maxWidth: 1000 }}>
        {items.map(idea => {
          const project = a.data.projects[idea.id]
          const milestones = a.data.milestones.filter(m => m.projectId === idea.id)
          const done = milestones.filter(m => m.status === 'done').length
          const community = a.data.communities.find(c => c.id === idea.cid)
          const acceptedCount = a.data.volunteers.filter(v => v.ideaId === idea.id && v.status === 'accepted').length
          return <button key={idea.id} type="button" className="glass pad" onClick={() => nav('/collaboration/' + idea.id)} style={{ display: 'block', textAlign: 'left', width: '100%', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="dim">{community?.name || 'Community'} · {!project ? 'Workspace setup needed' : project.status === 'completed' ? 'Completed' : 'Active project'}</p>
                <h3 style={{ fontSize: 20, marginTop: 5, overflowWrap: 'anywhere' }}>{idea.title}</h3>
                <p className="mut" style={{ marginTop: 7 }}>{project?.summary || (!project ? 'This accepted collaboration needs its workspace initialized. Open it to finish setup.' : 'No project brief has been added yet.')}</p>
              </div>
              <span className="chip"><QuorlythGlyph name="workspace" size={14} />Open workspace</span>
            </div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
              <span className="dim"><QuorlythGlyph name="team" size={14} /> {acceptedCount} accepted contributor{acceptedCount === 1 ? '' : 's'}</span>
              <span className="dim"><QuorlythGlyph name="complete" size={14} /> {done}/{milestones.length} milestones complete</span>
              <span className="dim">{project ? 'Updated ' + (when(project.updatedAt || project.at) || 'recently') : 'Workspace not initialized'}</span>
            </div>
          </button>
        })}
      </div>}
    </div>
  </>
}

function formatEvidenceSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function WorkspaceEvidenceFile({ attachment }: { attachment: WorkAttachment }) {
  const a = useApp()
  const [url, setUrl] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    let active = true
    setUrl('')
    if (!a.backend?.getWorkFileUrl) {
      setState('unavailable')
      return () => { active = false }
    }
    setState('loading')
    void a.backend.getWorkFileUrl(attachment.path)
      .then(value => {
        if (!active) return
        setUrl(value)
        setState(value ? 'ready' : 'unavailable')
      })
      .catch(() => { if (active) setState('unavailable') })
    return () => { active = false }
  }, [a.backend, attachment.path])

  return <div className="ql-evidence-file">
    <span className="ql-evidence-file__mark"><QuorlythGlyph name="document" size={16} /></span>
    <span className="ql-evidence-file__copy">
      <strong title={attachment.name}>{attachment.name}</strong>
      <small>{formatEvidenceSize(attachment.size)} · {attachment.mimeType || 'File'}</small>
    </span>
    {url
      ? <a href={url} target="_blank" rel="noreferrer" className="ql-evidence-file__open">Open evidence <QuorlythGlyph name="arrow" size={13} /></a>
      : <span className="ql-evidence-file__state">{state === 'loading' ? 'Preparing secure link…' : 'File unavailable'}</span>}
  </div>
}

export function CollaborationWorkspace() {
  return <Gate><Workspace /></Gate>
}

function Workspace() {
  const { id = '' } = useParams()
  const a = useApp()
  const nav = useNavigate()
  const comments = useComments(id || null)
  const [reply, setReply] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(0)
  const [mentionPeople, setMentionPeople] = useState<{ id: string; name: string }[]>([])
  const [mentionLoading, setMentionLoading] = useState(false)
  const [discussionMode, setDiscussionMode] = useState<'inline' | 'expanded' | 'minimized'>('inline')
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('overview')
  const [workspaceSummary, setWorkspaceSummary] = useState('Collaboration workspace ready. Add a project plan and milestones to coordinate the work.')
  const [projectDueDate, setProjectDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [aiPlan, setAiPlan] = useState<AIProjectPlan | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [applyingPlan, setApplyingPlan] = useState(false)
  const idea = a.data.ideas.find(item => item.id === id)
  const project = a.data.projects[id]
  useEffect(() => setProjectDueDate(dateInput(project?.dueAt)), [project?.dueAt])
  const community = idea ? a.data.communities.find(c => c.id === idea.cid) : undefined
  const canManage = !!idea && a.canManageCommunity(idea.cid)
  const canOrganizeWithAI = !!idea && a.canOrganizeIdeaWithAI(id)
  const organizerRequest = community && a.me ? a.data.aiOrganizerRequests.find(request => request.cid === community.id && request.userId === a.me!.id) : undefined
  const acceptedApplications = a.data.volunteers.filter(v => v.ideaId === id && v.status === 'accepted')
  const isAccepted = !!a.me && acceptedApplications.some(v => v.applicantId === a.me?.id)
  const isIdeaAuthor = !!a.me && idea?.authorId === a.me.id
  const canAccess = canManage || isIdeaAuthor || isAccepted
  const milestones = a.data.milestones.filter(m => m.projectId === id).sort((x, y) => x.at - y.at)
  const completed = milestones.filter(m => m.status === 'done').length
  const progress = milestones.length ? Math.round(completed / milestones.length * 100) : 0
  const projectSubmissions = a.data.workSubmissions
    .filter(item => item.projectId === id)
    .sort((first, second) => second.submittedAt - first.submittedAt || second.revision - first.revision)
  const pendingEvidenceReviews = projectSubmissions.filter(item => item.status === 'submitted').length
  const approvedEvidenceCount = projectSubmissions.filter(item => item.status === 'approved').length
  const workspaceTeamIds = [...new Set([idea?.authorId, community?.ownerId, community?.createdBy, ...acceptedApplications.map(application => application.applicantId)].filter((uid): uid is string => !!uid))]
  const communityIdeaIds = new Set(a.data.ideas.filter(item => item.cid === idea?.cid).map(item => item.id))
  const discussionParticipantIds = [...new Set([
    ...mentionPeople.map(person => person.id),
    idea?.authorId,
    community?.ownerId,
    community?.createdBy,
    ...Object.entries(a.data.members).filter(([, memberships]) => !!memberships?.[idea?.cid || '']).map(([userId]) => userId),
    ...a.data.ideas.filter(item => item.cid === idea?.cid).map(item => item.authorId),
    ...comments.map(comment => comment.authorId),
    ...a.data.volunteers.filter(application => communityIdeaIds.has(application.ideaId) && application.status === 'accepted').map(application => application.applicantId),
    ...Object.entries(a.data.votes).filter(([, votes]) => [...communityIdeaIds].some(communityIdeaId => !!votes?.[communityIdeaId])).map(([userId]) => userId),
  ].filter((uid): uid is string => !!uid))]
  const participantKey = discussionParticipantIds.join('|')
  const matchingDiscussionMembers = mentionPeople
    .filter(person => person.name.toLowerCase().includes(mentionQuery.trim().toLowerCase()))
    .sort((first, second) => first.name.localeCompare(second.name))
    .slice(0, 20)

  useEffect(() => {
    if (!mentionOpen || !idea) return
    let active = true
    setMentionLoading(true)

    const loadMentionPeople = async () => {
      const candidates = new Set<string>(discussionParticipantIds)
      // Use the database membership RPC as a source of truth when available, but
      // keep the picker useful if that optional RPC is missing or temporarily fails.
      try {
        const ids = await a.backend?.store.listCommunityMembers(idea.cid)
        for (const userId of ids || []) if (userId) candidates.add(userId)
      } catch (error) {
        console.warn('Could not fetch community member IDs for mentions; using visible collaboration participants instead.', error)
      }

      const people = await Promise.all([...candidates].map(async userId => {
        let profile = a.data.profiles[userId]
        if ((!profile?.name?.trim() && !profile?.authName?.trim()) && a.backend?.store) {
          try {
            const savedProfile = await a.backend.store.get('profiles/' + userId)
            if (savedProfile && typeof savedProfile === 'object') profile = savedProfile
          } catch {
            // The name fallback below keeps this person selectable when a profile is private.
          }
        }
        const name = profile?.name?.trim()
          || profile?.authName?.trim()
          || (a.me?.id === userId ? a.me.name.trim() : '')
          || ('Member · ' + userId.slice(-6))
        return { id: userId, name }
      }))

      if (active) {
        setMentionPeople(people.sort((first, second) => first.name.localeCompare(second.name)))
        setMentionLoading(false)
      }
    }

    void loadMentionPeople().catch(error => {
      console.warn('Could not build the team mention list:', error)
      if (active) {
        const fallback = [...discussionParticipantIds].map(userId => ({
          id: userId,
          name: a.data.profiles[userId]?.name?.trim()
            || a.data.profiles[userId]?.authName?.trim()
            || (a.me?.id === userId ? a.me.name.trim() : '')
            || ('Member · ' + userId.slice(-6)),
        }))
        setMentionPeople(fallback.sort((first, second) => first.name.localeCompare(second.name)))
        setMentionLoading(false)
      }
    })

    return () => { active = false }
  }, [mentionOpen, idea?.cid, a.backend, a.data.profiles, a.me?.id, a.me?.name, participantKey])

  if (!idea) return <div className="glass cent ql-workspace-empty"><span className="ql-empty-mark"><QuorlythGlyph name="workspace" size={30} /></span><p className="ql-eyebrow">QUORLYTH WORKSPACE</p><h3>Collaboration not found</h3><p className="mut">This idea may have been removed, or you may not have access to it.</p><button className="btn" style={{ marginTop: 12 }} onClick={() => nav('/collaborations')}><QuorlythGlyph name="back" size={14} />Back to collaborations</button></div>
  if (!canAccess) {
    const ownApplication = a.data.volunteers.find(v => v.ideaId === id && v.applicantId === a.me?.id)
    return <div className="glass cent ql-workspace-empty"><span className="ql-empty-mark"><QuorlythGlyph name="workspace" size={30} /></span><p className="ql-eyebrow">PRIVATE WORKSPACE</p><h3>This collaboration is not open to your account</h3><p className="mut">{ownApplication?.status === 'pending' ? 'Your application is still waiting for review. The workspace opens after acceptance.' : 'Only the community owner, idea creator and accepted collaborators can enter this workspace.'}</p><div className="acts" style={{ justifyContent: 'center', marginTop: 12 }}><button className="btn" onClick={() => nav('/idea/' + idea.id)}><QuorlythGlyph name="idea" size={14} />View idea</button><button className="btn" onClick={() => nav('/collaborations')}><QuorlythGlyph name="back" size={14} />My collaborations</button></div></div>
  }

  if (!project) {
    return <div style={{ maxWidth: 820, display: 'grid', gap: 16 }}>
      <div><button className="chip" onClick={() => nav('/collaborations')}><QuorlythGlyph name="back" size={14} />All collaborations</button></div>
      <Head kicker={community?.name || 'Collaboration workspace'} title={idea.title} />
      <section className="glass pad">
        <span className="chip"><QuorlythGlyph name="workspace" size={14} />Accepted collaboration</span>
        <h3 style={{ fontSize: 20, marginTop: 14 }}>{canManage ? 'Finish setting up this workspace' : 'Your workspace is being set up'}</h3>
        <p className="mut" style={{ marginTop: 8 }}>{canManage
          ? 'This collaboration was accepted, but its project record is missing. Create the project brief here to open the shared milestones and team discussion.'
          : 'The workspace is not initialized yet. The community manager can open this page and finish setup; you do not need to apply again if your application was already accepted.'}</p>
        {canManage ? <form className="reason" style={{ marginTop: 16 }} onSubmit={async event => {
          event.preventDefault()
          if (!workspaceSummary.trim()) return a.toast('Add a short project brief first.')
          if (isPastDateInput(projectDueDate)) return a.toast(PAST_DATE_MESSAGE)
          setBusy(true)
          try {
            await a.createProject(id, workspaceSummary.trim(), dateEnd(projectDueDate))
          } catch {
            a.toast('Could not initialize the collaboration workspace. Please try again.')
          } finally {
            setBusy(false)
          }
        }}>
          <label className="field"><span>Project brief</span><textarea value={workspaceSummary} onChange={e => setWorkspaceSummary(e.target.value)} maxLength={1200} required placeholder="Describe the goal, scope, and first outcome for this collaboration." /></label>
          <label className="field"><span>Target delivery date <small>Optional</small></span><input type="date" min={minimumDateInput()} value={projectDueDate} onChange={e => setProjectDueDate(e.target.value)} /></label>
          <button className="btn p" disabled={busy || !workspaceSummary.trim()}><QuorlythGlyph name="workspace" size={15} />{busy ? 'Creating workspace…' : 'Initialize collaboration workspace'}</button>
        </form> : <div className="acts" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => nav('/idea/' + idea.id)}>View original idea</button>
          <button className="btn" onClick={() => nav('/collaborations')}>Back to collaborations</button>
        </div>}
      </section>
    </div>
  }

  async function organizeWithAI() {
    if (!idea || !community || !canAccess) return
    if (!canOrganizeWithAI) {
      if (organizerRequest?.status === 'pending') {
        a.toast('Your AI organizer request is waiting for the community owner or a platform administrator.')
        return
      }
      setAiBusy(true)
      try {
        await a.requestCommunityAIOrganizerApproval(id, 'I would like to use Organize with AI for this collaboration workspace.')
      } finally {
        setAiBusy(false)
      }
      return
    }
    setAiBusy(true)
    try {
      const plan = await generateProjectPlan({
        idea: { id: idea.id, title: idea.title, body: idea.body, tags: idea.tags },
        community: { name: community.name, purpose: community.purpose, rules: community.rules },
        comments: comments.map(comment => ({ id: comment.id, authorId: comment.authorId, text: comment.text, at: comment.at })),
        team: workspaceTeamIds.map(memberId => ({ id: memberId, name: a.nm(memberId) })),
      })
      setAiPlan(plan)
      a.toast('AI project plan is ready to review.')
    } catch (error: any) {
      a.toast(error?.message || 'Quorlyth could not organize this discussion. Please try again.')
    } finally {
      setAiBusy(false)
    }
  }

  async function applyAIPlan() {
    if (!aiPlan || !idea || !canOrganizeWithAI || !project) return
    setApplyingPlan(true)
    try {
      if (aiPlan.project_summary && aiPlan.project_summary !== project.summary) {
        const updated = await a.updateProject(id, { summary: aiPlan.project_summary, aiOrganizerGenerated: true })
        if (!updated) throw new Error('The project brief could not be updated. Your milestone plan is still available to review.')
      }
      const existingTitles = new Set(milestones.map(milestone => milestone.title.trim().toLowerCase()))
      let created = 0
      for (const item of aiPlan.milestones) {
        if (existingTitles.has(item.title.trim().toLowerCase())) continue
        const ok = await a.addMilestone(id, item.title, item.description, {
          priority: item.priority,
          acceptanceCriteria: item.definition_of_done,
          aiOrganized: true,
        })
        if (!ok) throw new Error('Some milestones could not be saved. Review the workspace before retrying; existing milestone titles will be skipped.')
        existingTitles.add(item.title.trim().toLowerCase())
        created++
      }
      setAiPlan(null)
      a.toast(`AI plan applied. Added ${created} new milestone${created === 1 ? '' : 's'}.`)
    } catch (error: any) {
      a.toast(error?.message || 'The AI plan could not be applied completely.')
    } finally {
      setApplyingPlan(false)
    }
  }

  const updateDiscussionReply = (value: string, cursorPosition: number) => {
    setReply(value)
    setMentionedUserIds(current => current.filter(userId => value.includes('@' + a.nm(userId).replace(/^@/, ''))))
    const before = value.slice(0, cursorPosition)
    const match = before.match(/(^|\s)@([^\s@]*)$/)
    if (!match) {
      setMentionOpen(false)
      setMentionQuery('')
      return
    }
    setMentionStart(before.length - match[2].length - 1)
    setMentionQuery(match[2])
    setMentionOpen(true)
  }

  const chooseDiscussionMention = (userId: string) => {
    const name = a.nm(userId).replace(/^@/, '').trim()
    const replacement = '@' + name + ' '
    setReply(current => current.slice(0, mentionStart) + replacement + current.slice(mentionStart + mentionQuery.length + 1))
    setMentionedUserIds(current => [...new Set([...current, userId])])
    setMentionOpen(false)
    setMentionQuery('')
    window.setTimeout(() => document.getElementById('team-discussion-reply')?.focus(), 0)
  }

  const beginDiscussionReply = (commentId: string) => {
    setReplyTo(commentId)
    setMentionOpen(false)
    window.setTimeout(() => document.getElementById('team-discussion-reply')?.focus(), 0)
  }

  async function postReply(event: FormEvent) {
    event.preventDefault()
    if (!reply.trim()) return
    setBusy(true)
    const ok = await a.addComment(id, reply.trim(), replyTo || undefined, mentionedUserIds)
    if (ok) {
      setReply('')
      setReplyTo(null)
      setMentionedUserIds([])
      setMentionOpen(false)
      setMentionQuery('')
    }
    setBusy(false)
  }

  const topLevelDiscussion = comments.filter(comment => !comment.parentId || !comments.some(parent => parent.id === comment.parentId))
  const renderDiscussionComment = (comment: Comment, depth = 0): import('react').ReactNode => {
    const responses = comments.filter(item => item.parentId === comment.id)
    return <div key={comment.id} style={{
      marginLeft: depth ? Math.min(depth, 4) * 13 : 0,
      marginTop: 11,
      paddingLeft: depth ? 11 : 0,
      borderLeft: depth ? '1px solid var(--line, rgba(255,255,255,.13))' : undefined,
      minWidth: 0,
    }}>
      <div className="msg" style={{ alignItems: 'flex-start', gap: 9 }}>
        <Av id={comment.authorId} size={29} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
            <button type="button" className="lk" onClick={() => nav('/me/' + comment.authorId)}><strong>{a.nm(comment.authorId)}</strong></button>
            <span className="dim" style={{ fontSize: 11 }}>{when(comment.at)}</span>
            {comment.parentId ? <span className="dim" style={{ fontSize: 11 }}>Reply</span> : null}
          </p>
          <p className="mut" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 4 }}>{comment.text}</p>
          {comment.mentionedUserIds?.length ? <p className="dim" style={{ fontSize: 11, marginTop: 5 }}>Mentioned: {comment.mentionedUserIds.map(userId => a.nm(userId)).join(', ')}</p> : null}
          <div className="acts" style={{ marginTop: 6, gap: 6 }}>
            <button className="chip" type="button" onClick={() => beginDiscussionReply(comment.id)}><QuorlythGlyph name="message" size={12} />Reply</button>
          </div>
        </div>
      </div>
      {responses.map(response => renderDiscussionComment(response, depth + 1))}
    </div>
  }

  return <>
    <div className="head" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <div><button className="chip" onClick={() => nav('/collaborations')}><QuorlythGlyph name="back" size={14} /> All collaborations</button></div>
      <div className="acts" style={{ margin: 0 }}>
        <button className="btn" onClick={() => nav('/idea/' + id)}><QuorlythGlyph name="idea" size={15} />Original idea</button>
        {canManage && <button className="btn" onClick={() => nav('/projects?idea=' + encodeURIComponent(id))}><QuorlythGlyph name="plan" size={15} />Project settings</button>}
      </div>
    </div>
    <Head kicker={community?.name || 'Collaboration workspace'} title={idea.title} />

    <section className="ql-workspace-shell" aria-label="Project workspace navigation">
      <div className="ql-workspace-shell__meta">
        <div>
          <p className="ql-eyebrow">PROJECT WORKSPACE</p>
          <p className="ql-workspace-shell__description">One shared source of truth for the plan, submitted work, and team decisions.</p>
        </div>
        <span className="ql-workspace-trust"><QuorlythGlyph name="lock" size={14} />Evidence-led completion</span>
      </div>
      <div className="ql-workspace-tabs" role="tablist" aria-label="Workspace sections">
        <button id="ql-workspace-tab-overview" type="button" role="tab" aria-selected={workspaceTab === 'overview'} aria-controls="ql-workspace-panel-overview" className={workspaceTab === 'overview' ? 'is-active' : ''} onClick={() => setWorkspaceTab('overview')}><QuorlythGlyph name="workspace" size={16} /><span>Overview</span></button>
        <button id="ql-workspace-tab-plan" type="button" role="tab" aria-selected={workspaceTab === 'plan'} aria-controls="ql-workspace-panel-plan" className={workspaceTab === 'plan' ? 'is-active' : ''} onClick={() => setWorkspaceTab('plan')}><QuorlythGlyph name="milestone" size={16} /><span>Plan & tasks</span><small>{milestones.length}</small></button>
        <button id="ql-workspace-tab-evidence" type="button" role="tab" aria-selected={workspaceTab === 'evidence'} aria-controls="ql-workspace-panel-evidence" className={workspaceTab === 'evidence' ? 'is-active' : ''} onClick={() => setWorkspaceTab('evidence')}><QuorlythGlyph name="upload" size={16} /><span>Evidence & reviews</span><small>{pendingEvidenceReviews || projectSubmissions.length}</small></button>
        <button id="ql-workspace-tab-team" type="button" role="tab" aria-selected={workspaceTab === 'team'} aria-controls="ql-workspace-panel-team" className={workspaceTab === 'team' ? 'is-active' : ''} onClick={() => setWorkspaceTab('team')}><QuorlythGlyph name="team" size={16} /><span>Team room</span><small>{workspaceTeamIds.length}</small></button>
      </div>
    </section>
    {workspaceTab === 'overview' && <div id="ql-workspace-panel-overview" role="tabpanel" aria-labelledby="ql-workspace-tab-overview" className="ql-workspace-tab-panel">
      <div className="ql-workspace-overview-grid">
        <div className="ql-workspace-brief">        <section className="glass pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="chip"><QuorlythGlyph name="workspace" size={14} />Shared workspace</span>
            <span className="chip">{project?.status === 'completed' ? 'Completed' : 'Active'}</span>
          </div>
          <h3 style={{ fontSize: 18, marginTop: 16 }}>Project brief</h3>
          <p className="mut" style={{ marginTop: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{project?.summary || 'The project owner has not added a brief yet.'}</p>
          {project?.dueAt ? <p className="ql-muted ql-project-deadline"><QuorlythGlyph name="calendar" size={14} />Target delivery · {dateLabel(project.dueAt)}</p> : null}
          <div className="ql-workspace-progress">
            <div className="ql-workspace-progress__header"><span>Work completed</span><strong>{completed}/{milestones.length} · {progress}%</strong></div>
            <div className="ql-project-progress__track"><i style={{ width: progress + '%' }} /></div>
          </div>
        </section></div>
        <section className="glass pad ql-workspace-pulse">
          <div className="ql-workspace-pulse__heading"><div><p className="ql-eyebrow">PROJECT PULSE</p><h3>Where things stand</h3></div><span className={'ql-workspace-state' + (project.status === 'completed' ? ' is-complete' : '')}>{project.status === 'completed' ? 'Closed' : 'In progress'}</span></div>
          <div className="ql-workspace-stat-grid">
            <div><strong>{milestones.length}</strong><span>Planned outcomes</span></div>
            <div><strong>{progress}%</strong><span>Approved complete</span></div>
            <div><strong>{pendingEvidenceReviews}</strong><span>Awaiting review</span></div>
            <div><strong>{approvedEvidenceCount}</strong><span>Approved submissions</span></div>
          </div>
          <div className="ql-workspace-next">
            <span className="ql-workspace-next__mark"><QuorlythGlyph name={pendingEvidenceReviews ? 'upload' : 'milestone'} size={17} /></span>
            <div><strong>{pendingEvidenceReviews ? 'Work is ready for review' : milestones.length && completed < milestones.length ? 'Move the next outcome forward' : milestones.length ? 'All planned outcomes are approved' : 'Create your first outcome'}</strong><p>{pendingEvidenceReviews ? pendingEvidenceReviews + ' submission' + (pendingEvidenceReviews === 1 ? ' is' : 's are') + ' waiting for a reviewer. Review the submitted files against the definition of done.' : milestones.length && completed < milestones.length ? 'Open Plan & tasks to assign work, define acceptance criteria, and submit a deliverable when it is ready.' : milestones.length ? 'The current plan is complete. Keep the final evidence accessible in the review ledger below.' : 'Break the idea into clear outcomes with owners, dates and acceptance criteria.'}</p></div>
          </div>
          <div className="ql-workspace-pulse__actions"><button type="button" className="ql-primary-action" onClick={() => setWorkspaceTab(pendingEvidenceReviews ? 'evidence' : 'plan')}><QuorlythGlyph name={pendingEvidenceReviews ? 'upload' : 'milestone'} size={15} />{pendingEvidenceReviews ? 'Review evidence' : 'Open plan'}</button><button type="button" className="ql-quiet-action" onClick={() => setWorkspaceTab('team')}><QuorlythGlyph name="team" size={14} />Go to team room</button></div>
        </section>
      </div>
    </div>}
    {workspaceTab === 'plan' && <div id="ql-workspace-panel-plan" role="tabpanel" aria-labelledby="ql-workspace-tab-plan" className="ql-workspace-tab-panel ql-workspace-plan-panel">
              {canAccess && project && <section className="glass pad ql-ai-plan">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <span className="chip"><QuorlythGlyph name="plan" size={14} />Quorlyth Signal Engine</span>
              <h3 style={{ fontSize: 19, marginTop: 12 }}>Turn discussion into a buildable plan</h3>
              <p className="mut" style={{ marginTop: 6 }}>AI filters duplicate or off-topic discussion, identifies actionable signals, and drafts milestones with clear definitions of done. Review everything before it changes your workspace.</p>
              {!canOrganizeWithAI && <p className="mut" style={{ marginTop: 8 }}>AI organizer access is community-specific. Platform owners have automatic access across communities, community owners have automatic access in their own communities, and other eligible users need approval from the community owner or a platform admin.</p>}
            </div>
            <button className="btn p" disabled={aiBusy || applyingPlan || (!canOrganizeWithAI && organizerRequest?.status === 'pending')} onClick={organizeWithAI}>
              <QuorlythGlyph name="idea" size={15} />
              {aiBusy ? (canOrganizeWithAI ? 'Organizing signals…' : 'Requesting approval…') : canOrganizeWithAI ? (aiPlan ? 'Regenerate plan' : 'Organize with AI') : organizerRequest?.status === 'pending' ? 'Approval pending' : organizerRequest?.status === 'declined' ? 'Request approval again' : 'Request AI organizer approval'}
            </button>
          </div>
          {aiPlan && <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
            <div className="grid i2" style={{ gap: 10 }}>
              <div className="glass pad"><p className="dim" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Estimated signal score</p><strong style={{ fontSize: 28, fontWeight: 400 }}>{aiPlan.signal_score}<span className="dim" style={{ fontSize: 14 }}>/100</span></strong><p className="mut" style={{ fontSize: 12 }}>AI estimate of clarity, relevance, and actionability</p></div>
              <div className="glass pad"><p className="dim" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Estimated noise reduction</p><strong style={{ fontSize: 28, fontWeight: 400 }}>{aiPlan.noise_reduction_ratio}<span className="dim" style={{ fontSize: 14 }}>%</span></strong><p className="mut" style={{ fontSize: 12 }}>AI estimate for the supplied discussion only, not a measured platform-wide metric</p></div>
            </div>
            <div><p className="dim" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Suggested project</p><h4 style={{ fontSize: 17, marginTop: 4 }}>{aiPlan.project_title}</h4><p className="mut" style={{ marginTop: 5 }}>{aiPlan.project_summary}</p></div>
            <div><p className="dim" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Why these signals</p><p className="mut" style={{ marginTop: 5 }}>{aiPlan.evidence_summary || 'Review the source discussion alongside the proposed milestones.'}</p></div>
            {aiPlan.lead_collaborator && <p className="mut">Suggested lead collaborator: <strong>{a.nm(aiPlan.lead_collaborator)}</strong> <span className="dim">(confirm with the team before assigning)</span></p>}
            {!!aiPlan.definition_of_done.length && <div><p className="dim" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Project definition of done</p><ul style={{ marginTop: 7, paddingLeft: 20 }}>{aiPlan.definition_of_done.map((item, index) => <li key={index} className="mut" style={{ marginTop: 5 }}>{item}</li>)}</ul></div>}
            <div style={{ display: 'grid', gap: 8 }}>
              <p className="dim" style={{ fontSize: 11, letterSpacing: '.08em', textTransform: 'uppercase' }}>Draft milestones · {aiPlan.milestones.length}</p>
              {aiPlan.milestones.map((item, index) => <div key={item.title + index} className="glass pad" style={{ display: 'grid', gap: 5 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span className="chip">{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong><span className="chip">{item.priority}</span></div>
                <p className="mut">{item.description}</p>
                <p className="dim" style={{ fontSize: 12 }}>Done when: {item.definition_of_done}</p>
              </div>)}
            </div>
            {!!aiPlan.filtered_out.length && <details><summary className="mut" style={{ cursor: 'pointer' }}>View filtered items ({aiPlan.filtered_out.length})</summary><div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{aiPlan.filtered_out.map((item, index) => <div key={item.item + index} className="glass pad"><strong>{item.item}</strong><p className="mut" style={{ marginTop: 4 }}>{item.reason}</p></div>)}</div></details>}
            <div className="acts"><button className="btn p" disabled={applyingPlan || aiBusy} onClick={applyAIPlan}><QuorlythGlyph name="check" size={14} />{applyingPlan ? 'Applying plan…' : 'Apply brief and milestones'}</button><button className="btn" disabled={applyingPlan} onClick={() => setAiPlan(null)}>Discard draft</button></div>
            <p className="dim" style={{ fontSize: 11 }}>AI-generated estimates and plans are suggestions. Check the source evidence and confirm assignments before acting.</p>
          </div>}
        </section>}
      <MilestoneBoard idea={idea} projectId={id} projectStatus={project.status} milestones={milestones} teamMemberIds={workspaceTeamIds} canCollaborate={canAccess} canManage={canManage} />
    </div>}
    {workspaceTab === 'evidence' && <section id="ql-workspace-panel-evidence" role="tabpanel" aria-labelledby="ql-workspace-tab-evidence" className="ql-workspace-tab-panel glass pad ql-evidence-ledger">
      <div className="ql-evidence-ledger__heading"><div><p className="ql-eyebrow">DELIVERABLE REGISTER</p><h3>Evidence & reviews</h3><p className="ql-muted">Every record keeps its revision, contributor, submitted files, and reviewer decision together.</p></div><span className="ql-evidence-ledger__count">{projectSubmissions.length} submission{projectSubmissions.length === 1 ? '' : 's'}</span></div>
      <div className="ql-evidence-ledger__notice"><QuorlythGlyph name="lock" size={16} /><p>Files here are contributor-submitted evidence. They are not labelled source-verified unless a connected provider confirms their origin. A reviewer must still check them against the milestone criteria.</p></div>
      {projectSubmissions.length ? <div className="ql-evidence-ledger__list">
        {projectSubmissions.map(submission => {
          const linkedMilestone = milestones.find(item => item.id === submission.milestoneId)
          const decisionLabel = submission.status === 'approved' ? 'Approved' : submission.status === 'changes_requested' ? 'Changes requested' : 'Awaiting review'
          return <article className="ql-evidence-record" key={submission.id}>
            <div className="ql-evidence-record__top">
              <div className="ql-evidence-record__identity"><span className="ql-evidence-record__mark"><QuorlythGlyph name="document" size={17} /></span><div><p className="ql-eyebrow">REVISION {String(submission.revision).padStart(2, '0')} · {dateLabel(submission.submittedAt)}</p><h4>{linkedMilestone?.title || 'Project deliverable'}</h4><p>Submitted by {a.nm(submission.submittedBy)}</p></div></div>
              <span className={'ql-evidence-decision status-' + submission.status}>{decisionLabel}</span>
            </div>
            <p className="ql-evidence-record__summary">{submission.summary}</p>
            {submission.reviewNote && <div className="ql-evidence-review-note"><strong>{submission.status === 'approved' ? 'Reviewer note' : 'Requested changes'}</strong><p>{submission.reviewNote}</p>{submission.reviewedBy && submission.reviewedAt && <small>Reviewed by {a.nm(submission.reviewedBy)} · {dateLabel(submission.reviewedAt)}</small>}</div>}
            <div className="ql-evidence-record__files">
              {submission.attachments.map(attachment => <WorkspaceEvidenceFile key={attachment.path} attachment={attachment} />)}
              {!submission.attachments.length && <p className="ql-muted">This is a legacy submission recorded before required file evidence was enabled.</p>}
            </div>
          </article>
        })}
      </div> : <div className="ql-evidence-ledger__empty"><span><QuorlythGlyph name="upload" size={24} /></span><h4>No evidence submitted yet</h4><p>When a collaborator submits a deliverable for one of the milestones, the submission and its revisions will appear here for review.</p><button className="ql-primary-action" type="button" onClick={() => setWorkspaceTab('plan')}><QuorlythGlyph name="milestone" size={15} />Open plan & tasks</button></div>}
    </section>}
    {workspaceTab === 'team' && <div id="ql-workspace-panel-team" role="tabpanel" aria-labelledby="ql-workspace-tab-team" className="ql-workspace-tab-panel grid i2 ql-workspace-team-grid">
      <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>        <section className="glass pad">
          <h3 style={{ fontSize: 19 }}>People in this workspace</h3>
          <div style={{ display: 'grid', gap: 11, marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Av id={idea.authorId} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}><strong>{a.nm(idea.authorId)}</strong><p className="dim" style={{ fontSize: 12 }}>Idea creator</p></div>
            </div>
            {acceptedApplications.map(app => <div key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Av id={app.applicantId} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}><strong>{a.nm(app.applicantId)}</strong><p className="dim" style={{ fontSize: 12 }}>Accepted collaborator</p></div>
              <button className="chip" onClick={() => nav('/me/' + app.applicantId)}>Profile</button>
            </div>)}
          </div>
          <p className="dim" style={{ marginTop: 14, fontSize: 12 }}>The idea creator, community manager, and accepted collaborators can access this space.</p>
        </section></div>
      <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>        <section
          className="glass pad ql-team-discussion"
          aria-label="Team discussion"
          style={discussionMode === 'inline' ? undefined : {
            position: 'fixed',
            left: discussionMode === 'expanded' ? '50%' : 'auto',
            right: discussionMode === 'expanded' ? 'auto' : '12px',
            transform: discussionMode === 'expanded' ? 'translateX(-50%)' : undefined,
            bottom: discussionMode === 'expanded' ? '18px' : '12px',
            width: discussionMode === 'expanded' ? 'min(920px, calc(100vw - 32px))' : 'min(360px, calc(100vw - 24px))',
            height: discussionMode === 'expanded' ? 'min(820px, 82dvh)' : undefined,
            maxHeight: discussionMode === 'expanded' ? '82dvh' : 'calc(100dvh - 24px)',
            zIndex: 120,
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            overflow: 'hidden',
            padding: discussionMode === 'expanded' ? 20 : 16,
            background: 'var(--glass, rgba(12,12,14,.96))',
            backdropFilter: 'blur(24px)',
            border: '1px solid var(--line, rgba(255,255,255,.16))',
            boxShadow: '0 24px 90px rgba(0,0,0,.58)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3 style={{ fontSize: 19 }}>Team discussion <span className="dim" style={{ fontSize: 12, fontWeight: 400 }}>· {comments.length}</span></h3>
              {discussionMode !== 'minimized' && <p className="mut" style={{ marginTop: 5, fontSize: 12 }}>Shared with the original idea discussion, so decisions and context stay connected.</p>}
            </div>
            <div className="acts" style={{ margin: 0, gap: 5, flexShrink: 0 }}>
              {discussionMode === 'inline'
                ? <button type="button" className="chip" title="Expand discussion" aria-label="Expand team discussion" onClick={() => setDiscussionMode('expanded')}><QuorlythGlyph name="expand" size={14} /></button>
                : <button type="button" className="chip" title="Return discussion to page" aria-label="Return team discussion to page" onClick={() => setDiscussionMode('inline')}><QuorlythGlyph name="shrink" size={14} /></button>}
              {discussionMode !== 'minimized'
                ? <button type="button" className="chip" title="Minimize discussion" aria-label="Minimize team discussion" onClick={() => setDiscussionMode('minimized')}><QuorlythGlyph name="minimize" size={14} /></button>
                : <button type="button" className="chip" title="Expand minimized discussion" aria-label="Restore team discussion" onClick={() => setDiscussionMode('expanded')}><QuorlythGlyph name="expand" size={14} /></button>}
            </div>
          </div>

          {discussionMode !== 'minimized' && <>
            <div
              style={{
                display: 'grid',
                gap: 4,
                marginTop: 10,
                marginBottom: 10,
                flex: discussionMode === 'expanded' ? 1 : undefined,
                minHeight: 0,
                overflowY: 'auto',
                maxHeight: discussionMode === 'expanded' ? undefined : 320,
                paddingRight: 4,
                overscrollBehavior: 'contain',
              }}
            >
              {comments.length
                ? topLevelDiscussion.map(comment => renderDiscussionComment(comment))
                : <p className="mut" style={{ padding: '12px 0' }}>No discussion yet. Share the first update.</p>}
            </div>

            <form onSubmit={postReply} style={{ marginTop: 'auto', paddingTop: 8 }}>
              {replyTo && <div className="chip" style={{ marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                Replying to {a.nm(comments.find(comment => comment.id === replyTo)?.authorId || '')}
                <button type="button" className="lk" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><QuorlythGlyph name="close" size={12} /></button>
              </div>}
              <div className="discussion-reply-compose" style={{ position: 'relative', minWidth: 0 }}>
                <label className="field"><span>Message the team</span><textarea
                  id="team-discussion-reply"
                  value={reply}
                  onChange={event => updateDiscussionReply(event.target.value, event.currentTarget.selectionStart ?? event.target.value.length)}
                  onKeyDown={event => {
                    if (event.key === 'Escape' && mentionOpen) { setMentionOpen(false); setMentionQuery('') }
                  }}
                  maxLength={1000}
                  rows={discussionMode === 'expanded' ? 3 : 2}
                  required
                  placeholder="Write a reply or update. Type @ to mention someone…"
                /></label>
                {mentionOpen && <div className="discussion-mention-menu" role="listbox" aria-label="Mention people in this collaboration" style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 'calc(100% + 8px)',
                zIndex: 140,
                display: 'grid',
                gap: 2,
                maxHeight: 'min(320px, 40dvh)',
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                padding: 6,
                border: '1px solid var(--line, rgba(255,255,255,.12))',
                borderRadius: 12,
                background: 'rgba(12,12,14,.98)',
                backdropFilter: 'blur(24px)',
                boxShadow: '0 18px 48px rgba(0,0,0,.55)',
              }}>
                {mentionLoading
                  ? <p className="dim" style={{ padding: 8, fontSize: 12 }}>Loading community and collaboration people…</p>
                  : matchingDiscussionMembers.length
                    ? matchingDiscussionMembers.map(person => <button
                      key={person.id}
                      type="button"
                      role="option"
                      aria-selected="false"
                      className="discussion-mention-option"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => chooseDiscussionMention(person.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', textAlign: 'left', padding: '8px 9px', border: 0, borderRadius: 8, background: 'transparent', color: 'inherit', cursor: 'pointer' }}
                    >
                      <Av id={person.id} size={28} />
                      <span style={{ minWidth: 0, flex: 1 }}><strong style={{ display: 'block', fontSize: 13 }}>{person.name}</strong><span className="dim" style={{ fontSize: 11 }}>Community or collaboration participant</span></span>
                      <span className="dim" style={{ fontSize: 12 }}>@</span>
                    </button>)
                    : <p className="dim" style={{ padding: 8, fontSize: 12 }}>{mentionPeople.length ? 'No matching people. Try another name.' : 'No participants are visible yet. Refresh the workspace and try again.'}</p>}
                </div>}
              </div>
              <p className="dim" style={{ fontSize: 11, margin: '8px 0 10px' }}>Replies stay connected to the idea. Mentioned people are recorded with the message.</p>
              <div className="acts" style={{ margin: 0 }}>
                <button className="btn p" disabled={busy || !reply.trim()}><QuorlythGlyph name="send" size={14} />{busy ? 'Posting…' : replyTo ? 'Post reply' : 'Post update'}</button>
                {replyTo && <button type="button" className="chip" onClick={() => setReplyTo(null)}>Cancel reply</button>}
              </div>
            </form>
          </>}
        </section></div>
    </div>}
  </>
}
