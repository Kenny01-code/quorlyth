import { useEffect, useMemo, useState } from 'react'
import { App } from '../data/AppProvider'
import { UserState } from './userState'

export type NotifKind = 'idea' | 'promo' | 'access' | 'settings' | 'join' | 'ai-organizer' | 'collaboration' | 'collab-request' | 'comment' | 'vote' | 'community' | 'project' | 'milestone' | 'message' | 'announcement' | 'call'
export interface Notif { key: string; at: number; icon: string; text: string; kind: NotifKind; id?: string; target?: string; unread: boolean }
type StoredNotif = Omit<Notif, 'key' | 'unread'> & { key?: string }

const keyOf = (k: string, id: string | undefined, at: number) => `${k}_${id || 'x'}_${at}`.replace(/[^\w]/g, '_')

export function useNotifs(a: App, st: UserState): Notif[] {
  const memberId = a.me?.id
  const [storedState, setStoredState] = useState<{ memberId: string | null; docs: StoredNotif[] }>({ memberId: null, docs: [] })
  // Never render the previous account's notification snapshot during the render
  // between an account change and its subscription effect.
  const stored = storedState.memberId === (memberId || null) ? storedState.docs : []

  // These durable events live under the recipient's private user-vault path. Supabase
  // persists them across devices and Realtime updates the panel without polling.
  useEffect(() => {
    const store = a.backend?.store
    const uid = memberId || null
    if (!store || !uid) {
      setStoredState({ memberId: uid, docs: [] })
      return
    }
    let active = true
    setStoredState({ memberId: uid, docs: [] })
    const unsubscribe = store.subscribe(
      `data/users/${uid}/notifications`,
      docs => {
        if (active) setStoredState({ memberId: uid, docs: docs.map(doc => ({ id: doc.id, ...doc.data }) as StoredNotif) })
      },
      error => console.warn('Could not load Quorlyth notifications:', error),
    )
    return () => { active = false; unsubscribe() }
  }, [a.backend, memberId])

  return useMemo(() => {
    const m = memberId
    if (!m) return []
    const seen = st.seen || 0, rd = st.read || {}
    const out: Omit<Notif, 'key' | 'unread'>[] = []
    const d = a.data
    d.ideas.forEach(i => {
      const r = d.reviews[i.id]
      if (i.authorId === m && r && r.status && r.status !== 'review' && r.at) out.push({ at: r.at, icon: r.status === 'promoted' ? 'publish' : r.status === 'selected' ? 'select' : r.status === 'held' ? 'hold' : 'decline', text: `Your idea "${i.title}" was ${r.status === 'promoted' ? 'prepared for sharing' : r.status}`, kind: 'idea', id: i.id })
      if (i.authorId !== m && a.joined(i.cid) && i.at) out.push({ at: i.at, icon: 'idea', text: `${a.nm(i.authorId)} shared "${i.title}"`, kind: 'idea', id: i.id })
    })
    d.promotions.forEach(p => { if ((p.credits || []).includes(m) && p.by !== m) out.push({ at: p.at, icon: 'publish', text: 'You were credited in a post prepared to share', kind: 'promo', id: p.id }) })
    const dc = d.decisions[m]
    if (dc?.at) out.push({ at: dc.at, icon: dc.status === 'approved' ? 'approve' : 'alert', text: `Your access request was ${dc.status}`, kind: 'access' })
    if (a.platformAdmin) d.requests.forEach(r => { const x = d.decisions[r.id]; if (r.at && (!x || x.at < r.at)) out.push({ at: r.at, icon: 'invite', text: `${a.nm(r.id)} requested access`, kind: 'settings', id: r.id }) })
    d.joinRequests.forEach(r => {
      if (r.status !== 'pending' || (!a.owner && !a.canManageCommunity(r.cid))) return
      const community = d.communities.find(c => c.id === r.cid)
      out.push({ at: r.at, icon: 'member', text: `${a.nm(r.userId)} requested to join ${community?.name || 'your community'}`, kind: 'join', id: r.cid + '__' + r.userId, target: r.cid })
    })
    d.aiOrganizerRequests.forEach(r => {
      const community = d.communities.find(c => c.id === r.cid)
      const communityName = community?.name || 'your community'
      if (r.status === 'pending' && a.canManageCommunity(r.cid) && r.userId !== m) {
        out.push({
          at: r.at,
          icon: 'invite',
          text: a.nm(r.userId) + ' requested AI organizer access for ' + communityName,
          kind: 'ai-organizer',
          id: r.cid + '__' + r.userId,
          target: r.cid,
        })
      }
      if (r.userId === m && r.status !== 'pending' && r.reviewedAt) {
        out.push({
          at: r.reviewedAt,
          icon: r.status === 'approved' ? 'approve' : 'decline',
          text: 'Your AI organizer request for ' + communityName + ' was ' + r.status,
          kind: 'ai-organizer',
          id: r.cid + '__' + r.userId,
          target: r.cid,
        })
      }
    })
    d.volunteers.forEach(application => {
      const idea = d.ideas.find(item => item.id === application.ideaId)
      if (!idea) return
      if (application.status === 'pending' && a.canManageCommunity(idea.cid)) {
        out.push({ at: application.at, icon: 'collab', text: a.nm(application.applicantId) + ' applied to collaborate on "' + idea.title + '"', kind: 'collab-request', id: application.id, target: idea.id })
      }
      if (application.applicantId === m && application.status !== 'pending' && application.reviewedAt) {
        out.push({ at: application.reviewedAt, icon: application.status === 'accepted' ? 'approve' : 'decline', text: 'Your collaboration application for "' + idea.title + '" was ' + application.status, kind: 'collaboration', id: application.id, target: idea.id })
      }
    })

    // Prefer the persistent server event when its stable key matches a legacy-derived
    // item. This avoids showing the same idea/status/request twice during migration.
    const merged = new Map<string, Omit<Notif, 'unread'>>()
    out.forEach(item => {
      const key = keyOf(item.kind, item.id, item.at)
      merged.set(key, { ...item, key })
    })
    stored.forEach(item => {
      if (!item || !item.kind || !Number.isFinite(Number(item.at)) || !item.text) return
      const kind = item.kind as NotifKind
      const at = Number(item.at)
      const key = item.key || keyOf(kind, item.id, at)
      merged.set(key, {
        key, at, icon: item.icon || 'bell', text: String(item.text), kind,
        ...(item.id ? { id: item.id } : {}),
        ...(item.target ? { target: item.target } : {}),
      })
    })
    return [...merged.values()]
      .sort((x, y) => y.at - x.at)
      .slice(0, 100)
      .map(n => ({ ...n, unread: n.at > seen && !rd[n.key] }))
  }, [a.data, a.me?.id, a.owner, a.platformAdmin, a.nm, a.joined, a.canManageCommunity, st, memberId, stored])
}

let ac: AudioContext | null = null
export function unlockAudio() { try { ac = ac || new (window.AudioContext || (window as any).webkitAudioContext)(); if (ac.state === 'suspended') ac.resume() } catch {} }
if (typeof document !== 'undefined') { document.addEventListener('pointerdown', unlockAudio); document.addEventListener('keydown', unlockAudio) }

/** A soft three note chime. Only plays once the page has had a click or key press. */
export function chime() {
  if (!ac || ac.state !== 'running') return
  const t = ac.currentTime
  ;[[880, 0], [1318.5, 0.13], [1760, 0.26]].forEach(([f, d], i) => {
    const o = ac!.createOscillator(), g = ac!.createGain()
    o.type = 'sine'; o.frequency.value = f
    g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(i === 2 ? 0.05 : 0.11, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.75)
    o.connect(g); g.connect(ac!.destination); o.start(t + d); o.stop(t + d + 0.8)
  })
}
