import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Av, Head } from '../components/ui'
import { MilestoneBoard } from '../components/MilestoneBoard'
import { QuorlythGlyph } from '../components/QuorlythGlyph'
import { useApp, useComments } from '../data/AppProvider'
import { AIProjectPlan, generateProjectPlan } from '../ai/projectPlan'
import { Idea, Milestone, Project } from '../lib/types'
import { when } from '../lib/util'
import { isPastDateChange, isPastDateInput, minimumDateInput, PAST_DATE_MESSAGE } from '../lib/workspaceDates'

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
  const [aiPlan, setAiPlan] = useState<AIProjectPlan | null>(null)
  const [aiPlanAccepted, setAiPlanAccepted] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const comments = useComments(idea.id)
  const completed = milestones.filter(m => m.status === 'done').length
  const progress = milestones.length ? Math.round(completed / milestones.length * 100) : 0
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
    setBusy('project')
    const created = await a.createProject(idea.id, summary.trim(), dateEnd(projectDueDate))
    setBusy('')
    if (created) {
      const options = aiPlan && aiPlanAccepted
        ? { state: { aiPlan: { ...aiPlan, project_summary: summary.trim() } } }
        : undefined
      nav('/collaboration/' + idea.id + '?tab=plan', options)
    }
  }

  async function saveSummary(event: FormEvent) {
    event.preventDefault()
    if (!project || !summary.trim()) return a.toast('A project summary cannot be empty.')
    if (isPastDateChange(projectDueDate, dateInput(project.dueAt))) return a.toast(PAST_DATE_MESSAGE)
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
          <MilestoneBoard idea={idea} projectId={project.id} projectStatus={project.status} milestones={milestones} teamMemberIds={teamMemberIds} canCollaborate={canCollaborate} canManage={canManage} />
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
      <div className="acts" style={{ marginTop: -6, marginBottom: 18 }}><button type="button" className="btn p" onClick={() => nav('/workspaces')}><QuorlythGlyph name="workspace" size={15} />Open independent workspaces</button></div>
      {!ideas.length ? <div className="glass cent ql-project-empty"><span className="ql-empty-mark"><QuorlythGlyph name="workspace" size={30} /></span><h3>{canReview ? 'No selected ideas or projects yet' : 'No project spaces available yet'}</h3><p className="mut">{canReview ? 'Select an idea in a community you manage to start a tracked project.' : 'Project spaces appear here when one of your ideas is selected or a community accepts your collaboration application.'}</p>{canReview && <button type="button" className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/queue')}><QuorlythGlyph name="review" size={15} />Open review queue</button>}</div> : <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
        {ideas.map(idea => <ProjectCard key={idea.id} idea={idea} project={a.data.projects[idea.id]} milestones={a.data.milestones.filter(m => m.projectId === idea.id).sort((x, y) => x.at - y.at)} canManage={a.owner || a.canManageCommunity(idea.cid)} canCollaborate={a.owner || a.canManageCommunity(idea.cid) || idea.authorId === a.me?.id || a.data.volunteers.some(v => v.ideaId === idea.id && v.applicantId === a.me?.id && v.status === 'accepted')} />)}
      </div>}
    </>
  )
}
