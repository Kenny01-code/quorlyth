import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Av, Empty, Head } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { cn } from '../lib/util'

type Conversation = { id: string; title?: string; type: 'direct' | 'group'; members: string[]; createdBy: string; createdAt: number }
type Message = { id: string; conversationId: string; senderId: string; text: string; at: number; replyTo?: string }
type ReadState = { id: string; userId: string; conversationId: string; lastReadAt: number }

const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2)

export function Messages() {
  const a = useApp()
  const nav = useNavigate()
  const { conversationId } = useParams()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [reads, setReads] = useState<ReadState[]>([])
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedPeople, setSelectedPeople] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [workspaceSize, setWorkspaceSize] = useState<'compact' | 'standard' | 'expanded'>(() => (localStorage.getItem('qmessages:size') as 'compact' | 'standard' | 'expanded') || 'standard')
  const [rotatingLine, setRotatingLine] = useState(0)
  const [rotatingIcon, setRotatingIcon] = useState(0)
  const bottom = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const store = a.backend?.store
  const meId = a.me?.id || ''

  useEffect(() => {
    if (!store || !meId) { setConversations([]); setMessages([]); setReads([]); return }
    const report = (e: unknown) => { console.error('Quorlyth chat sync failed:', e); setError('Live chat sync is unavailable. Check your connection and database setup.') }
    const offC = store.subscribe('conversations', docs => setConversations(docs.map(d => ({ id: d.id, ...d.data })).filter(c => Array.isArray(c.members) && c.members.includes(meId)).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))), report)
    const offM = store.subscribe('messages', docs => setMessages(docs.map(d => ({ id: d.id, ...d.data })).filter(m => typeof m.conversationId === 'string' && typeof m.text === 'string').sort((x, y) => x.at - y.at)), report)
    const offR = store.subscribe('chatReads', docs => setReads(docs.map(d => ({ id: d.id, ...d.data })).filter(r => r.userId === meId)), report)
    return () => { offC(); offM(); offR() }
  }, [store, meId])

  const active = conversations.find(c => c.id === conversationId) || null
  const isPlatformAdmin = (id: string) => id === a.data.ownerId || !!(a.data.profiles[id] as any)?.platformAdmin || (!!a.me && id === a.me.id && a.owner)
  const profileLink = (id: string) => '/me/' + encodeURIComponent(id)
  const activeMessages = useMemo(() => messages.filter(m => m.conversationId === active?.id), [messages, active?.id])
  const people = useMemo(() => {
    const ids = new Set<string>([
      ...Object.keys(a.data.profiles),
      ...Object.keys(a.data.members),
      ...a.data.communities.flatMap(c => [c.ownerId, c.createdBy].filter(Boolean) as string[]),
      ...a.data.ideas.map(i => i.authorId),
    ])
    ids.delete(meId)
    return [...ids].map(id => ({ id, name: a.nm(id) })).sort((x, y) => x.name.localeCompare(y.name))
  }, [a.data.profiles, a.data.members, a.data.communities, a.data.ideas, a.nm, meId])
  const visiblePeople = people.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.id.toLowerCase().includes(query.toLowerCase()))
  const readAt = (id: string) => reads.find(r => r.conversationId === id)?.lastReadAt || 0
  const unreadCount = (c: Conversation) => messages.filter(m => m.conversationId === c.id && m.senderId !== meId && m.at > readAt(c.id)).length
  const titleOf = (c: Conversation) => c.type === 'group' ? (c.title || 'Untitled group') : a.nm(c.members.find(id => id !== meId) || '')
  const lastMessage = (c: Conversation) => messages.filter(m => m.conversationId === c.id).at(-1)
  const formatTime = (at: number) => {
    if (!at) return ''
    const d = new Date(at)
    const today = new Date()
    return d.toDateString() === today.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  useEffect(() => {
    const lineTimer = window.setInterval(() => setRotatingLine(n => (n + 1) % 6), 3600)
    const iconTimer = window.setInterval(() => setRotatingIcon(n => (n + 1) % 5), 2800)
    return () => { window.clearInterval(lineTimer); window.clearInterval(iconTimer) }
  }, [])

  useEffect(() => {
    if (!active || !store || !meId) return
    const now = Date.now()
    const id = meId + '_' + active.id
    void store.set('chatReads/' + id, { userId: meId, conversationId: active.id, lastReadAt: now }).catch(e => console.warn('Could not update chat read state', e))
  }, [active?.id, store, meId, activeMessages.length])

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [active?.id, activeMessages.length])

  async function startDirect(personId: string) {
    if (!store || !meId) return
    setError('')
    const existing = conversations.find(c => c.type === 'direct' && c.members.length === 2 && c.members.includes(personId) && c.members.includes(meId))
    if (existing) { nav('/messages/' + existing.id); setPeopleOpen(false); setQuery(''); return }
    const id = makeId()
    try {
      await store.set('conversations/' + id, { title: '', type: 'direct', members: [meId, personId], createdBy: meId, createdAt: Date.now() })
      nav('/messages/' + id)
      setPeopleOpen(false); setQuery('')
    } catch (e) { setError('Could not start this conversation. ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function createGroup() {
    if (!store || !meId) return
    const members = [...new Set([meId, ...selectedPeople])]
    if (!groupName.trim()) { setError('Give your group a name first.'); return }
    if (members.length < 3) { setError('Choose at least two other people for a group chat.'); return }
    const id = makeId()
    try {
      await store.set('conversations/' + id, { title: groupName.trim().slice(0, 60), type: 'group', members, createdBy: meId, createdAt: Date.now() })
      nav('/messages/' + id)
      setGroupOpen(false); setSelectedPeople([]); setGroupName(''); setQuery('')
    } catch (e) { setError('Could not create the group. ' + (e instanceof Error ? e.message : String(e))) }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    if (!store || !active || !meId || !draft.trim() || sending) return
    const text = draft.trim().slice(0, 4000)
    setSending(true); setError('')
    const id = makeId()
    try {
      await store.set('messages/' + id, { conversationId: active.id, senderId: meId, text, at: Date.now() })
      setDraft('')
      if (textarea.current) textarea.current.style.height = 'auto'
    } catch (e) { setError('Message not sent. ' + (e instanceof Error ? e.message : String(e))) }
    finally { setSending(false); textarea.current?.focus() }
  }

  if (!a.me) return <><Head kicker="Messages" title="Conversations, without the noise." /><div className="glass pad chat-signin"><div className="chat-orb"><Icon name="message" size={32} /></div><h3>Your people. Your ideas. One place.</h3><p className="mut">Sign in to start private conversations and build with your community.</p><button className="btn p" onClick={() => nav('/signin')}>Sign in to continue <Icon name="arrow" size={16} /></button></div></>

  return (
    <div className="chat-page">
      <div className="chat-topline"><div><p className="dim chat-eyebrow">QUORLYTH / MESSAGES</p><h1 className="chat-title">Conversations<span>.</span></h1><p className="mut">Private spaces for ideas to become something real.</p></div><div className="chat-top-actions"><button className="btn" onClick={() => { setGroupOpen(v => !v); setPeopleOpen(false); setError('') }}><Icon name="users" size={16} />New group</button><button className="btn p" onClick={() => { setPeopleOpen(v => !v); setGroupOpen(false); setError('') }}><Icon name="plus" size={16} />New message</button></div></div>
      {error && <div className="chat-error" role="alert"><Icon name="alert" size={16} />{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      {(peopleOpen || groupOpen) && <div className="glass chat-create">
        <div className="chat-create-head"><div><p className="dim">{groupOpen ? 'START A COLLABORATION' : 'FIND YOUR PEOPLE'}</p><h3>{groupOpen ? 'Create a group chat' : 'Start a conversation'}</h3></div><button className="chat-icon-btn" onClick={() => { setPeopleOpen(false); setGroupOpen(false); setQuery('') }} aria-label="Close"><Icon name="x" size={18} /></button></div>
        {groupOpen && <label className="chat-group-name"><span>Group name</span><input value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={60} placeholder="e.g. The next big idea" /></label>}
        <label className="chat-search"><Icon name="search" size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search people by name..." autoFocus /></label>
        <div className="chat-people-list">{visiblePeople.map(p => <button className="chat-person" key={p.id} onClick={() => groupOpen ? setSelectedPeople(old => old.includes(p.id) ? old.filter(x => x !== p.id) : [...old, p.id]) : void startDirect(p.id)}><Av id={p.id} size={42} /><span className="chat-person-copy"><b>{p.name}</b>{isPlatformAdmin(p.id) && <span className="owner-badge">✦ PLATFORM OWNER</span>}<small>{a.data.profiles[p.id]?.head || 'Quorlyth member'}</small></span>{groupOpen ? <span className={cn('chat-check', selectedPeople.includes(p.id) && 'on')}>{selectedPeople.includes(p.id) && <Icon name="check" size={14} />}</span> : <Icon name="arrow-up-right" size={17} />}</button>)}{!visiblePeople.length && <p className="mut chat-empty">No matching members found yet. People appear here after their profiles or community activity is available.</p>}</div>
        {groupOpen && <div className="chat-create-footer"><span className="dim">{selectedPeople.length} selected · choose at least 2</span><button className="btn p" disabled={selectedPeople.length < 2 || !groupName.trim()} onClick={() => void createGroup()}>Create group <Icon name="arrow" size={16} /></button></div>}
      </div>}
      <div className={cn('chat-workspace', 'size-' + workspaceSize)}>
        <aside className={cn('glass chat-sidebar', active && 'has-active')}>
          <div className="chat-sidebar-head"><div><p className="dim">YOUR INBOX</p><h3>Messages <span>{conversations.length || ''}</span></h3></div><button className="chat-icon-btn" title="New message" onClick={() => { setPeopleOpen(true); setGroupOpen(false) }}><Icon name="plus" size={18} /></button></div>
          <label className="chat-filter"><Icon name="search" size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a conversation" /></label>
          <div className="chat-conversation-list">{conversations.filter(c => titleOf(c).toLowerCase().includes(query.toLowerCase()) || (lastMessage(c)?.text || '').toLowerCase().includes(query.toLowerCase())).map(c => {
            const last = lastMessage(c), unread = unreadCount(c)
            return <div key={c.id} role="button" tabIndex={0} className={cn('chat-conversation', active?.id === c.id && 'active', unread > 0 && 'unread')} onClick={() => nav('/messages/' + c.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav('/messages/' + c.id) } }}>
              {c.type === 'group' ? <span className="chat-group-avatar"><Icon name="users" size={20} /></span> : <button className="chat-avatar-link" title={'View ' + titleOf(c) + "'s public profile"} aria-label={'View ' + titleOf(c) + ' public profile'} onClick={e => { e.stopPropagation(); nav(profileLink(c.members.find(id => id !== meId) || '')) }}><Av id={c.members.find(id => id !== meId) || ''} size={46} />{isPlatformAdmin(c.members.find(id => id !== meId) || '') && <span className="admin-orbit" title="Platform owner" aria-label="Platform owner">✦</span>}</button>}
              <span className="chat-conversation-copy"><span className="chat-conversation-title"><span className="chat-title-inline"><b>{titleOf(c)}</b>{c.type === 'direct' && isPlatformAdmin(c.members.find(id => id !== meId) || '') && <span className="owner-badge">✦ OWNER</span>}</span><small>{formatTime(last?.at || c.createdAt)}</small></span><span className="chat-preview">{last ? (last.senderId === meId ? 'You: ' : '') + last.text : c.type === 'group' ? c.members.length + ' people · Start the conversation' : 'Start the conversation'}</span></span>
              {unread > 0 && <span className="chat-unread-count" aria-label={unread + ' unread messages'}>{unread > 99 ? '99+' : unread}</span>}
            </div>
          })}{!conversations.length && <div className="chat-inbox-empty"><span className="chat-empty-icon"><Icon name="message" size={23} /></span><b>Your inbox is a blank canvas.</b><p>Start a private conversation or bring your collaborators together.</p><button className="btn p" onClick={() => { setPeopleOpen(true); setGroupOpen(false) }}>Start chatting</button></div>}</div>
          <div className="chat-sidebar-foot"><span className="chat-secure-dot" />Private conversations <span className="dim">· standard encryption in transit</span></div>
        </aside>
        <div className={cn('glass chat-thread', active && 'has-active')}>
          {active ? <>
            <header className="chat-thread-head"><button className="chat-back-mobile" onClick={() => nav('/messages')} aria-label="Back to inbox"><Icon name="arrow-left" size={18} /></button>
              {active.type === 'group' ? <span className="chat-group-avatar"><Icon name="users" size={20} /></span> : <button className="chat-avatar-link thread-avatar-link" title="View public profile" aria-label="View public profile" onClick={() => nav(profileLink(active.members.find(id => id !== meId) || ''))}><Av id={active.members.find(id => id !== meId) || ''} size={44} />{isPlatformAdmin(active.members.find(id => id !== meId) || '') && <span className="admin-orbit" title="Platform owner" aria-label="Platform owner">✦</span>}</button>}
              <div className="chat-thread-identity"><h3>{titleOf(active)}{active.type === 'direct' && isPlatformAdmin(active.members.find(id => id !== meId) || '') && <span className="owner-badge">✦ PLATFORM OWNER</span>}</h3><p>{active.type === 'group' ? active.members.length + ' members · Group conversation' : 'Private conversation'}</p></div>
              <span className="chat-private-label"><Icon name="lock" size={13} /> PRIVATE</span>
            </header>
            <div className="chat-thread-body">
              <div className="chat-thread-intro"><span className="chat-intro-mark"><Icon name="spark" size={18} /></span><p>{active.type === 'group' ? 'A shared space for good people and bigger ideas.' : 'Good ideas often start with a conversation.'}</p><small>Messages are visible to conversation members.</small></div>
              {activeMessages.map((m, i) => {
                const mine = m.senderId === meId
                const prev = activeMessages[i - 1]
                const showAuthor = active.type === 'group' && !mine && (!prev || prev.senderId !== m.senderId)
                return <div key={m.id} className={cn('chat-message-row', mine && 'mine', showAuthor && 'with-author')}>{showAuthor && <div className="chat-message-author"><button className="chat-author-link" onClick={() => nav(profileLink(m.senderId))} title={'View ' + a.nm(m.senderId) + "'s public profile"}><span>{a.nm(m.senderId)}</span>{isPlatformAdmin(m.senderId) && <span className="owner-badge" title="Platform owner">✦ OWNER</span>}</button></div>}<div className="chat-message-line"><button className="chat-avatar-link message-avatar-link" onClick={() => nav(profileLink(m.senderId))} title={'View ' + a.nm(m.senderId) + "'s public profile"} aria-label={'View ' + a.nm(m.senderId) + ' public profile'}><Av id={m.senderId} size={30} />{isPlatformAdmin(m.senderId) && <span className="admin-orbit" title="Platform owner">✦</span>}</button><div className={cn('chat-bubble', mine ? 'mine' : 'theirs')}><p>{m.text}</p><time>{formatTime(m.at)}</time></div></div></div>
              })}
              <div ref={bottom} />
            </div>
            <form className="chat-composer" onSubmit={sendMessage}><div className="chat-compose-glass"><textarea ref={textarea} value={draft} rows={1} maxLength={4000} onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() } }} placeholder="Write something worth sharing..." aria-label="Message text" /><div className="chat-compose-foot"><span>Enter to send <i>·</i> Shift + Enter for a new line</span><span>{draft.length}/4000</span><button className="chat-send" type="submit" disabled={!draft.trim() || sending} aria-label="Send message">{sending ? <span className="chat-spinner" /> : <Icon name="arrow-up" size={19} />}</button></div></div></form>
          </> : <div className="chat-no-thread"><div className="chat-orbit"><span /><span /><span /><span className="chat-orbit-core" key={rotatingIcon}><Icon name={(['message', 'idea', 'collab', 'audience', 'spark'] as string[])[rotatingIcon]} size={32} /></span></div><p className="dim chat-eyebrow">A SPACE OF YOUR OWN</p><h2 key={rotatingLine} className="chat-rotating-line">{[
            <>Every great thing<br />starts somewhere.</>,
            <>One message can<br />start something real.</>,
            <>Good ideas deserve<br />to find their people.</>,
            <>Build something<br />bigger together.</>,
            <>Your next chapter<br />could start here.</>,
            <>Say the thing<br />worth sharing.</>
          ][rotatingLine]}</h2><p className="mut">Choose a conversation or start a new one. Share a thought, build on an idea, make something happen.</p><div className="chat-no-actions"><button className="btn p" onClick={() => { setPeopleOpen(true); setGroupOpen(false) }}><Icon name="plus" size={16} />Start a conversation</button><button className="btn" onClick={() => { setGroupOpen(true); setPeopleOpen(false) }}><Icon name="users" size={16} />Create a group</button></div></div>}
        </div>
      </div>
      <p className="chat-footnote">Designed for collaboration. <span>Built around the ideas you bring to life.</span></p>
    </div>
  )
}
