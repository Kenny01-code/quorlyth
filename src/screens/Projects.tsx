import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Av, Head } from '../components/ui'
import { MilestoneBoard } from '../components/MilestoneBoard'
import { QuorlythGlyph } from '../components/QuorlythGlyph'
import { EvidencePreview } from '../components/EvidencePreview'
import { useApp, useComments } from '../data/AppProvider'
import { AIProjectPlan, generateProjectPlan } from '../ai/projectPlan'
import { Idea, Milestone, Project } from '../lib/types'
import { when } from '../lib/util'
import { isPastDateChange, isPastDateInput, minimumDateInput, PAST_DATE_MESSAGE } from '../lib/workspaceDates'
import { userFacingMutationError } from '../lib/userFacingErrors'

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

type ProjectWorkspace = {
  id: string
  docId?: string
  title: string
  summary: string
  status: 'active' | 'completed'
  createdBy: string
  at: number
  updatedAt: number
  dueAt?: number | null
  visibility?: 'team'
  linkedIdeaId?: string
  linkedIdeaProjectId?: string
}
type ProjectWorkspaceMember = {
  id: string
  projectId: string
  userId: string
  role: 'owner' | 'manager' | 'contributor' | 'viewer'
  status: 'active' | 'invited' | 'removed'
  docId?: string
}
type ProjectWorkspaceArtifact = {
  id: string
  projectId: string
  taskId: string
  provider: 'github' | 'manual'
  kind: string
  url?: string
  attachments?: { path: string; name: string; mimeType?: string; size?: number; uploadedAt?: number }[]
  summary: string
  status: 'submitted' | 'approved' | 'changes_requested'
  submittedBy: string
  submittedAt: number
  docId?: string
}

const PROJECT_WORKSPACE_CACHE_PREFIX = 'quorlyth:project-workspace-snapshot:v1:'
function readProjectWorkspaceCache<T>(userId: string | null | undefined, collection: string): T[] | null {
  if (!userId) return null
  try {
    const raw = sessionStorage.getItem(PROJECT_WORKSPACE_CACHE_PREFIX + userId + ':' + collection)
    const value = raw ? JSON.parse(raw) : null
    return Array.isArray(value) ? value as T[] : null
  } catch { return null }
}
function writeProjectWorkspaceCache<T>(userId: string, collection: string, rows: T[]) {
  try {
    const raw = JSON.stringify(rows)
    if (raw.length < 1_500_000) sessionStorage.setItem(PROJECT_WORKSPACE_CACHE_PREFIX + userId + ':' + collection, raw)
  } catch { /* Fresh backend subscriptions remain the source of truth. */ }
}

function PrivateWorkspaceEvidence({ attachment }: { attachment: { path: string; name: string; mimeType?: string } }) {
  const a = useApp()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setUrl('')
    setFailed(false)
    if (!a.backend?.getWorkFileUrl) {
      setFailed(true)
      return () => { active = false }
    }
    setLoading(true)
    void a.backend.getWorkFileUrl(attachment.path).then(value => {
      if (active) setUrl(value)
    }).catch(() => {
      if (active) setFailed(true)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [a.backend, attachment.path])
  return url
    ? <EvidencePreview url={url} name={attachment.name} mimeType={attachment.mimeType || ''} compact />
    : <small className="ql-muted">{loading ? 'Preparing secure preview…' : failed ? 'Private file preview is not available to this account.' : ''}</small>
}

function ProjectCard({ idea, project, milestones, canManage, canCollaborate, workspaceProjects, workspaceMembers, workspaceArtifacts }: {
  idea: Idea
  project?: Project
  milestones: Milestone[]
  canManage: boolean
  canCollaborate: boolean
  workspaceProjects: ProjectWorkspace[]
  workspaceMembers: ProjectWorkspaceMember[]
  workspaceArtifacts: ProjectWorkspaceArtifact[]
}) {
  const a = useApp()
  const nav = useNavigate()
  const [summary, setSummary] = useState(project?.summary || '')
  const [projectDueDate, setProjectDueDate] = useState(dateInput(project?.dueAt))
  const [editSummary, setEditSummary] = useState(false)
  const [busy, setBusy] = useState('')
  const [aiPlan, setAiPlan] = useState<AIProjectPlan | null>(null)
  const [aiPlanAccepted, setAiPlanAccepted] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [workspaceToConnect, setWorkspaceToConnect] = useState('')
  const comments = useComments(idea.id)
  const completed = milestones.filter(m => m.status === 'done').length
  const progress = milestones.length ? Math.round(completed / milestones.length * 100) : 0
  const linkedWorkspace = project
    ? workspaceProjects.find(item => item.linkedIdeaProjectId === project.id || item.linkedIdeaId === idea.id)
    : undefined
  const manageableWorkspaces = workspaceProjects.filter(item =>
    item.status === 'active'
    && !item.linkedIdeaId
    && !item.linkedIdeaProjectId
    && (item.createdBy === a.me?.id || workspaceMembers.some(member =>
      member.projectId === item.id
      && member.userId === a.me?.id
      && member.status === 'active'
      && (member.role === 'owner' || member.role === 'manager')))
  )
  const linkedArtifacts = linkedWorkspace
    ? workspaceArtifacts.filter(item => item.projectId === linkedWorkspace.id).sort((x, y) => y.submittedAt - x.submittedAt)
    : []
  const linkedMilestoneSubmissions = linkedWorkspace
    ? a.data.workSubmissions
      .filter(item => item.ideaId === idea.id || item.projectId === project?.id)
      .sort((x, y) => y.submittedAt - x.submittedAt || y.revision - x.revision)
    : []
  const linkedPendingReviews = linkedArtifacts.filter(item => item.status === 'submitted').length
    + linkedMilestoneSubmissions.filter(item => item.status === 'submitted').length
  const community = a.data.communities.find(c => c.id === idea.cid)
  const teamMemberIds = [idea.authorId, community?.ownerId, community?.createdBy, ...a.data.volunteers.filter(item => item.ideaId === idea.id && item.status === 'accepted').map(item => item.applicantId)].filter((uid): uid is string => !!uid)
  const canOrganizeWithAI = a.canOrganizeIdeaWithAI(idea.id)
  const organizerRequest = a.data.aiOrganizerRequests.find(request => request.cid === idea.cid && request.userId === a.me?.id)
  const organizerApprovalPending = organizerRequest?.status === 'pending'

  useEffect(() => { setSummary(project?.summary || ''); setProjectDueDate(dateInput(project?.dueAt)) }, [project?.summary, project?.dueAt])

  async function organizeProjectWithAI() {
    if (!community) return a.toast('The community context for this idea could not be loaded. Refresh and try again.')
    if (!canOrganizeWithAI) {
      if (organizerApprovalPending) return a.toast('Your AI organizer request is still waiting for community approval.')
      setAiBusy(true)
      try {
        await a.requestCommunityAIOrganizerApproval(idea.id, 'I would like to organize this project brief and collaboration plan with AI.')
      } catch (error) {
        a.toast(userFacingMutationError(error, 'request AI organizer access'))
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
        comments: comments.slice(-24).map(comment => ({ id: comment.id, authorId: comment.authorId, text: comment.text, at: comment.at })),
        team: teamMemberIds.slice(0, 30).map(memberId => ({ id: memberId, name: a.nm(memberId) })),
      })
      setAiPlan(plan)
      setAiPlanAccepted(false)
      a.toast('AI draft ready. Review it before adding it to the workspace.')
    } catch (error) {
      console.error('Quorlyth project-plan generation failed:', error)
      a.toast("Quorlyth couldn't prepare an AI draft. You can keep writing the project plan manually and try again.")
    } finally {
      setAiBusy(false)
    }
  }

  function chooseAIProjectPlan() {
    if (!aiPlan) return
    setSummary(aiPlan.project_summary || summary)
    setAiPlanAccepted(true)
    a.toast('AI draft selected. Start the project to review its proposed milestones in the workspace.')
  }

  async function createProject(event: FormEvent) {
    event.preventDefault()
    if (!summary.trim()) return a.toast('Add a short project summary first.')
    if (isPastDateInput(projectDueDate)) return a.toast(PAST_DATE_MESSAGE)
    if (busy) return
    setBusy('project')
    try {
      const created = await a.createProject(idea.id, summary.trim(), dateEnd(projectDueDate))
      if (created) {
        const options = aiPlan && aiPlanAccepted
          ? { state: { aiPlan: { ...aiPlan, project_summary: summary.trim() } } }
          : undefined
        nav('/collaboration/' + idea.id + '?tab=plan', options)
      }
    } catch (error) {
      a.toast(userFacingMutationError(error, 'create the project workspace'))
    } finally {
      setBusy('')
    }
  }

  async function saveSummary(event: FormEvent) {
    event.preventDefault()
    if (!project || !summary.trim()) return a.toast('A project summary cannot be empty.')
    if (isPastDateChange(projectDueDate, dateInput(project.dueAt))) return a.toast(PAST_DATE_MESSAGE)
    if (busy) return
    setBusy('summary')
    try {
      const ok = await a.updateProject(project.id, { summary: summary.trim(), dueAt: dateEnd(projectDueDate) })
      if (ok) setEditSummary(false)
    } catch (error) {
      a.toast(userFacingMutationError(error, 'save the project summary'))
    } finally {
      setBusy('')
    }
  }

  async function connectExistingWorkspace() {
    if (!project || !a.backend || !a.me || !canManage || !workspaceToConnect) return
    const target = manageableWorkspaces.find(item => item.id === workspaceToConnect)
    if (!target) return a.toast('Choose a workspace you manage, then try again.')
    setBusy('link-workspace')
    try {
      await a.backend.store.update('standaloneProjects/' + (target.docId || target.id), {
        linkedIdeaId: idea.id,
        linkedIdeaProjectId: project.id,
        updatedAt: Date.now(),
      })
      setWorkspaceToConnect('')
      a.toast('Workspace connected. Existing tasks and evidence now appear alongside this project where your permissions allow.')
    } catch (error) {
      a.toast(userFacingMutationError(error, 'connect this workspace'))
    } finally {
      setBusy('')
    }
  }

  async function createConnectedWorkspace() {
    if (!project || !a.backend || !a.me || !canManage || project.status !== 'active') return
    if (linkedWorkspace) {
      nav('/workspaces/' + linkedWorkspace.id)
      return
    }
    setBusy('create-workspace')
    const now = Date.now()
    const id = crypto.randomUUID()
    const rawSummary = (project.summary || '').trim()
    const workspace: ProjectWorkspace = {
      id,
      title: (idea.title + ' — Workspace').slice(0, 100),
      summary: (rawSummary.length >= 8 ? rawSummary : 'Delivery workspace for ' + idea.title).slice(0, 4000),
      status: 'active',
      createdBy: a.me.id,
      at: now,
      updatedAt: now,
      dueAt: project.dueAt ?? null,
      visibility: 'team',
      linkedIdeaId: idea.id,
      linkedIdeaProjectId: project.id,
    }
    const ownerMembership = {
      id: id + '__' + a.me.id,
      projectId: id,
      userId: a.me.id,
      role: 'owner' as const,
      status: 'active' as const,
      invitedBy: a.me.id,
      at: now,
      updatedAt: now,
    }
    let workspaceCreated = false
    try {
      await a.backend.store.create('standaloneProjects/' + id, workspace)
      workspaceCreated = true
      try {
        await a.backend.store.create('standaloneProjectMembers/' + ownerMembership.id, ownerMembership)
        a.toast('Connected workspace created. Open it to create real tasks, do the work in your tools, and submit evidence for review.')
      } catch (membershipError) {
        console.warn('Connected workspace exists but its owner membership record could not be written:', membershipError)
        a.toast('The linked workspace was created and you remain its owner. Team membership setup needs attention; you can open it now.')
      }
    } catch (error) {
      a.toast(workspaceCreated
        ? 'Workspace created, but setup was incomplete. Open the workspace and check its team settings.'
        : userFacingMutationError(error, 'create the connected workspace'))
    } finally {
      setBusy('')
    }
  }

  async function toggleProjectStatus() {
    if (!project || busy) return
    const status = project.status === 'completed' ? 'active' : 'completed'
    setBusy('project-status')
    try {
      await a.updateProject(project.id, { status })
    } catch (error) {
      a.toast(userFacingMutationError(error, status === 'completed' ? 'complete this project' : 'reopen this project'))
    } finally {
      setBusy('')
    }
  }

  return (
    <article className="glass pad" style={{ minWidth: 0 }}>
      <div className="head" style={{ alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ minWidth: 0 }}>
          <p className="dim">{community?.name || 'Community'} · {project ? 'Project' : 'Selected idea'}</p>
          <h3 style={{ marginTop: 6, fontSize: 21, fontWeight: 300, overflowWrap: 'anywhere' }}>{idea.title}</h3>
        </div>
        <span className="chip">{project ? project.status === 'completed' ? 'Completed' : 'Active' : 'Selected'}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" className="chip" onClick={() => nav('/me/' + idea.authorId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <Av id={idea.authorId} size={28} />Idea by {a.nm(idea.authorId)}
        </button>
        <button type="button" className="chip" onClick={() => nav('/idea/' + idea.id)}><QuorlythGlyph name="idea" size={14} />Open idea</button>
        {project && canCollaborate && <button type="button" className="chip" onClick={() => nav('/collaboration/' + idea.id + '?tab=plan')}><QuorlythGlyph name="workspace" size={14} />Open workspace</button>}
      </div>

      {!project ? (
        canManage ? (
          <form onSubmit={createProject}>
            <div className="glass pad" style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
              <div>
                <span className="chip"><QuorlythGlyph name="idea" size={14} />Quorlyth Signal Engine</span>
                <h4 style={{ fontSize: 17, marginTop: 8 }}>Organize this idea into a project</h4>
                <p className="mut" style={{ marginTop: 4 }}>Use this idea, its discussion, and eligible collaborators to draft a brief and milestones. Nothing is saved until you review and choose to use the draft.</p>
              </div>
              <div className="acts" style={{ margin: 0, flexWrap: 'wrap' }}>
                <button type="button" className="btn p" disabled={aiBusy || organizerApprovalPending} onClick={() => void organizeProjectWithAI()}>
                  <QuorlythGlyph name="idea" size={15} />
                  {aiBusy ? (canOrganizeWithAI ? 'Organizing discussion…' : 'Requesting approval…') : canOrganizeWithAI ? 'Organize with AI' : organizerApprovalPending ? 'Approval pending' : organizerRequest?.status === 'declined' ? 'Request AI approval again' : 'Request AI organizer approval'}
                </button>
                {aiPlanAccepted && <span className="chip"><QuorlythGlyph name="check" size={13} />AI draft selected</span>}
              </div>
              {!canOrganizeWithAI && <p className="dim" style={{ fontSize: 12 }}>AI organizing requires community-owner access or an approved request. Your project brief can still be written manually.</p>}
              {aiPlan && <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--line, rgba(255,255,255,.12))', paddingTop: 12 }}>
                <div>
                  <p className="dim" style={{ fontSize: 11, letterSpacing: '.07em', textTransform: 'uppercase' }}>Suggested project brief</p>
                  <p className="mut" style={{ marginTop: 5 }}>{aiPlan.project_summary}</p>
                  <p className="dim" style={{ fontSize: 11, marginTop: 5 }}>Signal score: {aiPlan.signal_score}/100 · AI estimate, not a measured engagement metric.</p>
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  <p className="dim" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.07em' }}>Proposed milestones · {aiPlan.milestones.length}</p>
                  {aiPlan.milestones.map((item, index) => <div key={item.title + index} className="glass pad" style={{ display: 'grid', gap: 5 }}>
                    <strong>{String(index + 1).padStart(2, '0')} · {item.title}</strong>
                    <p className="mut">{item.description}</p>
                    <p className="dim" style={{ fontSize: 12 }}>Done when: {item.definition_of_done}</p>
                  </div>)}
                </div>
                <div className="acts" style={{ margin: 0, flexWrap: 'wrap' }}>
                  <button type="button" className="btn p" onClick={chooseAIProjectPlan}><QuorlythGlyph name="check" size={14} />Use this draft</button>
                  <button type="button" className="btn" onClick={() => { setAiPlan(null); setAiPlanAccepted(false) }}>Discard draft</button>
                </div>
                <p className="dim" style={{ fontSize: 11 }}>Choosing this draft passes it to the workspace for another review. Proposed milestones are not created or marked complete until you confirm the plan there.</p>
              </div>}
            </div>
            <label className="field">
              <span>Project plan</span>
              <textarea value={summary} onChange={e => setSummary(e.target.value)} maxLength={1200} required placeholder="What are you going to deliver, and how will the contributors help?" />
            </label>
            <label className="field"><span>Target delivery date <small>Optional</small></span><input type="date" min={minimumDateInput()} value={projectDueDate} onChange={e => setProjectDueDate(e.target.value)} /></label>
            <p className="dim" style={{ marginTop: -6, marginBottom: 12 }}>Starting this project opens its workspace. Define concrete milestones, do the work there, submit the real deliverable as evidence, and wait for an authorized reviewer to approve it. An upload alone does not complete a milestone.</p>
            <button className="btn p" disabled={busy === 'project'}><QuorlythGlyph name="plan" size={16} />{busy === 'project' ? 'Creating workspace…' : 'Start project & open workspace'}</button>
          </form>
        ) : <p className="mut">This idea has been selected. The community creator has not created a project plan yet.</p>
      ) : (
        <>
          {editSummary && canManage ? (
            <form onSubmit={saveSummary}>
              <label className="field"><span>Project summary</span><textarea value={summary} onChange={e => setSummary(e.target.value)} required maxLength={1200} /></label>
              <label className="field"><span>Target delivery date <small>Optional</small></span><input type="date" min={minimumDateInput(dateInput(project?.dueAt))} value={projectDueDate} onChange={e => setProjectDueDate(e.target.value)} /></label>
              <div className="acts"><button className="btn p" disabled={busy === 'summary'}>{busy === 'summary' ? 'Saving…' : 'Save summary'}</button><button type="button" className="btn" onClick={() => { setSummary(project.summary); setEditSummary(false) }}>Cancel</button></div>
            </form>
          ) : (
            <div className="reason" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="dim">Project plan</span>
                {canManage && <button type="button" className="chip" onClick={() => setEditSummary(true)}><QuorlythGlyph name="plan" size={13} />Edit</button>}
              </div>
              <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{project.summary || 'No project summary has been added yet.'}</p>
              {project.dueAt ? <p className="ql-muted ql-project-deadline"><QuorlythGlyph name="calendar" size={14} />Target delivery · {dateLabel(project.dueAt)}</p> : null}
            </div>
          )}

          <div className="ql-project-progress">
            <div className="ql-project-progress__header"><div><p className="ql-eyebrow">Delivery health</p><h4>{completed} of {milestones.length} outcomes complete</h4></div><strong>{progress}%</strong></div>
            <div className="ql-project-progress__track"><i style={{ width: progress + '%' }} /></div>
            {project.dueAt ? <p className="ql-muted ql-project-deadline"><QuorlythGlyph name="calendar" size={14} />Target delivery · {dateLabel(project.dueAt)}</p> : null}
            {milestones.length > 0 && <p className="ql-muted ql-project-updated"><QuorlythGlyph name="timeline" size={13} />Last activity · {when(Math.max(project.updatedAt || project.at, ...milestones.map(m => m.updatedAt || m.at))) || 'not recorded'}</p>}
          </div>
          <MilestoneBoard idea={idea} projectId={project.id} projectStatus={project.status} milestones={milestones} teamMemberIds={teamMemberIds} canCollaborate={canCollaborate} canManage={canManage} workspaceId={linkedWorkspace?.id} onCreateWorkspace={() => void createConnectedWorkspace()} />
          <section className="ql-linked-workspace" aria-label="Connected delivery workspace">
            <div className="ql-linked-workspace__top">
              <span className="ql-linked-workspace__mark"><QuorlythGlyph name="workspace" size={18} /></span>
              <div className="ql-linked-workspace__heading">
                <p className="ql-eyebrow">CONNECTED DELIVERY SPACE</p>
                <h4>{linkedWorkspace ? linkedWorkspace.title : 'Connect your project to real work'}</h4>
                <p>{linkedWorkspace
                  ? 'Community milestones and workspace tasks remain permission-controlled, with evidence surfaced from both systems.'
                  : 'Keep the milestone plan and the hands-on task/evidence workspace connected instead of managing two unrelated project spaces.'}</p>
              </div>
              {linkedWorkspace && <span className={'sw-pill' + (linkedWorkspace.status === 'completed' ? ' is-done' : '')}>{linkedWorkspace.status === 'completed' ? 'Completed' : 'Active'}</span>}
            </div>
            {linkedWorkspace ? <>
              <div className="ql-linked-workspace__stats">
                <span><strong>{linkedArtifacts.length}</strong> workspace task evidence item{linkedArtifacts.length === 1 ? '' : 's'}</span>
                <span><strong>{linkedMilestoneSubmissions.length}</strong> milestone submission{linkedMilestoneSubmissions.length === 1 ? '' : 's'}</span>
                <span><strong>{linkedPendingReviews}</strong> awaiting review across both views</span>
              </div>
              {linkedArtifacts.length > 0
                ? <div className="ql-linked-workspace__artifacts">
                    {linkedArtifacts.slice(0, 3).map(item => <article className="ql-linked-workspace__artifact" key={'workspace-' + item.id}>
                      <div><strong>{item.summary || (item.kind === 'pull_request' ? 'Pull request evidence' : 'Project deliverable')}</strong><small>Workspace task · {item.kind.replace(/_/g, ' ')} · {dateLabel(item.submittedAt)} · {a.nm(item.submittedBy)}</small></div>
                      <span className={'sw-review-status status-' + item.status}>{item.status === 'approved' ? 'Approved' : item.status === 'changes_requested' ? 'Changes requested' : 'Awaiting review'}</span>
                      {item.url && <EvidencePreview url={item.url} name={item.summary || 'Workspace evidence'} summary={item.kind.replace(/_/g, ' ')} compact />}
                      {(item.attachments || []).map(attachment => <PrivateWorkspaceEvidence key={attachment.path} attachment={attachment} />)}
                      {!item.url && !(item.attachments?.length || 0) && <small>No file attachment is available for preview.</small>}
                    </article>)}
                  </div>
                : <p className="ql-linked-workspace__empty">No workspace-task evidence has been submitted yet. Community milestone submissions are shown separately below from their original records.</p>}
              {linkedMilestoneSubmissions.length > 0 && <p className="ql-linked-workspace__note">{linkedMilestoneSubmissions.length} legacy milestone submission{linkedMilestoneSubmissions.length === 1 ? '' : 's'} remain available in the connected workspace's Evidence & reviews tab. New work evidence is submitted in the workspace first and then mirrored here.</p>}
              <button type="button" className="btn p" onClick={() => nav('/workspaces/' + linkedWorkspace.id)}><QuorlythGlyph name="workspace" size={14} />Open connected workspace</button>
            </> : canManage && project.status === 'active' ? <>
              {manageableWorkspaces.length > 0 && <form className="ql-linked-workspace__connect" onSubmit={event => { event.preventDefault(); void connectExistingWorkspace() }}>
                <label className="field"><span>Connect an existing workspace</span><select value={workspaceToConnect} onChange={event => setWorkspaceToConnect(event.target.value)} required><option value="">Choose a workspace you manage</option>{manageableWorkspaces.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
                <button type="submit" className="btn" disabled={busy === 'link-workspace' || !workspaceToConnect}><QuorlythGlyph name="link" size={14} />{busy === 'link-workspace' ? 'Connecting…' : 'Connect workspace'}</button>
              </form>}
              <button type="button" className="btn p" onClick={() => void createConnectedWorkspace()} disabled={busy === 'create-workspace'}><QuorlythGlyph name="add" size={14} />{busy === 'create-workspace' ? 'Creating connected workspace…' : 'Create connected workspace'}</button>
              <p className="ql-linked-workspace__note">Connecting a workspace links the records; it does not bypass permissions. Invite teammates in the workspace team room as well if they need access to its private tasks and files.</p>
            </> : <p className="ql-linked-workspace__empty">A connected workspace can be created or linked while the project is active by an authorized project manager.</p>}
          </section>
          {canManage && <div className="acts" style={{ marginTop: 14 }}>
            <button type="button" className="btn" disabled={busy === 'project-status'} onClick={() => void toggleProjectStatus()}><QuorlythGlyph name={project.status === 'completed' ? 'progress' : 'complete'} size={15} />{project.status === 'completed' ? 'Reopen project' : 'Mark project complete'}</button>
          </div>}
        </>
      )}
    </article>
  )
}

export function Projects() {
  return <Gate><Inner /></Gate>
}

function Inner() {
  const a = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const requestedIdeaId = params.get('idea') || ''
  const currentUserId = a.me?.id || null
  const [workspaceProjectsSnapshot, setWorkspaceProjectsSnapshot] = useState<{ userId: string | null; rows: ProjectWorkspace[] }>(() => ({
    userId: currentUserId, rows: readProjectWorkspaceCache<ProjectWorkspace>(currentUserId, 'standaloneProjects') || [],
  }))
  const [workspaceMembersSnapshot, setWorkspaceMembersSnapshot] = useState<{ userId: string | null; rows: ProjectWorkspaceMember[] }>(() => ({
    userId: currentUserId, rows: readProjectWorkspaceCache<ProjectWorkspaceMember>(currentUserId, 'standaloneProjectMembers') || [],
  }))
  const [workspaceArtifactsSnapshot, setWorkspaceArtifactsSnapshot] = useState<{ userId: string | null; rows: ProjectWorkspaceArtifact[] }>(() => ({
    userId: currentUserId, rows: readProjectWorkspaceCache<ProjectWorkspaceArtifact>(currentUserId, 'standaloneArtifacts') || [],
  }))
  const workspaceProjects = workspaceProjectsSnapshot.userId === currentUserId ? workspaceProjectsSnapshot.rows : (readProjectWorkspaceCache<ProjectWorkspace>(currentUserId, 'standaloneProjects') || [])
  const workspaceMembers = workspaceMembersSnapshot.userId === currentUserId ? workspaceMembersSnapshot.rows : (readProjectWorkspaceCache<ProjectWorkspaceMember>(currentUserId, 'standaloneProjectMembers') || [])
  const workspaceArtifacts = workspaceArtifactsSnapshot.userId === currentUserId ? workspaceArtifactsSnapshot.rows : (readProjectWorkspaceCache<ProjectWorkspaceArtifact>(currentUserId, 'standaloneArtifacts') || [])
  const setWorkspaceProjects = (rows: ProjectWorkspace[]) => setWorkspaceProjectsSnapshot({ userId: currentUserId, rows })
  const setWorkspaceMembers = (rows: ProjectWorkspaceMember[]) => setWorkspaceMembersSnapshot({ userId: currentUserId, rows })
  const setWorkspaceArtifacts = (rows: ProjectWorkspaceArtifact[]) => setWorkspaceArtifactsSnapshot({ userId: currentUserId, rows })

  useEffect(() => {
    const store = a.backend?.store
    const uid = a.me?.id
    if (!store || !uid) {
      setWorkspaceProjects([])
      setWorkspaceMembers([])
      setWorkspaceArtifacts([])
      return
    }
    const cachedProjects = readProjectWorkspaceCache<ProjectWorkspace>(uid, 'standaloneProjects')
    const cachedMembers = readProjectWorkspaceCache<ProjectWorkspaceMember>(uid, 'standaloneProjectMembers')
    const cachedArtifacts = readProjectWorkspaceCache<ProjectWorkspaceArtifact>(uid, 'standaloneArtifacts')
    if (cachedProjects) setWorkspaceProjects(cachedProjects)
    if (cachedMembers) setWorkspaceMembers(cachedMembers)
    if (cachedArtifacts) setWorkspaceArtifacts(cachedArtifacts)
    const offProjects = store.subscribe('standaloneProjects', docs => {
      const rows: ProjectWorkspace[] = docs.map(doc => ({ ...doc.data, id: doc.data?.id || doc.id, docId: doc.id }))
      writeProjectWorkspaceCache(uid, 'standaloneProjects', rows)
      setWorkspaceProjects(rows)
    })
    const offMembers = store.subscribe('standaloneProjectMembers', docs => {
      const rows: ProjectWorkspaceMember[] = docs.map(doc => ({ ...doc.data, id: doc.data?.id || doc.id, docId: doc.id }))
      writeProjectWorkspaceCache(uid, 'standaloneProjectMembers', rows)
      setWorkspaceMembers(rows)
    })
    const offArtifacts = store.subscribe('standaloneArtifacts', docs => {
      const rows: ProjectWorkspaceArtifact[] = docs.map(doc => ({ ...doc.data, id: doc.data?.id || doc.id, docId: doc.id }))
      writeProjectWorkspaceCache(uid, 'standaloneArtifacts', rows)
      setWorkspaceArtifacts(rows)
    })
    return () => { offProjects(); offMembers(); offArtifacts() }
  }, [a.backend?.store, a.me?.id])
  const canReview = a.owner || a.data.communities.some(community => a.ownsCommunity(community.id))
  const canSeeIdeaProject = (idea: Idea) => a.owner
    || a.canManageCommunity(idea.cid)
    || idea.authorId === a.me?.id
    || a.data.volunteers.some(v => v.ideaId === idea.id && v.applicantId === a.me?.id && v.status === 'accepted')
  const ideas = a.data.ideas
    .filter(idea => !!a.data.projects[idea.id] || ['selected', 'promoted'].includes(a.statusOf(idea.id)))
    .filter(canSeeIdeaProject)
    .filter(idea => !requestedIdeaId || idea.id === requestedIdeaId)
    .sort((x, y) => (a.data.projects[y.id]?.updatedAt || a.data.projects[y.id]?.at || y.at) - (a.data.projects[x.id]?.updatedAt || a.data.projects[x.id]?.at || x.at))

  return (
    <>
      <Head kicker="Projects" title="Make progress visible." right={canReview ? <button type="button" className="btn" onClick={() => nav('/queue')}><QuorlythGlyph name="review" size={16} />Review queue</button> : undefined} />
      <p className="mut" style={{ maxWidth: 760, marginBottom: 18 }}>Turn selected ideas into real work. Community managers control the project brief and overall status; idea creators and accepted collaborators can add milestones and update shared progress.</p>
      <div className="acts" style={{ marginTop: -6, marginBottom: 18 }}><button type="button" className="btn p" onClick={() => nav('/workspaces')}><QuorlythGlyph name="workspace" size={15} />Open independent workspaces</button></div>
      {!ideas.length ? <div className="glass cent ql-project-empty"><span className="ql-empty-mark"><QuorlythGlyph name="workspace" size={30} /></span><h3>{canReview ? 'No selected ideas or projects yet' : 'No project spaces available yet'}</h3><p className="mut">{canReview ? 'Select an idea in a community you manage to start a tracked project.' : 'Project spaces appear here when one of your ideas is selected or a community accepts your collaboration application.'}</p>{canReview && <button type="button" className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/queue')}><QuorlythGlyph name="review" size={15} />Open review queue</button>}</div> : <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
        {ideas.map(idea => <ProjectCard key={idea.id} idea={idea} project={a.data.projects[idea.id]} milestones={a.data.milestones.filter(m => m.projectId === idea.id).sort((x, y) => x.at - y.at)} canManage={a.owner || a.canManageCommunity(idea.cid)} canCollaborate={a.owner || a.canManageCommunity(idea.cid) || a.data.volunteers.some(v => v.ideaId === idea.id && v.applicantId === a.me?.id && v.status === 'accepted')} workspaceProjects={workspaceProjects} workspaceMembers={workspaceMembers} workspaceArtifacts={workspaceArtifacts} />)}
      </div>}
    </>
  )
}
