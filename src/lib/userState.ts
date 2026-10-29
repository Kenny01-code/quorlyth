import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../data/AppProvider'

export interface UserState { loaded?: boolean; seen?: number; read?: Record<string, boolean>; saved?: Record<string, boolean>; preferences?: { emailNotifications?: boolean; desktopNotifications?: boolean; sound?: boolean; inAppNotifications?: boolean; messageNotifications?: boolean; messagePopups?: boolean; messageSounds?: boolean; profileVisibility?: 'public' | 'members' | 'private' } }
interface ScopedUserState { memberId: string | null; value: UserState }

const USER_STATE_CACHE_PREFIX = 'quorlyth:user-state:v1:'
function readCachedUserState(userId: string | null): UserState | null {
  if (!userId || typeof window === 'undefined') return null
  try {
    const value = JSON.parse(sessionStorage.getItem(USER_STATE_CACHE_PREFIX + userId) || 'null')
    return value && typeof value === 'object' ? { ...value, loaded: true } as UserState : null
  } catch { return null }
}
function writeCachedUserState(userId: string, value: UserState) {
  if (!userId || typeof window === 'undefined') return
  try {
    const { loaded: _loaded, ...durable } = value
    sessionStorage.setItem(USER_STATE_CACHE_PREFIX + userId, JSON.stringify(durable))
  } catch { /* A missing cache must not prevent notification read-state sync. */ }
}

/** Private per-person state: which notifications are read and which ideas are saved. */
export function useUserState() {
  const { backend, me } = useApp()
  const memberId = me?.id || null
  const [snapshot, setSnapshot] = useState<ScopedUserState>({ memberId: null, value: {} })
  // Prevent the previous account's read/saved markers flashing while a new
  // account subscription is starting.
  const st = snapshot.memberId === memberId
    ? snapshot.value
    : readCachedUserState(memberId) || { loaded: false }

  useEffect(() => {
    const uid = memberId
    if (!backend || !uid) {
      setSnapshot({ memberId: uid, value: {} })
      return
    }

    let active = true
    const cached = readCachedUserState(uid)
    setSnapshot({ memberId: uid, value: cached || { loaded: false } })
    const unsubscribe = backend.store.subscribe(
      'data/users/' + uid,
      docs => {
        if (!active) return
        const value = { ...(docs.find(x => x.id === 'state')?.data || {}), loaded: true } as UserState
        writeCachedUserState(uid, value)
        setSnapshot({ memberId: uid, value })
      },
    )
    return () => { active = false; unsubscribe() }
  }, [backend, memberId])

  const patch = useCallback(async (p: UserState) => {
    if (!backend || !memberId) return
    const path = `data/users/${memberId}/state`
    setSnapshot(current => {
      const currentState = current.memberId === memberId ? current.value : (readCachedUserState(memberId) || {})
      const optimistic: UserState = {
        ...currentState,
        ...p,
        loaded: true,
        read: { ...(currentState.read || {}), ...(p.read || {}) },
        saved: { ...(currentState.saved || {}), ...(p.saved || {}) },
      }
      writeCachedUserState(memberId, optimistic)
      return { memberId, value: optimistic }
    })
    try { await backend.store.update(path, p) }
    catch {
      const { loaded: _loaded, ...durable } = {
        ...st,
        ...p,
        read: { ...(st.read || {}), ...(p.read || {}) },
        saved: { ...(st.saved || {}), ...(p.saved || {}) },
      }
      await backend.store.set(path, durable)
    }
  }, [backend, memberId, st])

  const markAll = useCallback(async () => {
    if (!backend || !memberId) return
    const next: UserState = { ...st, loaded: true, seen: Date.now(), read: {} }
    writeCachedUserState(memberId, next)
    setSnapshot({ memberId, value: next })
    const { loaded: _loaded, ...durable } = next
    await backend.store.set(`data/users/${memberId}/state`, durable)
  }, [backend, memberId, st])

  return { st, patch, markAll }
}
