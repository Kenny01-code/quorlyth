import { useEffect, useState } from 'react'
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
  const [voting, setVoting] = useState(false)
  const [applicationMessage, setApplicationMessage] = useState('')
  const [applying, setApplying] = useState(false)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [mentionedUserIds, setMentionedUserIds] = useState<string[]>([])
  const [mentionOpen, setMentionOpen] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionStart, setMentionStart] = useState(0)
  const [communityMemberIds, setCommunityMemberIds] = useState<string[]>([])
  const [mentionLoading, setMentionLoading] = useState(false)
  const idea = a.data.ideas.find(i => i.id === id)
  useEffect(() => {
    if (!mentionOpen || !idea || !a.backend) return
    let active = true
    setCommunityMemberIds([])
    setMentionLoading(true)
    a.backend.store.listCommunityMembers(idea.cid)
      .then(ids => { if (active) setCommunityMemberIds(ids) })
      .catch(error => { if (active) { setCommunityMemberIds([]); console.warn('Could not load community members for mentions:', error) } })
      .finally(() => { if (active) setMentionLoading(false) })
    return () => { active = false }
  }, [mentionOpen, idea?.cid, a.backend])
  if (!idea) return <Empty icon="idea" title="This idea is not available" text="It may have been removed."><button className="btn" style={{ marginTop: 12 }} onClick={() => nav('/communities')}>Back to communities</button></Empty>
  const ideaCommunity = a.data.communities.find(c => c.id === idea.cid)
  const archivedCommunity = !!ideaCommunity?.arch
  const r = a.data.reviews[idea.id]
  const s = a.statusOf(idea.id)
  const voted = a.iVoted(idea.id)
  const communityOwner = a.canManageCommunity(idea.cid)
  const myApplication = a.data.volunteers.filter(v => v.ideaId === idea.id && v.applicantId === a.me?.id).sort((x, y) => y.at - x.at)[0]
  const acceptedCollaborator = myApplication?.status === 'accepted'
  const canOpenWorkspace = communityOwner || acceptedCollaborator || idea.authorId === a.me?.id
  const backers = Object.entries(a.data.votes)
    .filter(([, ideas]) => !!ideas?.[idea.id])
    .map(([uid]) => uid)
  const cname = ideaCommunity?.name || 'Community'
  const row = (l: string, v?: number) => v == null ? null : <div style={{ marginTop: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mut">{l}</span><span>{v}</span></div><Bar value={v} /></div>
  const startReply = (commentId?: string) => {
    setReplyTo(commentId || null)
    setMentionOpen(false)
    window.setTimeout(() => document.getElementById('idea-discussion-reply')?.focus(), 0)
  }
  const matchingCommunityMembers = communityMemberIds
    .filter(uid => uid !== a.me?.id)
    .map(uid => ({ id: uid, name: a.nm(uid) }))
    .filter(person => person.name && person.name.toLowerCase().includes(mentionQuery.trim().toLowerCase()))
    .sort((first, second) => first.name.localeCompare(second.name))
    .slice(0, 8)
  const updateReplyText = (value: string, cursorPosition: number) => {
    setText(value)
    setMentionedUserIds(current => current.filter(uid => value.includes('@' + a.nm(uid).replace(/^@/, ''))))
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
  const chooseMention = (userId: string) => {
    const name = a.nm(userId).replace(/^@/, '').trim()
    const replacement = '@' + name + ' '
    setText(current => current.slice(0, mentionStart) + replacement + current.slice(mentionStart + mentionQuery.length + 1))
    setMentionedUserIds(current => [...new Set([...current, userId])])
    setMentionOpen(false)
    setMentionQuery('')
    window.setTimeout(() => document.getElementById('idea-discussion-reply')?.focus(), 0)
  }
  const toggleBacking = async () => {
    if (!ideaCommunity || archivedCommunity || voting) return
    setVoting(true)
    try { await a.vote(idea.id) } finally { setVoting(false) }
  }
  const postReply = async () => {
    if (!text.trim()) return a.toast('Write a reply first')
    const ok = await a.addComment(idea.id, text.trim(), replyTo || undefined, mentionedUserIds)
    if (ok) { clearReplyDraft(''); setReplyTo(null); setMentionedUserIds([]) }
  }
  const topLevelComments = comments.filter(comment => !comment.parentId || !comments.some(parent => parent.id === comment.parentId))
  const renderComment = (comment: (typeof comments)[number], nested = false): import('react').ReactNode => {
    const replies = comments.filter(item => item.parentId === comment.id)
    return <div key={comment.id} style={{ marginLeft: nested ? 18 : 0, marginTop: 12, paddingLeft: nested ? 12 : 0, borderLeft: nested ? '1px solid var(--line, rgba(255,255,255,.12))' : undefined }}>
      <div className="msg" style={{ alignItems: 'flex-start' }}><Av id={comment.authorId} size={30} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ fontSize: 15 }}><button className="lk" onClick={() => nav('/me/' + comment.authorId)}>{a.nm(comment.authorId)}</button> <span className="dim">{when(comment.at)}</span></h3>
          <p className="mut" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{comment.text}</p>
          {comment.mentionedUserIds?.length ? <p className="dim" style={{ fontSize: 12, marginTop: 5 }}>Tagged: {comment.mentionedUserIds.map(uid => a.nm(uid)).join(', ')}</p> : null}
          <div className="acts" style={{ marginTop: 7, gap: 8 }}>
            <button className="chip" type="button" onClick={() => startReply(comment.id)}><Icon name="reply" size={13} />Reply</button>
          </div>
        </div>
      </div>
      {replies.map(reply => renderComment(reply, true))}
    </div>
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
          {idea.authorId === a.me?.id && <div className="reason" style={{ marginTop: 20 }}>
            <h3 style={{ fontSize: 18 }}>Your idea, your collaboration</h3>
            {a.data.projects[idea.id]
              ? <><p className="mut" style={{ marginTop: 6 }}>You can join the shared workspace as the idea creator and work alongside accepted contributors.</p><button className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/collaboration/' + idea.id)}><Icon name="collab" size={15} />Open collaboration space</button></>
              : <p className="mut" style={{ marginTop: 6 }}>When the community manager creates a project or accepts a collaborator, you will be able to participate in the shared workspace for this idea.</p>}
          </div>}
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
          {comments.length ? topLevelComments.map(comment => renderComment(comment)) : <p className="mut" style={{ padding: '14px 0' }}>No replies yet. Start the conversation.</p>}
          {replyTo && <div className="chip" style={{ marginTop: 14, display: 'inline-flex', gap: 8 }}>Replying to {a.nm(comments.find(comment => comment.id === replyTo)?.authorId || '')} <button type="button" className="lk" onClick={() => setReplyTo(null)}>Cancel</button></div>}
          <div className="discussion-reply-compose">
            <label className="field"><span>Reply</span><textarea id="idea-discussion-reply" value={text} maxLength={1000} onChange={e => updateReplyText(e.target.value, e.currentTarget.selectionStart ?? e.target.value.length)} rows={3} placeholder="Write a reply… Type @ to mention someone in this community." /></label>
            {mentionOpen && <div className="discussion-mention-menu" role="listbox" aria-label="Community member mentions">
              {mentionLoading ? <p className="dim discussion-mention-status">Loading community members…</p>
                : matchingCommunityMembers.length ? matchingCommunityMembers.map(person => <button key={person.id} type="button" role="option" aria-selected="false" className="discussion-mention-option" onMouseDown={event => event.preventDefault()} onClick={() => chooseMention(person.id)}><Av id={person.id} size={28} /><span><strong>{person.name}</strong><small>Member of {cname}</small></span><Icon name="at-sign" size={14} /></button>)
                : <p className="dim discussion-mention-status">No matching members in this community.</p>}
            </div>}
          </div>
          <p className="dim">Type @ while writing to mention members of this idea’s community. Unfinished replies are saved as drafts on this device.</p>
          <div className="acts" style={{ marginTop: 14 }}><button className="btn p" onClick={postReply}><Icon name="send" size={15} />Reply</button><button className="chip" onClick={() => { clearReplyDraft(''); setReplyTo(null); setMentionedUserIds([]); setMentionOpen(false); setMentionQuery('') }}>Discard draft</button></div>
        </div>
        <div className="glass pad">
          <button disabled={!ideaCommunity || archivedCommunity || voting} className={voted ? 'btn' : 'btn p'} style={{ width: '100%', justifyContent: 'center' }} onClick={() => { void toggleBacking() }}><Icon name="support" />{!ideaCommunity ? 'Loading community…' : archivedCommunity ? 'Archived · read-only' : voting ? 'Saving…' : voted ? 'Backed' : 'Back this idea'}</button>
          <p className="num" style={{ textAlign: 'center' }}>{a.votesOf(idea.id)}</p><p className="dim" style={{ textAlign: 'center' }}>members backing</p>
          <div style={{ marginTop: 18 }}>
            <h3 style={{ marginBottom: 10 }}>People backing this idea</h3>
            {backers.length ? <div style={{ display: 'grid', gap: 10 }}>{backers.map(uid => <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 9 }}><Av id={uid} size={30} /><div style={{ minWidth: 0, flex: 1 }}><button className="lk" onClick={() => nav('/me/' + uid)}>{a.nm(uid)}</button><p className="dim" style={{ fontSize: 12 }}>Supporting this idea</p></div></div>)}</div> : <p className="mut" style={{ fontSize: 14 }}>No one has backed this idea yet.</p>}
          </div>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={() => us.patch({ saved: { [idea.id]: !us.st.saved?.[idea.id] } })}><Icon name="save" />{us.st.saved?.[idea.id] ? 'Saved' : 'Save for later'}</button>
          {r?.score != null && <>{row('Originality', r.o)}{row('Feasibility', r.f)}{row('Relevance', r.r)}</>}
          {(a.data.projects[idea.id] || s === 'selected' || s === 'promoted') && <div className="acts" style={{ marginTop: 14 }}>
            <button className="btn" onClick={() => nav('/projects?idea=' + encodeURIComponent(idea.id))}><Icon name="insight" size={16} />{a.data.projects[idea.id] ? 'View project progress' : 'View selected idea progress'}</button>
            {canOpenWorkspace && a.data.projects[idea.id] && <button className="btn p" onClick={() => nav('/collaboration/' + idea.id)}><Icon name="collab" size={16} />Open collaboration space</button>}
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
