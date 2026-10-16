import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Av, Bar, Empty, Head } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { Idea, Milestone, Project } from '../lib/types'
import { Icon } from '../lib/Icon'
import { when } from '../lib/util'

const MILESTONE_LABEL: Record<Milestone['status'], string> = {
  todo: 'To do',
  in_progress: 'In progress',
  done: 'Done',
}

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
  const [editSummary, setEditSummary] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [milestoneDraft, setMilestoneDraft] = useState<{ id: string; title: string; description: string } | null>(null)
  const [busy, setBusy] = useState('')
  const completed = milestones.filter(m => m.status === 'done').length
  const progress = milestones.length ? Math.round(completed / milestones.length * 100) : 0
  const community = a.data.communities.find(c => c.id === idea.cid)

  useEffect(() => setSummary(project?.summary || ''), [project?.summary])

  async function createProject(event: FormEvent) {
    event.preventDefault()
    if (!summary.trim()) return a.toast('Add a short project summary first.')
    setBusy('project')
    await a.createProject(idea.id, summary.trim())
    setBusy('')
  }

  async function saveSummary(event: FormEvent) {
    event.preventDefault()
    if (!project || !summary.trim()) return a.toast('A project summary cannot be empty.')
    setBusy('summary')
    const ok = await a.updateProject(project.id, { summary: summary.trim() })
    if (ok) setEditSummary(false)
    setBusy('')
  }

  async function addMilestone(event: FormEvent) {
    event.preventDefault()
    if (!project || !newTitle.trim()) return a.toast('Give the milestone a title.')
    setBusy('add-milestone')
    const ok = await a.addMilestone(project.id, newTitle.trim(), newDescription.trim())
    if (ok) {
      setNewTitle('')
      setNewDescription('')
    }
    setBusy('')
  }

  async function saveMilestone(event: FormEvent) {
    event.preventDefault()
    if (!milestoneDraft || !milestoneDraft.title.trim()) return a.toast('Milestones need a title.')
    setBusy('milestone-' + milestoneDraft.id)
    const ok = await a.updateMilestone(milestoneDraft.id, {
      title: milestoneDraft.title.trim(),
      description: milestoneDraft.description.trim(),
    })
    if (ok) setMilestoneDraft(null)
    setBusy('')
  }

  async function setMilestoneStatus(milestone: Milestone, status: Milestone['status']) {
    setBusy('milestone-' + milestone.id)
    await a.updateMilestone(milestone.id, { status })
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
        <button type="button" className="chip" onClick={() => nav('/idea/' + idea.id)}><Icon name="idea" size={14} />Open idea</button>
        {project && canCollaborate && <button type="button" className="chip" onClick={() => nav('/collaboration/' + idea.id)}><Icon name="collab" size={14} />Collaboration space</button>}
      </div>

      {!project ? (
        canManage ? (
          <form onSubmit={createProject}>
            <label className="field">
              <span>Project plan</span>
              <textarea value={summary} onChange={e => setSummary(e.target.value)} maxLength={1200} required placeholder="What are you going to deliver, and how will the contributors help?" />
            </label>
            <p className="dim" style={{ marginTop: -6, marginBottom: 12 }}>Create a tracked project from this selected idea. You can then add milestones and share progress with community members.</p>
            <button className="btn p" disabled={busy === 'project'}><Icon name="contribute" size={16} />{busy === 'project' ? 'Creating project…' : 'Create project'}</button>
          </form>
        ) : <p className="mut">This idea has been selected. The community creator has not created a project plan yet.</p>
      ) : (
        <>
          {editSummary && canManage ? (
            <form onSubmit={saveSummary}>
              <label className="field"><span>Project summary</span><textarea value={summary} onChange={e => setSummary(e.target.value)} required maxLength={1200} /></label>
              <div className="acts"><button className="btn p" disabled={busy === 'summary'}>{busy === 'summary' ? 'Saving…' : 'Save summary'}</button><button type="button" className="btn" onClick={() => { setSummary(project.summary); setEditSummary(false) }}>Cancel</button></div>
            </form>
          ) : (
            <div className="reason" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span className="dim">Project plan</span>
                {canManage && <button type="button" className="chip" onClick={() => setEditSummary(true)}><Icon name="edit" size={13} />Edit</button>}
              </div>
              <p style={{ marginTop: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{project.summary || 'No project summary has been added yet.'}</p>
            </div>
          )}

          <div className="reason" style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <span className="dim">Milestone progress</span>
              <span>{completed} of {milestones.length} complete · {progress}%</span>
            </div>
            <div style={{ marginTop: 10 }}><Bar value={progress} /></div>
            {milestones.length > 0 && <p className="dim" style={{ marginTop: 8, fontSize: 12 }}>Last project update {when(Math.max(project.updatedAt || project.at, ...milestones.map(m => m.updatedAt || m.at))) || 'not recorded'}</p>}
          </div>

          {milestones.length ? <div style={{ display: 'grid', gap: 12 }}>
            {milestones.map(milestone => <div key={milestone.id} className="reason" style={{ marginTop: 0 }}>
              {milestoneDraft?.id === milestone.id ? (
                <form onSubmit={saveMilestone}>
                  <label className="field"><span>Milestone title</span><input value={milestoneDraft.title} maxLength={120} required onChange={e => setMilestoneDraft({ ...milestoneDraft, title: e.target.value })} /></label>
                  <label className="field"><span>Details</span><textarea value={milestoneDraft.description} maxLength={500} onChange={e => setMilestoneDraft({ ...milestoneDraft, description: e.target.value })} /></label>
                  <div className="acts"><button className="btn p" disabled={busy === 'milestone-' + milestone.id}>{busy === 'milestone-' + milestone.id ? 'Saving…' : 'Save milestone'}</button><button type="button" className="btn" onClick={() => setMilestoneDraft(null)}>Cancel</button></div>
                </form>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <h4 style={{ fontSize: 16, fontWeight: 500, overflowWrap: 'anywhere' }}>{milestone.title}</h4>
                      {milestone.description && <p className="mut" style={{ marginTop: 6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{milestone.description}</p>}
                      <p className="dim" style={{ marginTop: 8, fontSize: 12 }}>Updated {when(milestone.updatedAt || milestone.at) || 'recently'}</p>
                    </div>
                    <span className="chip">{MILESTONE_LABEL[milestone.status]}</span>
                  </div>
                  {canCollaborate && <div className="acts" style={{ marginTop: 12 }}>
                    <button type="button" className="btn" onClick={() => setMilestoneDraft({ id: milestone.id, title: milestone.title, description: milestone.description || '' })}><Icon name="edit" size={14} />Edit</button>
                    {milestone.status === 'todo' && <button type="button" className="btn" disabled={busy === 'milestone-' + milestone.id} onClick={() => void setMilestoneStatus(milestone, 'in_progress')}>Start</button>}
                    {milestone.status !== 'done' && <button type="button" className="btn p" disabled={busy === 'milestone-' + milestone.id} onClick={() => void setMilestoneStatus(milestone, 'done')}><Icon name="approve" size={14} />Mark done</button>}
                    {milestone.status === 'done' && <button type="button" className="btn" disabled={busy === 'milestone-' + milestone.id} onClick={() => void setMilestoneStatus(milestone, 'in_progress')}>Reopen</button>}
                  </div>}
                </>
              )}
            </div>)}
          </div> : <p className="mut" style={{ marginBottom: 16 }}>No milestones yet. Add the first step so contributors can see what happens next.</p>}

          {canCollaborate && project.status !== 'completed' && (
            <form onSubmit={addMilestone} className="reason" style={{ marginTop: 16 }}>
              <h4 style={{ fontSize: 16, marginBottom: 4 }}>Add a milestone</h4>
              <label className="field"><span>Milestone title</span><input value={newTitle} onChange={e => setNewTitle(e.target.value)} maxLength={120} required placeholder="e.g. Confirm the creative brief" /></label>
              <label className="field"><span>Details (optional)</span><textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} maxLength={500} placeholder="Describe the next deliverable" /></label>
              <button className="btn p" disabled={busy === 'add-milestone'}><Icon name="plus" size={15} />{busy === 'add-milestone' ? 'Adding…' : 'Add milestone'}</button>
            </form>
          )}
          {canManage && <div className="acts" style={{ marginTop: 14 }}>
            <button type="button" className="btn" disabled={busy === 'project-status'} onClick={() => void toggleProjectStatus()}><Icon name={project.status === 'completed' ? 'rotate' : 'approve'} size={15} />{project.status === 'completed' ? 'Reopen project' : 'Mark project complete'}</button>
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
  const ideas = a.data.ideas
    .filter(idea => !!a.data.projects[idea.id] || ['selected', 'promoted'].includes(a.statusOf(idea.id)))
    .filter(idea => !requestedIdeaId || idea.id === requestedIdeaId)
    .sort((x, y) => (a.data.projects[y.id]?.updatedAt || a.data.projects[y.id]?.at || y.at) - (a.data.projects[x.id]?.updatedAt || a.data.projects[x.id]?.at || x.at))

  return (
    <>
      <Head kicker="Projects" title="Make progress visible." right={<button type="button" className="btn" onClick={() => nav('/queue')}><Icon name="queue" size={16} />Review queue</button>} />
      <p className="mut" style={{ maxWidth: 760, marginBottom: 18 }}>Turn selected ideas into real work. Community managers control the project brief and overall status; idea creators and accepted collaborators can add milestones and update shared progress.</p>
      {!ideas.length ? <Empty icon="insight" title="No selected ideas or projects yet" text="Select an idea in the review queue to start a tracked project.">
        <button type="button" className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/queue')}>Open review queue</button>
      </Empty> : <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
        {ideas.map(idea => <ProjectCard key={idea.id} idea={idea} project={a.data.projects[idea.id]} milestones={a.data.milestones.filter(m => m.projectId === idea.id).sort((x, y) => x.at - y.at)} canManage={a.canManageCommunity(idea.cid)} canCollaborate={a.canManageCommunity(idea.cid) || idea.authorId === a.me?.id || a.data.volunteers.some(v => v.ideaId === idea.id && v.applicantId === a.me?.id && v.status === 'accepted')} />)}
      </div>}
    </>
  )
}
