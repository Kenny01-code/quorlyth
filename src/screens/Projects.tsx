import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Av, Head } from '../components/ui'
import { MilestoneBoard } from '../components/MilestoneBoard'
import { QuorlythGlyph } from '../components/QuorlythGlyph'
import { useApp } from '../data/AppProvider'
import { Idea, Milestone, Project } from '../lib/types'
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

function ProjectCard({ idea, project, milestones, canManage, canCollaborate }: {
  idea: Idea
  project?: Project
  milestones: Milestone[]
  canManage: boolean
  canCollaborate: boolean
}) {
  const a = useApp()
  const nav = useNavigate()
  const [summary, setSummary] = useState(project?.summary || '')
  const [projectDueDate, setProjectDueDate] = useState(dateInput(project?.dueAt))
  const [editSummary, setEditSummary] = useState(false)
  const [busy, setBusy] = useState('')
  const completed = milestones.filter(m => m.status === 'done').length
  const progress = milestones.length ? Math.round(completed / milestones.length * 100) : 0
  const community = a.data.communities.find(c => c.id === idea.cid)
  const teamMemberIds = [idea.authorId, community?.ownerId, community?.createdBy, ...a.data.volunteers.filter(item => item.ideaId === idea.id && item.status === 'accepted').map(item => item.applicantId)].filter((uid): uid is string => !!uid)

  useEffect(() => { setSummary(project?.summary || ''); setProjectDueDate(dateInput(project?.dueAt)) }, [project?.summary, project?.dueAt])

  async function createProject(event: FormEvent) {
    event.preventDefault()
    if (!summary.trim()) return a.toast('Add a short project summary first.')
    setBusy('project')
    await a.createProject(idea.id, summary.trim(), dateEnd(projectDueDate))
    setBusy('')
  }

  async function saveSummary(event: FormEvent) {
    event.preventDefault()
    if (!project || !summary.trim()) return a.toast('A project summary cannot be empty.')
    setBusy('summary')
    const ok = await a.updateProject(project.id, { summary: summary.trim(), dueAt: dateEnd(projectDueDate) })
    if (ok) setEditSummary(false)
    setBusy('')
  }

  async function toggleProjectStatus() {
    if (!project) return
    const status = project.status === 'completed' ? 'active' : 'completed'
    setBusy('project-status')
    await a.updateProject(project.id, { status })
    setBusy('')
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
        {project && canCollaborate && <button type="button" className="chip" onClick={() => nav('/collaboration/' + idea.id)}><QuorlythGlyph name="workspace" size={14} />Collaboration space</button>}
      </div>

      {!project ? (
        canManage ? (
          <form onSubmit={createProject}>
            <label className="field">
              <span>Project plan</span>
              <textarea value={summary} onChange={e => setSummary(e.target.value)} maxLength={1200} required placeholder="What are you going to deliver, and how will the contributors help?" />
            </label>
            <label className="field"><span>Target delivery date <small>Optional</small></span><input type="date" value={projectDueDate} onChange={e => setProjectDueDate(e.target.value)} /></label>
            <p className="dim" style={{ marginTop: -6, marginBottom: 12 }}>Create a tracked project from this selected idea. You can then add milestones and share progress with community members.</p>
            <button className="btn p" disabled={busy === 'project'}><QuorlythGlyph name="plan" size={16} />{busy === 'project' ? 'Creating project…' : 'Create project'}</button>
          </form>
        ) : <p className="mut">This idea has been selected. The community creator has not created a project plan yet.</p>
      ) : (
        <>
          {editSummary && canManage ? (
            <form onSubmit={saveSummary}>
              <label className="field"><span>Project summary</span><textarea value={summary} onChange={e => setSummary(e.target.value)} required maxLength={1200} /></label>
              <label className="field"><span>Target delivery date <small>Optional</small></span><input type="date" value={projectDueDate} onChange={e => setProjectDueDate(e.target.value)} /></label>
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
          <MilestoneBoard idea={idea} projectId={project.id} projectStatus={project.status} milestones={milestones} teamMemberIds={teamMemberIds} canCollaborate={canCollaborate} />
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
      {!ideas.length ? <div className="glass cent ql-project-empty"><span className="ql-empty-mark"><QuorlythGlyph name="workspace" size={30} /></span><h3>{canReview ? 'No selected ideas or projects yet' : 'No project spaces available yet'}</h3><p className="mut">{canReview ? 'Select an idea in a community you manage to start a tracked project.' : 'Project spaces appear here when one of your ideas is selected or a community accepts your collaboration application.'}</p>{canReview && <button type="button" className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/queue')}><QuorlythGlyph name="review" size={15} />Open review queue</button>}</div> : <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
        {ideas.map(idea => <ProjectCard key={idea.id} idea={idea} project={a.data.projects[idea.id]} milestones={a.data.milestones.filter(m => m.projectId === idea.id).sort((x, y) => x.at - y.at)} canManage={a.owner || a.canManageCommunity(idea.cid)} canCollaborate={a.owner || a.canManageCommunity(idea.cid) || idea.authorId === a.me?.id || a.data.volunteers.some(v => v.ideaId === idea.id && v.applicantId === a.me?.id && v.status === 'accepted')} />)}
      </div>}
    </>
  )
}
