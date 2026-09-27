import { useCallback, useEffect, useState } from 'react'
import { useApp } from '../data/AppProvider'

export interface UserState { seen?: number; read?: Record<string, boolean>; saved?: Record<string, boolean> }

/** Private per-person state: which notifications are read and which ideas are saved. */
export function useUserState() {
  const { backend, me } = useApp()
  const [st, setSt] = useState<UserState>({})
  useEffect(() => {
    if (!backend || !me) { setSt({}); return }
    return backend.store.subscribe('data/users/' + me.id, d => setSt(d.find(x => x.id === 'state')?.data || {}))
  }, [backend, me?.id])
  const patch = useCallback(async (p: UserState) => {
    if (!backend || !me) return
    const path = `data/users/${me.id}/state`
    setSt(s => ({ ...s, ...p, read: { ...(s.read || {}), ...(p.read || {}) }, saved: { ...(s.saved || {}), ...(p.saved || {}) } }))
    try { await backend.store.update(path, p) } catch { await backend.store.set(path, { ...st, ...p, read: { ...(st.read || {}), ...(p.read || {}) }, saved: { ...(st.saved || {}), ...(p.saved || {}) } }) }
  }, [backend, me?.id, st])
  const markAll = useCallback(async () => {
    if (!backend || !me) return
    const next = { ...st, seen: Date.now(), read: {} }
    setSt(next)
    await backend.store.set(`data/users/${me.id}/state`, next)
  }, [backend, me?.id, st])
  return { st, patch, markAll }
}
