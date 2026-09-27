/**
 * The whole app talks to a tiny document store. Swap the implementation
 * (local browser storage, Supabase, Firebase) without touching any screen.
 */
export interface Doc<T = any> { id: string; data: T }

export interface DocStore {
  get(path: string): Promise<any | null>
  set(path: string, data: any): Promise<void>
  update(path: string, patch: any): Promise<void>
  delete(path: string): Promise<void>
  /** live list of the documents directly inside a collection */
  subscribe(collection: string, cb: (docs: Doc[]) => void): () => void
}

export function isDirectChild(collection: string, path: string) {
  const pre = collection + '/'
  return path.startsWith(pre) && !path.slice(pre.length).includes('/')
}

export function deepMerge(a: any, b: any): any {
  const out = { ...(a || {}) }
  for (const k of Object.keys(b || {})) {
    const v = b[k]
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(out[k], v) : v
  }
  return out
}
