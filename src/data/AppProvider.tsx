import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Backend, createBackend } from '../backend'
import { Comment, Community, CommunityAIOrganizerRequest, CommunityJoinRequest, Decision, Idea, Me, Milestone, MilestoneDetails, MilestonePatch, Profile, Project, Promotion, Request, Review, SpaceSettings, Status, VolunteerApplication, VolunteerStatus, WorkAttachment, WorkSubmission } from '../lib/types'
import { slug } from '../lib/util'
import { createDemoBackend, DEMO_ME } from './demo'

type Rec<T> = Record<string, T>
interface Data {
  communities: Community[]; ideas: Idea[]; reviews: Rec<Review>; outcomes: Rec<Pick<Review, 'status' | 'at'>>; votes: Rec<Rec<boolean>>; members: Rec<Rec<boolean>>
  profiles: Rec<Profile>; requests: Request[]; joinRequests: CommunityJoinRequest[]; aiOrganizerRequests: CommunityAIOrganizerRequest[]; decisions: Rec<Decision>; promotions: Promotion[]; volunteers: VolunteerApplication[]; projects: Rec<Project>; milestones: Milestone[]; workSubmissions: WorkSubmission[]; settings: SpaceSettings | null; ownerId: string | null
}
const EMPTY: Data = { communities: [], ideas: [], reviews: {}, outcomes: {}, votes: {}, members: {}, profiles: {}, requests: [], joinRequests: [], aiOrganizerRequests: [], decisions: {}, promotions: [], volunteers: [], projects: {}, milestones: [], workSubmissions: [], settings: null, ownerId: null }

export interface App {
  ready: boolean; startupError: string | null; backend: Backend | null; me: Me | null; owner: boolean; platformOwner: boolean; platformAdmin: boolean; demo: boolean; data: Data; settingsLoaded: boolean; platformRolesReady: boolean
  enterDemo: () => void; exitDemo: () => Promise<void>; signOut: () => Promise<void>
  toast: (m: string) => void; toastMsg: string
  nm: (id: string) => string; avatar: (id: string) => string
  votesOf: (ideaId: string) => number; iVoted: (ideaId: string) => boolean; statusOf: (ideaId: string) => Status
  joined: (cid: string) => boolean
  ownsCommunity: (cid: string) => boolean
  canManageCommunity: (cid: string) => boolean
  canOrganizeIdeaWithAI: (ideaId: string) => boolean
  requestCommunityAIOrganizerApproval: (ideaId: string, message?: string) => Promise<boolean>
  reviewCommunityAIOrganizerRequest: (cid: string, userId: string, status: 'approved' | 'declined') => Promise<boolean>
  canPost: () => boolean
  createCommunity: (c: Partial<Community>) => Promise<boolean>
  createCommunityDetailed: (c: Partial<Community>) => Promise<{ ok: boolean; error?: string }>
  saveCommunity: (id: string, patch: Partial<Community>) => Promise<boolean>
  deleteCommunity: (id: string) => Promise<boolean>
  join: (cid: string, on: boolean) => Promise<boolean>
  postIdea: (i: { title: string; body?: string; cid: string; tags?: string[] }) => Promise<boolean>
  postIdeaDetailed: (i: { title: string; body?: string; cid: string; tags?: string[] }) => Promise<{ ok: boolean; error?: string }>
  vote: (ideaId: string) => Promise<boolean>
  addComment: (ideaId: string, text: string, parentId?: string, mentionedUserIds?: string[]) => Promise<boolean>
  setStatus: (ideaId: string, status: Status, extra?: Partial<Review>) => Promise<boolean>
  saveReview: (ideaId: string, r: Partial<Review>) => Promise<boolean>
  publish: (ideaId: string, text: string, credits: string[], platform?: 'instagram' | 'x' | 'tiktok' | 'linkedin') => Promise<boolean>
  applyToCollaborate: (ideaId: string, message: string) => Promise<boolean>
  decideVolunteer: (applicationId: string, status: VolunteerStatus) => Promise<boolean>
  createProject: (ideaId: string, summary: string, dueAt?: number | null) => Promise<boolean>
  updateProject: (projectId: string, patch: Partial<Pick<Project, 'summary' | 'status' | 'dueAt' | 'aiOrganizerGenerated'>>) => Promise<boolean>
  addMilestone: (projectId: string, title: string, description: string, details?: MilestoneDetails) => Promise<boolean>
  updateMilestone: (milestoneId: string, patch: MilestonePatch) => Promise<boolean>
  deleteMilestone: (milestoneId: string) => Promise<boolean>
  submitMilestoneWork: (milestoneId: string, summary: string, attachments: WorkAttachment[]) => Promise<boolean>
  reviewMilestoneWork: (submissionId: string, status: 'approved' | 'changes_requested', reviewNote?: string) => Promise<boolean>
  saveSettings: (p: Partial<SpaceSettings>) => Promise<boolean>
  saveProfile: (p: Partial<Profile>) => Promise<boolean>
  requestCommunityJoin: (cid: string, message?: string) => Promise<boolean>
  reviewCommunityJoinRequest: (cid: string, userId: string, status: 'approved' | 'declined') => Promise<boolean>
  sendRequest: (r: Partial<Request>) => Promise<boolean>
  decide: (uid: string, status: 'approved' | 'declined') => Promise<boolean>
  useComments: (ideaId: string | null) => Comment[]
}

const Ctx = createContext<App | null>(null)
export const useApp = () => { const a = useContext(Ctx); if (!a) throw new Error('AppProvider missing'); return a }
const IDLE_LOGOUT_MS = 30 * 60 * 1000

const asMap = <T,>(docs: { id: string; data: any }[]): Rec<T> => Object.fromEntries(docs.map(d => [d.id, { id: d.id, ...d.data }])) as Rec<T>
const asList = <T,>(docs: { id: string; data: any }[]): T[] => docs.map(d => ({ id: d.id, ...d.data })) as T[]

export function AppProvider({ children }: { children: ReactNode }) {
  const [backend, setBackend] = useState<Backend | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [demo, setDemo] = useState(() => sessionStorage.getItem('quorlyth:demo') === '1')
  const [ready, setReady] = useState(false)
  const [startupError, setStartupError] = useState<string | null>(null)
  const [data, setData] = useState<Data>(EMPTY)
  const [settingsSnapshot, setSettingsSnapshot] = useState<{ backend: Backend; userId: string; loaded: boolean } | null>(null)
  const [platformRoleSnapshot, setPlatformRoleSnapshot] = useState<{ backend: Backend; userId: string; ready: boolean } | null>(null)
  const [platformAdmin, setPlatformAdmin] = useState(false)
  const [platformOwnerRole, setPlatformOwnerRole] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const tt = useRef<number>()
  const realBackend = useRef<Backend | null>(null)
  const authOff = useRef<() => void>(() => {})

  const toast = useCallback((m: string) => { setToastMsg(m); clearTimeout(tt.current); tt.current = window.setTimeout(() => setToastMsg(''), 2400) }, [])

  useEffect(() => {
    let off = () => {}
    let cancelled = false
    const demoActive = sessionStorage.getItem('quorlyth:demo') === '1'

    if (demoActive) {
      setBackend(createDemoBackend())
      setMe(DEMO_ME)
      setReady(true)
    } else {
      createBackend().then(async real => {
        if (cancelled) return
        realBackend.current = real
        setBackend(real)
        const current = await real.auth.current()
        if (cancelled) return
        setMe(current)
        off = real.auth.onChange(setMe)
        authOff.current = off
        setReady(true)
      }).catch(error => {
        console.error('Quorlyth backend initialization failed:', error)
        if (cancelled) return
        setStartupError('Quorlyth could not initialize its backend. Check your connection and Supabase environment settings, then reload.')
        setReady(true)
      })
    }

    return () => {
      cancelled = true
      off()
      authOff.current()
      authOff.current = () => {}
    }
  }, [])

  useEffect(() => {
    if (!backend || !me || demo) return
    const key = `quorlyth:last-activity:${me.id}`
    let timer = 0
    let signingOut = false

    const signOutIdle = async () => {
      if (signingOut) return
      signingOut = true
      try { await backend.auth.signOut() }
      catch (e) { console.warn('Idle sign-out failed', e) }
      toast('Signed out after 30 minutes of inactivity.')
    }
    const armTimer = () => {
      window.clearTimeout(timer)
      const last = Number(localStorage.getItem(key)) || Date.now()
      const remaining = IDLE_LOGOUT_MS - (Date.now() - last)
      if (remaining <= 0) { void signOutIdle(); return }
      timer = window.setTimeout(() => {
        const latest = Number(localStorage.getItem(key)) || 0
        if (Date.now() - latest >= IDLE_LOGOUT_MS) void signOutIdle()
        else armTimer()
      }, remaining)
    }
    const markActivity = () => {
      localStorage.setItem(key, String(Date.now()))
      armTimer()
    }
    const onStorage = (event: StorageEvent) => { if (event.key === key) armTimer() }
    const onVisible = () => { if (!document.hidden) armTimer() }

    if (!localStorage.getItem(key)) markActivity()
    else armTimer()
    window.addEventListener('pointerdown', markActivity, { passive: true })
    window.addEventListener('keydown', markActivity)
    window.addEventListener('scroll', markActivity, { passive: true })
    window.addEventListener('touchstart', markActivity, { passive: true })
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', markActivity)
      window.removeEventListener('keydown', markActivity)
      window.removeEventListener('scroll', markActivity)
      window.removeEventListener('touchstart', markActivity)
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisible)
      localStorage.removeItem(key)
    }
  }, [backend, me?.id, toast, demo])

  useEffect(() => {
    // A settings snapshot is valid only for the current subscription lifecycle.
    // Reset it before switching account/backend subscriptions so a same-user
    // sign-out/sign-in cannot reuse an earlier loaded flag before fresh data arrives.
    setSettingsSnapshot(null)
    if (!backend) { setData(EMPTY); return }

    // Drop account-scoped snapshots immediately when auth/backend changes. The
    // replacement subscriptions may take a moment to complete their first SELECT;
    // retaining the previous account's data during that gap can leak stale private
    // requests, memberships, collaboration applications, and read states.
    setData(d => ({
      ...d,
      reviews: {}, outcomes: {}, votes: {}, members: {}, requests: [],
      joinRequests: [], aiOrganizerRequests: [], decisions: {}, promotions: [], volunteers: [],
      projects: {}, milestones: [], workSubmissions: [], settings: null,
    }))

    const s = backend.store
    const set = (k: keyof Data, v: any) => setData(d => ({ ...d, [k]: v }))
    let readErrorShown = false
    const onReadError = (error: unknown) => {
      console.error('Quorlyth shared-data read failed:', error)
      if (me && !readErrorShown) {
        readErrorShown = true
        toast('Some shared data could not load. Check your connection and refresh.')
      }
    }
    // Keep public profile pages usable for signed-out visitors. Sensitive member/admin data
    // is subscribed only after authentication; the database RLS remains the authority.
    const offs = [
      s.subscribe('communities', d => set('communities', asList<Community>(d).sort((a, b) => a.at - b.at)), onReadError),
      s.subscribe('ideas', d => set('ideas', asList<Idea>(d)), onReadError),
      s.subscribe('profiles', d => set('profiles', asMap<Profile>(d)), onReadError),
      s.subscribe('config', d => set('ownerId', d.find(x => x.id === 'owner')?.data?.id ?? null), onReadError),
      ...(me ? [
        s.subscribe('reviews', d => set('reviews', asMap<Review>(d)), onReadError),
        s.subscribe('ideaOutcomes', d => set('outcomes', asMap<Pick<Review, 'status' | 'at'>>(d)), onReadError),
        s.subscribe('votes', d => set('votes', Object.fromEntries(d.map(x => [x.id, x.data?.ideas || {}]))), onReadError),
        s.subscribe('members', d => set('members', Object.fromEntries(d.map(x => [x.id, x.data?.c || {}]))), onReadError),
        s.subscribe('requests', d => set('requests', asList<Request>(d)), onReadError),
        s.subscribe('communityJoinRequests', d => set('joinRequests', asList<CommunityJoinRequest>(d).sort((a, b) => b.at - a.at)), onReadError),
        s.subscribe('communityAiOrganizerRequests', d => set('aiOrganizerRequests', asList<CommunityAIOrganizerRequest>(d).sort((a, b) => b.at - a.at)), onReadError),
        s.subscribe('decisions', d => set('decisions', asMap<Decision>(d)), onReadError),
        s.subscribe('promotions', d => set('promotions', asList<Promotion>(d).sort((a, b) => b.at - a.at)), onReadError),
        s.subscribe('volunteers', d => set('volunteers', asList<VolunteerApplication>(d).sort((a, b) => b.at - a.at)), onReadError),
        s.subscribe('projects', d => set('projects', asMap<Project>(d)), onReadError),
        s.subscribe('milestones', d => set('milestones', asList<Milestone>(d).map(item => ({ ...item, status: String(item.status) === 'completed' ? 'done' as const : item.status })).sort((a, b) => a.at - b.at)), onReadError),
        s.subscribe('workSubmissions', d => set('workSubmissions', asList<WorkSubmission>(d).sort((a, b) => b.submittedAt - a.submittedAt)), onReadError),
        s.subscribe('settings', d => {
          set('settings', d.find(x => x.id === 'space')?.data ?? null)
          if (me) setSettingsSnapshot({ backend, userId: me.id, loaded: true })
        }, onReadError),
      ] : []),
    ]
    return () => offs.forEach(f => f())
  }, [backend, me?.id])

  useEffect(() => {
    if (backend?.auth.mode !== 'supabase' || !me) return
    let active = true
    void (async () => {
      try {
        const path = 'profiles/' + me.id
        const profile = await backend.store.get(path) || {}
        if (!active) return
        const patch: Record<string, string> = {}
        if (me.name && profile.authName !== me.name) patch.authName = me.name
        if (me.avatarUrl && profile.authAvatarUrl !== me.avatarUrl) patch.authAvatarUrl = me.avatarUrl
        if (Object.keys(patch).length) await backend.store.set(path, { ...profile, ...patch, at: profile.at || Date.now() })
      } catch (e) { console.warn('Could not sync account profile metadata', e) }
    })()
    return () => { active = false }
  }, [backend, me?.id, me?.name, me?.avatarUrl])

  useEffect(() => {
    if (!backend || !me) {
      setPlatformAdmin(false)
      setPlatformOwnerRole(false)
      setPlatformRoleSnapshot(null)
      return
    }
    if (demo) {
      setPlatformAdmin(true)
      setPlatformOwnerRole(true)
      setPlatformRoleSnapshot({ backend, userId: me.id, ready: true })
      return
    }
    let active = true
    setPlatformAdmin(false)
    setPlatformOwnerRole(false)
    setPlatformRoleSnapshot({ backend, userId: me.id, ready: false })
    void Promise.all([
      backend.isPlatformAdmin(),
      backend.isPlatformOwner ? backend.isPlatformOwner() : Promise.resolve(false),
    ]).then(([isAdmin, isOwner]) => {
      if (!active) return
      setPlatformAdmin(isAdmin)
      setPlatformOwnerRole(isOwner)
      setPlatformRoleSnapshot({ backend, userId: me.id, ready: true })
    }).catch(error => {
      console.warn('Could not resolve platform permissions', error)
      if (active) {
        setPlatformAdmin(false)
        setPlatformOwnerRole(false)
        setPlatformRoleSnapshot({ backend, userId: me.id, ready: true })
      }
    })
    return () => { active = false }
  }, [backend, me?.id, demo])

  const settingsLoaded = !!(backend && me && settingsSnapshot?.backend === backend && settingsSnapshot.userId === me.id && settingsSnapshot.loaded)
  const platformRolesReady = !me || !!(backend && platformRoleSnapshot?.backend === backend && platformRoleSnapshot.userId === me.id && platformRoleSnapshot.ready)
  const st = backend?.store
  // Platform-owner access comes from the backend role resolver. In Supabase this
  // checks the private platform_roles table; local mode validates its own owner claim.
  // Do not promote a user from the publicly subscribed config/ownerId field: a stale
  // config value must never override an explicit negative platform-role check.
  const platformOwner = demo || platformOwnerRole
  const legacyOwner = platformOwner
  // `owner` remains the broad workspace-manager capability for existing surfaces;
  // platform-owner-only permissions must check `platformOwner` explicitly.
  const owner = platformOwner || platformAdmin

  const enterDemo = useCallback(() => {
    sessionStorage.setItem('quorlyth:demo', '1')
    setDemo(true)
    setData(EMPTY)
    setBackend(createDemoBackend())
    setMe(DEMO_ME)
  }, [])
  const exitDemo = useCallback(async () => {
    try {
      let real = realBackend.current
      if (!real) {
        real = await createBackend()
        realBackend.current = real
      }

      const current = await real.auth.current()
      authOff.current()
      authOff.current = real.auth.onChange(setMe)

      sessionStorage.removeItem('quorlyth:demo')
      setDemo(false)
      setData(EMPTY)
      setBackend(real)
      setMe(current)
      setStartupError(null)
    } catch (error) {
      console.error('Could not exit demo mode:', error)
      toast('Could not connect to Quorlyth. Demo mode is still available.')
    }
  }, [toast])

  const signOut = useCallback(async () => {
    let authBackend = backend
    if (demo) {
      authBackend = realBackend.current
      if (!authBackend) {
        authBackend = await createBackend()
        realBackend.current = authBackend
      }
      sessionStorage.removeItem('quorlyth:demo')
      authOff.current()
      setDemo(false)
      setData(EMPTY)
      setBackend(authBackend)
      authOff.current = authBackend.auth.onChange(setMe)
    }
    if (!authBackend) throw new Error('Authentication is not ready. Reload Quorlyth and try again.')
    await authBackend.auth.signOut()
    setMe(null)
    setData(EMPTY)
  }, [backend, demo])

  const app = useMemo<App>(() => {
    const votesOf = (id: string) => Object.values(data.votes).filter(v => v && v[id]).length
    const w = async (fn: () => Promise<any>, ok?: string) => {
      try { await fn(); ok && toast(ok); return true }
      catch (e: any) {
        const message = String(e?.message || e || 'Unknown error').slice(0, 280)
        console.error('Quorlyth action failed:', e)
        toast(/row.level security|permission denied|not authorized|forbidden/i.test(message) ? 'Permission denied: ' + message : message)
        return false
      }
    }
    const ownsCommunity = (cid: string) => !!me && data.communities.some(c => {
      if (c.id !== cid) return false
      // An explicit ownerId is authoritative. createdBy is only a fallback for
      // older community records that predate ownerId; it must not override a
      // different, explicitly assigned owner.
      if (c.ownerId) return c.ownerId === me.id
      if (c.createdBy) return c.createdBy === me.id
      return platformOwner
    })
    const canManageCommunity = (cid: string) => !!me && (platformOwner || platformAdmin || ownsCommunity(cid))
    const canCollaborateOnIdea = (ideaId: string) => {
      const idea = data.ideas.find(item => item.id === ideaId)
      return !!me && !!idea && (canManageCommunity(idea.cid) || idea.authorId === me.id || data.volunteers.some(item => item.ideaId === ideaId && item.applicantId === me.id && item.status === 'accepted'))
    }
    const canOrganizeIdeaWithAI = (ideaId: string) => {
      if (!me) return false
      const idea = data.ideas.find(item => item.id === ideaId)
      if (!idea) return false
      // Platform owners have automatic platform-wide AI organizer access.
      // Community owners have automatic access only inside their own communities.
      if (platformOwner || ownsCommunity(idea.cid)) return true
      const eligibleWorkspaceParticipant = idea.authorId === me.id
        || data.volunteers.some(item => item.ideaId === ideaId && item.applicantId === me.id && item.status === 'accepted')
        || platformAdmin
      return eligibleWorkspaceParticipant && data.aiOrganizerRequests.some(request => request.cid === idea.cid && request.userId === me.id && request.status === 'approved')
    }
    const createCommunityDetailed = async (c: Partial<Community>): Promise<{ ok: boolean; error?: string }> => {
      if (!me) return { ok: false, error: 'Sign in before creating a community.' }
      try {
        await st!.create('communities/' + slug(), { name: c.name, ownerId: me.id, createdBy: me.id, purpose: c.purpose || '', icon: c.icon || 'community', vis: c.vis || 'listed', post: c.post || 'anyone', joinApproval: !!c.joinApproval, cover: c.cover || 'a', ...(c.welcome ? { welcome: c.welcome } : {}), ...(c.rules ? { rules: c.rules } : {}), ...(c.arch ? { arch: true } : {}), at: Date.now() })
        toast('Community created')
        return { ok: true }
      } catch (e: any) {
        const error = String(e?.message || e || 'Unknown database error').slice(0, 500)
        console.error('Quorlyth community creation failed:', error)
        toast('Community creation failed: ' + error)
        return { ok: false, error }
      }
    }
    const postIdeaDetailed = async (i: { title: string; body?: string; cid: string; tags?: string[] }): Promise<{ ok: boolean; error?: string }> => {
      if (!me) return { ok: false, error: 'Sign in before submitting an idea.' }
      if (!i.title.trim()) return { ok: false, error: 'An idea title is required.' }
      if (!data.communities.some(c => c.id === i.cid && !c.arch)) return { ok: false, error: 'The selected community does not exist or is archived.' }
      try {
        await st!.create('ideas/' + slug(), { title: i.title.trim(), body: i.body || '', cid: i.cid, authorId: me.id, tags: i.tags || [], at: Date.now() })
        toast('Idea shared')
        return { ok: true }
      } catch (e: any) {
        const error = String(e?.message || e || 'Unknown database error').slice(0, 500)
        console.error('Quorlyth idea submission failed:', error)
        toast('Idea submission failed: ' + error)
        return { ok: false, error }
      }
    }
    const up = async (path: string, patch: any) => {
  try {
    await st!.update(path, patch)
  } catch (e: any) {
    if (e?.message !== 'not_found') {
      throw e
    }

    await st!.set(path, patch)
  }
}
    return {
      ready, startupError, backend, me, owner, platformOwner, platformAdmin, demo, enterDemo, exitDemo, signOut, data, settingsLoaded, platformRolesReady, toast, toastMsg,
      nm: id => data.profiles[id]?.name || data.profiles[id]?.authName || (me && id === me.id ? me.name : 'Member'),
      avatar: id => data.profiles[id]?.photo || data.profiles[id]?.authAvatarUrl || (me && id === me.id ? me.avatarUrl || '' : ''),
      votesOf,
      iVoted: id => !!(me && data.votes[me.id]?.[id]),
      statusOf: id => data.reviews[id]?.status || data.outcomes[id]?.status || 'review',
      joined: cid => !!(me && data.members[me.id]?.[cid]),
      ownsCommunity,
      canManageCommunity,
      canOrganizeIdeaWithAI,
      canPost: () => owner || !data.settings?.appr || data.decisions[me?.id || '']?.status === 'approved',
      createCommunity: c => createCommunityDetailed(c).then(r => r.ok),
      createCommunityDetailed,
      saveCommunity: (id, p) => w(async () => {
        if (!canManageCommunity(id)) throw new Error('Only this community’s owner or a platform owner/administrator can manage it.')
        const currentCommunity = data.communities.find(community => community.id === id)
        if (!currentCommunity) throw new Error('Community not found. Refresh the page and try again.')

        // Turning approval off means join requests should no longer leave people
        // waiting. Approve the existing queue first; if an approval fails, keep
        // the setting unchanged so the manager can retry safely.
        if (p.joinApproval === false && currentCommunity.joinApproval === true) {
          if (!backend) throw new Error('The backend is not ready.')
          const pendingRequests = data.joinRequests.filter(request => request.cid === id && request.status === 'pending')
          for (const request of pendingRequests) {
            await backend.reviewCommunityJoinRequest(id, request.userId, 'approved')
          }
          if (pendingRequests.length) {
            const pendingUsers = new Set(pendingRequests.map(request => request.userId))
            const reviewedAt = Date.now()
            setData(d => ({
              ...d,
              joinRequests: d.joinRequests.map(request =>
                request.cid === id && pendingUsers.has(request.userId) && request.status === 'pending'
                  ? { ...request, status: 'approved', reviewedAt, reviewedBy: me!.id }
                  : request
              ),
              members: pendingRequests.reduce((members, request) => ({
                ...members,
                [request.userId]: { ...(members[request.userId] || {}), [id]: true },
              }), d.members),
            }))
          }
        }

        await up('communities/' + id, p)
      }, 'Saved'),
      deleteCommunity: id => w(async () => {
        if (!me || !canManageCommunity(id)) throw new Error('Only this community’s owner or a platform administrator can delete it.')
        if (!data.communities.some(c => c.id === id)) throw new Error('Community not found. Refresh the page and try again.')
        if (backend?.auth.mode === 'supabase') {
          const token = await backend.auth.accessToken?.()
          if (!token) throw new Error('Your session expired. Sign in again and retry deletion.')
          const response = await fetch('/api/admin-community', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ cid: id }),
          })
          const result = await response.json().catch(() => ({}))
          if (!response.ok || !result.ok) throw new Error(result.error || 'Server-side community deletion failed (' + response.status + ').')
          return result
        }
        // Local/demo store: delete linked data locally; never use a privileged browser key.
        const linkedIdeas = data.ideas.filter(i => i.cid === id)
        const ideaIds = new Set(linkedIdeas.map(i => i.id))
        for (const idea of linkedIdeas) {
          await st!.delete('ideas/' + idea.id)
          await st!.delete('reviews/' + idea.id)
          await st!.delete('projects/' + idea.id)
        }
        for (const application of data.volunteers.filter(v => ideaIds.has(v.ideaId))) await st!.delete('volunteers/' + application.id)
        for (const member of Object.keys(data.members)) if (data.members[member]?.[id]) await st!.update('members/' + member, { c: { [id]: false } })
        await st!.delete('communities/' + id)
      }, 'Community and its linked ideas deleted'),
      join: (cid, on) => w(() => up('members/' + me!.id, { c: { [cid]: on } }), on ? 'You joined' : 'You left'),
      postIdea: i => w(() => st!.create('ideas/' + slug(), { title: i.title.trim(), body: i.body || '', cid: i.cid, authorId: me!.id, tags: i.tags || [], at: Date.now() }), 'Idea shared'),
      postIdeaDetailed,
      vote: id => {
        const idea = data.ideas.find(item => item.id === id)
        if (!me) { toast('Sign in before backing an idea.'); return Promise.resolve(false) }
        if (!idea) { toast('This idea is no longer available.'); return Promise.resolve(false) }
        const community = data.communities.find(item => item.id === idea.cid)
        if (!community) { toast('The idea community is still loading. Try again.'); return Promise.resolve(false) }
        if (community.arch) { toast('Archived communities are read-only; backing is disabled.'); return Promise.resolve(false) }
        return w(() => up('votes/' + me.id, { ideas: { [id]: !data.votes[me.id]?.[id] } }))
      },
      addComment: (id, text, parentId, mentionedUserIds = []) => w(async () => {
        if (!me) throw new Error('Sign in before replying to a discussion.')
        const idea = data.ideas.find(item => item.id === id)
        if (!idea) throw new Error('This discussion is no longer available.')
        if (!text.trim()) throw new Error('Write a reply first.')
        const uniqueMentions = [...new Set(mentionedUserIds)].filter(uid => uid && uid !== me.id).slice(0, 20)
        await st!.set(`ideas/${id}/comments/${slug()}`, { authorId: me.id, text: text.trim().slice(0, 1000), at: Date.now(), ...(parentId ? { parentId } : {}), ...(uniqueMentions.length ? { mentionedUserIds: uniqueMentions } : {}) })
      }, 'Reply posted'),
      setStatus: (id, status, extra) => w(() => up('reviews/' + id, { status, at: Date.now(), ...extra }), status === 'selected' ? 'Selected for promotion' : status === 'held' ? 'Held for later' : status === 'declined' ? 'Declined' : 'Done'),
      saveReview: (id, r) => w(() => up('reviews/' + id, { ...r, at: Date.now() })),
      publish: (id, text, credits, platform) => w(async () => { await st!.set('promotions/' + slug(), { ideaId: id, text, credits, by: me!.id, at: Date.now(), status: 'draft', published: false, ...(platform ? { platform } : {}) }); await up('reviews/' + id, { status: 'promoted', at: Date.now() }) }, 'Post prepared to share'),
      applyToCollaborate: (ideaId, message) => {
        if (!me) { toast('Sign in before applying to collaborate.'); return Promise.resolve(false) }
        const idea = data.ideas.find(item => item.id === ideaId)
        if (!idea) { toast('This idea is no longer available.'); return Promise.resolve(false) }
        if (idea.authorId === me.id) { toast('You cannot apply to collaborate on your own idea.'); return Promise.resolve(false) }
        const ideaCommunity = data.communities.find(item => item.id === idea.cid)
        if (!ideaCommunity) { toast('The idea community is still loading. Refresh and try again.'); return Promise.resolve(false) }
        if (ideaCommunity.arch) { toast('This community is archived. Collaboration applications are closed until it is restored.'); return Promise.resolve(false) }
        if (!canManageCommunity(idea.cid) && !data.members[me.id]?.[idea.cid]) { toast('Join the idea community before applying to collaborate.'); return Promise.resolve(false) }
        if (data.volunteers.some(v => v.ideaId === ideaId && v.applicantId === me.id && v.status !== 'declined')) {
          toast('You already have an active application for this idea')
          return Promise.resolve(false)
        }
        return w(() => st!.create('volunteers/' + slug(), { ideaId, applicantId: me.id, message: message.trim(), status: 'pending', at: Date.now() }), 'Collaboration request sent')
      },
      decideVolunteer: (applicationId, status) => w(async () => {
        const application = data.volunteers.find(item => item.id === applicationId)
        if (!application) throw new Error('This collaboration request is no longer available. Refresh and try again.')
        if (application.status !== 'pending') throw new Error('This application has already been reviewed.')
        const applicationIdea = data.ideas.find(item => item.id === application.ideaId)
        if (!applicationIdea) throw new Error('The idea for this collaboration is no longer available.')
        if (!canManageCommunity(applicationIdea.cid)) throw new Error('Only the community owner or a platform administrator can review this application.')
        const reviewedAt = Date.now()
        const idea = status === 'accepted' ? applicationIdea : undefined
        const currentReview = idea ? data.reviews[idea.id] || data.outcomes[idea.id] : undefined
        let nextReviewStatus: 'selected' | 'promoted' = currentReview?.status === 'promoted' ? 'promoted' : 'selected'
        const needsProjectInLocalState = !!idea && !data.projects[idea.id]
        const workspaceSummary = 'Collaboration workspace ready. Add a project plan and milestones to coordinate the work.'
        let initializedProject: Project | undefined

        if (idea) {
          // Read the authoritative review record and mark the idea selected before
          // inserting its workspace. RLS intentionally allows a new workspace only
          // after the idea has been selected or promoted; doing this in the reverse
          // order silently made first-time collaboration acceptance fail.
          const storedReview = await st!.get('reviews/' + idea.id)
          const currentStatus = storedReview?.status || currentReview?.status
          nextReviewStatus = currentStatus === 'promoted' ? 'promoted' : 'selected'
          if (!storedReview || (currentStatus !== 'selected' && currentStatus !== 'promoted')) {
            await up('reviews/' + idea.id, { status: nextReviewStatus, at: reviewedAt })
          }

          // A realtime subscription can lag behind a successful insert, so do not
          // treat local project state as the source of truth during initialization.
          let storedProject = await st!.get('projects/' + idea.id)
          if (!storedProject) {
            try {
              await st!.create('projects/' + idea.id, {
                ideaId: idea.id,
                summary: workspaceSummary,
                status: 'active',
                createdBy: me!.id,
                at: reviewedAt,
                updatedAt: reviewedAt,
              })
              storedProject = {
                ideaId: idea.id,
                summary: workspaceSummary,
                status: 'active',
                createdBy: me!.id,
                at: reviewedAt,
                updatedAt: reviewedAt,
              }
            } catch (createError) {
              // A concurrent accept/create may have won the insert race. Reuse the
              // now-persisted workspace if it exists; otherwise leave the application
              // pending and surface the actual failure so the manager can retry.
              storedProject = await st!.get('projects/' + idea.id)
              if (!storedProject) throw createError
            }
          }

          const projectAt = Number(storedProject.at) > 0 ? Number(storedProject.at) : reviewedAt
          initializedProject = {
            id: idea.id,
            ideaId: idea.id,
            summary: typeof storedProject.summary === 'string' && storedProject.summary.trim() ? storedProject.summary : workspaceSummary,
            status: storedProject.status === 'completed' ? 'completed' : 'active',
            createdBy: typeof storedProject.createdBy === 'string' && storedProject.createdBy ? storedProject.createdBy : me!.id,
            at: projectAt,
            updatedAt: Number(storedProject.updatedAt) > 0 ? Number(storedProject.updatedAt) : projectAt,
          }
        }

        // Keep the application pending until both the project and the idea status
        // are ready. If a write fails, the manager can retry without making a
        // duplicate project or leaving a falsely accepted application.
        await up('volunteers/' + applicationId, { status, reviewedAt, reviewedBy: me!.id })
        setData(d => ({
          ...d,
          volunteers: d.volunteers.map(item => item.id === applicationId ? { ...item, status, reviewedAt, reviewedBy: me!.id } : item),
          ...(idea ? {
            reviews: {
              ...d.reviews,
              [idea.id]: { ...d.reviews[idea.id], id: idea.id, status: nextReviewStatus, at: reviewedAt },
            },
            ...(needsProjectInLocalState && initializedProject ? {
              projects: {
                ...d.projects,
                [idea.id]: initializedProject,
              },
            } : {}),
          } : {}),
        }))
      }, status === 'accepted' ? 'Contributor accepted and workspace opened' : 'Application declined'),
      createProject: (ideaId, summary, dueAt) => w(async () => {
        if (!me) throw new Error('Sign in before creating a collaboration workspace.')
        const projectIdea = data.ideas.find(item => item.id === ideaId)
        if (!projectIdea) throw new Error('The idea for this workspace is no longer available.')
        if (!canManageCommunity(projectIdea.cid)) throw new Error('Only the community owner or a platform administrator can initialize a collaboration workspace.')
        const cleanSummary = summary.trim()
        if (!cleanSummary) throw new Error('Add a short project summary first.')
        if (dueAt != null && !Number.isFinite(dueAt)) throw new Error('Choose a valid project due date.')
        const cleanDueAt = dueAt ?? null
        const existing = data.projects[ideaId] || await st!.get('projects/' + ideaId)
        if (existing) throw new Error('A workspace already exists for this idea. Refresh and open the existing collaboration instead.')

        const storedReview = await st!.get('reviews/' + ideaId)
        const currentStatus = storedReview?.status || data.reviews[ideaId]?.status || data.outcomes[ideaId]?.status
        const nextStatus: 'selected' | 'promoted' = currentStatus === 'promoted' ? 'promoted' : 'selected'
        const at = Date.now()

        // The database only permits project creation for selected/promoted ideas.
        // Persist that prerequisite first, while preserving a promoted idea's status.
        if (!storedReview || (currentStatus !== 'selected' && currentStatus !== 'promoted')) {
          await up('reviews/' + ideaId, { status: nextStatus, at })
        }

        const project: Project = { id: ideaId, ideaId, summary: cleanSummary, status: 'active', createdBy: me.id, at, updatedAt: at, dueAt: cleanDueAt }
        try {
          await st!.create('projects/' + ideaId, { ideaId, summary: cleanSummary, status: 'active', createdBy: me.id, at, updatedAt: at, dueAt: cleanDueAt })
        } catch (createError) {
          // If another manager created the workspace concurrently, use the persisted
          // record rather than reporting a false failure after the race has resolved.
          const racedProject = await st!.get('projects/' + ideaId)
          if (!racedProject) throw createError
          setData(d => ({
            ...d,
            projects: {
              ...d.projects,
              [ideaId]: {
                id: ideaId,
                ideaId,
                summary: typeof racedProject.summary === 'string' && racedProject.summary.trim() ? racedProject.summary : cleanSummary,
                status: racedProject.status === 'completed' ? 'completed' : 'active',
                createdBy: typeof racedProject.createdBy === 'string' && racedProject.createdBy ? racedProject.createdBy : me.id,
                at: Number(racedProject.at) > 0 ? Number(racedProject.at) : at,
                updatedAt: Number(racedProject.updatedAt) > 0 ? Number(racedProject.updatedAt) : at,
                dueAt: Number(racedProject.dueAt) > 0 ? Number(racedProject.dueAt) : null,
              },
            },
            reviews: { ...d.reviews, [ideaId]: { ...d.reviews[ideaId], status: nextStatus, at } },
          }))
          return
        }

        setData(d => ({ ...d, projects: { ...d.projects, [ideaId]: project }, reviews: { ...d.reviews, [ideaId]: { ...d.reviews[ideaId], status: nextStatus, at } } }))
      }, 'Project created'),
      updateProject: (projectId, patch) => w(async () => {
        const current = data.projects[projectId]
        if (!current) throw new Error('Project not found. Refresh the page and try again.')
        const projectIdea = data.ideas.find(item => item.id === current.ideaId)
        const manager = !!projectIdea && canManageCommunity(projectIdea.cid)
        const aiOrganizerIntent = patch.aiOrganizerGenerated === true
        const aiBriefOnly = !!projectIdea && canOrganizeIdeaWithAI(projectIdea.id) && Object.keys(patch).every(key => key === 'summary' || key === 'aiOrganizerGenerated')
        if (!projectIdea || (aiOrganizerIntent
          ? (!canOrganizeIdeaWithAI(projectIdea.id) || Object.keys(patch).some(key => !['summary', 'aiOrganizerGenerated'].includes(key)))
          : (!manager && !aiBriefOnly))) {
          throw new Error('The community owner or an approved AI organizer must approve this AI plan before it can update the project brief.')
        }
        const safePatch = { ...patch, ...(patch.summary !== undefined ? { summary: patch.summary.trim() } : {}), updatedAt: Date.now() }
        if ('summary' in safePatch && !safePatch.summary) throw new Error('A project summary cannot be empty.')
        await up('projects/' + projectId, safePatch)
        setData(d => ({ ...d, projects: { ...d.projects, [projectId]: { ...d.projects[projectId], ...safePatch } } }))
      }, 'Project updated'),
      addMilestone: (projectId, title, description, details = {}) => w(async () => {
        const cleanTitle = title.trim()
        if (!cleanTitle) throw new Error('Milestones need a title.')
        const project = data.projects[projectId]
        if (!project) throw new Error('Create the project before adding milestones.')
        if (project.status !== 'active') throw new Error('Reopen the project before adding milestones.')
        const projectIdea = data.ideas.find(item => item.id === project.ideaId)
        if (!projectIdea) throw new Error('The project idea could not be found.')
        const manager = canManageCommunity(projectIdea.cid)
        const approvedAIOrganizer = canOrganizeIdeaWithAI(projectIdea.id)
        const aiOrganized = details.aiOrganized === true
        if (aiOrganized && (!approvedAIOrganizer || !!details.assigneeId || details.dueAt != null || !!details.blocked || !!details.blockedNote)) {
          throw new Error('The community owner or an approved AI organizer must approve this AI plan before its milestones can be saved. AI-planned milestones must remain unassigned.')
        }
        if (!aiOrganized && !manager && (!approvedAIOrganizer || !!details.assigneeId || details.dueAt != null || !!details.blocked || !!details.blockedNote)) {
          throw new Error('Only the community owner/platform admin or an approved AI organizer can create AI-planned milestones. Organizers can add unassigned milestones only.')
        }
        if (details.priority && !['low', 'normal', 'high', 'critical'].includes(details.priority)) throw new Error('Choose a valid milestone priority.')
        if (details.dueAt != null && !Number.isFinite(details.dueAt)) throw new Error('Choose a valid milestone due date.')
        const community = data.communities.find(item => item.id === projectIdea.cid)
        const allowedAssignees = new Set([
          projectIdea?.authorId, community?.ownerId, community?.createdBy,
          ...data.volunteers.filter(item => item.ideaId === project.ideaId && item.status === 'accepted').map(item => item.applicantId),
        ].filter((uid): uid is string => !!uid))
        if (details.assigneeId && !allowedAssignees.has(details.assigneeId)) throw new Error('Milestones can only be assigned to people in this collaboration team.')
        const id = slug()
        const at = Date.now()
        const extra = {
          priority: details.priority || 'normal' as const,
          assigneeId: details.assigneeId || null,
          dueAt: details.dueAt ?? null,
          acceptanceCriteria: (details.acceptanceCriteria || '').trim().slice(0, 800),
          blocked: !!details.blocked,
          blockedNote: (details.blockedNote || '').trim().slice(0, 500),
          ...(aiOrganized ? { aiOrganized: true } : {}),
        }
        const milestone: Milestone = { id, projectId, title: cleanTitle, description: description.trim().slice(0, 2000), status: 'todo', createdBy: me!.id, at, updatedAt: at, ...extra }
        await st!.set('milestones/' + id, { projectId, title: cleanTitle, description: description.trim().slice(0, 2000), status: 'todo', createdBy: me!.id, at, updatedAt: at, ...extra })
        setData(d => ({ ...d, milestones: [...d.milestones.filter(item => item.id !== id), milestone] }))
      }, 'Milestone added'),
      updateMilestone: (milestoneId, patch) => w(async () => {
        const current = data.milestones.find(item => item.id === milestoneId)
        if (!current) throw new Error('Milestone not found. Refresh the page and try again.')
        if (!canCollaborateOnIdea(current.projectId)) throw new Error('Only the idea creator, accepted collaborators, and the community owner can update milestones.')
        const project = data.projects[current.projectId]
        const projectIdea = data.ideas.find(item => item.id === (project?.ideaId || current.projectId))
        if (!projectIdea) throw new Error('The project idea could not be found.')
        const manager = canManageCommunity(projectIdea.cid)
        if (patch.status === 'done') {
          throw new Error('Milestones can only be completed after an authorized reviewer approves a work submission with attached evidence.')
        }
        if (!manager && (
          Object.keys(patch).some(key => key !== 'status')
          || patch.status !== 'in_progress'
          || current.status !== 'todo'
          || current.blocked
          || (!!current.assigneeId && current.assigneeId !== me?.id)
        )) {
          throw new Error('Collaborators can start an available milestone assigned to them. Only the project manager can edit details or change its final status.')
        }
        if (patch.priority && !['low', 'normal', 'high', 'critical'].includes(patch.priority)) throw new Error('Choose a valid milestone priority.')
        if (patch.dueAt != null && !Number.isFinite(patch.dueAt)) throw new Error('Choose a valid milestone due date.')
        const community = data.communities.find(item => item.id === projectIdea.cid)
        const allowedAssignees = new Set([
          projectIdea?.authorId, community?.ownerId, community?.createdBy,
          ...data.volunteers.filter(item => item.ideaId === current.projectId && item.status === 'accepted').map(item => item.applicantId),
        ].filter((uid): uid is string => !!uid))
        if (patch.assigneeId && !allowedAssignees.has(patch.assigneeId)) throw new Error('Milestones can only be assigned to people in this collaboration team.')
        const safePatch: MilestonePatch = {
          ...patch,
          ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 120) } : {}),
          ...(patch.description !== undefined ? { description: patch.description.trim().slice(0, 2000) } : {}),
          ...(patch.acceptanceCriteria !== undefined ? { acceptanceCriteria: patch.acceptanceCriteria.trim().slice(0, 800) } : {}),
          ...(patch.blockedNote !== undefined ? { blockedNote: patch.blockedNote.trim().slice(0, 500) } : {}),
        }
        if (safePatch.title !== undefined && !safePatch.title) throw new Error('Milestones need a title.')
        const updatedAt = Date.now()
        await up('milestones/' + milestoneId, { ...safePatch, updatedAt })
        setData(d => ({ ...d, milestones: d.milestones.map(item => item.id === milestoneId ? { ...item, ...safePatch, updatedAt } : item) }))
      }, 'Milestone updated'),
      deleteMilestone: async milestoneId => {
        let deleted = false
        try {
          if (!me || !backend || !st) throw new Error('Sign in again before deleting a milestone.')
          const current = data.milestones.find(item => item.id === milestoneId)
          if (!current) throw new Error('Milestone not found. Refresh the page and try again.')
          const project = data.projects[current.projectId]
          const projectIdea = data.ideas.find(item => item.id === (project?.ideaId || current.projectId))
          if (!projectIdea || !canManageCommunity(projectIdea.cid)) {
            throw new Error('Only the community owner or a platform administrator can delete milestones.')
          }

          const submissions = data.workSubmissions.filter(item => item.milestoneId === milestoneId)
          const filePaths = [...new Set(submissions.flatMap(item => item.attachments || []).map(file => file.path).filter(Boolean))]
          let filesFailedToDelete = 0
          for (const filePath of filePaths) {
            try {
              if (!backend.deleteWorkFile) throw new Error('Private file deletion is not configured.')
              await backend.deleteWorkFile(filePath)
            } catch (error) {
              filesFailedToDelete += 1
              console.warn('A private milestone attachment could not be removed:', error)
            }
          }

          for (const submission of submissions) await st.delete('workSubmissions/' + submission.id)
          await st.delete('milestones/' + milestoneId)
          deleted = true
          setData(d => ({
            ...d,
            milestones: d.milestones.filter(item => item.id !== milestoneId),
            workSubmissions: d.workSubmissions.filter(item => item.milestoneId !== milestoneId),
          }))
          toast(filesFailedToDelete
            ? 'Milestone deleted. Some private attachments could not be removed.'
            : 'Milestone and linked work submissions deleted.')
          return true
        } catch (error: any) {
          const message = String(error?.message || error || 'Unknown error').slice(0, 280)
          console.error('Quorlyth milestone deletion failed:', error)
          toast(deleted ? 'Milestone deleted, but some linked records may need cleanup.' : message)
          return deleted
        }
      },
      submitMilestoneWork: (milestoneId, summary, attachments) => w(async () => {
        if (!me || !st) throw new Error('Sign in before submitting project work.')
        const milestone = data.milestones.find(item => item.id === milestoneId)
        if (!milestone) throw new Error('This milestone is no longer available. Refresh and try again.')
        const project = data.projects[milestone.projectId]
        const ideaId = project?.ideaId || milestone.projectId
        const idea = data.ideas.find(item => item.id === ideaId)
        if (!project || !idea) throw new Error('The project workspace could not be found.')
        if (project.status !== 'active') throw new Error('This project is closed. Ask the project manager to reopen it before submitting work.')
        if (milestone.status === 'done') throw new Error('This milestone has already been completed.')
        if (milestone.blocked) throw new Error('This milestone is blocked. Ask the project manager to clear the blocker first.')
        if (milestone.assigneeId && milestone.assigneeId !== me.id) throw new Error('This milestone is assigned to another team member.')
        if (!canCollaborateOnIdea(ideaId)) throw new Error('Only this workspace’s team can submit work.')
        const cleanSummary = summary.trim().slice(0, 6000)
        if (cleanSummary.length < 8) throw new Error('Add a meaningful summary of what you completed before submitting.')
        if (!Array.isArray(attachments) || attachments.length > 8) throw new Error('Attach up to 8 files to each submission.')
        const localMode = backend?.auth.mode === 'local'
        const expectedPrefix = localMode
          ? 'local/' + ideaId + '/' + milestoneId + '/' + me.id + '/'
          : ideaId + '/' + milestoneId + '/' + me.id + '/'
        const cleanedAttachments = attachments.map(file => {
          if (!file || typeof file.path !== 'string' || !file.path.startsWith(expectedPrefix)) throw new Error('One of the attachments is not owned by your current upload session.')
          if (!file.name || file.name.length > 180 || !Number.isFinite(file.size) || file.size < 0 || file.size > 25 * 1024 * 1024) throw new Error('One of the attachments has invalid file details.')
          return { path: file.path, name: file.name.slice(0, 180), mimeType: String(file.mimeType || 'application/octet-stream').slice(0, 120), size: file.size, uploadedAt: Number(file.uploadedAt) || Date.now() }
        })
        if (!cleanedAttachments.length) throw new Error('Attach at least one piece of evidence before submitting work for review.')
        const latestMine = data.workSubmissions
          .filter(item => item.milestoneId === milestoneId && item.submittedBy === me.id)
          .sort((first, second) => second.revision - first.revision || second.submittedAt - first.submittedAt)[0]
        if (latestMine?.status === 'submitted') throw new Error('Your latest submission is already waiting for review.')
        const revision = (latestMine?.revision || 0) + 1
        const id = slug()
        const submittedAt = Date.now()
        const submission: WorkSubmission = {
          id, ideaId, projectId: milestone.projectId, milestoneId, submittedBy: me.id,
          revision, summary: cleanSummary, attachments: cleanedAttachments,
          status: 'submitted', submittedAt, updatedAt: submittedAt,
        }
        await st.create('workSubmissions/' + id, submission)
        setData(d => ({ ...d, workSubmissions: [submission, ...d.workSubmissions.filter(item => item.id !== id)] }))
        if (milestone.status === 'todo') {
          const updatedAt = Date.now()
          await up('milestones/' + milestoneId, { status: 'in_progress', updatedAt })
          setData(d => ({ ...d, milestones: d.milestones.map(item => item.id === milestoneId ? { ...item, status: 'in_progress', updatedAt } : item) }))
        }
      }, 'Work submitted for review'),
      reviewMilestoneWork: (submissionId, status, reviewNote = '') => w(async () => {
        if (!me || !st) throw new Error('Sign in before reviewing project work.')
        if (!['approved', 'changes_requested'].includes(status)) throw new Error('Choose a valid review decision.')
        const submission = data.workSubmissions.find(item => item.id === submissionId)
        if (!submission) throw new Error('This submission is no longer available. Refresh and try again.')
        const project = data.projects[submission.projectId]
        const idea = data.ideas.find(item => item.id === submission.ideaId)
        if (!project || !idea) throw new Error('The submission’s project could not be found.')
        if (project.status !== 'active') throw new Error('Reopen the project before reviewing pending milestone work.')
        if (!canManageCommunity(idea.cid)) throw new Error('Only the community owner or platform administrator can review submitted work.')
        if (submission.submittedBy === me.id) throw new Error('You cannot review your own submission. Another authorized reviewer must decide.')
        if (submission.status !== 'submitted') throw new Error('This submission has already been reviewed.')
        const cleanNote = reviewNote.trim().slice(0, 1600)
        if (status === 'changes_requested' && cleanNote.length < 4) throw new Error('Explain what needs to change so the contributor knows what to do next.')
        const reviewedAt = Date.now()
        const patch = { status, reviewNote: cleanNote, reviewedAt, reviewedBy: me.id, updatedAt: reviewedAt }
        await st.update('workSubmissions/' + submissionId, patch)
        setData(d => ({ ...d, workSubmissions: d.workSubmissions.map(item => item.id === submissionId ? { ...item, ...patch } : item) }))
        if (status === 'approved') {
          const milestone = data.milestones.find(item => item.id === submission.milestoneId)
          if (milestone && milestone.status !== 'done' && project.status === 'active') {
            const milestonePatch = { status: 'done' as const, updatedAt: Date.now() }
            await up('milestones/' + milestone.id, milestonePatch)
            setData(d => ({ ...d, milestones: d.milestones.map(item => item.id === milestone.id ? { ...item, ...milestonePatch } : item) }))
          }
        }
      }, 'Submission reviewed'),
      saveSettings: p => w(() => up('settings/space', p), 'Saved'),
      saveProfile: async p => {
        const ok = await w(() => up('profiles/' + me!.id, { ...p, at: Date.now() }), 'Profile saved')
        if (ok && me) setData(d => ({ ...d, profiles: { ...d.profiles, [me.id]: { ...d.profiles[me.id], ...p, id: me.id, at: Date.now() } } }))
        return ok
      },
      requestCommunityJoin: (cid, message = '') => w(async () => {
        if (!me) throw new Error('Sign in before requesting to join a community.')
        const community = data.communities.find(c => c.id === cid)
        if (!community || !community.joinApproval || community.arch) throw new Error('This community is not accepting join requests.')
        if (data.members[me.id]?.[cid]) throw new Error('You are already a member of this community.')
        const path = 'communityJoinRequests/' + cid + '__' + me.id
        const previous = await st!.get(path)
        if (previous?.status === 'pending') throw new Error('Your join request is already pending.')
        if (previous?.status === 'approved') throw new Error('Your join request was approved. Refresh the community.')
        const request = { cid, userId: me.id, message: message.trim().slice(0, 500), status: 'pending', at: Date.now() }
        if (previous) await st!.set(path, request)
        else await st!.create(path, request)
      }, 'Join request sent'),
      requestCommunityAIOrganizerApproval: (ideaId, message = '') => w(async () => {
        if (!me) throw new Error('Sign in before requesting AI organizer access.')
        const idea = data.ideas.find(item => item.id === ideaId)
        const community = idea && data.communities.find(item => item.id === idea.cid)
        if (!idea || !community || community.arch) throw new Error('This collaboration is no longer available for AI organizer approval.')
        const isEligible = idea.authorId === me.id
          || data.volunteers.some(item => item.ideaId === ideaId && item.applicantId === me.id && item.status === 'accepted')
          || platformAdmin
        if (platformOwner) throw new Error('Platform owners already have automatic AI organizer access across communities.')
        if (!isEligible) throw new Error('Only the idea creator, an accepted collaborator, or a platform admin can request AI organizer approval.')
        if (ownsCommunity(community.id)) throw new Error('The community owner already has AI organizer access.')
        if (canOrganizeIdeaWithAI(ideaId)) throw new Error('Your AI organizer access is already approved.')
        const path = 'communityAiOrganizerRequests/' + community.id + '__' + me.id
        const previous = await st!.get(path)
        if (previous?.status === 'pending') throw new Error('Your AI organizer request is already waiting for approval.')
        if (previous?.status === 'approved') throw new Error('Your AI organizer access is already approved.')
        const request = { cid: community.id, userId: me.id, ideaId, message: message.trim().slice(0, 500), status: 'pending', at: Date.now() }
        if (previous) await st!.set(path, request)
        else await st!.create(path, request)
      }, 'AI organizer approval requested. The community owner or a platform admin must approve it.'),
      reviewCommunityAIOrganizerRequest: (cid, userId, status) => w(async () => {
        if (!me || !canManageCommunity(cid)) throw new Error('Only this community’s owner or a platform administrator can review AI organizer requests.')
        if (me.id === userId) throw new Error('You cannot approve or decline your own AI organizer request.')
        if (!['approved', 'declined'].includes(status)) throw new Error('Choose approve or decline.')
        const path = 'communityAiOrganizerRequests/' + cid + '__' + userId
        const current = await st!.get(path)
        if (!current || current.cid !== cid || current.userId !== userId || current.status !== 'pending') throw new Error('This AI organizer request is no longer pending. Refresh the page and try again.')
        const reviewedAt = Date.now()
        await st!.set(path, { ...current, status, reviewedAt, reviewedBy: me.id })
        setData(d => {
          const updated = { ...current, id: current.id || cid + '__' + userId, status, reviewedAt, reviewedBy: me.id } as CommunityAIOrganizerRequest
          const exists = d.aiOrganizerRequests.some(request => request.cid === cid && request.userId === userId)
          return {
            ...d,
            aiOrganizerRequests: exists
              ? d.aiOrganizerRequests.map(request => request.cid === cid && request.userId === userId ? updated : request)
              : [updated, ...d.aiOrganizerRequests],
          }
        })
      }, status === 'approved' ? 'AI organizer approved for this community' : 'AI organizer request declined'),
      reviewCommunityJoinRequest: (cid, userId, status) => w(async () => {
        if (!me || !canManageCommunity(cid)) throw new Error('Only this community’s owner or a platform administrator can review its join requests.')
        if (!backend) throw new Error('The backend is not ready.')
        await backend.reviewCommunityJoinRequest(cid, userId, status)
        const reviewedAt = Date.now()
        setData(d => ({
          ...d,
          joinRequests: d.joinRequests.map(request => request.cid === cid && request.userId === userId
            ? { ...request, status, reviewedAt, reviewedBy: me.id }
            : request),
          ...(status === 'approved' ? {
            members: { ...d.members, [userId]: { ...(d.members[userId] || {}), [cid]: true } },
          } : {}),
        }))
      }, status === 'approved' ? 'Join request approved' : 'Join request declined'),
      sendRequest: r => w(() => st!.set('requests/' + me!.id, { platforms: r.platforms || [], aud: r.aud || '', note: r.note || '', at: Date.now() }), 'Request sent'),
      decide: (uid, status) => w(() => st!.set('decisions/' + uid, { status, at: Date.now() }), status === 'approved' ? 'Approved' : 'Declined'),
      useComments: () => [],
    }
  }, [ready, startupError, backend, me, owner, legacyOwner, platformAdmin, demo, enterDemo, exitDemo, signOut, data, settingsLoaded, platformRolesReady, toast, toastMsg, st])

  return <Ctx.Provider value={app}>{children}</Ctx.Provider>
}

/** Live comments for one idea. */
export function useComments(ideaId: string | null): Comment[] {
  const { backend } = useApp()
  const [list, setList] = useState<Comment[]>([])
  useEffect(() => {
    if (!backend || !ideaId) { setList([]); return }
    return backend.store.subscribe(`ideas/${ideaId}/comments`, d => setList(asList<Comment>(d).sort((a, b) => a.at - b.at)))
  }, [backend, ideaId])
  return list
}
