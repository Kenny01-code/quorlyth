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
