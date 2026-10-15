import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { Tags } from '../components/IdeaCard'
import { Av, Bar, Empty } from '../components/ui'
import { useApp, useComments } from '../data/AppProvider'
import { STATUS_LABEL } from '../lib/types'
import { when } from '../lib/util'
import { useUserState } from '../lib/userState'
import { reviewIdeas } from '../ai/review'
import { useDraftState } from '../lib/useDraftState'

export function IdeaPage() {
  return <Gate><Inner /></Gate>
}

function Inner() {
  const { id } = useParams()
  const a = useApp()
  const nav = useNavigate()
  const comments = useComments(id || null)
  const [text, setText, clearReplyDraft] = useDraftState(`q-draft:${a.me?.id}:reply:${id || 'new'}`, '')
  const us = useUserState()
  const [rev, setRev] = useState(false)
  const [applicationMessage, setApplicationMessage] = useState('')
  const [applying, setApplying] = useState(false)
  const idea = a.data.ideas.find(i => i.id === id)
  if (!idea) return <Empty icon="idea" title="This idea is not available" text="It may have been removed."><button className="btn" style={{ marginTop: 12 }} onClick={() => nav('/communities')}>Back to communities</button></Empty>
  const r = a.data.reviews[idea.id]
  const s = a.statusOf(idea.id)
  const voted = a.iVoted(idea.id)
  const communityOwner = a.canManageCommunity(idea.cid)
  const myApplication = a.data.volunteers.filter(v => v.ideaId === idea.id && v.applicantId === a.me?.id).sort((x, y) => y.at - x.at)[0]
  const acceptedCollaborator = myApplication?.status === 'accepted'
  const canOpenWorkspace = communityOwner || acceptedCollaborator
  const backers = Object.entries(a.data.votes)
    .filter(([, ideas]) => !!ideas?.[idea.id])
    .map(([uid]) => uid)
  const cname = a.data.communities.find(c => c.id === idea.cid)?.name || 'Community'
  const row = (l: string, v?: number) => v == null ? null : <div style={{ marginTop: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mut">{l}</span><span>{v}</span></div><Bar value={v} /></div>
  const postReply = async () => {
    if (!text.trim()) return a.toast('Write a reply first')
    if (await a.addComment(idea.id, text.trim())) clearReplyDraft('')
  }

  return (
    <>
      <div className="head"><div><button className="chip" onClick={() => nav('/communities/' + idea.cid)}>Back to community</button></div></div>
      <div className="grid i2">
        <div className="glass pad">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span className="chip">{STATUS_LABEL[s]}</span><span className="chip">{cname}</span></div>
          <div style={{ marginTop: 12 }}><Tags tags={idea.tags} /></div>
          <h2 style={{ margin: '18px 0 12px' }}>{idea.title}</h2>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <Av id={idea.authorId} size={32} /><button className="lk dim" onClick={() => nav('/me/' + idea.authorId)}>{a.nm(idea.authorId)}</button><span className="dim">{when(idea.at)}</span>
          </div>
          <p className="mut" style={{ fontSize: 17, whiteSpace: 'pre-wrap' }}>{idea.body}</p>
          {!communityOwner && idea.authorId !== a.me?.id && <div className="reason" style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 18 }}>Collaborate on this idea</h3>
            <p className="mut" style={{ marginTop: 6 }}>Apply to join the work. If the owner accepts, your collaboration space will appear in Collaborations.</p>
            {acceptedCollaborator ? <button className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/collaboration/' + idea.id)}><Icon name="collab" size={15} />Open collaboration space</button>
              : myApplication?.status === 'pending' ? <span className="chip" style={{ marginTop: 12, display: 'inline-flex' }}>Application pending review</span>
              : !a.joined(idea.cid) ? <div className="acts" style={{ marginTop: 12 }}><button className="btn" onClick={() => nav('/communities/' + idea.cid)}>Join this community to apply</button></div>
              : <form onSubmit={async event => { event.preventDefault(); setApplying(true); const ok = await a.applyToCollaborate(idea.id, applicationMessage); if (ok) setApplicationMessage(''); setApplying(false) }} style={{ marginTop: 12 }}>
                <label className="field"><span>Why would you like to collaborate? (optional)</span><textarea value={applicationMessage} onChange={e => setApplicationMessage(e.target.value)} maxLength={600} placeholder="Share your skills, ideas, or how you can contribute…" /></label>
                <button className="btn p" disabled={applying}><Icon name="send" size={15} />{applying ? 'Sending application…' : 'Apply to collaborate'}</button>
              </form>}
          </div>}
          {r?.score != null && <div className="reason" style={{ marginTop: 26 }}><span className="dim">AI review {r.score}</span><p>{r.reason}</p></div>}
          <h3 style={{ margin: '26px 0 4px' }}>Discussion</h3>
          {comments.length ? comments.map(c => (
            <div key={c.id} className="msg"><Av id={c.authorId} size={30} />
              <div><h3 style={{ fontSize: 15 }}><button className="lk" onClick={() => nav('/me/' + c.authorId)}>{a.nm(c.authorId)}</button> <span className="dim">{when(c.at)}</span></h3><p className="mut" style={{ whiteSpace: 'pre-wrap' }}>{c.text}</p></div></div>
          )) : <p className="mut" style={{ padding: '14px 0' }}>No replies yet. Start the conversation.</p>}
          <label className="field"><span>{communityOwner ? 'Reply to this idea as the community owner' : 'Add to the idea'}</span><input value={text} maxLength={1000} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { e.preventDefault(); void postReply() } }} placeholder="Build on this" /></label>
          <p className="dim">Unfinished replies are saved as drafts on this device.</p>
          <div className="acts" style={{ marginTop: 14 }}><button className="btn p" onClick={postReply}><Icon name={communityOwner ? 'send' : 'collab'} />{communityOwner ? 'Reply as owner' : 'Post reply'}</button><button className="chip" onClick={() => clearReplyDraft('')}>Discard draft</button></div>
        </div>
        <div className="glass pad">
          <button className={voted ? 'btn' : 'btn p'} style={{ width: '100%', justifyContent: 'center' }} onClick={() => a.vote(idea.id)}><Icon name="support" />{voted ? 'Backed' : 'Back this idea'}</button>
          <p className="num" style={{ textAlign: 'center' }}>{a.votesOf(idea.id)}</p><p className="dim" style={{ textAlign: 'center' }}>members backing</p>
          <div style={{ marginTop: 18 }}>
            <h3 style={{ marginBottom: 10 }}>People backing this idea</h3>
            {backers.length ? <div style={{ display: 'grid', gap: 10 }}>{backers.map(uid => <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Av id={uid} size={30} /><div style={{ minWidth: 0, flex: 1 }}><button className="lk" onClick={() => nav('/me/' + uid)}>{a.nm(uid)}</button><p className="dim" style={{ fontSize: 12 }}>Supporting this idea</p></div></div>)}</div> : <p className="mut" style={{ fontSize: 14 }}>No one has backed this idea yet.</p>}
          </div>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={() => us.patch({ saved: { [idea.id]: !us.st.saved?.[idea.id] } })}><Icon name="save" />{us.st.saved?.[idea.id] ? 'Saved' : 'Save for later'}</button>
          {r?.score != null && <>{row('Originality', r.o)}{row('Feasibility', r.f)}{row('Relevance', r.r)}</>}
          {(a.data.projects[idea.id] || s === 'selected' || s === 'promoted') && <div className="acts" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => nav('/projects?idea=' + encodeURIComponent(idea.id))}><Icon name="insight" size={16} />{a.data.projects[idea.id] ? 'View project progress' : 'View selected idea progress'}</button>
            {canOpenWorkspace && a.data.projects[idea.id] && <button className="btn p" onClick={() => nav('/collaboration/' + idea.id)}><Icon name="collab" size={16} />Open collaboration space</button>
          </div>}
          {a.owner && (
            <div className="acts">
              <button className="btn" disabled={rev} onClick={async () => { setRev(true); try { await reviewIdeas(a, [idea]); a.toast('Reviewed') } catch (e: any) { a.toast(e.message || 'The review could not finish') } setRev(false) }}><span className="aiic"><Icon name="spark" size={16} /></span>{rev ? 'Reviewing...' : 'Review with AI'}</button>
              <button className="btn p" onClick={() => a.setStatus(idea.id, 'selected')}><Icon name="approve" />Select</button>
              <button className="btn" onClick={() => a.setStatus(idea.id, 'held')}><Icon name="hold" />Hold</button>
              <button className="btn" onClick={() => a.setStatus(idea.id, 'declined')}><Icon name="decline" />Decline</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
