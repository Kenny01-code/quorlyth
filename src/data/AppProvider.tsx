import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Backend, createBackend } from '../backend'
import { Comment, Community, Decision, Idea, Me, Profile, Promotion, Request, Review, SpaceSettings, Status } from '../lib/types'
import { slug } from '../lib/util'
import { OWNER_EMAIL } from '../lib/owner'

type Rec<T> = Record<string, T>
interface Data {
  communities: Community[]; ideas: Idea[]; reviews: Rec<Review>; votes: Rec<Rec<boolean>>; members: Rec<Rec<boolean>>
  profiles: Rec<Profile>; requests: Request[]; decisions: Rec<Decision>; promotions: Promotion[]; settings: SpaceSettings | null; ownerId: string | null
}
const EMPTY: Data = { communities: [], ideas: [], reviews: {}, votes: {}, members: {}, profiles: {}, requests: [], decisions: {}, promotions: [], settings: null, ownerId: null }

export interface App {
  ready: boolean; backend: Backend | null; me: Me | null; owner: boolean; data: Data
  toast: (m: string) => void; toastMsg: string
  nm: (id: string) => string; avatar: (id: string) => string
  votesOf: (ideaId: string) => number; iVoted: (ideaId: string) => boolean; statusOf: (ideaId: string) => Status
  joined: (cid: string) => boolean
  canPost: () => boolean
  claimOwner: () => Promise<boolean>
  createCommunity: (c: Partial<Community>) => Promise<boolean>
  saveCommunity: (id: string, patch: Partial<Community>) => Promise<boolean>
  deleteCommunity: (id: string) => Promise<boolean>
  join: (cid: string, on: boolean) => Promise<boolean>
  postIdea: (i: { title: string; body?: string; cid: string; tags?: string[] }) => Promise<boolean>
  vote: (ideaId: string) => Promise<boolean>
  addComment: (ideaId: string, text: string) => Promise<boolean>
  setStatus: (ideaId: string, status: Status, extra?: Partial<Review>) => Promise<boolean>
  saveReview: (ideaId: string, r: Partial<Review>) => Promise<boolean>
  publish: (ideaId: string, text: string, credits: string[]) => Promise<boolean>
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
  const [ready, setReady] = useState(false)
  const [data, setData] = useState<Data>(EMPTY)
  const [toastMsg, setToastMsg] = useState('')
  const tt = useRef<number>()

  const toast = useCallback((m: string) => { setToastMsg(m); clearTimeout(tt.current); tt.current = window.setTimeout(() => setToastMsg(''), 2400) }, [])

  useEffect(() => {
    let off = () => {}
    createBackend().then(async b => {
      setBackend(b)
      setMe(await b.auth.current())
      off = b.auth.onChange(setMe)
      setReady(true)
    })
    return () => off()
  }, [])

  useEffect(() => {
    if (!backend || !me) return
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
  }, [backend, me?.id, toast])

  useEffect(() => {
    if (!backend || !me) { setData(EMPTY); return }
    const s = backend.store
    const set = (k: keyof Data, v: any) => setData(d => ({ ...d, [k]: v }))
    const offs = [
      s.subscribe('communities', d => set('communities', asList<Community>(d).sort((a, b) => a.at - b.at))),
      s.subscribe('ideas', d => set('ideas', asList<Idea>(d))),
      s.subscribe('reviews', d => set('reviews', asMap<Review>(d))),
      s.subscribe('votes', d => set('votes', Object.fromEntries(d.map(x => [x.id, x.data?.ideas || {}])))),
      s.subscribe('members', d => set('members', Object.fromEntries(d.map(x => [x.id, x.data?.c || {}])))),
      s.subscribe('profiles', d => set('profiles', asMap<Profile>(d))),
      s.subscribe('requests', d => set('requests', asList<Request>(d))),
      s.subscribe('decisions', d => set('decisions', asMap<Decision>(d))),
      s.subscribe('promotions', d => set('promotions', asList<Promotion>(d).sort((a, b) => b.at - a.at))),
      s.subscribe('settings', d => set('settings', d.find(x => x.id === 'space')?.data ?? null)),
      s.subscribe('config', d => set('ownerId', d.find(x => x.id === 'owner')?.data?.id ?? null)),
    ]
    return () => offs.forEach(f => f())
  }, [backend, me?.id])

  const st = backend?.store
  const owner = !!me && (backend?.auth.mode === 'supabase'
    ? me.email?.trim().toLowerCase() === OWNER_EMAIL
    : data.ownerId === me.id)

  const app = useMemo<App>(() => {
    const votesOf = (id: string) => Object.values(data.votes).filter(v => v && v[id]).length
    const w = async (fn: () => Promise<any>, ok?: string) => {
      try { await fn(); ok && toast(ok); return true } catch (e: any) { toast(e?.message?.includes('row-level') ? 'You do not have permission to do that' : 'That did not go through. Please try again.'); return false }
    }
    const up = async (path: string, patch: any) => { try { await st!.update(path, patch) } catch { await st!.set(path, patch) } }
    return {
      ready, backend, me, owner, data, toast, toastMsg,
      nm: id => data.profiles[id]?.name || (me && id === me.id ? me.name : 'Member'),
      avatar: id => data.profiles[id]?.photo || (me && id === me.id ? me.avatarUrl || '' : ''),
      votesOf,
      iVoted: id => !!(me && data.votes[me.id]?.[id]),
      statusOf: id => data.reviews[id]?.status || 'review',
      joined: cid => !!(me && data.members[me.id]?.[cid]),
      canPost: () => owner || !data.settings?.appr || data.decisions[me?.id || '']?.status === 'approved',
      claimOwner: () => w(() => st!.set('config/owner', { id: me!.id }), 'You now own this space'),
      createCommunity: c => w(() => st!.set('communities/' + slug(), { name: c.name, purpose: c.purpose || '', icon: c.icon || 'community', vis: c.vis || 'listed', post: c.post || 'anyone', cover: 'a', at: Date.now() }), 'Community created'),
      saveCommunity: (id, p) => w(() => up('communities/' + id, p), 'Saved'),
      deleteCommunity: id => w(() => st!.delete('communities/' + id), 'Community deleted'),
      join: (cid, on) => w(() => up('members/' + me!.id, { c: { [cid]: on } }), on ? 'You joined' : 'You left'),
      postIdea: i => w(() => st!.set('ideas/' + slug(), { title: i.title, body: i.body || '', cid: i.cid, authorId: me!.id, tags: i.tags || [], at: Date.now() }), 'Idea shared'),
      vote: id => w(() => up('votes/' + me!.id, { ideas: { [id]: !data.votes[me!.id]?.[id] } })),
      addComment: (id, text) => w(() => st!.set(`ideas/${id}/comments/${slug()}`, { authorId: me!.id, text, at: Date.now() }), 'Reply posted'),
      setStatus: (id, status, extra) => w(() => up('reviews/' + id, { status, at: Date.now(), ...extra }), status === 'selected' ? 'Selected for promotion' : status === 'held' ? 'Held for later' : status === 'declined' ? 'Declined' : 'Done'),
      saveReview: (id, r) => w(() => up('reviews/' + id, { ...r, at: Date.now() })),
      publish: (id, text, credits) => w(async () => { await st!.set('promotions/' + slug(), { ideaId: id, text, credits, by: me!.id, at: Date.now() }); await up('reviews/' + id, { status: 'promoted', at: Date.now() }) }, 'Published'),
      saveSettings: p => w(() => up('settings/space', p), 'Saved'),
      saveProfile: p => w(() => up('profiles/' + me!.id, { ...p, at: Date.now() }), 'Profile saved'),
      sendRequest: r => w(() => st!.set('requests/' + me!.id, { platforms: r.platforms || [], aud: r.aud || '', note: r.note || '', at: Date.now() }), 'Request sent'),
      decide: (uid, status) => w(() => st!.set('decisions/' + uid, { status, at: Date.now() }), status === 'approved' ? 'Approved' : 'Declined'),
      useComments: () => [],
    }
  }, [ready, backend, me, owner, data, toast, toastMsg, st])

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
