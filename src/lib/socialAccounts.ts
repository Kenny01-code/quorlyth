import type { Backend } from '../backend'

export type SocialProvider = 'x' | 'linkedin' | 'meta' | 'facebook' | 'instagram' | 'pinterest'

export interface SocialConnection {
  connection_id: string
  provider: SocialProvider
  provider_account_id: string
  account_name: string
  username: string
  token_expires_at: string | null
  scopes: string[]
  metadata: {
    boards?: Array<{ id: string; name: string; privacy?: string }>
    defaultBoardId?: string
    profileImageUrl?: string
    [key: string]: unknown
  }
  connected_at: string
}

export interface SocialAccountsList {
  connections: SocialConnection[]
  providerConfigured: Record<'x' | 'linkedin' | 'meta' | 'pinterest', boolean>
}

export async function socialAccountsRequest<T = Record<string, unknown>>(
  backend: Backend | null | undefined,
  body: Record<string, unknown>,
): Promise<T> {
  if (backend?.auth.mode !== 'supabase') {
    throw new Error('Connect a Supabase-backed Quorlyth account before using social publishing.')
  }
  const token = await backend.auth.accessToken?.()
  if (!token) throw new Error('Your Quorlyth session has expired. Sign in again.')

  const url = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const key = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '')
  if (!url || !key) throw new Error('Social publishing is missing its public Supabase connection settings.')

  const response = await fetch(url + '/functions/v1/social-accounts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: key,
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const result = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok || result.ok === false) {
    throw new Error(typeof result.error === 'string' ? result.error : 'The social account request did not complete.')
  }
  return result as T
}

export async function loadSocialAccounts(backend: Backend | null | undefined) {
  return socialAccountsRequest<SocialAccountsList & { ok: true }>(backend, { action: 'list' })
}
