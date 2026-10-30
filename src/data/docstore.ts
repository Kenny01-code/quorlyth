/**
 * The whole app talks to a tiny document store. Swap the implementation
 * (local browser storage, Supabase, Firebase) without touching any screen.
 */
export interface Doc<T = any> { id: string; data: T }

export type GrowthEventName =
  | 'account_created'
  | 'active_day'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'profile_completed'
  | 'community_created'
  | 'member_joined'
  | 'idea_submitted'
  | 'project_created'
  | 'invite_link_shared'

export type SelfTrackedGrowthEventName =
  | 'active_day'
  | 'onboarding_started'
  | 'onboarding_completed'
  | 'invite_link_shared'

export interface GrowthEvent {
  id: string
  user_id: string
  actor_id: string | null
  event_name: GrowthEventName
  event_key: string
  occurred_at: string
}

export interface ExportDoc<T = any> { path: string; data: T; updatedAt?: string | null }

export interface DocStore {
  get(path: string): Promise<any | null>
  /** Export every document visible to the current backend identity. Supabase RLS remains authoritative. */
  exportAll(): Promise<ExportDoc[]>
  /** Return only user IDs who belong to a community the current user may view. */
  listCommunityMembers(cid: string): Promise<string[]>
  /** Return scoped contributor totals for a community the caller manages. */
  listCommunityContributors(cid: string): Promise<{ userId: string; ideas: number; backings: number }[]>
  /** Read the platform growth ledger. Supabase RLS limits this to platform admins. */
  listGrowthEvents(): Promise<GrowthEvent[]>
  /** Record a small, self-attributed event. The database restricts allowed event names and ownership. */
  trackGrowthEvent(eventName: SelfTrackedGrowthEventName, eventKey?: string): Promise<void>
  /** Create a brand-new record without ON CONFLICT UPDATE semantics. */
  create(path: string, data: any): Promise<void>
  set(path: string, data: any): Promise<void>
  update(path: string, patch: any): Promise<void>
  delete(path: string): Promise<void>
  /** live list of the documents directly inside a collection */
  subscribe(collection: string, cb: (docs: Doc[]) => void, onError?: (error: unknown) => void): () => void
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
