import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Av, Head } from '../components/ui'
import { QuorlythGlyph } from '../components/QuorlythGlyph'
import { useApp } from '../data/AppProvider'

type WorkspaceTab = 'overview' | 'tasks' | 'evidence' | 'team'
type WorkspaceProject = {
  id: string; title: string; summary: string; status: 'active' | 'completed'; createdBy: string
  at: number; updatedAt: number; dueAt?: number | null; visibility: 'team'; docId?: string
}
type WorkspaceMember = {
  id: string; projectId: string; userId: string; role: 'owner' | 'manager' | 'contributor' | 'viewer'
  status: 'active' | 'invited' | 'removed'; invitedBy: string; at: number; updatedAt: number; docId?: string
}
type WorkspaceTask = {
  id: string; projectId: string; title: string; description: string; status: 'todo' | 'in_progress' | 'done'
  createdBy: string; at: number; updatedAt: number; dueAt?: number | null; assigneeId?: string | null
  acceptanceCriteria?: string; docId?: string
}
type WorkspaceArtifact = {
  id: string; projectId: string; taskId: string; provider: 'github'; kind: 'commit' | 'pull_request'
  url: string; summary: string; status: 'submitted' | 'approved' | 'changes_requested'
  verificationStatus: 'source_verified'; verifiedAt: number; submittedBy: string; submittedAt: number
  reviewedAt?: number; reviewedBy?: string; reviewNote?: string; repositoryFullName?: string
  sourceMetadata: Record<string, unknown>; docId?: string
}
type GithubRepository = {
  id: string; projectId: string; fullName: string; htmlUrl: string; description: string
  defaultBranch: string; language?: string; stars: number; openIssues: number; sourceVerified: boolean
  lastSyncedAt: number; docId?: string
}
type WorkspaceComment = { id: string; projectId: string; authorId: string; text: string; at: number; docId?: string }

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
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'

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
        <label className="sw-field"><span>Target delivery <small>Optional</small></span><input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>
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

  const project = projects.find(item => item.id === id || item.docId === id)
  const team = members.filter(item => item.projectId === id && item.status === 'active')
  const invitation = members.find(item => item.projectId === id && item.userId === a.me?.id && item.status === 'invited')
  const myMembership = members.find(item => item.projectId === id && item.userId === a.me?.id && item.status === 'active')
  const isOwner = !!a.me && project?.createdBy === a.me.id
  const role = isOwner ? 'owner' : myMembership?.role
  const canManage = !!role && ['owner','manager'].includes(role)
  const canContribute = !!role && ['owner','manager','contributor'].includes(role)
  const projectTasks = tasks.filter(item => item.projectId === id).sort((x,y) => (x.dueAt || Number.MAX_SAFE_INTEGER) - (y.dueAt || Number.MAX_SAFE_INTEGER) || x.at-y.at)
  const projectArtifacts = artifacts.filter(item => item.projectId === id).sort((x,y) => y.submittedAt-x.submittedAt)
  const projectRepos = repositories.filter(item => item.projectId === id).sort((x,y) => y.lastSyncedAt-x.lastSyncedAt)
  const projectComments = comments.filter(item => item.projectId === id).sort((x,y) => x.at-y.at)
  const doneCount = projectTasks.filter(task => task.status === 'done').length
  const progress = projectTasks.length ? Math.round(doneCount / projectTasks.length * 100) : 0
  const pendingReviews = projectArtifacts.filter(item => item.status === 'submitted').length
  const [tab, setTab] = useState<WorkspaceTab>('overview')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDescription, setTaskDescription] = useState('')
  const [taskCriteria, setTaskCriteria] = useState('')
  const [taskAssignee, setTaskAssignee] = useState('')
  const [taskDueDate, setTaskDueDate] = useState('')
  const [inviteUser, setInviteUser] = useState('')
  const [inviteRole, setInviteRole] = useState<'contributor'|'viewer'>('contributor')
  const [repoUrl, setRepoUrl] = useState('')
  const [repoPreview, setRepoPreview] = useState<any[]>([])
  const [artifactTask, setArtifactTask] = useState('')
  const [artifactUrl, setArtifactUrl] = useState('')
  const [commentText, setCommentText] = useState('')
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
    await runAction('save-project', async () => {
      await a.backend!.store.update('standaloneProjects/' + project.id, { title: projectTitle.trim(), summary: projectSummary.trim(), dueAt: dateEnd(projectDueDate), updatedAt: Date.now() })
      a.toast('Workspace details saved.')
    })
  }

  async function addTask(event: FormEvent) {
    event.preventDefault()
    if (!project || !a.backend || !a.me) return
    if (taskTitle.trim().length < 2) return setError('Give the task a clear title.')
    await runAction('add-task', async () => {
      const now = Date.now(); const taskId = crypto.randomUUID()
      const task: WorkspaceTask = {
        id: taskId, projectId: id, title: taskTitle.trim().slice(0,140), description: taskDescription.trim().slice(0,2000),
        acceptanceCriteria: taskCriteria.trim().slice(0,1000), status: 'todo', createdBy: a.me!.id, at: now, updatedAt: now,
        dueAt: dateEnd(taskDueDate), assigneeId: taskAssignee || null,
      }
      await a.backend!.store.create('standaloneTasks/' + taskId, task)
      setTaskTitle(''); setTaskDescription(''); setTaskCriteria(''); setTaskAssignee(''); setTaskDueDate('')
      setTab('tasks'); a.toast('Task added to the project plan.')
    })
  }

  async function startTask(task: WorkspaceTask) {
    if (!a.backend || !a.me) return
    await runAction('start-'+task.id, async () => {
      await a.backend!.store.update('standaloneTasks/' + task.id, { status: 'in_progress', ...(task.assigneeId ? {} : { assigneeId: a.me!.id }), updatedAt: Date.now() })
      a.toast('Task started.')
    })
  }

  async function completeTask(task: WorkspaceTask) {
    if (!a.backend) return
    await runAction('complete-'+task.id, async () => {
      await a.backend!.store.update('standaloneTasks/' + task.id, { status: 'done', updatedAt: Date.now() })
      a.toast('Task completed with approved GitHub evidence.')
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

  async function inviteMember(event: FormEvent) {
    event.preventDefault()
    if (!project || !a.backend || !a.me || !inviteUser) return
    await runAction('invite-'+inviteUser, async () => {
      const now = Date.now()
      const member: WorkspaceMember = {
        id: id + '__' + inviteUser, projectId: id, userId: inviteUser, role: inviteRole, status: 'invited',
        invitedBy: a.me!.id, at: now, updatedAt: now,
      }
      await a.backend!.store.create('standaloneProjectMembers/' + member.id, member)
      setInviteUser(''); a.toast('Workspace invitation sent.')
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

  async function submitGithubEvidence(event: FormEvent) {
    event.preventDefault()
    if (!artifactTask || !artifactUrl.trim()) return setError('Select a task and paste a GitHub commit or pull request URL.')
    await runAction('verify-github', async () => {
      await githubAction(a, 'verify_artifact', id, { taskId: artifactTask, artifactUrl: artifactUrl.trim() })
      setArtifactUrl('')
      setTab('evidence')
      a.toast('GitHub source verified. The project manager can now review the evidence.')
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
        {projectTasks.length ? <div className="sw-mini-task-list">{projectTasks.slice(0,5).map(task => <button className="sw-mini-task" key={task.id} type="button" onClick={() => setTab('tasks')}><span className={'sw-task-check '+(task.status==='done'?'is-done':'')}>{task.status==='done'?<QuorlythGlyph name="check" size={13}/>:null}</span><span><strong>{task.title}</strong><small>{task.assigneeId ? a.nm(task.assigneeId) : 'Unassigned'} · {task.status === 'todo' ? 'Queued' : task.status === 'in_progress' ? 'In progress' : 'Approved complete'}</small></span><QuorlythGlyph name="arrow" size={14}/></button>)}</div> : <div className="sw-empty-inline"><QuorlythGlyph name="milestone" size={21}/><strong>No tasks yet</strong><p>Break the project into manageable outcomes. Each task should define what done means.</p>{canManage && <button className="btn p" type="button" onClick={() => setTab('tasks')}><QuorlythGlyph name="add" size={14}/>Create first task</button>}</div>}
      </div>
      <div className="glass pad sw-panel"><div className="sw-section-heading"><div><p className="ql-eyebrow">SOURCE OF TRUTH</p><h3>Connected GitHub</h3><p>Repository metadata is fetched from GitHub’s public API.</p></div></div>
        {projectRepos.length ? projectRepos.map(repo => <div className="sw-repo-row" key={repo.id}><span className="sw-repo-mark"><QuorlythGlyph name="link" size={17}/></span><div><a href={repo.htmlUrl} target="_blank" rel="noreferrer">{repo.fullName} <QuorlythGlyph name="open" size={12}/></a><small>{repo.defaultBranch ? 'Default branch · '+repo.defaultBranch : 'Public repository'} · {repo.stars} stars</small><small>Last checked {localDate(repo.lastSyncedAt)}</small></div><span className="sw-verified"><QuorlythGlyph name="check" size={12}/>Connected</span></div>) : <div className="sw-empty-inline"><QuorlythGlyph name="link" size={21}/><strong>No repository connected</strong><p>Connect a public GitHub repository to source-check commits and pull requests.</p></div>}
        {canManage && <button type="button" className="btn p" onClick={() => setTab('evidence')}><QuorlythGlyph name="link" size={14}/>{projectRepos.length ? 'Manage GitHub evidence' : 'Connect GitHub'}</button>}
      </div>
    </section>}

    {tab === 'tasks' && <section className="glass pad sw-panel">
      <div className="sw-section-heading"><div><p className="ql-eyebrow">EXECUTION PLAN</p><h3>Tasks and deliverables</h3><p>Completion is locked until a connected GitHub artifact has been reviewed and approved.</p></div><span className="sw-count">{doneCount}/{projectTasks.length} complete</span></div>
      {canManage && project.status==='active' && <form className="sw-task-form" onSubmit={addTask}>
        <p className="ql-eyebrow">ADD A TASK</p>
        <label className="sw-field"><span>Task title</span><input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} required maxLength={140} placeholder="What concrete result should be delivered?" /></label>
        <label className="sw-field"><span>Details <small>Optional</small></span><textarea value={taskDescription} onChange={e=>setTaskDescription(e.target.value)} maxLength={2000} rows={2} placeholder="Scope, approach or links the contributor needs." /></label>
        <label className="sw-field"><span>Definition of done</span><textarea value={taskCriteria} onChange={e=>setTaskCriteria(e.target.value)} maxLength={1000} rows={2} placeholder="Which behaviour, tests or changes must the evidence demonstrate?" /></label>
        <div className="sw-form-row"><label className="sw-field"><span>Assign to</span><select value={taskAssignee} onChange={e=>setTaskAssignee(e.target.value)}><option value="">Unassigned</option>{team.filter(member=>member.role!=='viewer').map(member=><option key={member.userId} value={member.userId}>{a.nm(member.userId)}</option>)}</select></label><label className="sw-field"><span>Due date</span><input type="date" value={taskDueDate} onChange={e=>setTaskDueDate(e.target.value)} /></label></div>
        <button className="btn p" disabled={busy==='add-task'||taskTitle.trim().length<2}><QuorlythGlyph name="add" size={14}/>{busy==='add-task'?'Adding…':'Add task'}</button>
      </form>}
      {!projectTasks.length ? <div className="sw-empty-inline"><QuorlythGlyph name="milestone" size={22}/><strong>Nothing planned yet</strong><p>Start by adding a task with clear acceptance criteria.</p></div> : <div className="sw-task-list">{projectTasks.map(task => {
        const taskEvidence = projectArtifacts.filter(artifact => artifact.taskId===task.id)
        const approved = taskEvidence.filter(artifact=>artifact.status==='approved'&&artifact.verificationStatus==='source_verified').length
        const currentAssignee = task.assigneeId===a.me?.id
        return <article className="sw-task" key={task.id}>
          <div className="sw-task__top"><span className={'sw-task-check '+(task.status==='done'?'is-done':'')}>{task.status==='done'?<QuorlythGlyph name="check" size={14}/>:null}</span><div className="sw-task__title"><p className="ql-eyebrow">{task.status==='todo'?'QUEUED':task.status==='in_progress'?'IN PROGRESS':'APPROVED COMPLETE'}</p><h4>{task.title}</h4></div><span className={'sw-task-status '+(task.status==='done'?'is-done':'')}>{task.status==='done'?'Complete':task.status==='in_progress'?'Active':'Open'}</span></div>
          {task.description && <p className="sw-task__description">{task.description}</p>}
          {task.acceptanceCriteria && <div className="sw-criteria"><span><QuorlythGlyph name="check" size={14}/></span><div><strong>Definition of done</strong><p>{task.acceptanceCriteria}</p></div></div>}
          <div className="sw-task__meta"><span><QuorlythGlyph name="person" size={13}/>{task.assigneeId?a.nm(task.assigneeId):'Unassigned'}</span><span><QuorlythGlyph name="calendar" size={13}/>{task.dueAt?localDate(task.dueAt):'No deadline'}</span><button type="button" className="sw-link-button" onClick={()=>{setArtifactTask(task.id);setTab('evidence')}}><QuorlythGlyph name="link" size={13}/>{taskEvidence.length} evidence item{taskEvidence.length===1?'':'s'}</button></div>
          <div className="sw-task__actions">{canContribute && project.status==='active' && task.status==='todo' && (currentAssignee||!task.assigneeId||canManage) && <button className="btn" type="button" disabled={busy==='start-'+task.id} onClick={()=>void startTask(task)}><QuorlythGlyph name="start" size={14}/>Start task</button>}{canManage&&project.status==='active'&&task.status!=='done'&&<button className="btn p" type="button" disabled={busy==='complete-'+task.id||approved===0} title={approved?'Complete with approved GitHub evidence':'A reviewer must approve source-verified GitHub evidence first'} onClick={()=>void completeTask(task)}><QuorlythGlyph name="complete" size={14}/>{busy==='complete-'+task.id?'Checking…':'Mark complete'}{approved===0?' · evidence needed':''}</button>}{task.status==='done'&&<span className="sw-verified"><QuorlythGlyph name="check" size={12}/>Evidence approved</span>}</div>
        </article>
      })}</div>}
    </section>}

    {tab === 'evidence' && <div className="sw-evidence-layout">
      <section className="glass pad sw-panel"><div className="sw-section-heading"><div><p className="ql-eyebrow">GITHUB CONNECTION</p><h3>Connect a repository</h3><p>Phase 1 checks public repositories, commits and pull requests directly against GitHub’s API. Private repository OAuth is not enabled in this release.</p></div></div>
        {canManage&&project.status==='active'&&<form className="sw-inline-form" onSubmit={connectRepository}><label className="sw-field"><span>Public repository URL</span><input type="url" required value={repoUrl} onChange={e=>setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repository" /></label><button className="btn p" disabled={busy==='connect-github'}><QuorlythGlyph name="link" size={14}/>{busy==='connect-github'?'Checking GitHub…':'Connect repository'}</button></form>}
        {projectRepos.map(repo=><div className="sw-repo-row" key={repo.id}><span className="sw-repo-mark"><QuorlythGlyph name="link" size={17}/></span><div><a href={repo.htmlUrl} target="_blank" rel="noreferrer">{repo.fullName} <QuorlythGlyph name="open" size={12}/></a><small>{repo.description||'No repository description'} </small><small>{repo.defaultBranch||'Default branch not reported'} · {repo.stars} stars · {repo.openIssues} open issues</small></div><span className="sw-verified"><QuorlythGlyph name="check" size={12}/>API checked</span></div>)}
        {repoPreview.length>0&&<div className="sw-recent-commits"><p className="ql-eyebrow">RECENT SOURCE ACTIVITY</p>{repoPreview.map(commit=><a className="sw-commit-preview" href={commit.url} target="_blank" rel="noreferrer" key={commit.sha}><code>{commit.shortSha}</code><span><strong>{commit.message||'Commit'}</strong><small>{commit.authorLogin?'@'+commit.authorLogin:commit.authorName||'Author not attributed'}{commit.date?' · '+new Date(commit.date).toLocaleDateString():''}</small></span><QuorlythGlyph name="open" size={13}/></a>)}</div>}
      </section>
      <section className="glass pad sw-panel"><div className="sw-section-heading"><div><p className="ql-eyebrow">SUBMIT A SOURCE RECORD</p><h3>Attach a commit or pull request</h3><p>The URL is inspected by the server against GitHub. A pasted URL alone is not accepted as proof.</p></div></div>
        <form className="sw-artifact-form" onSubmit={submitGithubEvidence}>
          <label className="sw-field"><span>Which task does this support?</span><select required value={artifactTask} onChange={e=>setArtifactTask(e.target.value)}><option value="">Choose a task</option>{projectTasks.filter(task=>task.status!=='done').map(task=><option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <label className="sw-field"><span>GitHub commit or pull request URL</span><input required type="url" value={artifactUrl} onChange={e=>setArtifactUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/42" /></label>
          <p className="sw-muted">Accepted formats: a commit URL ending in <code>/commit/SHA</code> or a pull request URL ending in <code>/pull/number</code> from a connected public repository.</p>
          <button className="btn p" disabled={busy==='verify-github'||!projectRepos.length||!canContribute||project.status!=='active'}><QuorlythGlyph name="check" size={14}/>{busy==='verify-github'?'Checking GitHub…':'Verify source and submit'}</button>
        </form>
      </section>
      <section className="glass pad sw-panel sw-evidence-register"><div className="sw-section-heading"><div><p className="ql-eyebrow">DELIVERABLE REGISTER</p><h3>Source evidence and reviews</h3><p>Source existence and review approval are separate decisions. The public API does not prove GitHub account ownership.</p></div><span className="sw-count">{projectArtifacts.length} records</span></div>
        {projectArtifacts.length===0?<div className="sw-empty-inline"><QuorlythGlyph name="review" size={22}/><strong>No source evidence submitted yet</strong><p>Connect a repository, then submit a commit or pull request tied to a task.</p></div>:<div className="sw-artifact-list">{projectArtifacts.map(artifact=>{
          const meta=artifact.sourceMetadata||{}
          const statusLabel=artifact.status==='approved'?'Approved':artifact.status==='changes_requested'?'Changes requested':'Awaiting review'
          return <article className="sw-artifact" key={artifact.id}>
            <div className="sw-artifact__top"><span className="sw-repo-mark"><QuorlythGlyph name="link" size={17}/></span><div className="sw-artifact__identity"><p className="ql-eyebrow">{artifact.kind==='pull_request'?'PULL REQUEST':'COMMIT'} · {localDate(artifact.verifiedAt)}</p><h4>{artifact.summary||'GitHub source record'}</h4><p>{artifact.repositoryFullName||meta.repository as string||'GitHub'} · Submitted by {a.nm(artifact.submittedBy)}</p></div><span className={'sw-review-status status-'+artifact.status}>{statusLabel}</span></div>
            <div className="sw-source-confirmation"><QuorlythGlyph name="check" size={14}/><span>GitHub source confirmed{meta.authorLogin?' · @'+String(meta.authorLogin):''}{meta.signatureVerified===true?' · Signed commit verified':''}</span><a href={artifact.url} target="_blank" rel="noreferrer">Open source <QuorlythGlyph name="open" size={12}/></a></div>
            {meta.message&&<p className="sw-artifact__message">{String(meta.message).slice(0,700)}</p>}
            {meta.title&&<p className="sw-artifact__message">{String(meta.title).slice(0,300)}{meta.state?' · '+String(meta.state):''}{meta.merged===true?' · Merged':''}</p>}
            {artifact.reviewNote&&<div className="sw-review-note"><strong>{artifact.status==='approved'?'Reviewer note':'Requested changes'}</strong><p>{artifact.reviewNote}</p>{artifact.reviewedBy&&artifact.reviewedAt&&<small>Reviewed by {a.nm(artifact.reviewedBy)} · {localDate(artifact.reviewedAt)}</small>}</div>}
            {canManage&&project.status==='active'&&artifact.status==='submitted'&&artifact.submittedBy!==a.me?.id&&<div className="sw-review-controls"><label className="sw-field"><span>Reviewer feedback <small>Optional for approval, required for changes</small></span><textarea rows={2} maxLength={1600} value={reviewNotes[artifact.id]||''} onChange={e=>setReviewNotes(current=>({...current,[artifact.id]:e.target.value}))} placeholder="Check the source against the task's definition of done." /></label><div className="acts"><button type="button" className="btn" disabled={busy==='review-'+artifact.id} onClick={()=>void reviewArtifact(artifact,'changes_requested')}><QuorlythGlyph name="rotate" size={14}/>Request changes</button><button type="button" className="btn p" disabled={busy==='review-'+artifact.id} onClick={()=>void reviewArtifact(artifact,'approved')}><QuorlythGlyph name="check" size={14}/>Approve evidence</button></div></div>}
          </article>
        })}</div>}
      </section>
    </div>}

    {tab === 'team' && <div className="sw-evidence-layout">
      <section className="glass pad sw-panel"><div className="sw-section-heading"><div><p className="ql-eyebrow">PEOPLE</p><h3>Project team</h3><p>Only active teammates have workspace access. Invites must be accepted by the invited account.</p></div><span className="sw-count">{team.length} active</span></div>
        <div className="sw-team-list">{team.map(member=><div className="sw-team-member" key={member.userId}><Av id={member.userId} size={36}/><div><strong>{a.nm(member.userId)}{member.userId===a.me?.id?' · You':''}</strong><small>{member.role.charAt(0).toUpperCase()+member.role.slice(1)} · Joined {localDate(member.updatedAt||member.at)}</small></div><span className={'sw-role-pill role-'+member.role}>{member.role}</span></div>)}</div>
        {canManage&&project.status==='active'&&<form className="sw-invite-form" onSubmit={inviteMember}><p className="ql-eyebrow">INVITE A TEAMMATE</p><label className="sw-field"><span>Person</span><select value={inviteUser} onChange={e=>setInviteUser(e.target.value)} required><option value="">Select a Quorlyth member</option>{profilePeople.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="sw-field"><span>Permission</span><select value={inviteRole} onChange={e=>setInviteRole(e.target.value as 'contributor'|'viewer')}><option value="contributor">Contributor · can start assigned tasks</option><option value="viewer">Viewer · read-only</option></select></label><button className="btn p" disabled={busy.startsWith('invite-')}><QuorlythGlyph name="invite" size={14}/>Invite to workspace</button>{!profilePeople.length&&<p className="sw-muted">No other visible member profiles were found. The owner can invite someone once their public Quorlyth profile exists.</p>}</form>}
      </section>
      <section className="glass pad sw-panel"><div className="sw-section-heading"><div><p className="ql-eyebrow">TEAM DISCUSSION</p><h3>Project room</h3><p>Keep decisions and next steps attached to this project.</p></div></div>
        <div className="sw-comments">{projectComments.length?projectComments.map(comment=><article className="sw-comment" key={comment.id}><Av id={comment.authorId} size={30}/><div><div className="sw-comment__meta"><strong>{a.nm(comment.authorId)}</strong><small>{new Date(comment.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</small></div><p>{comment.text}</p></div></article>):<div className="sw-empty-inline"><QuorlythGlyph name="message" size={20}/><strong>No discussion yet</strong><p>Post a decision, blocker or next step to get the conversation started.</p></div>}</div>
{canContribute && (
        <form className="sw-comment-form" onSubmit={postComment}><label className="sw-field"><span>Message the team</span><textarea value={commentText} onChange={e=>setCommentText(e.target.value)} maxLength={3000} rows={3} placeholder="What should the team know?" required /></label><button className="btn p" disabled={busy==='comment'||!commentText.trim()}><QuorlythGlyph name="send" size={14}/>Post update</button></form>
        )}
      </section>
    </div>}

    {canManage&&<section className="glass pad sw-settings-panel"><details><summary><QuorlythGlyph name="settings" size={15}/>Workspace settings <span>Owner and manager only</span></summary><form onSubmit={saveProject} className="sw-settings-form"><label className="sw-field"><span>Project title</span><input value={projectTitle} onChange={e=>setProjectTitle(e.target.value)} maxLength={100} required /></label><label className="sw-field"><span>Project brief</span><textarea value={projectSummary} onChange={e=>setProjectSummary(e.target.value)} maxLength={4000} rows={3} required /></label><label className="sw-field"><span>Target delivery</span><input type="date" value={projectDueDate} onChange={e=>setProjectDueDate(e.target.value)} /></label><div className="acts"><button className="btn p" disabled={busy==='save-project'}>Save settings</button><button className="btn" type="button" disabled={busy==='project-status'||project.status==='active'&&projectTasks.some(task=>task.status!=='done')} onClick={()=>void toggleProjectStatus()}>{project.status==='completed'?'Reopen workspace':'Close workspace'} </button></div><p className="sw-muted">Closing a workspace is permitted only after every task has completed with approved evidence. Reopening allows new tasks or revisions.</p></form></details></section>}
  </>
}
