import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Av, Head } from '../components/ui'
import { QuorlythGlyph } from '../components/QuorlythGlyph'
import { useApp } from '../data/AppProvider'
import { isPastDateChange, isPastDateInput, minimumDateInput, PAST_DATE_MESSAGE } from '../lib/workspaceDates'
import { emitWorkflowEvent } from '../lib/automation'
import { userFacingMutationError } from '../lib/userFacingErrors'
import { WorkSubmission } from '../lib/types'

type WorkspaceTab = 'overview' | 'tasks' | 'evidence' | 'team'
type WorkspaceProject = {
  id: string; title: string; summary: string; status: 'active' | 'completed'; createdBy: string
  at: number; updatedAt: number; dueAt?: number | null; visibility: 'team'; docId?: string
  linkedIdeaId?: string; linkedIdeaProjectId?: string
}
type WorkspaceMember = {
  id: string; projectId: string; userId: string; role: 'owner' | 'manager' | 'contributor' | 'viewer'
  status: 'active' | 'invited' | 'removed'; invitedBy: string; at: number; updatedAt: number; docId?: string
}
type WorkspaceTask = {
  id: string; projectId: string; title: string; description: string; status: 'todo' | 'in_progress' | 'done'
  createdBy: string; at: number; updatedAt: number; dueAt?: number | null; assigneeId?: string | null; assigneeIds?: string[]
  acceptanceCriteria?: string; docId?: string
}
const assignedTaskIds = (task: Pick<WorkspaceTask, 'assigneeId' | 'assigneeIds'>): string[] =>
  [...new Set([...(Array.isArray(task.assigneeIds) ? task.assigneeIds : []), ...(task.assigneeId ? [task.assigneeId] : [])].filter(Boolean))]

type WorkspaceAttachment = { path: string; name: string; mimeType: string; size: number; uploadedAt: number }
type WorkspaceArtifact = {
  id: string; projectId: string; taskId: string; provider: 'github' | 'manual'; kind: 'commit' | 'pull_request' | 'link' | 'document' | 'demo' | 'file'
  url?: string; attachments?: WorkspaceAttachment[]; summary: string; status: 'submitted' | 'approved' | 'changes_requested'
  verificationStatus: 'source_verified' | 'submitted_evidence'; verifiedAt?: number; submittedBy: string; submittedAt: number
  reviewedAt?: number; reviewedBy?: string; reviewNote?: string; updatedAt?: number; repositoryFullName?: string
  sourceMetadata: Record<string, unknown>; docId?: string
}
type GithubRepository = {
  id: string; projectId: string; fullName: string; htmlUrl: string; description: string
  defaultBranch: string; language?: string; stars: number; openIssues: number; sourceVerified: boolean
  lastSyncedAt: number; docId?: string
}
type WorkspaceComment = { id: string; projectId: string; authorId: string; text: string; at: number; docId?: string }

function LinkedWorkSubmissionCard({ submission, milestoneTitle, ideaId }: {
  submission: WorkSubmission
  milestoneTitle: string
  ideaId: string
}) {
  const a = useApp()
  const nav = useNavigate()
  const [fileLinks, setFileLinks] = useState<{ path: string; name: string; url: string }[]>([])
  useEffect(() => {
    let active = true
    const getUrl = a.backend?.getWorkFileUrl
    if (!getUrl || !submission.attachments?.length) {
      setFileLinks([])
      return () => { active = false }
    }
    void Promise.all(submission.attachments.map(async attachment => {
      try {
        return { path: attachment.path, name: attachment.name, url: await getUrl(attachment.path) }
      } catch {
        return { path: attachment.path, name: attachment.name, url: '' }
      }
    })).then(files => { if (active) setFileLinks(files) })
    return () => { active = false }
  }, [a.backend, submission.id, submission.updatedAt])

  const status = submission.status === 'approved' ? 'Approved'
    : submission.status === 'changes_requested' ? 'Changes requested' : 'Awaiting review'
  return <article className="sw-linked-submission">
    <div className="sw-linked-submission__top">
      <div><p className="ql-eyebrow">MILESTONE · REVISION {submission.revision}</p><h4>{milestoneTitle}</h4></div>
      <span className={'sw-review-status status-' + submission.status}>{status}</span>
    </div>
    <p className="sw-linked-submission__summary">{submission.summary}</p>
    <div className="sw-linked-submission__meta"><span>Submitted by {a.nm(submission.submittedBy)}</span><span>{new Date(submission.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
    {submission.reviewNote && <p className="sw-review-note"><strong>{submission.status === 'approved' ? 'Reviewer note' : 'Requested changes'}</strong><br />{submission.reviewNote}</p>}
    {fileLinks.length > 0 && <div className="sw-linked-submission__files">{fileLinks.map(file => file.url
      ? <a key={file.path} href={file.url} target="_blank" rel="noreferrer"><QuorlythGlyph name="file" size={13}/>{file.name}<QuorlythGlyph name="open" size={12}/></a>
      : <span key={file.path}>{file.name} · Open the original project to access this private file</span>)}</div>}
    <button className="sw-link-button" type="button" onClick={() => nav('/projects?idea=' + encodeURIComponent(ideaId))}>Open original milestone review <QuorlythGlyph name="arrow" size={13}/></button>
  </article>
}

function useWorkspaceCollection<T extends { id?: string }>(collection: string) {
  const a = useApp()
  const [rows, setRows] = useState<T[]>([])
  useEffect(() => {
    setRows([])
    const store = a.backend?.store
    if (!store || !a.me?.id) return
    return store.subscribe(collection, docs => {
      setRows(docs.map(doc => ({ ...doc.data, docId: doc.id } as T)))
    }, error => console.warn('Workspace collection could not refresh:', collection, error))
  }, [a.backend?.store, a.me?.id, a.demo, collection])
  return rows
}

const localDate = (timestamp?: number | null) => timestamp
  ? new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  : ''
const dateInput = (timestamp?: number | null) => {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}
const dateEnd = (value: string) => {
  if (!value) return null
  const [year, month, day] = value.split('-').map(Number)
  const d = new Date(year, month - 1, day, 23, 59, 59, 999)
  return Number.isFinite(d.getTime()) ? d.getTime() : null
}
const errorText = (error: unknown) => userFacingMutationError(error, 'complete this workspace action')

function WorkspaceEvidenceAttachment({ attachment }: { attachment: WorkspaceAttachment }) {
  const a = useApp()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [unavailable, setUnavailable] = useState(false)

  useEffect(() => {
    let active = true
    setUrl('')
    setUnavailable(false)
    if (!a.backend?.getWorkFileUrl) {
      setUnavailable(true)
      return () => { active = false }
    }
    setLoading(true)
    void a.backend.getWorkFileUrl(attachment.path).then(value => {
      if (active) setUrl(value)
    }).catch(() => {
      if (active) setUnavailable(true)
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [a.backend, attachment.path])

  const size = attachment.size < 1024 ? attachment.size + ' B'
    : attachment.size < 1024 * 1024 ? Math.round(attachment.size / 1024) + ' KB'
    : (attachment.size / (1024 * 1024)).toFixed(1) + ' MB'

  return <div className="sw-evidence-attachment">
    <span className="sw-repo-mark"><QuorlythGlyph name="file" size={16}/></span>
    <div><strong title={attachment.name}>{attachment.name}</strong><small>{size} · {attachment.mimeType || 'File'}</small></div>
    {url ? <a href={url} target="_blank" rel="noreferrer">Open file <QuorlythGlyph name="open" size={12}/></a>
      : <small className="sw-muted">{loading ? 'Preparing secure link…' : unavailable ? 'File unavailable' : ''}</small>}
  </div>
}


async function githubAction(a: ReturnType<typeof useApp>, action: string, projectId: string, extra: Record<string, unknown>) {
  if (!a.backend || a.backend.auth.mode !== 'supabase') {
    throw new Error('GitHub source checking requires Quorlyth’s connected Supabase account. Sign in through the live site to use it.')
  }
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  const token = await a.backend.auth.accessToken?.()
  if (!baseUrl || !anonKey || !token) throw new Error('GitHub source checking is not configured for this session. Please sign in again.')
  const response = await fetch(baseUrl + '/functions/v1/standalone-github', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, projectId, ...extra }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok || payload?.ok !== true) throw new Error(payload?.error || 'GitHub could not verify this source.')
  return payload
}

function WorkspaceProjectList() {
  const a = useApp()
  const nav = useNavigate()
  const projects = useWorkspaceCollection<WorkspaceProject>('standaloneProjects')
  const members = useWorkspaceCollection<WorkspaceMember>('standaloneProjectMembers')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')

  const visible = projects.filter(project => {
    if (!a.me) return false
    return project.createdBy === a.me.id || members.some(member =>
      member.projectId === project.id && member.userId === a.me!.id && member.status !== 'removed')
  }).sort((x, y) => (y.updatedAt || y.at) - (x.updatedAt || x.at))
  const invitedCount = visible.filter(project => members.some(member => member.projectId === project.id && member.userId === a.me?.id && member.status === 'invited')).length

  async function createProject(event: FormEvent) {
    event.preventDefault()
    if (!a.me || !a.backend) return
    const cleanTitle = title.trim()
    const cleanSummary = summary.trim()
    if (cleanTitle.length < 2 || cleanSummary.length < 8) return setError('Add a clear project name and a meaningful short brief.')
    if (isPastDateInput(dueDate)) return setError(PAST_DATE_MESSAGE)
    setBusy(true)
    setError('')
    const id = crypto.randomUUID()
    const now = Date.now()
    try {
      const project: WorkspaceProject = {
        id, title: cleanTitle.slice(0, 100), summary: cleanSummary.slice(0, 4000), status: 'active',
        createdBy: a.me.id, at: now, updatedAt: now, dueAt: dateEnd(dueDate), visibility: 'team',
      }
      await a.backend.store.create('standaloneProjects/' + id, project)
      const ownerMembership: WorkspaceMember = {
        id: id + '__' + a.me.id, projectId: id, userId: a.me.id, role: 'owner', status: 'active',
        invitedBy: a.me.id, at: now, updatedAt: now,
      }
      await a.backend.store.create('standaloneProjectMembers/' + ownerMembership.id, ownerMembership)
      emitWorkflowEvent('workspace.created', { id, title: cleanTitle, summary: cleanSummary, projectId: id, at: now })
      a.toast('Project workspace created.')
      nav('/workspaces/' + id)
    } catch (error) {
      setError(errorText(error))
      a.toast('Workspace could not be created.')
    } finally {
      setBusy(false)
    }
  }

  return <>
    <Head kicker="Independent projects" title="A place to actually build." right={<button className="btn p" type="button" onClick={() => { setCreating(v => !v); setError('') }}><QuorlythGlyph name={creating ? 'close' : 'add'} size={15} />{creating ? 'Close form' : 'Create workspace'}</button>} />
    <p className="mut sw-intro">Create a private team space that does not depend on a community idea. Invite collaborators, break the goal into tasks, connect a GitHub repository, and submit source-checked evidence before work is approved.</p>

    <section className="glass pad sw-create sw-first-work" aria-labelledby="sw-first-work-title">
      <div className="sw-section-heading"><div><p className="ql-eyebrow">START HERE</p><h3 id="sw-first-work-title">Not sure what to do first?</h3><p>Quorlyth keeps your plan, tasks, people and proof of work together. You do the actual coding, design, writing or research in the tools you already use.</p></div></div>
      <ol className="sw-first-work__steps">
        <li><strong>Set one clear goal.</strong> Say what you want to finish and who it is for.</li>
        <li><strong>Make a small task.</strong> Choose the first thing you can realistically complete.</li>
        <li><strong>Do the task in your usual tools.</strong> For example, use your code editor, Figma, or a document.</li>
        <li><strong>Submit proof of the work.</strong> Attach a GitHub link, demo, document, or file under Evidence &amp; reviews.</li>
      </ol>
      <div className="acts"><button className="btn p" type="button" onClick={() => { setCreating(true); setError('') }}><QuorlythGlyph name="add" size={15} />Start my own project</button><button className="btn" type="button" onClick={() => nav('/collaborations')}>Join a community idea <QuorlythGlyph name="arrow" size={14} /></button></div>
    </section>

    <div className="sw-principles">
      <div><span><QuorlythGlyph name="workspace" size={16} /></span><strong>One shared goal</strong><small>Brief, deadlines and assigned tasks.</small></div>
      <div><span><QuorlythGlyph name="link" size={16} /></span><strong>Evidence attached</strong><small>Real public GitHub commits and pull requests.</small></div>
      <div><span><QuorlythGlyph name="review" size={16} /></span><strong>Review before credit</strong><small>Managers approve work, not empty claims.</small></div>
    </div>

    {creating && <section className="glass pad sw-create">
      <div className="sw-section-heading"><div><p className="ql-eyebrow">NEW WORKSPACE</p><h3>Start with the outcome</h3><p>Only the owner and invited team can enter this workspace.</p></div><span className="sw-pill"><QuorlythGlyph name="lock" size={13} />Private team</span></div>
      <form onSubmit={createProject}>
        <label className="sw-field"><span>Project name</span><input value={title} onChange={e => setTitle(e.target.value)} required maxLength={100} placeholder="e.g. Creator analytics dashboard" /></label>
        <label className="sw-field"><span>What are you building?</span><textarea value={summary} onChange={e => setSummary(e.target.value)} required minLength={8} maxLength={4000} placeholder="Describe the purpose, audience and what a successful outcome looks like." rows={4} /></label>
        <label className="sw-field"><span>Target delivery <small>Optional</small></span><input type="date" min={minimumDateInput()} value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
        {error && <p className="sw-error" role="alert">{error}</p>}
        <div className="acts"><button className="btn p" disabled={busy || title.trim().length < 2 || summary.trim().length < 8}><QuorlythGlyph name="workspace" size={15} />{busy ? 'Creating…' : 'Create project space'}</button><button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button></div>
      </form>
    </section>}

    <div className="sw-list-heading"><div><p className="ql-eyebrow">YOUR PROJECT SPACES</p><h3>{visible.length} workspace{visible.length === 1 ? '' : 's'}</h3></div><span className="sw-count">{invitedCount} invitation{invitedCount === 1 ? '' : 's'} waiting</span></div>
    {!visible.length ? <section className="glass pad sw-empty"><span><QuorlythGlyph name="workspace" size={27} /></span><h3>No independent workspaces yet</h3><p>Create the first one for a side project, portfolio build, research effort, open-source contribution or product prototype.</p><button className="btn p" type="button" onClick={() => setCreating(true)}><QuorlythGlyph name="add" size={15} />Create your first workspace</button></section>
    : <div className="sw-project-list">{visible.map(project => {
      const team = members.filter(member => member.projectId === project.id && member.status === 'active')
      const currentInvite = members.find(member => member.projectId === project.id && member.userId === a.me?.id && member.status === 'invited')
      return <button type="button" className="glass pad sw-project-card" key={project.id} onClick={() => nav('/workspaces/' + project.id)}>
        <div className="sw-project-card__top"><span className="sw-mark"><QuorlythGlyph name="workspace" size={18} /></span><span className={'sw-pill' + (project.status === 'completed' ? ' is-done' : '')}>{currentInvite ? 'Invitation' : project.status === 'completed' ? 'Completed' : 'Active'}</span></div>
        <h3>{project.title}</h3><p>{project.summary}</p>
        <div className="sw-project-card__meta"><span><QuorlythGlyph name="team" size={13} />{team.length || 1} teammate{(team.length || 1) === 1 ? '' : 's'}</span><span><QuorlythGlyph name="calendar" size={13} />{project.dueAt ? localDate(project.dueAt) : 'No deadline'}</span></div>
        {project.linkedIdeaId && <small className="sw-project-card__linked"><QuorlythGlyph name="link" size={12}/>Connected to a community project</small>}
        <div className="sw-project-card__footer"><span>{project.createdBy === a.me?.id ? 'Owned by you' : 'Shared with you'}</span><span>Open workspace <QuorlythGlyph name="arrow" size={14} /></span></div>
      </button>
    })}</div>}
  </>
}

export function StandaloneWorkspaceList() {
  return <Gate><WorkspaceProjectList /></Gate>
}

export function StandaloneWorkspaceDetail() {
  return <Gate><WorkspaceProjectView /></Gate>
}

function WorkspaceProjectView() {
  const { id = '' } = useParams()
  const a = useApp()
  const nav = useNavigate()
  const projects = useWorkspaceCollection<WorkspaceProject>('standaloneProjects')
  const members = useWorkspaceCollection<WorkspaceMember>('standaloneProjectMembers')
  const tasks = useWorkspaceCollection<WorkspaceTask>('standaloneTasks')
  const artifacts = useWorkspaceCollection<WorkspaceArtifact>('standaloneArtifacts')
  const repositories = useWorkspaceCollection<GithubRepository>('standaloneGithubRepos')
  const comments = useWorkspaceCollection<WorkspaceComment>('standaloneComments')
  const activity = useWorkspaceCollection<{ id: string; projectId: string; docId?: string }>('standaloneActivity')

  const project = projects.find(item => item.id === id || item.docId === id)
  const linkedIdeaId = project?.linkedIdeaId || ''
  const linkedIdea = a.data.ideas.find(item => item.id === linkedIdeaId)
  const linkedIdeaProjectId = project?.linkedIdeaProjectId || linkedIdeaId
  const linkedIdeaProject = linkedIdeaId ? a.data.projects[linkedIdeaId] : undefined
  const linkedMilestones = a.data.milestones
    .filter(item => item.projectId === linkedIdeaProjectId || item.projectId === linkedIdeaId)
    .sort((first, second) => (first.dueAt || first.at) - (second.dueAt || second.at))
  const linkedSubmissions = a.data.workSubmissions
    .filter(item => item.ideaId === linkedIdeaId || item.projectId === linkedIdeaProjectId)
    .sort((first, second) => second.revision - first.revision || second.submittedAt - first.submittedAt)
  const team = members.filter(item => item.projectId === id && item.status === 'active')
  const invitation = members.find(item => item.projectId === id && item.userId === a.me?.id && item.status === 'invited')
  const myMembership = members.find(item => item.projectId === id && item.userId === a.me?.id && item.status === 'active')
  const isOwner = !!a.me && project?.createdBy === a.me.id
  const role = isOwner ? 'owner' : myMembership?.role
  const canManage = !!role && ['owner','manager'].includes(role)
  const canContribute = !!role && ['owner','manager','contributor'].includes(role)
  const taskAssignees = team.filter(member => member.status === 'active' && member.role !== 'viewer')
  if (a.me?.id && canManage && !taskAssignees.some(member => member.userId === a.me!.id)) {
    const now = Date.now()
    taskAssignees.unshift({
      id: id + '__' + a.me.id, projectId: id, userId: a.me.id,
      role: isOwner ? 'owner' : 'manager', status: 'active',
      invitedBy: a.me.id, at: now, updatedAt: now,
    })
  }
  taskAssignees.sort((first, second) => a.nm(first.userId).localeCompare(a.nm(second.userId)))
  const projectTasks = tasks.filter(item => item.projectId === id).sort((x,y) => (x.dueAt || Number.MAX_SAFE_INTEGER) - (y.dueAt || Number.MAX_SAFE_INTEGER) || x.at-y.at)
  const projectArtifacts = artifacts.filter(item => item.projectId === id).sort((x,y) => y.submittedAt-x.submittedAt)
  const projectRepos = repositories.filter(item => item.projectId === id).sort((x,y) => y.lastSyncedAt-x.lastSyncedAt)
  const projectComments = comments.filter(item => item.projectId === id).sort((x,y) => x.at-y.at)
  const projectActivity = activity.filter(item => item.projectId === id)
  const doneCount = projectTasks.filter(task => task.status === 'done').length
  const progress = projectTasks.length ? Math.round(doneCount / projectTasks.length * 100) : 0
  const pendingReviews = projectArtifacts.filter(item => item.status === 'submitted').length
  const [tab, setTab] = useState<WorkspaceTab>('overview')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskCriteria, setTaskCriteria] = useState('')
  const [taskAssigneeDraft, setTaskAssigneeDraft] = useState<string[]>([])
  const [taskDueDate, setTaskDueDate] = useState('')
  const [inviteUser, setInviteUser] = useState('')
  const [inviteRole, setInviteRole] = useState<'contributor'|'viewer'>('contributor')
  const [repoUrl, setRepoUrl] = useState('')
  const [repoPreview, setRepoPreview] = useState<any[]>([])
  const [artifactTask, setArtifactTask] = useState('')
  const [artifactType, setArtifactType] = useState<'github' | 'link' | 'document' | 'demo' | 'file'>('github')
  const [artifactUrl, setArtifactUrl] = useState('')
  const [artifactSummary, setArtifactSummary] = useState('')
  const [artifactFiles, setArtifactFiles] = useState<File[]>([])
  const selectedEvidenceTask = projectTasks.find(task => task.id === artifactTask)
  const selectedEvidenceAssignees = selectedEvidenceTask ? assignedTaskIds(selectedEvidenceTask) : []
  const canSubmitSelectedTaskEvidence = !!selectedEvidenceTask
    && (!selectedEvidenceAssignees.length || selectedEvidenceAssignees.includes(a.me?.id || ''))
  const [commentText, setCommentText] = useState('')
  // Keep discussion interactions consistent with the collaboration workspace panel.
  const [discussionMode, setDiscussionMode] = useState<'inline' | 'expanded' | 'minimized'>('inline')
  const [reviewNotes, setReviewNotes] = useState<Record<string,string>>({})
  const [projectTitle, setProjectTitle] = useState('')
  const [projectSummary, setProjectSummary] = useState('')
  const [projectDueDate, setProjectDueDate] = useState('')

  useEffect(() => {
    setProjectTitle(project?.title || '')
    setProjectSummary(project?.summary || '')
    setProjectDueDate(dateInput(project?.dueAt))
  }, [project?.id, project?.title, project?.summary, project?.dueAt])

  const profilePeople = useMemo(() => Object.keys(a.data.profiles || {})
    .filter(userId => userId !== a.me?.id && !members.some(member => member.projectId === id && member.userId === userId && member.status !== 'removed'))
    .map(userId => ({ id: userId, name: a.nm(userId) }))
    .filter(person => person.name && !person.name.startsWith('Member · '))
    .sort((x,y) => x.name.localeCompare(y.name)), [a.data.profiles, a.me?.id, members, id, a.nm])

  async function runAction(label: string, fn: () => Promise<void>) {
    setBusy(label); setError('')
    try { await fn() } catch (err) { setError(errorText(err)); a.toast(errorText(err)) } finally { setBusy('') }
  }

  async function acceptInvitation() {
    if (!invitation || !a.backend || !a.me) return
    await runAction('accept-invite', async () => {
      const now = Date.now()
      await a.backend!.store.update('standaloneProjectMembers/' + invitation.id, { status: 'active', updatedAt: now })
      a.toast('Project invitation accepted.')
    })
  }

  async function saveProject(event: FormEvent) {
    event.preventDefault()
    if (!project || !a.backend) return
    if (isPastDateChange(projectDueDate, dateInput(project.dueAt))) return setError(PAST_DATE_MESSAGE)
    await runAction('save-project', async () => {
      await a.backend!.store.update('standaloneProjects/' + project.id, { title: projectTitle.trim(), summary: projectSummary.trim(), dueAt: dateEnd(projectDueDate), updatedAt: Date.now() })
      a.toast('Workspace details saved.')
    })
  }

  async function addTask(event: FormEvent) {
    event.preventDefault()
    if (!project || !a.backend || !a.me) return
    if (taskTitle.trim().length < 2) return setError('Give the task a clear title.')
    if (isPastDateInput(taskDueDate)) return setError(PAST_DATE_MESSAGE)
    await runAction('add-task', async () => {
      const now = Date.now(); const taskId = crypto.randomUUID()
      const task: WorkspaceTask = {
        id: taskId, projectId: id, title: taskTitle.trim().slice(0,140), description: taskDescription.trim().slice(0,2000),
        acceptanceCriteria: taskCriteria.trim().slice(0,1000), status: 'todo', createdBy: a.me!.id, at: now, updatedAt: now,
        dueAt: dateEnd(taskDueDate), assigneeIds: [...taskAssigneeDraft], assigneeId: taskAssigneeDraft[0] || null,
      }
      await a.backend!.store.create('standaloneTasks/' + taskId, task)
      setTaskTitle(''); setTaskDescription(''); setTaskCriteria(''); setTaskAssigneeDraft([]); setTaskDueDate('')
      setTab('tasks'); a.toast('Task added to the project plan.')
    })
  }

  async function reassignTask(task: WorkspaceTask, assigneeIds: string[]) {
    if (!a.backend || !canManage || task.status === 'done') return
    if (!a.me) return setError('Sign in again before changing task assignments.')
    const nextAssigneeIds = [...new Set(assigneeIds)]
    if (nextAssigneeIds.some(assigneeId => !taskAssignees.some(member => member.userId === assigneeId))) {
      setError('Tasks can only be assigned to active workspace owners, managers, or contributors. Read-only viewers cannot own work.')
      return
    }
    const currentAssigneeIds = assignedTaskIds(task)
    if (currentAssigneeIds.length === nextAssigneeIds.length && currentAssigneeIds.every(uid => nextAssigneeIds.includes(uid))) return
    await runAction('assign-' + task.id, async () => {
      await a.backend!.store.update('standaloneTasks/' + (task.docId || task.id), {
        assigneeIds: nextAssigneeIds,
        assigneeId: nextAssigneeIds[0] || null,
        updatedAt: Date.now(),
      })
      a.toast(nextAssigneeIds.length
        ? 'Task assigned to ' + nextAssigneeIds.length + ' teammate' + (nextAssigneeIds.length === 1 ? '' : 's') + '.'
        : 'Task returned to the unassigned queue.')
    })
  }

  async function startTask(task: WorkspaceTask) {
    if (!a.backend || !a.me) return
    const assignedUsers = assignedTaskIds(task)
    if (assignedUsers.length && !assignedUsers.includes(a.me.id)) {
      setError('Only a teammate assigned to this task can start it. Ask the project manager to add you to the assignees.')
      return
    }
    await runAction('start-'+task.id, async () => {
      const currentAssignees = assignedTaskIds(task)
      await a.backend!.store.update('standaloneTasks/' + task.id, {
        status: 'in_progress',
        ...(!currentAssignees.length ? { assigneeId: a.me!.id, assigneeIds: [a.me!.id] } : {}),
        updatedAt: Date.now(),
      })
      a.toast('Task started.')
    })
  }

  async function completeTask(task: WorkspaceTask) {
    if (!a.backend) return
    await runAction('complete-'+task.id, async () => {
      const completedAt = Date.now()
      await a.backend!.store.update('standaloneTasks/' + task.id, { status: 'done', updatedAt: completedAt })
      emitWorkflowEvent('task.completed', { id: task.id, taskId: task.id, projectId: id, title: task.title, summary: task.description, at: completedAt })
      a.toast('Task completed with approved evidence.')
    })
  }

  async function removeTask(task: WorkspaceTask) {
    if (!project || !a.backend || !canManage) return
    const linkedArtifacts = projectArtifacts.filter(artifact => artifact.taskId === task.id)
    const attachments = linkedArtifacts.flatMap(artifact => artifact.attachments || [])
    if (!window.confirm(`Delete "${task.title}" permanently? This also removes ${linkedArtifacts.length} linked evidence item${linkedArtifacts.length === 1 ? '' : 's'} and ${attachments.length} attached private file${attachments.length === 1 ? '' : 's'}. This cannot be undone.`)) return

    await runAction('delete-' + task.id, async () => {
      let failedFileCleanup = 0
      for (const attachment of attachments) {
        try {
          if (!a.backend?.deleteWorkFile) throw new Error('Private file deletion is not configured.')
          await a.backend.deleteWorkFile(attachment.path)
        } catch (error) {
          failedFileCleanup += 1
          console.warn('A private task attachment could not be removed:', error)
        }
      }
      for (const artifact of linkedArtifacts) await a.backend!.store.delete('standaloneArtifacts/' + artifact.id)
      await a.backend!.store.delete('standaloneTasks/' + task.id)
      a.toast(failedFileCleanup
        ? 'Task and evidence deleted. Some private attachments could not be removed.'
        : 'Task and linked evidence deleted.')
    })
  }


  async function removeWorkspace() {
    if (!project || !a.backend || !isOwner) return
    const projectMembers = members.filter(member => member.projectId === id)
    const linkedAttachments = projectArtifacts.flatMap(artifact => artifact.attachments || [])
    const confirmed = window.confirm(
      `Permanently delete "${project.title}"? This removes ${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'}, ${projectArtifacts.length} evidence item${projectArtifacts.length === 1 ? '' : 's'}, ${projectMembers.length} team membership${projectMembers.length === 1 ? '' : 's'}, ${projectComments.length} comment${projectComments.length === 1 ? '' : 's'}, and ${linkedAttachments.length} private file attachment${linkedAttachments.length === 1 ? '' : 's'}. This cannot be undone.`
    )
    if (!confirmed) return

    await runAction('delete-workspace', async () => {
      let failedFileCleanup = 0
      for (const attachment of linkedAttachments) {
        try {
          if (!a.backend?.deleteWorkFile) throw new Error('Private file deletion is not configured.')
          await a.backend.deleteWorkFile(attachment.path)
        } catch (error) {
          failedFileCleanup += 1
          console.warn('A private workspace attachment could not be removed:', error)
        }
      }

      for (const artifact of projectArtifacts) await a.backend!.store.delete('standaloneArtifacts/' + artifact.id)
      for (const task of projectTasks) await a.backend!.store.delete('standaloneTasks/' + task.id)
      for (const comment of projectComments) await a.backend!.store.delete('standaloneComments/' + comment.id)
      for (const repo of projectRepos) await a.backend!.store.delete('standaloneGithubRepos/' + repo.id)
      for (const item of projectActivity) await a.backend!.store.delete('standaloneActivity/' + item.id)
      for (const member of projectMembers) await a.backend!.store.delete('standaloneProjectMembers/' + member.id)
      await a.backend!.store.delete('standaloneProjects/' + project.id)

      a.toast(failedFileCleanup
        ? 'Workspace deleted. Some private attachments could not be removed.'
        : 'Workspace and all linked project records deleted.')
      nav('/workspaces')
    })
  }
  async function toggleProjectStatus() {
    if (!project || !a.backend) return
    const next = project.status === 'completed' ? 'active' : 'completed'
    await runAction('project-status', async () => {
      await a.backend!.store.update('standaloneProjects/' + id, { status: next, updatedAt: Date.now() })
      a.toast(next === 'completed' ? 'Workspace closed.' : 'Workspace reopened.')
    })
  }

  async function updateMemberRole(member: WorkspaceMember, nextRole: 'manager' | 'contributor' | 'viewer') {
    if (!a.backend || !project || !canManage || project.status !== 'active' || member.role === 'owner' || member.userId === a.me?.id) return
    if (nextRole === 'manager' && !isOwner) {
      setError('Only the workspace owner can grant manager permissions.')
      return
    }
    if (nextRole === member.role) return
    await runAction('role-' + member.userId, async () => {
      await a.backend!.store.update('standaloneProjectMembers/' + (member.docId || member.id), {
        role: nextRole,
        updatedAt: Date.now(),
      })
      a.toast(nextRole === 'viewer'
        ? a.nm(member.userId) + ' now has read-only access.'
        : a.nm(member.userId) + ' can now be assigned workspace tasks.')
    })
  }

  async function inviteMember(event: FormEvent) {
    event.preventDefault()
    if (!project || !a.backend || !a.me || !inviteUser) return
    if (!canManage || project.status !== 'active') {
      setError('Only an active workspace owner or manager can invite teammates.')
      return
    }
    const person = profilePeople.find(item => item.id === inviteUser)
    if (!person) {
      setError('That account is no longer available in the member list. Refresh the workspace and choose a current Quorlyth profile.')
      return
    }
    const existing = members.find(member => member.projectId === id && member.userId === inviteUser)
    if (existing?.status === 'active') {
      setInviteUser('')
      a.toast('This person is already an active workspace member.')
      return
    }
    if (existing?.status === 'invited') {
      setInviteUser('')
      a.toast('An invitation is already pending for this account. They can accept it from the workspace.')
      return
    }
    await runAction('invite-' + inviteUser, async () => {
      const now = Date.now()
      if (existing?.status === 'removed') {
        // Membership IDs are deterministic. Reactivate the old row rather than INSERTing
        // a duplicate primary key; the original role/inviter remain immutable under RLS.
        await a.backend!.store.update('standaloneProjectMembers/' + (existing.docId || existing.id), {
          status: 'invited',
          updatedAt: now,
        })
        setInviteUser('')
        a.toast('Workspace invitation re-sent. The teammate must accept it before access is restored.')
        return
      }
      const member: WorkspaceMember = {
        id: id + '__' + inviteUser, projectId: id, userId: inviteUser, role: inviteRole, status: 'invited',
        invitedBy: a.me!.id, at: now, updatedAt: now,
      }
      await a.backend!.store.create('standaloneProjectMembers/' + member.id, member)
      setInviteUser('')
      a.toast('Workspace invitation sent. The teammate must accept it before entering the workspace.')
    })
  }

  async function connectRepository(event: FormEvent) {
    event.preventDefault()
    if (!repoUrl.trim()) return setError('Paste a GitHub repository URL first.')
    await runAction('connect-github', async () => {
      const response = await githubAction(a, 'connect_repository', id, { repositoryUrl: repoUrl.trim() })
      setRepoPreview(Array.isArray(response.commits) ? response.commits : [])
      setRepoUrl('')
      a.toast('GitHub repository connected and checked.')
    })
  }

  async function submitEvidence(event: FormEvent) {
    event.preventDefault()
    if (!artifactTask) return setError('Choose the task this evidence supports.')
    if (!a.me) return setError('Sign in before submitting evidence.')
    const evidenceTask = projectTasks.find(task => task.id === artifactTask)
    if (!evidenceTask) return setError('This task is no longer available. Refresh and choose it again.')
    const evidenceAssignees = assignedTaskIds(evidenceTask)
    if (evidenceAssignees.length && !evidenceAssignees.includes(a.me.id)) {
      return setError('This task is assigned to other teammates. Only an assigned teammate can submit evidence for review.')
    }
    if (artifactType === 'file' ? artifactFiles.length === 0 : !artifactUrl.trim()) {
      return setError(artifactType === 'file' ? 'Attach at least one file.' : 'Add an evidence link.')
    }
    if (artifactType !== 'github' && artifactSummary.trim().length < 8) {
      return setError('Describe what this evidence demonstrates in at least 8 characters.')
    }
    if (artifactType === 'link' || artifactType === 'document' || artifactType === 'demo') {
      try {
        const candidate = new URL(artifactUrl.trim())
        if (candidate.protocol !== 'https:' || candidate.username || candidate.password) {
          return setError('Use a secure HTTPS link without embedded credentials.')
        }
      } catch {
        return setError('Enter a valid HTTPS evidence link.')
      }
    }

    const action = artifactType === 'github' ? 'verify-github' : artifactType === 'file' ? 'upload-files' : 'submit-link'
    await runAction(action, async () => {
      if (!a.backend || !a.me) throw new Error('Sign in again before submitting project evidence.')
      if (artifactType === 'github') {
        await githubAction(a, 'verify_artifact', id, { taskId: artifactTask, artifactUrl: artifactUrl.trim() })
        a.toast('GitHub source verified. A project manager must review it before the task can be completed.')
      } else {
        const now = Date.now()
        const artifactId = crypto.randomUUID()
        const attachments: WorkspaceAttachment[] = []
        try {
          if (artifactType === 'file') {
            if (!a.backend.uploadWorkFile) throw new Error('Private file uploads are not configured for this session.')
            if (artifactFiles.length > 8) throw new Error('Attach no more than 8 files per submission.')
            for (const file of artifactFiles) {
              if (file.size > 25 * 1024 * 1024) throw new Error('Each file must be 25 MB or smaller.')
              const filePath = await a.backend.uploadWorkFile(id, artifactTask, file)
              attachments.push({
                path: filePath,
                name: file.name.replace(/[\\/]/g, '_').slice(0, 180) || 'attachment',
                mimeType: file.type || 'application/octet-stream',
                size: file.size,
                uploadedAt: Date.now(),
              })
            }
          }
          const kind = artifactType
          const record: WorkspaceArtifact = {
            id: artifactId, projectId: id, taskId: artifactTask, provider: 'manual', kind,
            ...(artifactType === 'file' ? { attachments } : { url: artifactUrl.trim() }),
            summary: artifactSummary.trim().slice(0, 1200),
            status: 'submitted', verificationStatus: 'submitted_evidence',
            submittedBy: a.me.id, submittedAt: now, updatedAt: now,
            sourceMetadata: { source: artifactType === 'file' ? 'private_file_upload' : 'user_submitted_link', submittedAt: now },
          }
          await a.backend.store.create('standaloneArtifacts/' + artifactId, record)
          a.toast(artifactType === 'file'
            ? 'Private files submitted. A manager must review them before the task can be completed.'
            : 'Evidence link submitted. It is not source-verified; a manager can review it.')
        } catch (error) {
          if (a.backend.deleteWorkFile) {
            await Promise.all(attachments.map(file => a.backend!.deleteWorkFile!(file.path).catch(() => undefined)))
          }
          throw error
        }
      }
      setArtifactUrl('')
      setArtifactSummary('')
      setArtifactFiles([])
      setTab('evidence')
    })
  }

  async function reviewArtifact(artifact: WorkspaceArtifact, status: 'approved'|'changes_requested') {
    if (!a.backend || !a.me) return
    const note = (reviewNotes[artifact.id] || '').trim()
    if (status === 'changes_requested' && note.length < 4) return setError('Explain what the contributor needs to change.')
    await runAction('review-'+artifact.id, async () => {
      const now = Date.now()
      await a.backend!.store.update('standaloneArtifacts/' + artifact.id, {
        status, reviewNote: note, reviewedAt: now, reviewedBy: a.me!.id, updatedAt: now,
      })
      a.toast(status === 'approved' ? 'Evidence approved. The task can now be marked complete.' : 'Changes requested from the contributor.')
    })
  }

  async function postComment(event: FormEvent) {
    event.preventDefault()
    if (!a.backend || !a.me || commentText.trim().length < 1) return
    await runAction('comment', async () => {
      const now = Date.now(); const commentId = crypto.randomUUID()
      const comment: WorkspaceComment = { id: commentId, projectId: id, authorId: a.me!.id, text: commentText.trim().slice(0,3000), at: now }
      await a.backend!.store.create('standaloneComments/' + commentId, comment)
      setCommentText('')
    })
  }

  if (!project) {
    return <div className="glass cent sw-empty"><span><QuorlythGlyph name="workspace" size={28} /></span><h3>Workspace not found</h3><p>This project may have been removed, or your invitation has not been accepted by the workspace owner.</p><button type="button" className="btn" onClick={() => nav('/workspaces')}><QuorlythGlyph name="back" size={14} />All workspaces</button></div>
  }

  if (invitation) {
    return <div className="sw-invite-shell"><Head kicker="Project invitation" title={project.title} /><section className="glass pad sw-invite-card"><span className="sw-pill"><QuorlythGlyph name="invite" size={14} />Waiting for your response</span><p>{project.summary}</p><p className="sw-muted">Invited by {a.nm(invitation.invitedBy)} as a {invitation.role}. Accept to access tasks, evidence and the team room.</p><button type="button" className="btn p" disabled={busy==='accept-invite'} onClick={() => void acceptInvitation()}><QuorlythGlyph name="check" size={15} />{busy==='accept-invite' ? 'Accepting…' : 'Accept invitation'}</button>{error && <p className="sw-error">{error}</p>}</section></div>
  }

  if (!role) return <div className="glass cent sw-empty"><span><QuorlythGlyph name="lock" size={28} /></span><h3>Private workspace</h3><p>Only active team members can open this project.</p><button type="button" className="btn" onClick={() => nav('/workspaces')}>Back to workspaces</button></div>

  return <>
    <div className="sw-back-row"><button type="button" className="chip" onClick={() => nav('/workspaces')}><QuorlythGlyph name="back" size={14} />All workspaces</button><span className="sw-pill"><QuorlythGlyph name="lock" size={13} />Private project</span></div>
    <Head kicker="Standalone project workspace" title={project.title} right={<span className={'sw-pill'+(project.status==='completed'?' is-done':'')}>{project.status === 'completed' ? 'Completed' : 'Active'}</span>} />
    {project.linkedIdeaId && <section className="sw-linked-project-banner" aria-label="Connected community project">
      <span className="sw-linked-project-banner__mark"><QuorlythGlyph name="link" size={17}/></span>
      <div className="sw-linked-project-banner__copy">
        <p className="ql-eyebrow">CONNECTED COMMUNITY PROJECT</p>
        <h3>{linkedIdea?.title || 'Linked collaboration project'}</h3>
        <p>This workspace and the project's milestone submissions are connected. Evidence is shown from its original record, not copied into a fake duplicate.</p>
        <div className="sw-linked-project-banner__stats">
          <span><strong>{linkedMilestones.length}</strong> milestone{linkedMilestones.length===1?'':'s'}</span>
          <span><strong>{linkedSubmissions.length}</strong> submission{linkedSubmissions.length===1?'':'s'} visible</span>
          {linkedIdeaProject && <span><strong>{linkedIdeaProject.status==='completed'?'Closed':'Active'}</strong> project status</span>}
        </div>
      </div>
      <button type="button" className="btn" onClick={() => nav('/projects?idea=' + encodeURIComponent(project.linkedIdeaId || ''))}>Open project page <QuorlythGlyph name="arrow" size={13}/></button>
    </section>}
    <section className="sw-workspace-shell">
      <div className="sw-workspace-summary">
        <div className="sw-workspace-summary__copy"><p className="ql-eyebrow">PROJECT BRIEF</p><p>{project.summary}</p>{project.dueAt && <small><QuorlythGlyph name="calendar" size={13} />Target delivery · {localDate(project.dueAt)}</small>}</div>
        <div className="sw-workspace-pulse"><p className="ql-eyebrow">DELIVERY PULSE</p><div className="sw-progress-number"><strong>{progress}%</strong><span>{doneCount} of {projectTasks.length} tasks approved complete</span></div><div className="sw-progress-track"><i style={{width:progress+'%'}} /></div><div className="sw-pulse-stats"><span><strong>{projectTasks.length}</strong>Tasks</span><span><strong>{pendingReviews}</strong>Awaiting review</span><span><strong>{projectRepos.length}</strong>GitHub repos</span></div></div>
      </div>
      <div className="sw-tabs" role="tablist" aria-label="Standalone project sections">
        <button role="tab" type="button" aria-selected={tab==='overview'} className={tab==='overview'?'is-active':''} onClick={() => setTab('overview')}><QuorlythGlyph name="workspace" size={15} />Overview</button>
        <button role="tab" type="button" aria-selected={tab==='tasks'} className={tab==='tasks'?'is-active':''} onClick={() => setTab('tasks')}><QuorlythGlyph name="milestone" size={15} />Tasks <small>{projectTasks.length}</small></button>
        <button role="tab" type="button" aria-selected={tab==='evidence'} className={tab==='evidence'?'is-active':''} onClick={() => setTab('evidence')}><QuorlythGlyph name="review" size={15} />Evidence & reviews <small>{projectArtifacts.length}</small></button>
        <button role="tab" type="button" aria-selected={tab==='team'} className={tab==='team'?'is-active':''} onClick={() => setTab('team')}><QuorlythGlyph name="team" size={15} />Team room <small>{team.length}</small></button>
      </div>
    </section>

    {error && <div className="sw-error-banner" role="alert"><QuorlythGlyph name="alert" size={15} />{error}<button className="chip" type="button" onClick={() => setError('')}>Dismiss</button></div>}

    {tab === 'overview' && <section className="sw-two-column">
      <div className="glass pad sw-panel"><div className="sw-section-heading"><div><p className="ql-eyebrow">BUILD PLAN</p><h3>Next, make it actionable</h3><p>Give each outcome an owner and a definition of done.</p></div></div>
        {projectTasks.length ? <div className="sw-mini-task-list">{projectTasks.slice(0,5).map(task => <button className="sw-mini-task" key={task.id} type="button" onClick={() => setTab('tasks')}><span className={'sw-task-check '+(task.status==='done'?'is-done':'')}>{task.status==='done'?<QuorlythGlyph name="check" size={13}/>:null}</span><span><strong>{task.title}</strong><small>{assignedTaskIds(task).length ? 'Assigned to ' + assignedTaskIds(task).length + ': ' + assignedTaskIds(task).map(uid => a.nm(uid)).join(', ') : 'Unassigned'} · {task.status === 'todo' ? 'Queued' : task.status === 'in_progress' ? 'In progress' : 'Approved complete'}</small></span><QuorlythGlyph name="arrow" size={14}/></button>)}</div> : <div className="sw-empty-inline"><QuorlythGlyph name="milestone" size={21}/><strong>No tasks yet</strong><p>Break the project into manageable outcomes. Each task should define what done means.</p>{canManage && <button className="btn p" type="button" onClick={() => setTab('tasks')}><QuorlythGlyph name="add" size={14}/>Create first task</button>}</div>}
      </div>
      <div className="glass pad sw-panel"><div className="sw-section-heading"><div><p className="ql-eyebrow">SOURCE OF TRUTH</p><h3>Connected GitHub</h3><p>Repository metadata is fetched from GitHub’s public API.</p></div></div>
        {projectRepos.length ? projectRepos.map(repo => <div className="sw-repo-row" key={repo.id}><span className="sw-repo-mark"><QuorlythGlyph name="link" size={17}/></span><div><a href={repo.htmlUrl} target="_blank" rel="noreferrer">{repo.fullName} <QuorlythGlyph name="open" size={12}/></a><small>{repo.defaultBranch ? 'Default branch · '+repo.defaultBranch : 'Public repository'} · {repo.stars} stars</small><small>Last checked {localDate(repo.lastSyncedAt)}</small></div><span className="sw-verified"><QuorlythGlyph name="check" size={12}/>Connected</span></div>) : <div className="sw-empty-inline"><QuorlythGlyph name="link" size={21}/><strong>No repository connected</strong><p>Connect a public GitHub repository to source-check commits and pull requests. Other deliverable links can also be submitted for human review.</p></div>}
        {canManage && <button type="button" className="btn p" onClick={() => setTab('evidence')}><QuorlythGlyph name="link" size={14}/>{projectRepos.length ? 'Manage GitHub evidence' : 'Connect GitHub'}</button>}
      </div>
    </section>}

    {tab === 'tasks' && <section className="glass pad sw-panel">
      <div className="sw-section-heading"><div><p className="ql-eyebrow">EXECUTION PLAN</p><h3>Tasks and deliverables</h3><p>Completion stays locked until submitted evidence or a GitHub source record has been reviewed and approved.</p></div><span className="sw-count">{doneCount}/{projectTasks.length} complete</span></div>
      {canManage && project.status==='active' && <form className="sw-task-form" onSubmit={addTask}>
        <p className="ql-eyebrow">ADD A TASK</p>
        <label className="sw-field"><span>Task title</span><input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} required maxLength={140} placeholder="What concrete result should be delivered?" /></label>
        <label className="sw-field"><span>Details <small>Optional</small></span><textarea value={taskDescription} onChange={e=>setTaskDescription(e.target.value)} maxLength={2000} rows={2} placeholder="Scope, approach or links the contributor needs." /></label>
        <label className="sw-field"><span>Definition of done</span><textarea value={taskCriteria} onChange={e=>setTaskCriteria(e.target.value)} maxLength={1000} rows={2} placeholder="Which behaviour, tests or changes must the evidence demonstrate?" /></label>
        <div className="sw-form-row">
          <div className="sw-field sw-assignee-picker">
            <span>Assign to everyone you select</span>
            <div className="sw-assignee-picker__actions">
              <button type="button" className="sw-link-button" onClick={() => setTaskAssigneeDraft(taskAssignees.map(member => member.userId))}>Select everyone ({taskAssignees.length})</button>
              <button type="button" className="sw-link-button" onClick={() => setTaskAssigneeDraft([])}>Clear selection</button>
            </div>
            <div className="sw-assignee-picker__list">
              {taskAssignees.map(member => <label className="sw-assignee-option" key={member.userId}>
                <input type="checkbox" checked={taskAssigneeDraft.includes(member.userId)} onChange={e => setTaskAssigneeDraft(current => e.target.checked ? [...new Set([...current, member.userId])] : current.filter(uid => uid !== member.userId))} />
                <span>{a.nm(member.userId)}<small>{member.role}{member.userId===a.me?.id?' · You':''}</small></span>
              </label>)}
            </div>
            <small className="sw-muted">{taskAssigneeDraft.length} selected · viewers are read-only and cannot be assigned work.</small>
          </div>
          <label className="sw-field"><span>Due date</span><input type="date" min={minimumDateInput()} value={taskDueDate} onChange={e=>setTaskDueDate(e.target.value)} /></label>
        </div>
        <button className="btn p" disabled={busy==='add-task'||taskTitle.trim().length<2}><QuorlythGlyph name="add" size={14}/>{busy==='add-task'?'Adding…':'Add task'}</button>
      </form>}
      {!projectTasks.length ? <div className="sw-empty-inline"><QuorlythGlyph name="milestone" size={22}/><strong>Nothing planned yet</strong><p>Start by adding a task with clear acceptance criteria.</p></div> : <div className="sw-task-list">{projectTasks.map(task => {
        const taskEvidence = projectArtifacts.filter(artifact => artifact.taskId===task.id)
        const approved = taskEvidence.filter(artifact=>artifact.status==='approved'&&((artifact.provider==='github'&&artifact.verificationStatus==='source_verified')||(artifact.provider==='manual'&&artifact.verificationStatus==='submitted_evidence'))).length
        const currentAssignee = assignedTaskIds(task).includes(a.me?.id || '')
        return <article className="sw-task" key={task.id}>
          <div className="sw-task__top"><span className={'sw-task-check '+(task.status==='done'?'is-done':'')}>{task.status==='done'?<QuorlythGlyph name="check" size={14}/>:null}</span><div className="sw-task__title"><p className="ql-eyebrow">{task.status==='todo'?'QUEUED':task.status==='in_progress'?'IN PROGRESS':'APPROVED COMPLETE'}</p><h4>{task.title}</h4></div><span className={'sw-task-status '+(task.status==='done'?'is-done':'')}>{task.status==='done'?'Complete':task.status==='in_progress'?'Active':'Open'}</span></div>
          {task.description && <p className="sw-task__description">{task.description}</p>}
          {task.acceptanceCriteria && <div className="sw-criteria"><span><QuorlythGlyph name="check" size={14}/></span><div><strong>Definition of done</strong><p>{task.acceptanceCriteria}</p></div></div>}
          <div className="sw-task__meta"><span><QuorlythGlyph name="person" size={13}/>{assignedTaskIds(task).length ? assignedTaskIds(task).length + ' assigned · ' + assignedTaskIds(task).map(uid => a.nm(uid)).join(', ') : 'Unassigned'}</span><span><QuorlythGlyph name="calendar" size={13}/>{task.dueAt?localDate(task.dueAt):'No deadline'}</span><button type="button" className="sw-link-button" onClick={()=>{setArtifactTask(task.id);setTab('evidence')}}><QuorlythGlyph name="link" size={13}/>{taskEvidence.length} evidence item{taskEvidence.length===1?'':'s'}</button></div>
          {canManage && project.status==='active' && task.status!=='done' && <details className="sw-task-reassign">
            <summary>{'Assign to teammates · ' + (assignedTaskIds(task).length || 'none') + ' selected'}</summary>
            <div className="sw-assignee-picker__actions">
              <button type="button" className="sw-link-button" disabled={busy==='assign-'+task.id} onClick={() => void reassignTask(task, taskAssignees.map(member => member.userId))}>Select everyone</button>
              <button type="button" className="sw-link-button" disabled={busy==='assign-'+task.id} onClick={() => void reassignTask(task, [])}>Clear</button>
            </div>
            <div className="sw-assignee-picker__list">
              {[
                ...taskAssignees,
                ...assignedTaskIds(task).filter(uid => !taskAssignees.some(member => member.userId === uid)).map(uid => ({ id: uid, projectId: id, userId: uid, role: 'viewer' as const, status: 'removed' as const, invitedBy: '', at: 0, updatedAt: 0 })),
              ].map(member => {
                const assignedIds = assignedTaskIds(task)
                const checked = assignedIds.includes(member.userId)
                const eligible = taskAssignees.some(candidate => candidate.userId === member.userId)
                return <label className="sw-assignee-option" key={member.userId}>
                  <input type="checkbox" checked={checked} disabled={busy==='assign-'+task.id || (!eligible && !checked)} onChange={e => {
                    const next = e.target.checked ? [...assignedIds, member.userId] : assignedIds.filter(uid => uid !== member.userId)
                    void reassignTask(task, next)
                  }} />
                  <span>{a.nm(member.userId)}<small>{eligible ? member.role : 'no longer eligible'}</small></span>
                </label>
              })}
            </div>
          </details>}
          <div className="sw-task__actions">{canContribute && project.status==='active' && task.status==='todo' && (currentAssignee||!assignedTaskIds(task).length) && <button className="btn" type="button" disabled={busy==='start-'+task.id} onClick={()=>void startTask(task)}><QuorlythGlyph name="start" size={14}/>Start task</button>}{canManage&&project.status==='active'&&task.status!=='done'&&<button className="btn p" type="button" disabled={busy==='complete-'+task.id||approved===0} title={approved?'Complete with approved GitHub evidence':'A manager must approve evidence first'} onClick={()=>void completeTask(task)}><QuorlythGlyph name="complete" size={14}/>{busy==='complete-'+task.id?'Checking…':'Mark complete'}{approved===0?' · evidence needed':''}</button>}{task.status==='done'&&<span className="sw-verified"><QuorlythGlyph name="check" size={12}/>Evidence approved</span>}{canManage&&<button className="btn sw-danger-button" type="button" disabled={busy==='delete-'+task.id} onClick={()=>void removeTask(task)}><QuorlythGlyph name="trash" size={14}/>{busy==='delete-'+task.id?'Deleting…':'Delete task'}</button>}</div>
        </article>
      })}</div>}
    </section>}

    {tab === 'evidence' && <div className="sw-evidence-layout">
      {project.linkedIdeaId && <section className="glass pad sw-panel sw-linked-evidence">
        <div className="sw-section-heading"><div><p className="ql-eyebrow">CONNECTED PROJECT RECORDS</p><h3>Milestone submissions</h3><p>Submissions uploaded on the community project page appear here from the original, permission-checked record.</p></div><span className="sw-count">{linkedSubmissions.length}</span></div>
        {linkedSubmissions.length
          ? <div className="sw-linked-submission-list">{linkedSubmissions.slice(0, 8).map(submission => {
              const milestone = linkedMilestones.find(item => item.id === submission.milestoneId)
              return <LinkedWorkSubmissionCard key={submission.id} submission={submission} milestoneTitle={milestone?.title || 'Project milestone'} ideaId={project.linkedIdeaId || ''}/>
            })}</div>
          : <div className="sw-empty-inline"><QuorlythGlyph name="review" size={21}/><strong>No linked milestone submissions are visible yet</strong><p>Submit work under a milestone on the Project page. If you do not have access to that project, its private submissions will not be exposed through this workspace.</p><button type="button" className="btn" onClick={() => nav('/projects?idea=' + encodeURIComponent(project.linkedIdeaId || ''))}>Open project milestones</button></div>}
      </section>}
      <section className="glass pad sw-panel"><div className="sw-section-heading"><div><p className="ql-eyebrow">GITHUB CONNECTION</p><h3>Connect a repository</h3><p>Phase 1 checks public repositories, commits and pull requests directly against GitHub’s API. Private repository OAuth is not enabled in this release.</p></div></div>
        {canManage&&project.status==='active'&&<form className="sw-inline-form" onSubmit={connectRepository}><label className="sw-field"><span>Public repository URL</span><input type="url" required value={repoUrl} onChange={e=>setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repository" /></label><button className="btn p" disabled={busy==='connect-github'}><QuorlythGlyph name="link" size={14}/>{busy==='connect-github'?'Checking GitHub…':'Connect repository'}</button></form>}
        {projectRepos.map(repo=><div className="sw-repo-row" key={repo.id}><span className="sw-repo-mark"><QuorlythGlyph name="link" size={17}/></span><div><a href={repo.htmlUrl} target="_blank" rel="noreferrer">{repo.fullName} <QuorlythGlyph name="open" size={12}/></a><small>{repo.description||'No repository description'} </small><small>{repo.defaultBranch||'Default branch not reported'} · {repo.stars} stars · {repo.openIssues} open issues</small></div><span className="sw-verified"><QuorlythGlyph name="check" size={12}/>API checked</span></div>)}
        {repoPreview.length>0&&<div className="sw-recent-commits"><p className="ql-eyebrow">RECENT SOURCE ACTIVITY</p>{repoPreview.map(commit=><a className="sw-commit-preview" href={commit.url} target="_blank" rel="noreferrer" key={commit.sha}><code>{commit.shortSha}</code><span><strong>{commit.message||'Commit'}</strong><small>{commit.authorLogin?'@'+commit.authorLogin:commit.authorName||'Author not attributed'}{commit.date?' · '+new Date(commit.date).toLocaleDateString():''}</small></span><QuorlythGlyph name="open" size={13}/></a>)}</div>}
      </section>
      <section className="glass pad sw-panel"><div className="sw-section-heading"><div><p className="ql-eyebrow">SUBMIT WORK EVIDENCE</p><h3>Attach a deliverable</h3><p>GitHub source records are checked by the API. Other links remain clearly marked as contributor-submitted until a manager reviews them.</p></div></div>
        <form className="sw-artifact-form" onSubmit={submitEvidence}>
          <label className="sw-field"><span>Which task does this support?</span><select required value={artifactTask} onChange={e=>setArtifactTask(e.target.value)}><option value="">Choose a task</option>{projectTasks.filter(task=>task.status!=='done').map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <label className="sw-field"><span>Evidence type</span><select value={artifactType} onChange={e=>setArtifactType(e.target.value as 'github'|'link'|'document'|'demo'|'file')}><option value="github">GitHub commit or pull request · API checked</option><option value="file">Private file attachments · manager review</option><option value="demo">Demo or prototype link · manager review</option><option value="document">Document or report link · manager review</option><option value="link">Other project deliverable link · manager review</option></select></label>
          {artifactType==='file'
            ? <label className="sw-field"><span>Private evidence files</span><input type="file" required multiple accept="image/*,video/*,audio/*,application/pdf,text/plain,text/markdown,text/csv,application/json,application/zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={e=>setArtifactFiles(Array.from(e.currentTarget.files || []).slice(0,8))}/><small className="sw-muted">Up to 8 files · 25 MB each · private to this workspace</small>{artifactFiles.length>0&&<span className="sw-selected-files">{artifactFiles.map(file=>file.name).join(' · ')}</span>}</label>
            : <label className="sw-field"><span>{artifactType==='github'?'GitHub commit or pull request URL':'HTTPS evidence URL'}</span><input required type="url" value={artifactUrl} onChange={e=>setArtifactUrl(e.target.value)} placeholder={artifactType==='github'?'https://github.com/owner/repo/pull/42':'https://…'} /></label>}
          {artifactType!=='github'&&<label className="sw-field"><span>What does this evidence demonstrate?</span><textarea required rows={3} minLength={8} maxLength={1200} value={artifactSummary} onChange={e=>setArtifactSummary(e.target.value)} placeholder="Explain what the reviewer should look for and how it meets the task criteria." /></label>}
          <p className="sw-muted">{artifactType==='github'?'GitHub checks the connected public repository and source record. This confirms the record exists, not that its author owns the Quorlyth account.':artifactType==='file'?'These files are privately uploaded and are not independently source-verified. A manager must open them, compare them with the acceptance criteria and approve them before the task can be completed.':'This link is contributor-submitted evidence, not source-verified. A manager must open it, compare it with the acceptance criteria and approve it before the task can be completed.'}</p>
          {selectedEvidenceTask && selectedEvidenceAssignees.length > 0 && !canSubmitSelectedTaskEvidence && <p className="sw-error-banner" role="status">This task is assigned to {selectedEvidenceAssignees.map(uid => a.nm(uid)).join(', ')}. Only the assigned teammates can submit evidence for review.</p>}
          <button className="btn p" disabled={(artifactType==='github'&&(!projectRepos.length||busy==='verify-github'))||(artifactType==='file'&&(artifactFiles.length===0||busy==='upload-files'))||((artifactType==='link'||artifactType==='document'||artifactType==='demo')&&busy==='submit-link')||!canContribute||project.status!=='active'||!canSubmitSelectedTaskEvidence}><QuorlythGlyph name="check" size={14}/>{busy==='verify-github'?'Checking GitHub…':busy==='upload-files'?'Uploading…':busy==='submit-link'?'Submitting…':artifactType==='github'?'Verify source and submit':artifactType==='file'?'Upload private files':'Submit evidence for review'}</button>
        </form>
      </section>
      <section className="glass pad sw-panel sw-evidence-register"><div className="sw-section-heading"><div><p className="ql-eyebrow">DELIVERABLE REGISTER</p><h3>Evidence and reviews</h3><p>GitHub source verification and human review are separate. External demo and document links stay marked as unverified until an authorised manager reviews them.</p></div><span className="sw-count">{projectArtifacts.length} records</span></div>
        {projectArtifacts.length===0?<div className="sw-empty-inline"><QuorlythGlyph name="review" size={22}/><strong>No evidence submitted yet</strong><p>Connect GitHub for source-checked commits and pull requests, or submit a demo, document or deliverable link for human review.</p></div>:<div className="sw-artifact-list">{projectArtifacts.map(artifact=>{
          const meta=artifact.sourceMetadata||{}
          const statusLabel=artifact.status==='approved'?'Approved':artifact.status==='changes_requested'?'Changes requested':'Awaiting review'
          return <article className="sw-artifact" key={artifact.id}>
            <div className="sw-artifact__top"><span className="sw-repo-mark"><QuorlythGlyph name="link" size={17}/></span><div className="sw-artifact__identity"><p className="ql-eyebrow">{artifact.provider==='github'?(artifact.kind==='pull_request'?'PULL REQUEST':'COMMIT'):(artifact.kind==='file'?'FILE SUBMISSION':artifact.kind==='demo'?'DEMO / PROTOTYPE':artifact.kind==='document'?'DOCUMENT / REPORT':'PROJECT LINK')} · {localDate(artifact.verifiedAt||artifact.submittedAt)}</p><h4>{artifact.summary||'GitHub source record'}</h4><p>{artifact.repositoryFullName||(typeof meta.repository==='string'?meta.repository:artifact.provider==='github'?'GitHub':'External link')} · Submitted by {a.nm(artifact.submittedBy)}</p></div><span className={'sw-review-status status-'+artifact.status}>{statusLabel}</span></div>
            <div className="sw-source-confirmation"><QuorlythGlyph name="check" size={14}/><span>{artifact.provider==='github'?<>GitHub API confirmed this source{meta.authorLogin?' · @'+String(meta.authorLogin):''}{meta.signatureVerified===true?' · Signed commit verified':''}</>:<>Contributor-submitted evidence · not source-verified</>}</span>{artifact.url&&<a href={artifact.url} target="_blank" rel="noreferrer">Open evidence <QuorlythGlyph name="open" size={12}/></a>}</div>
            {typeof meta.message==='string'&&<p className="sw-artifact__message">{meta.message.slice(0,700)}</p>}
            {artifact.attachments?.map(attachment=><WorkspaceEvidenceAttachment key={attachment.path} attachment={attachment}/>)}
            {typeof meta.title==='string'&&<p className="sw-artifact__message">{meta.title.slice(0,300)}{typeof meta.state==='string'?' · '+meta.state:''}{meta.merged===true?' · Merged':''}</p>}
            {artifact.reviewNote&&<div className="sw-review-note"><strong>{artifact.status==='approved'?'Reviewer note':'Requested changes'}</strong><p>{artifact.reviewNote}</p>{artifact.reviewedBy&&artifact.reviewedAt&&<small>Reviewed by {a.nm(artifact.reviewedBy)} · {localDate(artifact.reviewedAt)}</small>}</div>}
            {canManage&&project.status==='active'&&artifact.status==='submitted'&&artifact.submittedBy!==a.me?.id&&<div className="sw-review-controls"><label className="sw-field"><span>Reviewer feedback <small>Optional for approval, required for changes</small></span><textarea rows={2} maxLength={1600} value={reviewNotes[artifact.id]||''} onChange={e=>setReviewNotes(current=>({...current,[artifact.id]:e.target.value}))} placeholder="Check the source against the task's definition of done." /></label><div className="acts"><button type="button" className="btn" disabled={busy==='review-'+artifact.id} onClick={()=>void reviewArtifact(artifact,'changes_requested')}><QuorlythGlyph name="rotate" size={14}/>Request changes</button><button type="button" className="btn p" disabled={busy==='review-'+artifact.id} onClick={()=>void reviewArtifact(artifact,'approved')}><QuorlythGlyph name="check" size={14}/>Approve evidence</button></div></div>}
          </article>
        })}</div>}
      </section>
    </div>}

    {tab === 'team' && <div className="sw-evidence-layout">
      <section className="glass pad sw-panel"><div className="sw-section-heading"><div><p className="ql-eyebrow">PEOPLE</p><h3>Project team</h3><p>Only active teammates have workspace access. Invites must be accepted by the invited account.</p></div><span className="sw-count">{team.length} active</span></div>
        <div className="sw-team-list">{team.map(member=><div className="sw-team-member" key={member.userId}><Av id={member.userId} size={36}/><div><strong>{a.nm(member.userId)}{member.userId===a.me?.id?' · You':''}</strong><small>{member.role.charAt(0).toUpperCase()+member.role.slice(1)} · Joined {localDate(member.updatedAt||member.at)}</small></div><span className={'sw-role-pill role-'+member.role}>{member.role}</span>{canManage&&project.status==='active'&&member.role!=='owner'&&member.userId!==a.me?.id&&<label className="sw-member-role-control"><span>Role</span><select aria-label={'Change role for ' + a.nm(member.userId)} value={member.role} disabled={busy==='role-'+member.userId} onChange={e=>void updateMemberRole(member,e.target.value as 'manager'|'contributor'|'viewer')}><option value="contributor">Contributor · can be assigned work</option><option value="viewer">Viewer · read-only</option>{isOwner&&<option value="manager">Manager · can manage workspace</option>}{member.role==='manager'&&!isOwner&&<option value="manager" disabled>Manager · owner-managed</option>}</select></label>}</div>)}</div>
        {canManage&&project.status==='active'&&<form className="sw-invite-form" onSubmit={inviteMember}><p className="ql-eyebrow">INVITE A TEAMMATE</p><label className="sw-field"><span>Person</span><select value={inviteUser} onChange={e=>setInviteUser(e.target.value)} required><option value="">Select a Quorlyth member</option>{profilePeople.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="sw-field"><span>Permission</span><select value={inviteRole} onChange={e=>setInviteRole(e.target.value as 'contributor'|'viewer')}><option value="contributor">Contributor · can start assigned tasks</option><option value="viewer">Viewer · read-only</option></select></label><button className="btn p" disabled={busy.startsWith('invite-')}><QuorlythGlyph name="invite" size={14}/>Invite to workspace</button>{!profilePeople.length&&<p className="sw-muted">No other visible member profiles were found. The owner can invite someone once their public Quorlyth profile exists.</p>}</form>}
      </section>
      <section
        className="glass pad sw-panel sw-team-discussion"
        aria-label="Team discussion"
        style={discussionMode === 'inline' ? undefined : {
          position: 'fixed',
          left: discussionMode === 'expanded' ? '50%' : 'auto',
          right: discussionMode === 'expanded' ? 'auto' : '12px',
          top: discussionMode === 'expanded' ? '50%' : 'auto',
          transform: discussionMode === 'expanded' ? 'translate(-50%, -50%)' : undefined,
          bottom: discussionMode === 'expanded' ? 'auto' : '12px',
          width: discussionMode === 'expanded' ? 'min(920px, calc(100vw - 32px))' : 'min(360px, calc(100vw - 24px))',
          height: discussionMode === 'expanded' ? 'min(820px, calc(100dvh - 40px))' : undefined,
          maxHeight: discussionMode === 'expanded' ? 'calc(100dvh - 40px)' : 'calc(100dvh - 24px)',
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
            <p className="ql-eyebrow" style={{ marginBottom: 4 }}>TEAM DISCUSSION</p>
            <h3 style={{ fontSize: 19 }}>Project room <span className="dim" style={{ fontSize: 12, fontWeight: 400 }}>· {projectComments.length}</span></h3>
            {discussionMode !== 'minimized' && <p className="mut" style={{ marginTop: 5, fontSize: 12 }}>Share decisions, blockers and next steps with your project team.</p>}
          </div>
          <div className="acts" style={{ margin: 0, gap: 5, flexShrink: 0 }}>
            {discussionMode === 'inline'
              ? <button type="button" className="chip" title="Expand discussion" aria-label="Expand team discussion" onClick={() => setDiscussionMode('expanded')}><QuorlythGlyph name="expand" size={14} /></button>
              : <button type="button" className="chip" title="Return discussion to page" aria-label="Return team discussion to page" onClick={() => setDiscussionMode('inline')}><QuorlythGlyph name="shrink" size={14} /></button>}
            {discussionMode !== 'minimized'
              ? <button type="button" className="chip" title="Minimize discussion" aria-label="Minimize team discussion" onClick={() => setDiscussionMode('minimized')}><QuorlythGlyph name="minimize" size={14} /></button>
              : <button type="button" className="chip" title="Restore discussion" aria-label="Restore team discussion" onClick={() => setDiscussionMode('expanded')}><QuorlythGlyph name="expand" size={14} /></button>}
          </div>
        </div>
        {discussionMode !== 'minimized' && <>
          <div
            className="sw-comments"
            style={{
              flex: discussionMode === 'expanded' ? 1 : undefined,
              minHeight: 0,
              maxHeight: discussionMode === 'expanded' ? 'none' : 320,
              marginTop: 10,
              marginBottom: 10,
              paddingRight: 4,
              overscrollBehavior: 'contain',
            }}
          >
            {projectComments.length
              ? projectComments.map(comment => <article className="sw-comment" key={comment.id}>
                  <Av id={comment.authorId} size={30} />
                  <div>
                    <div className="sw-comment__meta">
                      <strong>{a.nm(comment.authorId)}</strong>
                      <small>{new Date(comment.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
                    </div>
                    <p>{comment.text}</p>
                  </div>
                </article>)
              : <div className="sw-empty-inline"><QuorlythGlyph name="message" size={20}/><strong>No discussion yet</strong><p>Post a decision, blocker or next step to get the conversation started.</p></div>}
          </div>
          {canContribute && <form className="sw-comment-form" onSubmit={postComment} style={{ marginTop: 'auto' }}>
            <label className="sw-field"><span>Message the team</span><textarea value={commentText} onChange={e=>setCommentText(e.target.value)} maxLength={3000} rows={discussionMode === 'expanded' ? 3 : 2} placeholder="What should the team know?" required /></label>
            <button className="btn p" disabled={busy==='comment'||!commentText.trim()}><QuorlythGlyph name="send" size={14}/>{busy==='comment'?'Posting…':'Post update'}</button>
          </form>}
        </>}
      </section>

    </div>}

    {canManage&&<section className="glass pad sw-settings-panel"><details><summary><QuorlythGlyph name="settings" size={15}/>Workspace settings <span>Owner and manager only</span></summary><form onSubmit={saveProject} className="sw-settings-form"><label className="sw-field"><span>Project title</span><input value={projectTitle} onChange={e=>setProjectTitle(e.target.value)} maxLength={100} required /></label><label className="sw-field"><span>Project brief</span><textarea value={projectSummary} onChange={e=>setProjectSummary(e.target.value)} maxLength={4000} rows={3} required /></label><label className="sw-field"><span>Target delivery</span><input type="date" min={minimumDateInput(dateInput(project?.dueAt))} value={projectDueDate} onChange={e=>setProjectDueDate(e.target.value)} /></label><div className="acts"><button className="btn p" disabled={busy==='save-project'}>Save settings</button><button className="btn" type="button" disabled={busy==='project-status'||project.status==='active'&&projectTasks.some(task=>task.status!=='done')} onClick={()=>void toggleProjectStatus()}>{project.status==='completed'?'Reopen workspace':'Close workspace'} </button>{isOwner&&<button className="btn sw-danger-button" type="button" disabled={busy==='delete-workspace'} onClick={()=>void removeWorkspace()}><QuorlythGlyph name="trash" size={14}/>{busy==='delete-workspace'?'Deleting workspace…':'Delete workspace permanently'}</button>}</div><p className="sw-muted">Closing a workspace is permitted only after every task has completed with approved evidence. Reopening allows new tasks or revisions.</p>{isOwner&&<p className="sw-muted">Permanent deletion is available to the workspace owner only and removes all tasks, evidence records, team memberships, comments and linked repository records.</p>}</form></details></section>}
  </>
}
