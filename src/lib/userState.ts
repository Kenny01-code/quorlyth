import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../data/AppProvider'

export interface UserState { seen?: number; read?: Record<string, boolean>; saved?: Record<string, boolean> }
interface ScopedUserState { memberId: string | null; value: UserState }

/** Private per-person state: which notifications are read and which ideas are saved. */
export function useUserState() {
  const { backend, me } = useApp()
  const memberId = me?.id || null
  const [snapshot, setSnapshot] = useState<ScopedUserState>({ memberId: null, value: {} })
  // Prevent the previous account's read/saved markers flashing while a new
  // account subscription is starting.
  const st = snapshot.memberId === memberId ? snapshot.value : {}

  useEffect(() => {
    const uid = memberId
    if (!backend || !uid) {
      setSnapshot({ memberId: uid, value: {} })
      return
    }

    let active = true
    setSnapshot({ memberId: uid, value: {} })
    const unsubscribe = backend.store.subscribe(
      'data/users/' + uid,
      docs => {
        if (active) setSnapshot({ memberId: uid, value: docs.find(x => x.id === 'state')?.data || {} })
      },
    )
    return () => { active = false; unsubscribe() }
  }, [backend, memberId])

  const patch = useCallback(async (p: UserState) => {
    if (!backend || !memberId) return
    const path = `data/users/${memberId}/state`
    setSnapshot(current => {
      const currentState = current.memberId === memberId ? current.value : {}
      return {
        memberId,
        value: {
          ...currentState,
          ...p,
          read: { ...(currentState.read || {}), ...(p.read || {}) },
          saved: { ...(currentState.saved || {}), ...(p.saved || {}) },
        },
      }
    })
    try { await backend.store.update(path, p) }
    catch {
      await backend.store.set(path, {
        ...st,
        ...p,
        read: { ...(st.read || {}), ...(p.read || {}) },
        saved: { ...(st.saved || {}), ...(p.saved || {}) },
      })
    }
  }, [backend, memberId, st])

  const markAll = useCallback(async () => {
    if (!backend || !memberId) return
    const next = { ...st, seen: Date.now(), read: {} }
    setSnapshot({ memberId, value: next })
    await backend.store.set(`data/users/${memberId}/state`, next)
  }, [backend, memberId, st])

  return { st, patch, markAll }
}
