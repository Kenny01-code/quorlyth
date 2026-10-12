import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Av, Empty, Head } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { cn } from '../lib/util'

type Conversation = { id: string; title?: string; type: 'direct' | 'group'; members: string[]; createdBy: string; createdAt: number }
type Message = { id: string; conversationId: string; senderId: string; text: string; at: number; replyTo?: string }
type ReadState = { id: string; userId: string; conversationId: string; lastReadAt: number }

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
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [peopleOpen, setPeopleOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [peopleQuery, setPeopleQuery] = useState('')
  const [conversationFilter, setConversationFilter] = useState<'all' | 'groups' | 'unread'>('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
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
    if (!store || !meId) { setConversations([]); setMessages([]); setReads([]); return }
    const report = (e: unknown) => { console.error('Quorlyth chat sync failed:', e); setError('Live chat sync is unavailable. Check your connection and database setup.') }
    const offC = store.subscribe('conversations', docs => setConversations(docs.map(d => ({ id: d.id, ...d.data })).filter(c => Array.isArray(c.members) && c.members.includes(meId)).sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))), report)
    const offM = store.subscribe('messages', docs => setMessages(docs.map(d => ({ id: d.id, ...d.data })).filter(m => typeof m.conversationId === 'string' && typeof m.text === 'string').sort((x, y) => x.at - y.at)), report)
    const offR = store.subscribe('chatReads', docs => setReads(docs.map(d => ({ id: d.id, ...d.data })).filter(r => r.userId === meId)), report)
    return () => { offC(); offM(); offR() }
  }, [store, meId])

  const active = conversations.find(c => c.id === conversationId) || null

  useEffect(() => {
    if (conversationId || !conversations.length) return
    const desktop = window.matchMedia('(min-width: 761px)')
    const openFirstConversation = () => {
      if (desktop.matches) nav('/messages/' + conversations[0].id, { replace: true })
    }
    openFirstConversation()
    desktop.addEventListener('change', openFirstConversation)
    return () => desktop.removeEventListener('change', openFirstConversation)
  }, [conversationId, conversations, nav])

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
  const formatTime = (at: number) => {
    if (!at) return ''
    const d = new Date(at)
    const today = new Date()
    return d.toDateString() === today.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }
  const formatDay = (at: number) => {
    const day = new Date(at)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (day.toDateString() === today.toDateString()) return 'Today'
    if (day.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return day.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
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
    if (existing) { nav('/messages/' + existing.id); setPeopleOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery(''); return }
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
      await store.set('messages/' + id, { conversationId: active.id, senderId: meId, text, at: Date.now() })
      setDraft('')
      if (textarea.current) textarea.current.style.height = 'auto'
    } catch (e) { setError('Message not sent. ' + readableChatError(e)) }
    finally { setSending(false); textarea.current?.focus() }
  }

  async function signOut() {
    setError('')
    try {
      if (a.demo) {
        await a.exitDemo()
        nav('/', { replace: true })
      } else {
        await a.backend?.auth.signOut()
        nav('/signin', { replace: true })
      }
    } catch (e) {
      setError('Could not sign out. ' + readableChatError(e))
    }
  }

  if (!a.me) return (
    <>
      <Head kicker="Messages" title="Conversations, without the noise." />
      <section className="chat-signin-shell" aria-labelledby="chat-signin-title">
        <div className="chat-signin-ambient" aria-hidden="true">
          <span className="chat-signin-orb chat-signin-orb-a" />
          <span className="chat-signin-orb chat-signin-orb-b" />
          <span className="chat-signin-orbit chat-signin-orbit-a" />
          <span className="chat-signin-orbit chat-signin-orbit-b" />
        </div>

        <div className="chat-signin-chrome">
          <div className="chat-signin-wordmark">
            <span className="chat-signin-mark"><Icon name="message" size={17} /></span>
            <span>QUORLYTH <i>/</i> MESSAGES</span>
          </div>
          <span className="chat-signin-access"><i /> MEMBER SPACE</span>
        </div>

        <div className="chat-signin-layout">
          <div className="chat-signin-copy">
            <p className="chat-signin-overline"><i /> PRIVATE CONVERSATIONS, BUILT FOR GOOD IDEAS</p>
            <h1 id="chat-signin-title">Ideas move<br /><span>when we talk.</span></h1>
            <p className="chat-signin-description">
              Start a private conversation, bring your collaborators together, and give good ideas room to grow.
            </p>

            <div className="chat-signin-actions">
              <button className="chat-signin-cta" onClick={() => nav('/signin')}>
                <span className="chat-signin-cta-copy">
                  <b>Enter your messages</b>
                  <small>Sign in to your Quorlyth space</small>
                </span>
                <span className="chat-signin-cta-icon" aria-hidden="true"><Icon name="arrow" size={18} /></span>
              </button>
              <div className="chat-signin-assurance">
                <span className="chat-signin-lock"><Icon name="lock" size={15} /></span>
                <span><b>Private conversations</b><small>A quieter space for you and your collaborators.</small></span>
              </div>
            </div>

            <div className="chat-signin-features" aria-label="Messaging features">
              <div><span>01</span><b>Direct</b><small>One-to-one</small></div>
              <div><span>02</span><b>Together</b><small>Group chats</small></div>
              <div><span>03</span><b>In sync</b><small>Live messages</small></div>
            </div>
          </div>

          <div className="chat-signin-visual" role="img" aria-label="Illustrated preview of a Quorlyth conversation">
            <div className="chat-signin-visual-halo" aria-hidden="true" />
            <div className="chat-signin-float-pill chat-signin-float-pill-top" aria-hidden="true">
              <span className="chat-signin-float-icon"><Icon name="lock" size={15} /></span>
              <span><b>Private by design</b><small>A space that feels like yours</small></span>
            </div>

            <div className="chat-signin-preview" aria-hidden="true">
              <div className="chat-signin-preview-top">
                <span className="chat-signin-window-controls"><i /><i /><i /></span>
                <span>QUORLYTH <i>/</i> MESSAGES</span>
                <span className="chat-signin-preview-lock"><Icon name="lock" size={13} /></span>
              </div>
              <div className="chat-signin-preview-heading">
                <span className="chat-signin-avatar">Q</span>
                <span className="chat-signin-preview-title"><small>A SPACE FOR IDEAS</small><b>Good things, in progress</b></span>
                <span className="chat-signin-preview-presence"><i /> PRIVATE</span>
              </div>
              <div className="chat-signin-preview-time"><span>MONDAY · 9:41 AM</span></div>
              <div className="chat-signin-preview-message chat-signin-preview-message-in">
                <span className="chat-signin-avatar-small">Q</span>
                <span><small>IN THE ROOM</small><b>What if we made this together?</b><time>9:41</time></span>
              </div>
              <div className="chat-signin-preview-message chat-signin-preview-message-out">
                <span><b>That’s exactly where it should start.</b><time>9:42</time></span>
              </div>
              <div className="chat-signin-preview-composer">
                <span>Write something worth sharing…</span>
                <i><Icon name="arrow-up" size={16} /></i>
              </div>
              <div className="chat-signin-preview-foot"><span>AN ILLUSTRATION OF YOUR SPACE</span><span>01 — 03</span></div>
            </div>

            <div className="chat-signin-float-pill chat-signin-float-pill-bottom" aria-hidden="true">
              <span className="chat-signin-float-icon"><Icon name="users" size={15} /></span>
              <span><b>One-to-one or together</b><small>Good ideas grow in good company</small></span>
            </div>
          </div>
        </div>

        <div className="chat-signin-footer"><span>QUORLYTH MESSAGES</span><span>Make room for what comes next.</span><span>01 / PRIVATE SPACE</span></div>
      </section>
    </>
  )

  return (
    <div className="chat-page">
      <div className="chat-topline"><div className="chat-page-heading"><span className="chat-heading-mark"><Icon name="message" size={17} /></span><div><h2 className="chat-title">Messages</h2><p className="mut">Your conversations, thoughtfully connected</p></div></div><div className="chat-top-actions"><button className="btn" onClick={() => { setGroupOpen(true); setPeopleOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery(''); setError('') }}><Icon name="users" size={16} />New group</button><button className="btn p" onClick={() => { setPeopleOpen(true); setGroupOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery(''); setError('') }}><Icon name="plus" size={16} />New conversation</button></div></div>
      {error && <div className="chat-error" role="alert"><Icon name="alert" size={16} />{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
      <div className={cn('chat-workspace', 'size-' + workspaceSize, (peopleOpen || groupOpen || settingsOpen || profileOpen) && 'with-sidepanel')}>
        <nav className="chat-scene-rail" aria-label="Messaging navigation">
          <button className={cn('chat-utility-item', !peopleOpen && !groupOpen && !settingsOpen && !profileOpen && 'on')} title="Chats" aria-label="Chats" onClick={() => { setPeopleOpen(false); setGroupOpen(false); setSettingsOpen(false); setProfileOpen(false); setConversationFilter('all') }}><Icon name="message" size={16} /><span>Chats</span></button>
          <button className="chat-utility-item chat-call-rail" type="button" disabled title="Voice calls are not available yet" aria-label="Voice calls are not available yet"><Icon name="phone" size={16} /><span>Calls</span></button>
          <button className={cn('chat-utility-item', peopleOpen && 'on')} title="Contacts" aria-label="Contacts" onClick={() => { setPeopleOpen(true); setGroupOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery(''); setError('') }}><Icon name="users" size={16} /><span>Contacts</span></button>
          <button className={cn('chat-utility-item', settingsOpen && 'on')} title="Settings" aria-label="Settings" onClick={() => { setSettingsOpen(true); setPeopleOpen(false); setGroupOpen(false); setProfileOpen(false) }}><Icon name="settings" size={16} /><span>Settings</span></button>
          <span className="chat-rail-spacer" aria-hidden="true" />
          <button className={cn('chat-rail-avatar', profileOpen && 'on')} title="Your profile" aria-label="Your profile" onClick={() => { setProfileOpen(true); setPeopleOpen(false); setGroupOpen(false); setSettingsOpen(false) }}><Av id={meId} size={30} /></button>
          <button className="chat-utility-item chat-logout" title="Logout" aria-label="Logout" onClick={() => void signOut()}><Icon name="logout" size={16} /><span>Logout</span></button>
        </nav>
        <aside className={cn('glass chat-sidebar', active && 'has-active')}>
          <div className="chat-search-toolbar"><label className="chat-filter"><Icon name="search" size={16} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search" /></label><div className="chat-inbox-actions"><button className="chat-icon-btn chat-rail-home" onClick={() => nav('/dashboard')} title="Back to Quorlyth" aria-label="Back to Quorlyth"><Icon name="home" size={16} /></button><button className={cn('chat-icon-btn', 'chat-profile-btn', profileOpen && 'on')} title="Your profile" aria-label="Your profile" onClick={() => { setProfileOpen(true); setPeopleOpen(false); setGroupOpen(false); setSettingsOpen(false) }}><Av id={meId} size={23} /></button><button className={cn('chat-icon-btn', 'chat-filter-toggle', filtersOpen && 'on')} title={filtersOpen ? 'Hide chat filters' : 'Show chat filters'} aria-label={filtersOpen ? 'Hide chat filters' : 'Show chat filters'} aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)}><Icon name="sliders" size={16} /></button><button className="chat-icon-btn" title="Create a group" aria-label="Create a group" onClick={() => { setGroupOpen(true); setPeopleOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery(''); setError('') }}><Icon name="users" size={16} /></button><button className="chat-icon-btn" title="New conversation" aria-label="New conversation" onClick={() => { setPeopleOpen(true); setGroupOpen(false); setSettingsOpen(false); setProfileOpen(false); setPeopleQuery(''); setError('') }}><Icon name="plus" size={18} /></button></div></div>
          <div className="chat-sidebar-head"><div><h3>Chats <span>{conversations.length || ''}</span></h3></div></div>
          <div className={cn('chat-filter-tabs', filtersOpen && 'open')} role="group" aria-label="Filter conversations"><button className={cn(conversationFilter === 'all' && 'on')} onClick={() => setConversationFilter('all')}>All</button><button className={cn(conversationFilter === 'groups' && 'on')} onClick={() => setConversationFilter('groups')}>Groups</button><button className={cn(conversationFilter === 'unread' && 'on') } onClick={() => setConversationFilter('unread')}>Unread</button></div>
          <div className="chat-conversation-list">{conversations.filter(c => conversationFilter === 'all' || (conversationFilter === 'groups' ? c.type === 'group' : unreadCount(c) > 0)).filter(c => titleOf(c).toLowerCase().includes(query.toLowerCase()) || (lastMessage(c)?.text || '').toLowerCase().includes(query.toLowerCase())).map(c => {
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
              <span className="chat-private-label"><Icon name="lock" size={13} /> PRIVATE</span><button className="chat-call-button" type="button" disabled title="Voice calls are not available yet" aria-label="Voice calls are not available yet"><Icon name="phone" size={16} /></button>
            </header>
            <div className="chat-thread-body" ref={threadBody} onScroll={e => { const pane = e.currentTarget; shouldStickToBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 120 }}>
              {!activeMessages.length && <div className="chat-thread-intro"><span className="chat-intro-mark"><Icon name="spark" size={18} /></span><p>{active.type === 'group' ? 'A shared space for good people and bigger ideas.' : 'Good ideas often start with a conversation.'}</p><small>Messages are visible to conversation members.</small></div>}
              {!!activeMessages.length && <div className="chat-thread-spacer" aria-hidden="true" />}
              {activeMessages.map((m, i) => {
                const mine = m.senderId === meId
                const prev = activeMessages[i - 1]
                const showAuthor = active.type === 'group' && !mine && (!prev || prev.senderId !== m.senderId)
                const startsDay = !prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString()
                return <Fragment key={m.id}>{startsDay && <div className="chat-day-divider"><span>{formatDay(m.at)}</span></div>}<div className={cn('chat-message-row', mine && 'mine', showAuthor && 'with-author')}>{showAuthor && <div className="chat-message-author"><button className="chat-author-link" onClick={() => nav(profileLink(m.senderId))} title={'View ' + a.nm(m.senderId) + "'s public profile"}><span>{a.nm(m.senderId)}</span>{isPlatformAdmin(m.senderId) && <span className="owner-badge" title="Platform owner">✦ OWNER</span>}</button></div>}<div className="chat-message-line"><button className="chat-avatar-link message-avatar-link" onClick={() => nav(profileLink(m.senderId))} title={'View ' + a.nm(m.senderId) + "'s public profile"} aria-label={'View ' + a.nm(m.senderId) + ' public profile'}><Av id={m.senderId} size={30} />{isPlatformAdmin(m.senderId) && <span className="admin-orbit" title="Platform owner">✦</span>}</button><div className={cn('chat-bubble', mine ? 'mine' : 'theirs')}><p>{m.text}</p><time>{formatTime(m.at)}</time></div></div></div></Fragment>
              })}
              <div ref={bottom} />
            </div>
            <form className="chat-composer" onSubmit={sendMessage}><div className="chat-compose-glass"><textarea ref={textarea} value={draft} rows={1} maxLength={4000} onChange={e => { setDraft(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px' }} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() } }} placeholder="Message" aria-label="Message text" /><div className="chat-compose-foot"><span>Enter to send <i>·</i> Shift + Enter for a new line</span><span>{draft.length}/4000</span><button className="chat-send" type="submit" disabled={!draft.trim() || sending} aria-label="Send message">{sending ? <span className="chat-spinner" /> : <Icon name="arrow-up" size={19} />}</button></div></div></form>
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
      <p className="chat-footnote">Designed for collaboration. <span>Built around the ideas you bring to life.</span></p>
    </div>
  )
}
