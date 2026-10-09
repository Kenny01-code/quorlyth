import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Backend, createBackend } from '../backend'
import { Comment, Community, Decision, Idea, Me, Milestone, Profile, Project, Promotion, Request, Review, SpaceSettings, Status, VolunteerApplication, VolunteerStatus } from '../lib/types'
import { slug } from '../lib/util'
import { OWNER_EMAIL } from '../lib/owner'
import { createDemoBackend, DEMO_ME } from './demo'

type Rec<T> = Record<string, T>
interface Data {
  communities: Community[]; ideas: Idea[]; reviews: Rec<Review>; votes: Rec<Rec<boolean>>; members: Rec<Rec<boolean>>
  profiles: Rec<Profile>; requests: Request[]; decisions: Rec<Decision>; promotions: Promotion[]; volunteers: VolunteerApplication[]; projects: Rec<Project>; milestones: Milestone[]; settings: SpaceSettings | null; ownerId: string | null
}
const EMPTY: Data = { communities: [], ideas: [], reviews: {}, votes: {}, members: {}, profiles: {}, requests: [], decisions: {}, promotions: [], volunteers: [], projects: {}, milestones: [], settings: null, ownerId: null }

export interface App {
  ready: boolean; startupError: string | null; backend: Backend | null; me: Me | null; owner: boolean; demo: boolean; data: Data
  enterDemo: () => void; exitDemo: () => Promise<void>
  toast: (m: string) => void; toastMsg: string
  nm: (id: string) => string; avatar: (id: string) => string
  votesOf: (ideaId: string) => number; iVoted: (ideaId: string) => boolean; statusOf: (ideaId: string) => Status
  joined: (cid: string) => boolean
  canPost: () => boolean
  claimOwner: () => Promise<boolean>
  createCommunity: (c: Partial<Community>) => Promise<boolean>
  createCommunityDetailed: (c: Partial<Community>) => Promise<{ ok: boolean; error?: string }>
  saveCommunity: (id: string, patch: Partial<Community>) => Promise<boolean>
  deleteCommunity: (id: string) => Promise<boolean>
  join: (cid: string, on: boolean) => Promise<boolean>
  postIdea: (i: { title: string; body?: string; cid: string; tags?: string[] }) => Promise<boolean>
  vote: (ideaId: string) => Promise<boolean>
  addComment: (ideaId: string, text: string) => Promise<boolean>
  setStatus: (ideaId: string, status: Status, extra?: Partial<Review>) => Promise<boolean>
  saveReview: (ideaId: string, r: Partial<Review>) => Promise<boolean>
  publish: (ideaId: string, text: string, credits: string[]) => Promise<boolean>
  applyToCollaborate: (ideaId: string, message: string) => Promise<boolean>
  decideVolunteer: (applicationId: string, status: VolunteerStatus) => Promise<boolean>
  createProject: (ideaId: string, summary: string) => Promise<boolean>
  addMilestone: (projectId: string, title: string, description: string) => Promise<boolean>
  updateMilestone: (milestoneId: string, patch: Partial<Pick<Milestone, 'title' | 'description' | 'status'>>) => Promise<boolean>
  saveSettings: (p: Partial<SpaceSettings>) => Promise<boolean>
  saveProfile: (p: Partial<Profile>) => Promise<boolean>
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
    if (!backend || !me) { setData(EMPTY); return }
    const s = backend.store
    const set = (k: keyof Data, v: any) => setData(d => ({ ...d, [k]: v }))
    let readErrorShown = false
    const onReadError = (error: unknown) => {
      console.error('Quorlyth shared-data read failed:', error)
      if (!readErrorShown) {
        readErrorShown = true
        toast('Some shared data could not load. Check your connection and refresh.')
      }
    }
    const offs = [
      s.subscribe('communities', d => set('communities', asList<Community>(d).sort((a, b) => a.at - b.at)), onReadError),
      s.subscribe('ideas', d => set('ideas', asList<Idea>(d)), onReadError),
      s.subscribe('reviews', d => set('reviews', asMap<Review>(d)), onReadError),
      s.subscribe('votes', d => set('votes', Object.fromEntries(d.map(x => [x.id, x.data?.ideas || {}]))), onReadError),
      s.subscribe('members', d => set('members', Object.fromEntries(d.map(x => [x.id, x.data?.c || {}]))), onReadError),
      s.subscribe('profiles', d => set('profiles', asMap<Profile>(d)), onReadError),
      s.subscribe('requests', d => set('requests', asList<Request>(d)), onReadError),
      s.subscribe('decisions', d => set('decisions', asMap<Decision>(d)), onReadError),
      s.subscribe('promotions', d => set('promotions', asList<Promotion>(d).sort((a, b) => b.at - a.at)), onReadError),
      s.subscribe('volunteers', d => set('volunteers', asList<VolunteerApplication>(d).sort((a, b) => b.at - a.at)), onReadError),
      s.subscribe('projects', d => set('projects', asMap<Project>(d)), onReadError),
      s.subscribe('milestones', d => set('milestones', asList<Milestone>(d).sort((a, b) => a.at - b.at)), onReadError),
      s.subscribe('settings', d => set('settings', d.find(x => x.id === 'space')?.data ?? null), onReadError),
      s.subscribe('config', d => set('ownerId', d.find(x => x.id === 'owner')?.data?.id ?? null), onReadError),
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

  const st = backend?.store
  const owner = demo || (!!me && (backend?.auth.mode === 'supabase'
    ? me.email?.trim().toLowerCase() === OWNER_EMAIL
    : data.ownerId === me.id))

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

  const app = useMemo<App>(() => {
    const votesOf = (id: string) => Object.values(data.votes).filter(v => v && v[id]).length
    const w = async (fn: () => Promise<any>, ok?: string) => {
      try { await fn(); ok && toast(ok); return true } catch (e: any) { toast(e?.message?.includes('row-level') ? 'You do not have permission to do that' : 'That did not go through. Please try again.'); return false }
    }
    const createCommunityDetailed = async (c: Partial<Community>): Promise<{ ok: boolean; error?: string }> => {
      if (!me) return { ok: false, error: 'Sign in before creating a community.' }
      if (!owner) return { ok: false, error: 'Your current account is not recognized as the Quorlyth owner.' }
      try {
        await st!.set('communities/' + slug(), { name: c.name, purpose: c.purpose || '', icon: c.icon || 'community', vis: c.vis || 'listed', post: c.post || 'anyone', cover: c.cover || 'a', ...(c.welcome ? { welcome: c.welcome } : {}), ...(c.rules ? { rules: c.rules } : {}), ...(c.arch ? { arch: true } : {}), at: Date.now() })
        toast('Community created')
        return { ok: true }
      } catch (e: any) {
        const error = String(e?.message || e || 'Unknown database error').slice(0, 500)
        console.error('Quorlyth community creation failed:', error)
        toast('Community creation failed: ' + error)
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
      ready, startupError, backend, me, owner, demo, enterDemo, exitDemo, data, toast, toastMsg,
      nm: id => data.profiles[id]?.name || data.profiles[id]?.authName || (me && id === me.id ? me.name : 'Member'),
      avatar: id => data.profiles[id]?.photo || data.profiles[id]?.authAvatarUrl || (me && id === me.id ? me.avatarUrl || '' : ''),
      votesOf,
      iVoted: id => !!(me && data.votes[me.id]?.[id]),
      statusOf: id => data.reviews[id]?.status || 'review',
      joined: cid => !!(me && data.members[me.id]?.[cid]),
      canPost: () => owner || !data.settings?.appr || data.decisions[me?.id || '']?.status === 'approved',
      claimOwner: () => w(() => st!.set('config/owner', { id: me!.id }), 'You now own this space'),
      createCommunity: c => w(() => st!.set('communities/' + slug(), { name: c.name, purpose: c.purpose || '', icon: c.icon || 'community', vis: c.vis || 'listed', post: c.post || 'anyone', cover: c.cover || 'a', ...(c.welcome ? { welcome: c.welcome } : {}), ...(c.rules ? { rules: c.rules } : {}), ...(c.arch ? { arch: true } : {}), at: Date.now() }), 'Community created'),
      createCommunityDetailed,
      saveCommunity: (id, p) => w(() => up('communities/' + id, p), 'Saved'),
      deleteCommunity: id => w(() => st!.delete('communities/' + id), 'Community deleted'),
      join: (cid, on) => w(() => up('members/' + me!.id, { c: { [cid]: on } }), on ? 'You joined' : 'You left'),
      postIdea: i => w(() => st!.set('ideas/' + slug(), { title: i.title, body: i.body || '', cid: i.cid, authorId: me!.id, tags: i.tags || [], at: Date.now() }), 'Idea shared'),
      vote: id => w(() => up('votes/' + me!.id, { ideas: { [id]: !data.votes[me!.id]?.[id] } })),
      addComment: (id, text) => w(() => st!.set(`ideas/${id}/comments/${slug()}`, { authorId: me!.id, text, at: Date.now() }), 'Reply posted'),
      setStatus: (id, status, extra) => w(() => up('reviews/' + id, { status, at: Date.now(), ...extra }), status === 'selected' ? 'Selected for promotion' : status === 'held' ? 'Held for later' : status === 'declined' ? 'Declined' : 'Done'),
      saveReview: (id, r) => w(() => up('reviews/' + id, { ...r, at: Date.now() })),
      publish: (id, text, credits) => w(async () => { await st!.set('promotions/' + slug(), { ideaId: id, text, credits, by: me!.id, at: Date.now() }); await up('reviews/' + id, { status: 'promoted', at: Date.now() }) }, 'Post prepared to share'),
      applyToCollaborate: (ideaId, message) => {
        if (data.volunteers.some(v => v.ideaId === ideaId && v.applicantId === me?.id && v.status !== 'declined')) {
          toast('You already have an active application for this idea')
          return Promise.resolve(false)
        }
        return w(() => st!.set('volunteers/' + slug(), { ideaId, applicantId: me!.id, message: message.trim(), status: 'pending', at: Date.now() }), 'Collaboration request sent')
      },
      decideVolunteer: (applicationId, status) => w(() => up('volunteers/' + applicationId, { status, reviewedAt: Date.now(), reviewedBy: me!.id }), status === 'accepted' ? 'Contributor accepted' : 'Application declined'),
      createProject: (ideaId, summary) => w(async () => {
        await st!.set('projects/' + ideaId, { ideaId, summary: summary.trim(), status: 'active', createdBy: me!.id, at: Date.now() })
        await up('reviews/' + ideaId, { status: 'selected', at: Date.now() })
      }, 'Project created'),
      addMilestone: (projectId, title, description) => w(() => st!.set('milestones/' + slug(), { projectId, title: title.trim(), description: description.trim(), status: 'todo', createdBy: me!.id, at: Date.now() }), 'Milestone added'),
      updateMilestone: (milestoneId, patch) => w(() => up('milestones/' + milestoneId, { ...patch, updatedAt: Date.now() }), 'Milestone updated'),
      saveSettings: p => w(() => up('settings/space', p), 'Saved'),
      saveProfile: async p => {
        const ok = await w(() => up('profiles/' + me!.id, { ...p, at: Date.now() }), 'Profile saved')
        if (ok && me) setData(d => ({ ...d, profiles: { ...d.profiles, [me.id]: { ...d.profiles[me.id], ...p, id: me.id, at: Date.now() } } }))
        return ok
      },
      sendRequest: r => w(() => st!.set('requests/' + me!.id, { platforms: r.platforms || [], aud: r.aud || '', note: r.note || '', at: Date.now() }), 'Request sent'),
      decide: (uid, status) => w(() => st!.set('decisions/' + uid, { status, at: Date.now() }), status === 'approved' ? 'Approved' : 'Declined'),
      useComments: () => [],
    }
  }, [ready, startupError, backend, me, owner, demo, enterDemo, exitDemo, data, toast, toastMsg, st])

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
