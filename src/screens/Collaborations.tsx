import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Av, Head } from '../components/ui'
import { MilestoneBoard } from '../components/MilestoneBoard'
import { QuorlythGlyph } from '../components/QuorlythGlyph'
import { useApp, useComments } from '../data/AppProvider'
import { when } from '../lib/util'


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
export function CollaborationWorkspace() {
  return <Gate><Workspace /></Gate>
}

function Workspace() {
  const { id = '' } = useParams()
  const a = useApp()
  const nav = useNavigate()
  const comments = useComments(id || null)
  const [reply, setReply] = useState('')
  const [workspaceSummary, setWorkspaceSummary] = useState('Collaboration workspace ready. Add a project plan and milestones to coordinate the work.')
  const [projectDueDate, setProjectDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const idea = a.data.ideas.find(item => item.id === id)
  const project = a.data.projects[id]
  useEffect(() => setProjectDueDate(dateInput(project?.dueAt)), [project?.dueAt])
  const community = idea ? a.data.communities.find(c => c.id === idea.cid) : undefined
  const canManage = !!idea && a.canManageCommunity(idea.cid)
  const acceptedApplications = a.data.volunteers.filter(v => v.ideaId === id && v.status === 'accepted')
  const isAccepted = !!a.me && acceptedApplications.some(v => v.applicantId === a.me?.id)
  const isIdeaAuthor = !!a.me && idea?.authorId === a.me.id
  const canAccess = canManage || isIdeaAuthor || isAccepted
  const milestones = a.data.milestones.filter(m => m.projectId === id).sort((x, y) => x.at - y.at)
  const completed = milestones.filter(m => m.status === 'done').length
  const progress = milestones.length ? Math.round(completed / milestones.length * 100) : 0
  const workspaceTeamIds = [idea?.authorId, community?.ownerId, community?.createdBy, ...acceptedApplications.map(application => application.applicantId)].filter((uid): uid is string => !!uid)

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
          setBusy(true)
          await a.createProject(id, workspaceSummary.trim(), dateEnd(projectDueDate))
          setBusy(false)
        }}>
          <label className="field"><span>Project brief</span><textarea value={workspaceSummary} onChange={e => setWorkspaceSummary(e.target.value)} maxLength={1200} required placeholder="Describe the goal, scope, and first outcome for this collaboration." /></label>
          <label className="field"><span>Target delivery date <small>Optional</small></span><input type="date" value={projectDueDate} onChange={e => setProjectDueDate(e.target.value)} /></label>
          <button className="btn p" disabled={busy || !workspaceSummary.trim()}><QuorlythGlyph name="workspace" size={15} />{busy ? 'Creating workspace…' : 'Initialize collaboration workspace'}</button>
        </form> : <div className="acts" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => nav('/idea/' + idea.id)}>View original idea</button>
          <button className="btn" onClick={() => nav('/collaborations')}>Back to collaborations</button>
        </div>}
      </section>
    </div>
  }

  async function postReply(event: FormEvent) {
    event.preventDefault()
    if (!reply.trim()) return
    setBusy(true)
    const ok = await a.addComment(id, reply.trim())
    if (ok) setReply('')
    setBusy(false)
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
    <div className="grid i2" style={{ alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
        <section className="glass pad">
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
        </section>
        <MilestoneBoard idea={idea} projectId={id} projectStatus={project.status} milestones={milestones} teamMemberIds={workspaceTeamIds} canCollaborate={canAccess} canManage={canManage} />
      </div>
      <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
        <section className="glass pad">
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
        </section>
        <section className="glass pad">
          <h3 style={{ fontSize: 19 }}>Team discussion</h3>
          <p className="mut" style={{ marginTop: 5 }}>This thread is shared with the original idea discussion, so decisions and context stay connected.</p>
          <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
            {comments.length ? comments.map(comment => <div key={comment.id} className="msg" style={{ alignItems: 'flex-start' }}>
              <Av id={comment.authorId} size={30} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <p><strong>{a.nm(comment.authorId)}</strong> <span className="dim">{when(comment.at)}</span></p>
                <p className="mut" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginTop: 4 }}>{comment.text}</p>
              </div>
            </div>) : <p className="mut">No discussion yet. Share the first update.</p>}
          </div>
          <form onSubmit={postReply} style={{ marginTop: 14 }}>
            <label className="field"><span>Message the team</span><textarea value={reply} onChange={e => setReply(e.target.value)} maxLength={1000} required placeholder="Share an update, question, or decision…" /></label>
            <button className="btn p" disabled={busy || !reply.trim()}><QuorlythGlyph name="send" size={14} />{busy ? 'Posting…' : 'Post update'}</button>
          </form>
        </section>
      </div>
    </div>
  </>
}
