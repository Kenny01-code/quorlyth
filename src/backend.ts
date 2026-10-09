import { DocStore } from './data/docstore'
import { createLocalStore } from './data/local'
import { createSupabaseStore } from './data/supabase'
import { Me } from './lib/types'

export interface Auth {
  mode: 'local' | 'supabase'
  accessToken?(): Promise<string | null>
  current(): Promise<Me | null>
  onChange(cb: (m: Me | null) => void): () => void
  signInGoogle(): Promise<void>
  signInEmail(email: string, password: string): Promise<void>
  signUpEmail(email: string, password: string): Promise<{ sentLink?: boolean }>
  resetPassword(email: string): Promise<void>
  updatePassword(password: string): Promise<void>
  signOut(): Promise<void>
}
export interface Backend { store: DocStore; auth: Auth }

const ME_KEY = 'quorlyth:me'
const LOCAL_ACCOUNTS_KEY = 'quorlyth:accounts:v1'
const OWNER_CLAIM_MIGRATION = 'quorlyth:owner-claim-v1'

interface LocalAccount { id: string; email: string; name: string; salt: string; hash: string }

function localAccounts(): Record<string, LocalAccount> {
  try { return JSON.parse(localStorage.getItem(LOCAL_ACCOUNTS_KEY) || '{}') } catch { return {} }
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))
}

async function passwordHash(password: string, salt: Uint8Array): Promise<string> {
  if (!crypto.subtle) throw new Error('Password auth requires a secure browser context.')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const saltBuffer = new ArrayBuffer(salt.byteLength)
  new Uint8Array(saltBuffer).set(salt)
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBuffer, iterations: 120000, hash: 'SHA-256' }, key, 256)
  return bytesToBase64(new Uint8Array(bits))
}

function localSession(account: Pick<LocalAccount, 'id' | 'email' | 'name'>): Me {
  return { id: account.id, email: account.email, name: account.name }
}

function localAuth(): Auth {
  const subs = new Set<(m: Me | null) => void>()
  const get = (): Me | null => { try { return JSON.parse(localStorage.getItem(ME_KEY) || 'null') } catch { return null } }
  const emit = () => subs.forEach(f => f(get()))
  return {
    mode: 'local',
    async accessToken() { return null },
    async current() { return get() },
    onChange(cb) { subs.add(cb); return () => { subs.delete(cb) } },
    async signInGoogle() { throw new Error('Google sign in needs Supabase. Add your keys to .env, see the README.') },
    async signInEmail(email, password) {
      const normalized = email.trim().toLowerCase()
      const account = localAccounts()[normalized]
      if (!account) throw new Error('No account found. Choose Create account to get started.')
      const salt = Uint8Array.from(atob(account.salt), c => c.charCodeAt(0))
      if (await passwordHash(password, salt) !== account.hash) throw new Error('Email or password is incorrect.')
      localStorage.setItem(ME_KEY, JSON.stringify(localSession(account)))
      emit()
    },
    async signUpEmail(email, password) {
      const normalized = email.trim().toLowerCase()
      const accounts = localAccounts()
      if (accounts[normalized]) throw new Error('An account with this email already exists. Sign in instead.')
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const account: LocalAccount = {
        id: 'u_' + crypto.randomUUID(), email: normalized,
        name: normalized.split('@')[0], salt: bytesToBase64(salt), hash: await passwordHash(password, salt),
      }
      accounts[normalized] = account
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts))
      localStorage.setItem(ME_KEY, JSON.stringify(localSession(account)))
      emit()
      return {}
    },
    async resetPassword() { throw new Error('Password reset email needs Supabase. Configure real auth in .env.') },
    async updatePassword(password) {
      const me = get()
      if (!me?.email) throw new Error('Sign in again before changing your password.')
      const accounts = localAccounts()
      const account = accounts[me.email.toLowerCase()]
      if (!account) throw new Error('Local account not found.')
      const salt = crypto.getRandomValues(new Uint8Array(16))
      account.salt = bytesToBase64(salt)
      account.hash = await passwordHash(password, salt)
      accounts[me.email.toLowerCase()] = account
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts))
    },
    async signOut() { localStorage.removeItem(ME_KEY); emit() },
  }
}

export async function createBackend(): Promise<Backend> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (url || key) {
    if (!url || !key) {
      throw new Error('Supabase is partially configured. Set both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    }

    const { store, sb } = await createSupabaseStore(url, key)
      const toMe = (u: any): Me | null => {
        if (!u) return null
        const google = u.identities?.find((identity: any) => identity.provider === 'google')?.identity_data || {}
        const metadata = u.user_metadata || {}
        return {
          id: u.id,
          email: u.email,
          name: metadata.full_name || metadata.name || google.full_name || google.name || (u.email || '').split('@')[0],
          avatarUrl: metadata.avatar_url || metadata.picture || google.avatar_url || google.picture || google.photo_url,
        }
      }
      const auth: Auth = {
        mode: 'supabase',
        async accessToken() { const { data } = await sb.auth.getSession(); return data.session?.access_token || null },
        async current() { const { data } = await sb.auth.getUser(); return toMe(data.user) },
        onChange(cb) { const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toMe(s?.user))); return () => data.subscription.unsubscribe() },
        async signInGoogle() { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }); if (error) throw error },
        async signInEmail(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error },
        async signUpEmail(email, password) {
          const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
          if (error) throw error
          return { sentLink: !data.session }
        },
        async resetPassword(email) {
          const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/signin?recovery=1' })
          if (error) throw error
        },
        async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw error },
        async signOut() { const { error } = await sb.auth.signOut({ scope: 'local' }); if (error) throw error },
      }
    return { store, auth }
  }

  // Local storage is used only when neither Supabase credential is configured.
  const store = createLocalStore()
  // Older local builds silently made the first signed-in user the owner.
  // Preserve the space data, but require an explicit claim under the new flow.
  if (!localStorage.getItem(OWNER_CLAIM_MIGRATION)) {
    await store.delete('config/owner')
    localStorage.setItem(OWNER_CLAIM_MIGRATION, '1')
  }
  return { store, auth: localAuth() }
}
