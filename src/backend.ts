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
  verifyRecoveryOtp(email: string, token: string): Promise<void>
  updatePassword(password: string): Promise<void>
  signOut(): Promise<void>
}
export interface Backend {
  store: DocStore; auth: Auth
  isPlatformAdmin(): Promise<boolean>
  isPlatformOwner?(): Promise<boolean>
  reviewCommunityJoinRequest(cid: string, userId: string, status: 'approved' | 'declined'): Promise<void>
  uploadWorkFile?(ideaId: string, milestoneId: string, file: File): Promise<string>
  getWorkFileUrl?(path: string): Promise<string>
  deleteWorkFile?(path: string): Promise<void>
  uploadChatFile?(contextId: string, file: File): Promise<string>
  getChatFileUrl?(path: string): Promise<string>
  deleteChatFile?(path: string): Promise<void>
}

const ME_KEY = 'quorlyth:me'
const LOCAL_ACCOUNTS_KEY = 'quorlyth:accounts:v1'
const OWNER_CLAIM_MIGRATION = 'quorlyth:owner-claim-v1'

interface LocalAccount { id: string; email: string; name: string; salt: string; hash: string; createdAt?: number }

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

function localSession(account: Pick<LocalAccount, 'id' | 'email' | 'name' | 'createdAt'>): Me {
  return { id: account.id, email: account.email, name: account.name, ...(account.createdAt ? { createdAt: account.createdAt } : {}) }
}

function localAuth(): Auth {
  const subs = new Set<(m: Me | null) => void>()
  const get = (): Me | null => {
    try {
      const saved = JSON.parse(localStorage.getItem(ME_KEY) || 'null') as Me | null
      if (!saved) return null
      const account = saved.email ? localAccounts()[saved.email.toLowerCase()] : undefined
      return { ...saved, ...(saved.createdAt || !account?.createdAt ? {} : { createdAt: account.createdAt }) }
    } catch { return null }
  }
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
        name: normalized.split('@')[0], salt: bytesToBase64(salt), hash: await passwordHash(password, salt), createdAt: Date.now(),
      }
      accounts[normalized] = account
      localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts))
      localStorage.setItem(ME_KEY, JSON.stringify(localSession(account)))
      emit()
      return {}
    },
    async resetPassword() { throw new Error('Password reset email needs Supabase. Configure real auth in .env.') },
    async verifyRecoveryOtp() { throw new Error('Email OTP recovery requires a configured Supabase backend.') },
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
          ...(Number.isFinite(Date.parse(String(u.created_at || ''))) ? { createdAt: Date.parse(String(u.created_at)) } : {}),
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
          const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/signin?recovery=1' })
          if (error) throw error
        },
        async verifyRecoveryOtp(email, token) {
          const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'recovery' })
          if (error) throw error
        },
        async updatePassword(password) { const { error } = await sb.auth.updateUser({ password }); if (error) throw error },
        async signOut() { const { error } = await sb.auth.signOut({ scope: 'local' }); if (error) throw error },
      }
    return {
      store, auth,
      async uploadWorkFile(ideaId, milestoneId, file) {
        const { data: userData, error: userError } = await sb.auth.getUser()
        if (userError || !userData.user) throw new Error('Sign in again before uploading project work.')
        if (file.size > 25 * 1024 * 1024) throw new Error('Each attachment must be 25 MB or smaller.')
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90) || 'attachment'
        const path = [ideaId, milestoneId, userData.user.id, crypto.randomUUID() + '-' + safeName].join('/')
        const { error } = await sb.storage.from('quorlyth-work-submissions').upload(path, file, {
          cacheControl: '3600',
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
        if (error) throw new Error(error.message || 'Could not upload this attachment.')
        return path
      },
      async getWorkFileUrl(path) {
        if (path.startsWith('local/')) throw new Error('This file belongs to local mode.')
        const { data, error } = await sb.storage.from('quorlyth-work-submissions').createSignedUrl(path, 900)
        if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not open this attachment.')
        return data.signedUrl
      },
      async deleteWorkFile(path) {
        if (path.startsWith('local/')) throw new Error('This file belongs to local mode.')
        const { error } = await sb.storage.from('quorlyth-work-submissions').remove([path])
        if (error) throw new Error(error.message || 'Could not remove this attachment.')
      },
      async uploadChatFile(contextId, file) {
        const { data: userData, error: userError } = await sb.auth.getUser()
        if (userError || !userData.user) throw new Error('Sign in again before sending chat attachments.')
        if (file.size > 25 * 1024 * 1024) throw new Error('Each chat attachment must be 25 MB or smaller.')
        const safeContext = contextId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 160)
        if (!safeContext || safeContext !== contextId) throw new Error('This conversation or workspace ID is invalid.')
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90) || 'attachment'
        const path = [safeContext, userData.user.id, crypto.randomUUID() + '-' + safeName].join('/')
        const { error } = await sb.storage.from('quorlyth-chat-attachments').upload(path, file, {
          cacheControl: '3600',
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        })
        if (error) throw new Error(error.message || 'Could not upload this attachment.')
        return path
      },
      async getChatFileUrl(path) {
        if (path.startsWith('local-chat/')) throw new Error('This file belongs to local mode.')
        const { data, error } = await sb.storage.from('quorlyth-chat-attachments').createSignedUrl(path, 900)
        if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not open this chat attachment.')
        return data.signedUrl
      },
      async deleteChatFile(path) {
        if (path.startsWith('local-chat/')) throw new Error('This file belongs to local mode.')
        const { error } = await sb.storage.from('quorlyth-chat-attachments').remove([path])
        if (error) throw new Error(error.message || 'Could not remove this chat attachment.')
      },
      async isPlatformAdmin() {
        const { data, error } = await sb.rpc('current_user_is_platform_admin')
        if (error) throw error
        return data === true
      },
      async isPlatformOwner() {
        const { data, error } = await sb.rpc('current_user_is_platform_owner')
        if (error) throw error
        return data === true
      },
      async reviewCommunityJoinRequest(cid, userId, status) {
        const { error } = await sb.rpc('review_community_join_request', { p_cid: cid, p_user_id: userId, p_status: status })
        if (error) throw error
      },
    }
  }

  // Local storage is used only when neither Supabase credential is configured.
  const store = createLocalStore()
  // Older local builds silently made the first signed-in user the owner.
  // Preserve the space data, but require an explicit claim under the new flow.
  if (!localStorage.getItem(OWNER_CLAIM_MIGRATION)) {
    await store.delete('config/owner')
    localStorage.setItem(OWNER_CLAIM_MIGRATION, '1')
  }
  const auth = localAuth()
  return {
    store, auth,
    async isPlatformAdmin() { return false },
    async isPlatformOwner() {
      const current = await auth.current()
      const claim = await store.get('config/owner')
      return !!current && claim?.id === current.id
    },
    async reviewCommunityJoinRequest(cid, userId, status) {
      const path = 'communityJoinRequests/' + cid + '__' + userId
      const request = await store.get(path)
      if (!request || request.status !== 'pending') throw new Error('This join request is no longer pending.')
      await store.set(path, { ...request, status, reviewedAt: Date.now() })
      if (status === 'approved') {
        const memberPath = 'members/' + userId
        const current = await store.get(memberPath) || {}
        await store.set(memberPath, { ...current, c: { ...(current.c || {}), [cid]: true } })
      }
    },
    async uploadWorkFile(ideaId, milestoneId, file) {
      const current = await auth.current()
      if (!current) throw new Error('Sign in before attaching files to a submission.')
      if (file.size > 256 * 1024) throw new Error('Local mode supports files up to 256 KB. Configure Supabase Storage for larger project files.')
      const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90) || 'attachment'
      const path = 'local/' + ideaId + '/' + milestoneId + '/' + current.id + '/' + crypto.randomUUID() + '-' + filename
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read this file.'))
        reader.onerror = () => reject(new Error('Could not read this file.'))
        reader.readAsDataURL(file)
      })
      await store.set('workFileBlobs/' + encodeURIComponent(path), { dataUrl, uploadedBy: current.id, at: Date.now() })
      return path
    },
    async getWorkFileUrl(path) {
      if (!path.startsWith('local/')) throw new Error('This file belongs to a configured storage backend.')
      const stored = await store.get('workFileBlobs/' + encodeURIComponent(path))
      if (typeof stored?.dataUrl !== 'string') throw new Error('This attachment is no longer available.')
      return stored.dataUrl
    },
    async deleteWorkFile(path) {
      if (!path.startsWith('local/')) throw new Error('This file belongs to a configured storage backend.')
      await store.delete('workFileBlobs/' + encodeURIComponent(path))
    },
    async uploadChatFile(contextId, file) {
      const current = await auth.current()
      if (!current) throw new Error('Sign in before attaching a file to a message.')
      if (file.size > 256 * 1024) throw new Error('Local mode supports files up to 256 KB. Configure Supabase Storage for larger uploads.')
      const safeContext = contextId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 160)
      if (!safeContext || safeContext !== contextId) throw new Error('This conversation or workspace ID is invalid.')
      const filename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90) || 'attachment'
      const path = 'local-chat/' + safeContext + '/' + current.id + '/' + crypto.randomUUID() + '-' + filename
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read this file.'))
        reader.onerror = () => reject(new Error('Could not read this file.'))
        reader.readAsDataURL(file)
      })
      await store.set('workFileBlobs/' + encodeURIComponent(path), { dataUrl, uploadedBy: current.id, at: Date.now() })
      return path
    },
    async getChatFileUrl(path) {
      if (!path.startsWith('local-chat/')) throw new Error('This file belongs to a configured storage backend.')
      const stored = await store.get('workFileBlobs/' + encodeURIComponent(path))
      if (typeof stored?.dataUrl !== 'string') throw new Error('This chat attachment is no longer available.')
      return stored.dataUrl
    },
    async deleteChatFile(path) {
      if (!path.startsWith('local-chat/')) throw new Error('This file belongs to a configured storage backend.')
      await store.delete('workFileBlobs/' + encodeURIComponent(path))
    },
  }
}
