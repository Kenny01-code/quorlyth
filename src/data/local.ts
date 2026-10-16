import { DocStore, Doc, isDirectChild, deepMerge } from './docstore'

const KEY = 'quorlyth:docs:v1'

/** Browser-only store. Works with zero setup, perfect for building and testing. */
export function createLocalStore(): DocStore {
  const read = (): Record<string, any> => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} }
  }
  const write = (m: Record<string, any>) => localStorage.setItem(KEY, JSON.stringify(m))
  const subs = new Set<() => void>()
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('quorlyth') : null
  const ping = () => { subs.forEach(f => f()); bc?.postMessage('x') }
  bc && (bc.onmessage = () => subs.forEach(f => f()))
  window.addEventListener('storage', e => { if (e.key === KEY) subs.forEach(f => f()) })

  return {
    async get(path) { return read()[path] ?? null },
    async exportAll() { return Object.entries(read()).map(([path, data]) => ({ path, data })) },
    async listCommunityMembers(cid) {
      return Object.entries(read())
        .filter(([path, data]) => /^members\/[^/]+$/.test(path) && data?.c?.[cid] === true)
        .map(([path]) => path.slice('members/'.length))
    },
    async listCommunityContributors(cid) {
      const docs = read()
      const community = docs['communities/' + cid] || {}
      const ownerId = community.ownerId || community.createdBy || docs['config/owner']?.id || ''
      const ideas = Object.entries(docs)
        .filter(([path, data]) => /^ideas\\/[^/]+$/.test(path) && data?.cid === cid && typeof data?.authorId === 'string' && data.authorId !== ownerId)
        .map(([path, data]) => ({ id: path.slice('ideas/'.length), userId: data.authorId as string }))
      const totals = new Map<string, { userId: string; ideas: number; backings: number }>()
      const voteMaps = Object.entries(docs)
        .filter(([path]) => /^votes\\/[^/]+$/.test(path))
        .map(([, data]) => data?.ideas || {})
      for (const idea of ideas) {
        const row = totals.get(idea.userId) || { userId: idea.userId, ideas: 0, backings: 0 }
        row.ideas += 1
        for (const voteMap of voteMaps) if (voteMap[idea.id] === true) row.backings += 1
        totals.set(idea.userId, row)
      }
      return [...totals.values()].sort((a, b) => b.ideas - a.ideas || b.backings - a.backings || a.userId.localeCompare(b.userId))
    },
    async create(path, data) {
      const m = read()
      if (Object.prototype.hasOwnProperty.call(m, path)) throw new Error('already_exists')
      m[path] = JSON.parse(JSON.stringify(data))
      write(m); ping()
    },
    async set(path, data) { const m = read(); m[path] = JSON.parse(JSON.stringify(data)); write(m); ping() },
    async update(path, patch) {
      const m = read()
      if (!m[path]) throw new Error('not_found')
      m[path] = deepMerge(m[path], JSON.parse(JSON.stringify(patch)))
      write(m); ping()
    },
    async delete(path) {
      const m = read()
      Object.keys(m).filter(k => k === path || k.startsWith(path + '/')).forEach(k => delete m[k])
      write(m); ping()
    },
    subscribe(collection, cb) {
      const emit = () => {
        const m = read()
        const docs: Doc[] = Object.keys(m).filter(k => isDirectChild(collection, k)).map(k => ({ id: k.slice(collection.length + 1), data: m[k] }))
        cb(docs)
      }
      subs.add(emit)
      emit()
      return () => { subs.delete(emit) }
    },
  }
}
