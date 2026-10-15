import { FormEvent, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Gate } from '../components/Gate'
import { Av, Empty, Head } from '../components/ui'
import { useApp, useComments } from '../data/AppProvider'
import { Icon } from '../lib/Icon'
import { Idea, Milestone } from '../lib/types'
import { when } from '../lib/util'

export function Collaborations() {
  return <Gate><CollaborationList /></Gate>
}

function CollaborationList() {
  const a = useApp()
  const nav = useNavigate()
  const myId = a.me?.id
  const items = a.data.ideas.filter(idea => {
    const accepted = a.data.volunteers.some(v => v.ideaId === idea.id && v.applicantId === myId && v.status === 'accepted')
    return !!a.data.projects[idea.id] && (accepted || a.canManageCommunity(idea.cid))
  }).sort((x, y) => (a.data.projects[y.id]?.updatedAt || a.data.projects[y.id]?.at || 0) - (a.data.projects[x.id]?.updatedAt || a.data.projects[x.id]?.at || 0))

  return <>
    <Head kicker="Collaboration" title="Work together, in one place." />
    <p className="mut" style={{ maxWidth: 760, marginBottom: 20 }}>Your accepted collaborations live here. Open a workspace to follow the project plan, coordinate milestones, and keep the discussion with the idea.</p>
    {!items.length ? <Empty icon="collab" title="No collaboration spaces yet" text="When an owner accepts your application, the workspace will appear here. If you manage a community, accept an application from the review queue to open a workspace.">
      <button className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/communities')}>Explore communities</button>
    </Empty> : <div style={{ display: 'grid', gap: 14, maxWidth: 1000 }}>
      {items.map(idea => {
        const project = a.data.projects[idea.id]
        const milestones = a.data.milestones.filter(m => m.projectId === idea.id)
        const done = milestones.filter(m => m.status === 'done').length
        const community = a.data.communities.find(c => c.id === idea.cid)
        const acceptedCount = a.data.volunteers.filter(v => v.ideaId === idea.id && v.status === 'accepted').length
        return <button key={idea.id} type="button" className="glass pad" onClick={() => nav('/collaboration/' + idea.id)} style={{ display: 'block', textAlign: 'left', width: '100%', cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p className="dim">{community?.name || 'Community'} · {project.status === 'completed' ? 'Completed' : 'Active project'}</p>
              <h3 style={{ fontSize: 20, marginTop: 5, overflowWrap: 'anywhere' }}>{idea.title}</h3>
              <p className="mut" style={{ marginTop: 7 }}>{project.summary}</p>
            </div>
            <span className="chip"><Icon name="collab" size={14} />Open workspace</span>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 14 }}>
            <span className="dim"><Icon name="users" size={14} /> {acceptedCount} accepted contributor{acceptedCount === 1 ? '' : 's'}</span>
            <span className="dim"><Icon name="approve" size={14} /> {done}/{milestones.length} milestones complete</span>
            <span className="dim">Updated {when(project.updatedAt || project.at) || 'recently'}</span>
          </div>
        </button>
      })}
    </div>}
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
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const idea = a.data.ideas.find(item => item.id === id)
  const project = a.data.projects[id]
  const community = idea ? a.data.communities.find(c => c.id === idea.cid) : undefined
  const canManage = !!idea && a.canManageCommunity(idea.cid)
  const acceptedApplications = a.data.volunteers.filter(v => v.ideaId === id && v.status === 'accepted')
  const isAccepted = !!a.me && acceptedApplications.some(v => v.applicantId === a.me?.id)
  const canAccess = canManage || isAccepted
  const milestones = a.data.milestones.filter(m => m.projectId === id).sort((x, y) => x.at - y.at)
  const completed = milestones.filter(m => m.status === 'done').length
  const progress = milestones.length ? Math.round(completed / milestones.length * 100) : 0

  if (!idea) return <Empty icon="collab" title="Collaboration not found" text="This idea may have been removed, or you may not have access to it."><button className="btn" style={{ marginTop: 12 }} onClick={() => nav('/collaborations')}>Back to collaborations</button></Empty>
  if (!canAccess) {
    const ownApplication = a.data.volunteers.find(v => v.ideaId === id && v.applicantId === a.me?.id)
    return <Empty icon="private" title="This workspace is private" text={ownApplication?.status === 'pending' ? 'Your application is still waiting for the owner. The workspace opens after acceptance.' : 'Only the community owner and accepted collaborators can enter this workspace.'}>
      <div className="acts" style={{ justifyContent: 'center', marginTop: 12 }}>
        <button className="btn" onClick={() => nav('/idea/' + idea.id)}>View idea</button>
        <button className="btn" onClick={() => nav('/collaborations')}>My collaborations</button>
      </div>
    </Empty>
  }

  async function addMilestone(event: FormEvent) {
    event.preventDefault()
    if (!newTitle.trim()) return a.toast('Give the milestone a title.')
    setBusy(true)
    const ok = await a.addMilestone(id, newTitle.trim(), newDescription.trim())
    if (ok) { setNewTitle(''); setNewDescription('') }
    setBusy(false)
  }

  async function changeStatus(milestone: Milestone, status: Milestone['status']) {
    setBusy(true)
    await a.updateMilestone(milestone.id, { status })
    setBusy(false)
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
      <div><button className="chip" onClick={() => nav('/collaborations')}><Icon name="arrow-left" size={14} /> All collaborations</button></div>
      <div className="acts" style={{ margin: 0 }}>
        <button className="btn" onClick={() => nav('/idea/' + id)}><Icon name="idea" size={15} />Original idea</button>
        {canManage && <button className="btn" onClick={() => nav('/projects?idea=' + encodeURIComponent(id))}><Icon name="edit" size={15} />Project settings</button>}
      </div>
    </div>
    <Head kicker={community?.name || 'Collaboration workspace'} title={idea.title} />
    <div className="grid i2" style={{ alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
        <section className="glass pad">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="chip"><Icon name="collab" size={14} />Shared workspace</span>
            <span className="chip">{project?.status === 'completed' ? 'Completed' : 'Active'}</span>
          </div>
          <h3 style={{ fontSize: 18, marginTop: 16 }}>Project brief</h3>
          <p className="mut" style={{ marginTop: 8, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{project?.summary || 'The project owner has not added a brief yet.'}</p>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span className="dim">Milestone progress</span><strong>{completed}/{milestones.length} · {progress}%</strong>
          </div>
          <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,.1)', overflow: 'hidden', marginTop: 9 }}>
            <div style={{ width: progress + '%', height: '100%', background: 'rgba(255,255,255,.8)', transition: 'width .25s ease' }} />
          </div>
        </section>
        <section className="glass pad">
          <div className="head" style={{ marginBottom: 14 }}>
            <div><p className="dim">Shared plan</p><h3 style={{ fontSize: 20, marginTop: 4 }}>Milestones</h3></div>
            <span className="chip">{milestones.length} total</span>
          </div>
          {!milestones.length && <p className="mut" style={{ marginBottom: 14 }}>No milestones yet. Add the first concrete step so everyone knows what happens next.</p>}
          <div style={{ display: 'grid', gap: 10 }}>
            {milestones.map(milestone => <article key={milestone.id} className="reason" style={{ margin: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h4 style={{ fontSize: 16, fontWeight: 500, overflowWrap: 'anywhere' }}>{milestone.title}</h4>
                  {milestone.description && <p className="mut" style={{ marginTop: 5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{milestone.description}</p>}
                  <p className="dim" style={{ fontSize: 12, marginTop: 7 }}>Updated {when(milestone.updatedAt || milestone.at) || 'recently'}</p>
                </div>
                <span className="chip">{milestone.status === 'done' ? 'Done' : milestone.status === 'in_progress' ? 'In progress' : 'To do'}</span>
              </div>
              {project?.status === 'active' && <div className="acts" style={{ marginTop: 12 }}>
                {milestone.status === 'todo' && <button className="btn" disabled={busy} onClick={() => void changeStatus(milestone, 'in_progress')}>Start</button>}
                {milestone.status !== 'done' && <button className="btn p" disabled={busy} onClick={() => void changeStatus(milestone, 'done')}><Icon name="approve" size={14} />Mark done</button>}
                {milestone.status === 'done' && <button className="btn" disabled={busy} onClick={() => void changeStatus(milestone, 'in_progress')}><Icon name="rotate" size={14} />Reopen</button>}
              </div>}
            </article>)}
          </div>
          {project?.status === 'active' && <form className="reason" style={{ marginTop: 14 }} onSubmit={addMilestone}>
            <h4 style={{ fontSize: 16, marginBottom: 10 }}>Add a milestone</h4>
            <label className="field"><span>Milestone</span><input value={newTitle} onChange={e => setNewTitle(e.target.value)} maxLength={120} required placeholder="e.g. Draft the first prototype" /></label>
            <label className="field"><span>Details (optional)</span><textarea value={newDescription} onChange={e => setNewDescription(e.target.value)} maxLength={500} placeholder="What does done look like?" /></label>
            <button className="btn p" disabled={busy}><Icon name="plus" size={14} />{busy ? 'Saving…' : 'Add milestone'}</button>
          </form>}
        </section>
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
          <p className="dim" style={{ marginTop: 14, fontSize: 12 }}>Only accepted collaborators and the community owner can access this space.</p>
        </section>
        <section className="glass pad">
          <h3 style={{ fontSize: 19 }}>Team discussion</h3>
          <p className="mut" style={{ marginTop: 5 }}>Keep decisions and progress updates connected to the original idea.</p>
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
            <button className="btn p" disabled={busy || !reply.trim()}><Icon name="send" size={14} />{busy ? 'Posting…' : 'Post update'}</button>
          </form>
        </section>
      </div>
    </div>
  </>
}
