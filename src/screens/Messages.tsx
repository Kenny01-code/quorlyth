import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Av, Empty, Head } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { cn } from '../lib/util'
import DitherVeil from '../components/DitherVeil'

type Conversation = { id: string; title?: string; type: 'direct' | 'group'; members: string[]; createdBy: string; createdAt: number }
type Message = { id: string; conversationId: string; senderId: string; text: string; at: number; replyTo?: string }
type ReadState = { id: string; userId: string; conversationId: string; lastReadAt: number }
type ChatPreference = { id: string; userId: string; conversationId: string; pinned?: boolean; archived?: boolean; hidden?: boolean; muted?: boolean; updatedAt?: number }
type MessageEdit = { id: string; messageId: string; conversationId: string; senderId: string; text: string; editedAt: number }
type MessageTombstone = { id: string; messageId: string; conversationId: string; senderId: string; deletedAt: number }
type MessageHide = { id: string; messageId: string; conversationId: string; userId: string; hiddenAt: number }
type MessageReaction = { id: string; messageId: string; conversationId: string; userId: string; reaction: string; at: number }
type ConversationActionMenu = { conversationId: string; x: number; y: number }
type MessageActionMenu = { messageId: string; x: number; y: number }
const REACTIONS = ['👍', '❤️', '😂', '🔥', '👏', '👀']

function readableChatError(error: unknown): string {
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown; status?: unknown; error_description?: unknown }
    const message = [e.message, e.details, e.hint, e.error_description].filter(v => typeof v === 'string' && v.trim()).join(' · ')
    if (message) return (e.code ? message + ' (code ' + String(e.code) + ')' : message).slice(0, 420)
    try {
      const json = JSON.stringify(error)
      if (json && json !== '{}') return json.slice(0, 420)
    } catch { /* use fallback below */ }
    const props = Object.getOwnPropertyNames(error).map(k => {
      try { return k + ': ' + String((error as any)[k]) } catch { return '' }
    }).filter(Boolean)
    if (props.length) return props.join(' · ').slice(0, 420)
  }
  return error instanceof Error ? error.message : String(error)
}

const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2)

export function Messages() {
  const a = useApp()
  const nav = useNavigate()
  const { conversationId } = useParams()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [reads, setReads] = useState<ReadState[]>([])
  const [chatPreferences, setChatPreferences] = useState<ChatPreference[]>([])
  const [messageEdits, setMessageEdits] = useState<MessageEdit[]>([])
  const [messageTombstones, setMessageTombstones] = useState<MessageTombstone[]>([])
  const [messageHides, setMessageHides] = useState<MessageHide[]>([])
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([])
  const [conversationMenu, setConversationMenu] = useState<ConversationActionMenu | null>(null)
  const [messageMenu, setMessageMenu] = useState<MessageActionMenu | null>(null)
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [replyToMessageId, setReplyToMessageId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [peopleQuery, setPeopleQuery] = useState('')
  const [conversationFilter, setConversationFilter] = useState<'all' | 'groups' | 'unread' | 'archived'>('all')
  const [groupName, setGroupName] = useState('')
  const [selectedPeople, setSelectedPeople] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [workspaceSize, setWorkspaceSize] = useState<'compact' | 'standard' | 'expanded'>(() => (localStorage.getItem('qmessages:size') as 'compact' | 'standard' | 'expanded') || 'standard')
  const [rotatingLine, setRotatingLine] = useState(0)
  const [rotatingIcon, setRotatingIcon] = useState(0)
  const bottom = useRef<HTMLDivElement>(null)
  const threadBody = useRef<HTMLDivElement>(null)
  const shouldStickToBottom = useRef(true)
  const lastConversationId = useRef<string | undefined>(undefined)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const store = a.backend?.store
  const meId = a.me?.id || ''

  useEffect(() => {
    if (!store || !meId) { setConversations([]); setMessages([]); setReads([]); setChatPreferences([]); setMessageEdits([]); setMessageTombstones([]); setMessageHides([]); setMessageReactions([]); return }
    const report = (e: unknown) => { console.error('Quorlyth chat sync failed:', e); setError('Live chat sync is unavailable. Check your connection and database setup.') }
    const offC = store.subscribe('conversations', docs => setConversations(docs.map(d => ({ id: d.id, ...d.data })).filter(c => Array.isArray(c.members) && c.members.includes(meId)).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))), report)
    const offM = store.subscribe('messages', docs => setMessages(docs.map(d => ({ id: d.id, ...d.data })).filter(m => typeof m.conversationId === 'string' && typeof m.text === 'string').sort((x, y) => x.at - y.at)), report)
    const offR = store.subscribe('chatReads', docs => setReads(docs.map(d => ({ id: d.id, ...d.data })).filter(r => r.userId === meId)), report)
    const offP = store.subscribe('chatPreferences', docs => setChatPreferences(docs.map(d => ({ id: d.id, ...d.data })).filter(p => p.userId === meId)), report)
    const offE = store.subscribe('chatMessageEdits', docs => setMessageEdits(docs.map(d => ({ id: d.id, ...d.data }))), report)
    const offT = store.subscribe('chatMessageTombstones', docs => setMessageTombstones(docs.map(d => ({ id: d.id, ...d.data }))), report)
    const offH = store.subscribe('chatMessageHides', docs => setMessageHides(docs.map(d => ({ id: d.id, ...d.data })).filter(h => h.userId === meId)), report)
    const offReact = store.subscribe('chatMessageReactions', docs => setMessageReactions(docs.map(d => ({ id: d.id, ...d.data })).filter(r => typeof r.messageId === 'string' && typeof r.reaction === 'string' && r.reaction)), report)
    return () => { offC(); offM(); offR(); offP(); offE(); offT(); offH(); offReact() }
  }, [store, meId])

  const active = conversations.find(c => c.id === conversationId) || null
  const isPlatformAdmin = (id: string) => id === a.data.ownerId || !!(a.data.profiles[id] as any)?.platformAdmin || (!!a.me && id === a.me.id && a.owner)
  const isCommunityCreator = (id: string) => id !== a.data.ownerId && !(a.me && id === a.me.id && a.owner) && a.data.communities.some(c => c.ownerId === id || c.createdBy === id)
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
  const visiblePeople = people.filter(p => p.name.toLowerCase().includes(peopleQuery.toLowerCase()) || p.id.toLowerCase().includes(peopleQuery.toLowerCase()))
  const readAt = (id: string) => reads.find(r => r.conversationId === id)?.lastReadAt || 0
  const unreadCount = (c: Conversation) => messages.filter(m => m.conversationId === c.id && m.senderId !== meId && m.at > readAt(c.id)).length
  const titleOf = (c: Conversation) => c.type === 'group' ? (c.title || 'Untitled group') : a.nm(c.members.find(id => id !== meId) || '')
  const lastMessage = (c: Conversation) => messages.filter(m => m.conversationId === c.id).at(-1)
  const preferenceFor = (id: string) => chatPreferences.find(p => p.userId === meId && p.conversationId === id)
  const messageText = (m: Message) => messageEdits.find(e => e.messageId === m.id)?.text || m.text
  const isDeletedMessage = (id: string) => messageTombstones.some(t => t.messageId === id)
  const visibleConversations = useMemo(() => conversations
    .filter(c => {
      const pref = chatPreferences.find(p => p.userId === meId && p.conversationId === c.id)
      if (pref?.hidden) return false
      if (conversationFilter === 'archived') { if (!pref?.archived) return false }
      else if (pref?.archived) return false
      if (conversationFilter === 'groups' && c.type !== 'group') return false
      if (conversationFilter === 'unread' && unreadCount(c) === 0) return false
      return titleOf(c).toLowerCase().includes(query.toLowerCase()) || (lastMessage(c)?.text || '').toLowerCase().includes(query.toLowerCase())
    })
    .sort((x, y) => Number(!!preferenceFor(y.id)?.pinned) - Number(!!preferenceFor(x.id)?.pinned) || (y.createdAt || 0) - (x.createdAt || 0)),
    [conversations, chatPreferences, meId, conversationFilter, query, messages, reads, a.nm])

  async function saveChatPreference(conversationId: string, patch: Partial<ChatPreference>) {
    if (!store || !meId) return
    const current = chatPreferences.find(p => p.userId === meId && p.conversationId === conversationId)
    const next: ChatPreference = { ...current, ...patch, userId: meId, conversationId, id: meId + '_' + conversationId, updatedAt: Date.now() }
    await store.set('chatPreferences/' + meId + '_' + conversationId, next)
    setChatPreferences(old => [...old.filter(p => !(p.userId === meId && p.conversationId === conversationId)), next])
  }

  function openConversationMenu(id: string, x: number, y: number) {
    setMessageMenu(null)
    setConversationMenu({ conversationId: id, x: Math.max(12, Math.min(x, window.innerWidth - 224)), y: Math.max(12, Math.min(y, window.innerHeight - 315)) })
  }

  function openMessageMenu(id: string, x: number, y: number) {
    setConversationMenu(null)
    setMessageMenu({ messageId: id, x: Math.max(12, Math.min(x, window.innerWidth - 245)), y: Math.max(12, Math.min(y, window.innerHeight - 360)) })
  }

  async function actOnConversation(action: 'pin' | 'folder' | 'mute' | 'delete' | 'unread' | 'read') {
    const id = conversationMenu?.conversationId
    if (!id || !store || !meId) return
    const pref = preferenceFor(id)
    setConversationMenu(null)
    try {
      if (action === 'delete') {
        if (!window.confirm('Delete this chat from your inbox? This hides it only for you; other participants keep their conversation and messages.')) return
        await saveChatPreference(id, { hidden: true, archived: false })
        if (active?.id === id) nav('/messages')
        a.toast('Chat removed from your inbox')
      } else if (action === 'pin') {
        await saveChatPreference(id, { pinned: !pref?.pinned })
        a.toast(pref?.pinned ? 'Chat unpinned' : 'Chat pinned to the top')
      } else if (action === 'folder') {
        await saveChatPreference(id, { archived: !pref?.archived })
        a.toast(pref?.archived ? 'Chat restored to your inbox' : 'Chat archived')
      } else if (action === 'mute') {
        await saveChatPreference(id, { muted: !pref?.muted })
        a.toast(pref?.muted ? 'Chat unmuted' : 'Chat muted')
      } else if (action === 'unread') {
        await store.delete('chatReads/' + meId + '_' + id)
        a.toast('Marked as unread')
      } else {
        await store.set('chatReads/' + meId + '_' + id, { userId: meId, conversationId: id, lastReadAt: Date.now() })
        a.toast('Marked as read')
      }
    } catch (e) { setError('That chat action could not be saved. ' + readableChatError(e)) }
  }

  async function actOnMessage(action: 'message' | 'copy' | 'edit' | 'delete-me' | 'delete-all' | 'react', m: Message, reaction?: string) {
    if (!store || !meId) return
    setMessageMenu(null)
    try {
      if (action === 'message') {
        setReplyToMessageId(m.id)
        textarea.current?.focus()
        return
      }
      if (action === 'copy') {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable in this browser.')
        await navigator.clipboard.writeText(messageText(m))
        a.toast('Message copied')
        return
      }
      if (action === 'edit') {
        if (m.senderId !== meId || isDeletedMessage(m.id)) return
        setEditingMessageId(m.id)
        setEditDraft(messageText(m))
        return
      }
      if (action === 'delete-me') {
        if (!window.confirm('Remove this message from your view? Other participants can still see it.')) return
        await store.set('chatMessageHides/' + m.id + '_' + meId, { messageId: m.id, conversationId: m.conversationId, userId: meId, hiddenAt: Date.now() })
        a.toast('Message removed from your view')
        return
      }
      if (action === 'delete-all') {
        if (m.senderId !== meId) return
        if (!window.confirm('Delete this message for everyone in the conversation?')) return
        await store.set('chatMessageTombstones/' + m.id, { messageId: m.id, conversationId: m.conversationId, senderId: meId, deletedAt: Date.now() })
        a.toast('Message deleted for everyone')
        return
      }
      if (action === 'react' && reaction) {
        const existing = messageReactions.find(r => r.messageId === m.id && r.userId === meId)
        await store.set('chatMessageReactions/' + m.id + '_' + meId, { messageId: m.id, conversationId: m.conversationId, userId: meId, reaction: existing?.reaction === reaction ? '' : reaction, at: Date.now() })
      }
    } catch (e) { setError('That message action could not be completed. ' + readableChatError(e)) }
  }

  async function saveMessageEdit(m: Message) {
    if (!store || !meId || m.senderId !== meId || !editDraft.trim()) return
    try {
      await store.set('chatMessageEdits/' + m.id, { messageId: m.id, conversationId: m.conversationId, senderId: meId, text: editDraft.trim().slice(0, 4000), editedAt: Date.now() })
      setEditingMessageId(null); setEditDraft('')
      a.toast('Message updated')
    } catch (e) { setError('Could not edit this message. ' + readableChatError(e)) }
  }
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

  useEffect(() => {
    const pane = threadBody.current
    if (!pane) return
    if (lastConversationId.current !== active?.id) {
      lastConversationId.current = active?.id
      shouldStickToBottom.current = true
    }
    if (shouldStickToBottom.current) pane.scrollTop = pane.scrollHeight
  }, [active?.id, activeMessages.length])

  async function startDirect(personId: string) {
    if (!store || !meId) return
    setError('')
    const existing = conversations.find(c => c.type === 'direct' && c.members.length === 2 && c.members.includes(personId) && c.members.includes(meId))
    if (existing) { try { await saveChatPreference(existing.id, { hidden: false, archived: false }) } catch {} nav('/messages/' + existing.id); setPeopleOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery(''); return }
    const id = makeId()
    try {
      await store.set('conversations/' + id, { title: '', type: 'direct', members: [meId, personId], createdBy: meId, createdAt: Date.now() })
      nav('/messages/' + id)
      setPeopleOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery('')
    } catch (e) { setError('Could not start this conversation. ' + readableChatError(e)) }
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
      setGroupOpen(false); setSettingsOpen(false); setProfileOpen(false); setSelectedPeople([]); setGroupName(''); setPeopleQuery('')
    } catch (e) {
      const detail = readableChatError(e)
      console.error('Quorlyth group creation failed:', e)
      setError('Could not create the group. ' + (detail && detail !== '[object Object]' ? detail : 'The database rejected the conversation. Confirm the private/group chat migration is applied and try again.'))
    }
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    if (!store || !active || !meId || !draft.trim() || sending) return
    const text = draft.trim().slice(0, 4000)
    setSending(true); setError('')
    const id = makeId()
    try {
      await store.set('messages/' + id, { conversationId: active.id, senderId: meId, text, at: Date.now(), ...(replyToMessageId ? { replyTo: replyToMessageId } : {}) })
      setDraft('')
      setReplyToMessageId(null)
      if (textarea.current) textarea.current.style.height = 'auto'
    } catch (e) { setError('Message not sent. ' + readableChatError(e)) }
    finally { setSending(false); textarea.current?.focus() }
  }

  if (!a.me) return <><Head kicker="Messages" title="Conversations, without the noise." /><div className="glass pad chat-signin"><div className="chat-orb"><Icon name="message" size={32} /></div><h3>Your people. Your ideas. One place.</h3><p className="mut">Sign in to start private conversations and build with your community.</p><button className="btn p" onClick={() => nav('/signin')}>Sign in to continue <Icon name="arrow" size={16} /></button></div></>

  return (
    <div className="chat-page">
      <DitherVeil className="chat-dither-background" wander rim={0.16} pixelSize={2} levels={2} inkColor="#050505" paperColor="#c9c9c9" contrast={1.15} revealRadius={220} softness={0.62} />
      <div className="chat-dither-vignette" aria-hidden="true" />
      <div className="chat-topline"><div className="chat-page-heading"><span className="chat-heading-mark"><Icon name="message" size={17} /></span><div><h2 className="chat-title">Messages</h2><p className="mut">Your conversations, thoughtfully connected</p></div></div><div className="chat-top-actions"><button className="btn" onClick={() => { setGroupOpen(true); setPeopleOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery(''); setError('') }}><Icon name="users" size={16} />New group</button><button className="btn p" onClick={() => { setPeopleOpen(true); setGroupOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery(''); setError('') }}><Icon name="plus" size={16} />New conversation</button></div></div>
      {error && <div className="chat-error" role="alert"><Icon name="alert" size={16} />{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      <div className={cn('chat-workspace', 'size-' + workspaceSize, (peopleOpen || groupOpen || settingsOpen || profileOpen) && 'with-sidepanel')}>
        <aside className={cn('glass chat-sidebar', active && 'has-active')}>
          <nav className="chat-utility-nav" aria-label="Messaging navigation">
            <button className={cn('chat-utility-item', !peopleOpen && !groupOpen && !settingsOpen && !profileOpen && 'on')} onClick={() => { setPeopleOpen(false); setGroupOpen(false); setSettingsOpen(false); setProfileOpen(false); setConversationFilter('all') }}><Icon name="message" size={16} /><span>Chats</span></button>
            <button className={cn('chat-utility-item', peopleOpen && 'on')} onClick={() => { setPeopleOpen(true); setGroupOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery(''); setError('') }}><Icon name="users" size={16} /><span>People</span></button>
            <button className={cn('chat-utility-item', profileOpen && 'on')} onClick={() => { setProfileOpen(true); setPeopleOpen(false); setGroupOpen(false); setSettingsOpen(false) }}><Icon name="member" size={16} /><span>Profile</span></button>
            <button className={cn('chat-utility-item', settingsOpen && 'on')} onClick={() => { setSettingsOpen(true); setPeopleOpen(false); setGroupOpen(false); setProfileOpen(false) }}><Icon name="settings" size={16} /><span>Settings</span></button>
          </nav>
          <div className="chat-inbox-panel">
           <div className="chat-sidebar-head"><div><p className="dim">YOUR INBOX</p><h3>Messages <span>{conversations.length || ''}</span></h3></div><button className="chat-icon-btn" title="New message" onClick={() => { setPeopleOpen(true); setGroupOpen(false) }}><Icon name="plus" size={18} /></button></div>
          <label className="chat-filter"><Icon name="search" size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a conversation" /></label>
          <div className="chat-filter-tabs" role="group" aria-label="Filter conversations"><button className={cn(conversationFilter === 'all' && 'on')} onClick={() => setConversationFilter('all')}>All</button><button className={cn(conversationFilter === 'groups' && 'on')} onClick={() => setConversationFilter('groups')}>Groups</button><button className={cn(conversationFilter === 'unread' && 'on')} onClick={() => setConversationFilter('unread')}>Unread</button><button className={cn(conversationFilter === 'archived' && 'on')} onClick={() => setConversationFilter('archived')}>Archived</button></div>
          <div className="chat-conversation-list">{visibleConversations.map(c => {
            const last = lastMessage(c), unread = unreadCount(c)
            const pref = preferenceFor(c.id)
            return <div key={c.id} id={'chat-list-' + c.id} role="button" tabIndex={0} className={cn('chat-conversation', active?.id === c.id && 'active', unread > 0 && 'unread', pref?.pinned && 'is-pinned', pref?.archived && 'is-archived')} onClick={() => nav('/messages/' + c.id)} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openConversationMenu(c.id, e.clientX, e.clientY) }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nav('/messages/' + c.id) } }}>
              {c.type === 'group' ? <span className="chat-group-avatar"><Icon name="users" size={20} /></span> : <button className="chat-avatar-link" title={'View ' + titleOf(c) + "'s public profile"} aria-label={'View ' + titleOf(c) + ' public profile'} onClick={e => { e.stopPropagation(); nav(profileLink(c.members.find(id => id !== meId) || '')) }}><Av id={c.members.find(id => id !== meId) || ''} size={46} />{isPlatformAdmin(c.members.find(id => id !== meId) || '') && <span className="admin-orbit" title="Platform owner" aria-label="Platform owner">✦</span>}</button>}
              <span className="chat-conversation-copy"><span className="chat-conversation-title"><span className="chat-title-inline"><b>{titleOf(c)}</b>{c.type === 'direct' && isPlatformAdmin(c.members.find(id => id !== meId) || '') && <span className="owner-badge">✦ OWNER</span>}</span><small>{formatTime(last?.at || c.createdAt)}</small></span><span className="chat-preview">{last ? (last.senderId === meId ? 'You: ' : '') + last.text : c.type === 'group' ? c.members.length + ' people · Start the conversation' : 'Start the conversation'}</span></span>
              {pref?.pinned && <span className="chat-pin-indicator" title="Pinned chat"><Icon name="pin" size={12} /></span>}
              {pref?.muted && <span className="chat-pin-indicator" title="Muted chat"><Icon name="bell" size={12} /></span>}
              {unread > 0 && <span className="chat-unread-count" aria-label={unread + ' unread messages'}>{unread > 99 ? '99+' : unread}</span>}
              <button className="chat-conversation-menu-trigger" type="button" aria-label={'Options for ' + titleOf(c)} title="Chat options" onClick={e => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openConversationMenu(c.id, r.right - 210, r.bottom + 4) }}><Icon name="more" size={17} /></button>
            </div>
          })}{!visibleConversations.length && <div className="chat-inbox-empty"><span className="chat-empty-icon"><Icon name="message" size={23} /></span><b>{conversationFilter === 'archived' ? 'No archived conversations.' : 'Your inbox is a blank canvas.'}</b><p>{conversationFilter === 'archived' ? 'Chats you archive will live here until you restore them.' : 'Start a private conversation or bring your collaborators together.'}</p>{conversationFilter !== 'archived' && <button className="btn p" onClick={() => { setPeopleOpen(true); setGroupOpen(false) }}>Start chatting</button>}</div>}</div>
          <div className="chat-sidebar-foot"><span className="chat-secure-dot" />Private conversations <span className="dim">· standard encryption in transit</span></div>
        </div>
         </aside>
        <div className={cn('glass chat-thread', active && 'has-active')}>
          {active ? <>
            <header className="chat-thread-head"><button className="chat-back-mobile" onClick={() => nav('/messages')} aria-label="Back to inbox"><Icon name="arrow-left" size={18} /></button>
              {active.type === 'group' ? <span className="chat-group-avatar"><Icon name="users" size={20} /></span> : <button className="chat-avatar-link thread-avatar-link" title="View public profile" aria-label="View public profile" onClick={() => nav(profileLink(active.members.find(id => id !== meId) || ''))}><Av id={active.members.find(id => id !== meId) || ''} size={44} />{isPlatformAdmin(active.members.find(id => id !== meId) || '') && <span className="admin-orbit" title="Platform owner" aria-label="Platform owner">✦</span>}</button>}
              <div className="chat-thread-identity"><h3>{titleOf(active)}{active.type === 'direct' && isPlatformAdmin(active.members.find(id => id !== meId) || '') && <span className="owner-badge">✦ PLATFORM OWNER</span>}</h3><p>{active.type === 'group' ? active.members.length + ' members · Group conversation' : 'Private conversation'}</p></div>
              <span className="chat-private-label"><Icon name="lock" size={13} /> PRIVATE</span>
              <button className="chat-icon-btn chat-thread-menu-trigger" type="button" aria-label="Conversation options" title="Conversation options" onClick={e => { const r = e.currentTarget.getBoundingClientRect(); openConversationMenu(active.id, r.left - 205, r.bottom + 6) }}><Icon name="more" size={18} /></button>
            </header>
            <div className="chat-thread-body" ref={threadBody} onScroll={e => { const pane = e.currentTarget; shouldStickToBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 120 }}>
              <div className="chat-thread-intro"><span className="chat-intro-mark"><Icon name="spark" size={18} /></span><p>{active.type === 'group' ? 'A shared space for good people and bigger ideas.' : 'Good ideas often start with a conversation.'}</p><small>Messages are visible to conversation members.</small></div>
              {activeMessages.filter(m => !messageHides.some(h => h.messageId === m.id && h.userId === meId)).map((m, i, renderedMessages) => {
                const mine = m.senderId === meId
                const prev = renderedMessages[i - 1]
                const showAuthor = active.type === 'group' && !mine && (!prev || prev.senderId !== m.senderId)
                const deleted = isDeletedMessage(m.id)
                const reply = m.replyTo ? activeMessages.find(message => message.id === m.replyTo) : undefined
                const reactions = messageReactions.filter(r => r.messageId === m.id && r.reaction)
                const reactionTypes = [...new Set(reactions.map(r => r.reaction))]
                return <div id={'chat-message-' + m.id} key={m.id} className={cn('chat-message-row', mine && 'mine', showAuthor && 'with-author', deleted && 'is-deleted')} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); openMessageMenu(m.id, e.clientX, e.clientY) }}>
                  {showAuthor && <div className="chat-message-author"><button className="chat-author-link" onClick={() => nav(profileLink(m.senderId))} title={'View ' + a.nm(m.senderId) + "'s public profile"}><span>{a.nm(m.senderId)}</span>{isPlatformAdmin(m.senderId) && <span className="owner-badge" title="Platform owner">✦ OWNER</span>}</button></div>}
                  <div className="chat-message-line">
                    <button className="chat-avatar-link message-avatar-link" onClick={() => nav(profileLink(m.senderId))} title={'View ' + a.nm(m.senderId) + "'s public profile"} aria-label={'View ' + a.nm(m.senderId) + ' public profile'}><Av id={m.senderId} size={30} />{isPlatformAdmin(m.senderId) && <span className="admin-orbit" title="Platform owner">✦</span>}</button>
                    <div className={cn('chat-bubble', mine ? 'mine' : 'theirs')}>
                      {reply && <button className="chat-reply-reference" type="button" onClick={() => document.getElementById('chat-message-' + reply.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><span>{a.nm(reply.senderId)}</span><small>{messageText(reply).slice(0, 110)}</small></button>}
                      {editingMessageId === m.id ? <div className="chat-edit-block"><textarea value={editDraft} maxLength={4000} rows={3} onChange={e => setEditDraft(e.target.value)} aria-label="Edit message text" /><div><button type="button" className="chat-small-action" onClick={() => { setEditingMessageId(null); setEditDraft('') }}>Cancel</button><button type="button" className="chat-small-action is-primary" disabled={!editDraft.trim()} onClick={() => void saveMessageEdit(m)}>Save edit</button></div></div> : <p>{deleted ? 'This message was deleted.' : messageText(m)}</p>}
                      <time>{formatTime(m.at)}{messageEdits.some(edit => edit.messageId === m.id) && !deleted && ' · edited'}</time>
                    </div>
                    <button className="chat-message-menu-trigger" type="button" aria-label="Message options" title="Message options" onClick={e => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); openMessageMenu(m.id, r.left - 215, r.top) }}><Icon name="more" size={16} /></button>
                  </div>
                  {reactionTypes.length > 0 && !deleted && <div className="chat-message-reactions">{reactionTypes.map(emoji => <button type="button" key={emoji} className={cn('chat-reaction-pill', reactions.some(r => r.userId === meId && r.reaction === emoji) && 'mine')} onClick={() => void actOnMessage('react', m, emoji)}>{emoji}<span>{reactions.filter(r => r.reaction === emoji).length}</span></button>)}</div>}
                </div>
              })}
              <div ref={bottom} />
            </div>
            <form className="chat-composer" onSubmit={sendMessage}>
              {replyToMessageId && <div className="chat-reply-composer"><div><b>Replying to {a.nm(activeMessages.find(m => m.id === replyToMessageId)?.senderId || meId)}</b><small>{messageText(activeMessages.find(m => m.id === replyToMessageId) || ({ id: '', conversationId: active.id, senderId: meId, text: '', at: 0 } as Message)).slice(0, 130)}</small></div><button type="button" aria-label="Cancel reply" onClick={() => setReplyToMessageId(null)}><Icon name="x" size={15} /></button></div>}
              <div className="chat-compose-glass"><textarea ref={textarea} value={draft} rows={1} maxLength={4000} onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() } }} placeholder="Write something worth sharing..." aria-label="Message text" /><div className="chat-compose-foot"><span>Enter to send <i>·</i> Shift + Enter for a new line</span><span>{draft.length}/4000</span><button className="chat-send" type="submit" disabled={!draft.trim() || sending} aria-label="Send message">{sending ? <span className="chat-spinner" /> : <Icon name="arrow-up" size={19} />}</button></div></div></form>
          </> : <div className="chat-no-thread"><div className="chat-orbit"><span /><span /><span /><span className="chat-orbit-core" key={rotatingIcon}><Icon name={(['message', 'idea', 'collab', 'audience', 'spark'] as string[])[rotatingIcon]} size={32} /></span></div><p className="dim chat-eyebrow">A SPACE OF YOUR OWN</p><h2 key={rotatingLine} className="chat-rotating-line">{[
            <>Every great thing<br />starts somewhere.</>,
            <>One message can<br />start something real.</>,
            <>Good ideas deserve<br />to find their people.</>,
            <>Build something<br />bigger together.</>,
            <>Your next chapter<br />could start here.</>,
            <>Make room for<br />something meaningful.</>
          ][rotatingLine]}</h2><p className="chat-hero-tagline">Say the thing worth sharing.</p><p className="mut">Choose a conversation or start a new one. Share a thought, build on an idea, make something happen.</p><div className="chat-no-actions"><button className="btn p" onClick={() => { setPeopleOpen(true); setGroupOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery('') }}><Icon name="plus" size={16} />Start a conversation</button><button className="btn" onClick={() => { setGroupOpen(true); setPeopleOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery('') }}><Icon name="users" size={16} />Create a group</button></div></div>}
        </div>
        {(peopleOpen || groupOpen || settingsOpen || profileOpen) && <aside className={cn('glass chat-create', settingsOpen && 'chat-create-settings', profileOpen && 'chat-create-profile')} aria-label={settingsOpen ? 'Message settings' : profileOpen ? 'My profile' : groupOpen ? 'Create group' : 'New conversation'}>
          <div className="chat-create-head"><div><p className="dim">{settingsOpen ? 'PREFERENCES & CONTROLS' : profileOpen ? 'YOUR QUORLYTH IDENTITY' : groupOpen ? 'START A COLLABORATION' : 'FIND YOUR PEOPLE'}</p><h3>{settingsOpen ? 'Message settings' : profileOpen ? 'My profile' : groupOpen ? 'Create a group chat' : 'New conversation'}</h3></div><button className="chat-icon-btn" onClick={() => { setPeopleOpen(false); setGroupOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery('') }} aria-label="Close panel"><Icon name="x" size={18} /></button></div>
          {(peopleOpen || groupOpen) && <>
            {groupOpen && <label className="chat-group-name"><span>Group name</span><input value={groupName} onChange={e => setGroupName(e.target.value)} maxLength={60} placeholder="e.g. The next big idea" /></label>}
            <label className="chat-search"><Icon name="search" size={18} /><input value={peopleQuery} onChange={e => setPeopleQuery(e.target.value)} placeholder="Search people by name..." autoFocus /></label>
            <div className="chat-people-list">{visiblePeople.map(p => <button className="chat-person" key={p.id} onClick={() => groupOpen ? setSelectedPeople(old => old.includes(p.id) ? old.filter(x => x !== p.id) : [...old, p.id]) : void startDirect(p.id)}><Av id={p.id} size={42} /><span className="chat-person-copy"><b>{p.name}</b>{isPlatformAdmin(p.id) && <span className="owner-badge">✦ PLATFORM OWNER</span>}{isCommunityCreator(p.id) && <span className="creator-badge"><span aria-hidden="true">✧</span> COMMUNITY CREATOR</span>}<small>{a.data.profiles[p.id]?.head || 'Quorlyth member'}</small></span>{groupOpen ? <span className={cn('chat-check', selectedPeople.includes(p.id) && 'on')}>{selectedPeople.includes(p.id) && <Icon name="check" size={14} />}</span> : <Icon name="arrow-up-right" size={17} />}</button>)}{!visiblePeople.length && <p className="mut chat-empty">No matching members found yet. People appear here after their profiles or community activity is available.</p>}</div>
            {groupOpen && <div className="chat-create-footer"><span className="dim">{selectedPeople.length} selected · choose at least 2</span><button className="btn p" disabled={selectedPeople.length < 2 || !groupName.trim()} onClick={() => void createGroup()}>Create group <Icon name="arrow" size={16} /></button></div>}
          </>}
          {profileOpen && <div className="chat-panel-profile"><div className="chat-profile-card"><Av id={meId} size={72} /><div><h4>{a.nm(meId)}</h4><p>{a.data.profiles[meId]?.head || 'Quorlyth member'}</p><small>Signed in to Quorlyth</small></div></div><div className="chat-panel-note">Your profile is how people recognize you across conversations and communities.</div><button className="btn p chat-panel-action" onClick={() => nav('/me')}><Icon name="member" size={16} />Open my profile <Icon name="arrow-up-right" size={15} /></button><button className="btn chat-panel-action" onClick={() => nav('/settings')}><Icon name="settings" size={16} />Account settings <Icon name="arrow-up-right" size={15} /></button></div>}
          {settingsOpen && <div className="chat-panel-settings"><p className="chat-panel-intro">Make your messaging space feel like yours. Full account controls remain available in Quorlyth settings.</p><button className="chat-setting-row" onClick={() => nav('/settings')}><span className="chat-setting-icon"><Icon name="settings" size={17} /></span><span><b>Account & preferences</b><small>Manage your Quorlyth settings</small></span><Icon name="arrow-up-right" size={16} /></button><button className="chat-setting-row" onClick={() => nav('/me')}><span className="chat-setting-icon"><Icon name="member" size={17} /></span><span><b>Profile & identity</b><small>Update how others see you</small></span><Icon name="arrow-up-right" size={16} /></button><button className="chat-setting-row" onClick={() => { setSettingsOpen(false); setPeopleOpen(false); setGroupOpen(false); setProfileOpen(false); setConversationFilter('unread') }}><span className="chat-setting-icon"><Icon name="bell" size={17} /></span><span><b>Unread messages</b><small>Filter your inbox to unread conversations</small></span><Icon name="arrow-up-right" size={16} /></button><div className="chat-panel-note">Only settings that are implemented by the existing account system are shown as account controls. Messaging-specific preferences can be expanded without pretending unsupported features are active.</div></div>}
        </aside>}
      </div>
      {conversationMenu && <><button className="chat-context-backdrop" aria-label="Close chat options" onClick={() => setConversationMenu(null)} /><div className="chat-context-menu" role="menu" style={{ left: conversationMenu.x, top: conversationMenu.y }} onClick={e => e.stopPropagation()}>
        <p>CONVERSATION OPTIONS</p>
        <button role="menuitem" onClick={() => void actOnConversation('pin')}><Icon name={preferenceFor(conversationMenu.conversationId)?.pinned ? 'pin' : 'pin'} size={15} />{preferenceFor(conversationMenu.conversationId)?.pinned ? 'Unpin chat' : 'Pin to top'}</button>
        <button role="menuitem" onClick={() => void actOnConversation('unread')}><Icon name="mail" size={15} />Mark as unread</button>
        <button role="menuitem" onClick={() => void actOnConversation('read')}><Icon name="mail" size={15} />Mark as read</button>
        <button role="menuitem" onClick={() => void actOnConversation('mute')}><Icon name={preferenceFor(conversationMenu.conversationId)?.muted ? 'bell' : 'bell'} size={15} />{preferenceFor(conversationMenu.conversationId)?.muted ? 'Unmute notifications' : 'Mute notifications'}</button>
        <button role="menuitem" onClick={() => void actOnConversation('folder')}><Icon name={preferenceFor(conversationMenu.conversationId)?.archived ? 'folder' : 'folder'} size={15} />{preferenceFor(conversationMenu.conversationId)?.archived ? 'Restore from archive' : 'Archive chat'}</button>
        <div className="chat-context-divider" />
        <button role="menuitem" className="is-danger" onClick={() => void actOnConversation('delete')}><Icon name="trash" size={15} />Delete chat for me</button>
      </div></>}
      {messageMenu && activeMessages.find(m => m.id === messageMenu.messageId) && <><button className="chat-context-backdrop" aria-label="Close message options" onClick={() => setMessageMenu(null)} /><div className="chat-context-menu chat-message-context-menu" role="menu" style={{ left: messageMenu.x, top: messageMenu.y }} onClick={e => e.stopPropagation()}>
        <p>MESSAGE OPTIONS</p>
        <button role="menuitem" onClick={() => { const m = activeMessages.find(item => item.id === messageMenu.messageId); if (m) void actOnMessage('message', m) }}><Icon name="message" size={15} />Reply to message</button>
        <button role="menuitem" onClick={() => { const m = activeMessages.find(item => item.id === messageMenu.messageId); if (m) void actOnMessage('copy', m) }}><Icon name="copy" size={15} />Copy text</button>
        <div className="chat-reaction-picker">{REACTIONS.map(emoji => <button type="button" key={emoji} title={'React ' + emoji} onClick={() => { const m = activeMessages.find(item => item.id === messageMenu.messageId); if (m) void actOnMessage('react', m, emoji) }}>{emoji}</button>)}</div>
        {activeMessages.find(m => m.id === messageMenu.messageId)?.senderId === meId && !isDeletedMessage(messageMenu.messageId) && <button role="menuitem" onClick={() => { const m = activeMessages.find(item => item.id === messageMenu.messageId); if (m) void actOnMessage('edit', m) }}><Icon name="edit" size={15} />Edit message</button>}
        <button role="menuitem" className="is-danger" onClick={() => { const m = activeMessages.find(item => item.id === messageMenu.messageId); if (m) void actOnMessage('delete-me', m) }}><Icon name="eye" size={15} />Delete for me</button>
        {activeMessages.find(m => m.id === messageMenu.messageId)?.senderId === meId && !isDeletedMessage(messageMenu.messageId) && <button role="menuitem" className="is-danger" onClick={() => { const m = activeMessages.find(item => item.id === messageMenu.messageId); if (m) void actOnMessage('delete-all', m) }}><Icon name="trash" size={15} />Delete for everyone</button>}
      </div></>}
      <p className="chat-footnote">Designed for collaboration. <span>Built around the ideas you bring to life.</span></p>
    </div>
  )
}
