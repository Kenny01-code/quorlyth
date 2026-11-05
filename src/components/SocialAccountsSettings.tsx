import { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../lib/Icon'
import { SocialBrandIcon } from './SocialBrandIcon'
import { useApp } from '../data/AppProvider'
import { loadSocialAccounts, socialAccountsRequest, type SocialConnection } from '../lib/socialAccounts'

type OAuthProvider = 'x' | 'linkedin' | 'meta' | 'pinterest'
type ConfigDraft = { clientId: string; clientSecret: string }
type ProviderInfo = {
  id: OAuthProvider
  label: string
  description: string
  scopes: string
  products: string
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'x',
    label: 'X',
    description: 'Publish text posts from your connected X account.',
    scopes: 'tweet.read, users.read, tweet.write, offline.access',
    products: 'X Developer Portal app with OAuth 2.0 user authentication and write permissions.',
  },
  {
    id: 'linkedin',
    label: 'LinkedIn',
    description: 'Publish member posts to the signed-in LinkedIn profile.',
    scopes: 'openid, profile, email, w_member_social',
    products: 'LinkedIn app with the Share on LinkedIn product enabled.',
  },
  {
    id: 'meta',
    label: 'Meta: Facebook and Instagram',
    description: 'Connect Facebook Pages and linked Instagram professional accounts.',
    scopes: 'pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic, instagram_content_publish',
    products: 'Meta Developer app. Instagram must be a professional account connected to a Facebook Page.',
  },
  {
    id: 'pinterest',
    label: 'Pinterest',
    description: 'Publish image Pins to a board you manage.',
    scopes: 'boards:read, boards:write, pins:read, pins:write, user_accounts:read',
    products: 'Pinterest developer app with Pins API access.',
  },
]

const REDIRECT_URI = 'https://tujvptxjmkihwrqbqmyk.supabase.co/functions/v1/social-oauth-callback'
const EMPTY_CONFIGS: Record<OAuthProvider, ConfigDraft> = {
  x: { clientId: '', clientSecret: '' },
  linkedin: { clientId: '', clientSecret: '' },
  meta: { clientId: '', clientSecret: '' },
  pinterest: { clientId: '', clientSecret: '' },
}

const providerLabel = (provider: string) => ({
  x: 'X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook Page',
  instagram: 'Instagram',
  pinterest: 'Pinterest',
}[provider] || provider)

export function SocialAccountsSettings() {
  const a = useApp()
  const [connections, setConnections] = useState<SocialConnection[]>([])
  const [configured, setConfigured] = useState<Record<OAuthProvider, boolean>>({
    x: false, linkedin: false, meta: false, pinterest: false,
  })
  const [drafts, setDrafts] = useState(EMPTY_CONFIGS)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    if (a.backend?.auth.mode !== 'supabase') {
      setLoading(false)
      return
    }
    setError('')
    try {
      const result = await loadSocialAccounts(a.backend)
      setConnections(Array.isArray(result.connections) ? result.connections : [])
      setConfigured({
        x: !!result.providerConfigured?.x,
        linkedin: !!result.providerConfigured?.linkedin,
        meta: !!result.providerConfigured?.meta,
        pinterest: !!result.providerConfigured?.pinterest,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load connected social accounts.')
    } finally {
      setLoading(false)
    }
  }, [a.backend])

  useEffect(() => { void refresh() }, [refresh])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauth = params.get('oauth')
    const provider = params.get('provider') || ''
    if (oauth === 'connected') {
      setNotice(providerLabel(provider) + ' is now connected to Quorlyth.')
      void refresh()
    } else if (oauth === 'error') {
      setError(params.get('message') || ('Quorlyth could not connect ' + providerLabel(provider) + '.'))
    }
    if (oauth) {
      params.delete('oauth')
      params.delete('provider')
      params.delete('message')
      const query = params.toString()
      window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash)
    }
  }, [refresh])

  const setConfigField = (provider: OAuthProvider, field: keyof ConfigDraft, value: string) => {
    setDrafts(current => ({
      ...current,
      [provider]: { ...current[provider], [field]: value },
    }))
  }

  const configure = async (provider: OAuthProvider) => {
    const draft = drafts[provider]
    if (!draft.clientId.trim() || !draft.clientSecret.trim()) {
      setError('Enter both the ' + providerLabel(provider) + ' client ID and client secret.')
      return
    }
    setBusy('configure:' + provider)
    setError('')
    setNotice('')
    try {
      await socialAccountsRequest(a.backend, {
        action: 'configure',
        provider,
        clientId: draft.clientId.trim(),
        clientSecret: draft.clientSecret.trim(),
      })
      setConfigured(current => ({ ...current, [provider]: true }))
      setDrafts(current => ({ ...current, [provider]: { ...current[provider], clientSecret: '' } }))
      setNotice(providerLabel(provider) + ' OAuth credentials were saved in Supabase Vault.')
      a.toast(providerLabel(provider) + ' app configured securely.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save provider credentials.')
    } finally {
      setBusy('')
    }
  }

  const connect = async (provider: OAuthProvider) => {
    setBusy('connect:' + provider)
    setError('')
    try {
      const result = await socialAccountsRequest<{ authUrl?: string }>(a.backend, { action: 'start', provider })
      if (!result.authUrl || !/^https:\/\//i.test(result.authUrl)) throw new Error('The provider returned an invalid authorization address.')
      window.location.assign(result.authUrl)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start social account authorization.')
      setBusy('')
    }
  }

  const disconnect = async (connection: SocialConnection) => {
    const label = providerLabel(connection.provider) + (connection.account_name ? ' (' + connection.account_name + ')' : '')
    if (!window.confirm('Disconnect ' + label + ' from Quorlyth?')) return
    setBusy('disconnect:' + connection.connection_id)
    setError('')
    try {
      await socialAccountsRequest(a.backend, { action: 'disconnect', connectionId: connection.connection_id })
      setConnections(current => current.filter(item => item.connection_id !== connection.connection_id))
      setNotice(label + ' was disconnected. Its saved tokens were deleted from Vault.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not disconnect this account.')
    } finally {
      setBusy('')
    }
  }

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(REDIRECT_URI)
      a.toast('OAuth callback URL copied.')
    } catch {
      setError('Could not copy the callback address. Select it and copy it manually.')
    }
  }

  const grouped = useMemo(() => connections.reduce<Record<string, SocialConnection[]>>((all, connection) => {
    ;(all[connection.provider] ||= []).push(connection)
    return all
  }, {}), [connections])

  if (a.backend?.auth.mode !== 'supabase') {
    return <section className="q-social-settings">
      <h3>Connected social accounts</h3>
      <p className="dim">Direct publishing requires the live Supabase-backed Quorlyth account. Demo and local accounts cannot store provider tokens.</p>
    </section>
  }

  return <section className="q-social-settings">
    <div className="q-social-settings-heading">
      <div>
        <p className="ql-eyebrow">PUBLISHING CONNECTIONS</p>
        <h3>Connected social accounts</h3>
        <p className="dim">Connect a channel once, then publish approved drafts from Quorlyth without copying captions between apps.</p>
      </div>
      <button type="button" className="btn" onClick={() => { setLoading(true); void refresh() }} disabled={loading || !!busy}>
        <Icon name="rotate" size={14} /> Refresh
      </button>
    </div>

    {error && <p className="q-social-alert" role="alert">{error}</p>}
    {notice && <p className="q-social-notice" role="status">{notice}</p>}

    <div className="q-social-connected-list">
      <div className="q-social-section-heading">
        <strong>Connected channels</strong>
        <span className="dim">{connections.length} account{connections.length === 1 ? '' : 's'}</span>
      </div>
      {loading ? <p className="dim">Loading your connected accounts…</p>
        : connections.length ? connections.map(connection => <article className="q-social-connection" key={connection.connection_id}>
          <span className="q-social-provider-mark"><SocialBrandIcon name={connection.provider === 'meta' ? 'facebook' : connection.provider} /></span>
          <div className="q-social-connection-copy">
            <strong>{providerLabel(connection.provider)}</strong>
            <span>{connection.account_name || connection.username || 'Connected account'}</span>
            {connection.username && <small>@{connection.username.replace(/^@/, '')}</small>}
          </div>
          <span className="q-social-connected-tag">Connected</span>
          <button type="button" className="btn q-social-disconnect" disabled={!!busy} onClick={() => void disconnect(connection)}>
            {busy === 'disconnect:' + connection.connection_id ? 'Disconnecting…' : 'Disconnect'}
          </button>
        </article>)
        : <p className="q-social-empty">No social accounts connected yet. Configure a provider app below, then connect the account you want Quorlyth to publish to.</p>}
    </div>

    <div className="q-social-provider-setup">
      <div className="q-social-section-heading">
        <strong>Connect a channel</strong>
        <span className="dim">OAuth 2.0</span>
      </div>
      {PROVIDERS.map(provider => {
        const accounts = grouped[provider.id === 'meta' ? 'facebook' : provider.id] || []
        const instagramAccounts = provider.id === 'meta' ? (grouped.instagram || []) : []
        const isConfigured = configured[provider.id]
        const isSaving = busy === 'configure:' + provider.id
        const isConnecting = busy === 'connect:' + provider.id
        const canConfigure = a.platformOwner
        return <article className="q-social-provider-card" key={provider.id}>
          <div className="q-social-provider-card-heading">
            <span className={provider.id === 'meta' ? 'q-social-provider-mark q-social-meta-mark' : 'q-social-provider-mark'}>{provider.id === 'meta' ? <><SocialBrandIcon name="facebook" /><SocialBrandIcon name="instagram" /></> : <SocialBrandIcon name={provider.id} />}</span>
            <div>
              <strong>{provider.label}</strong>
              <p>{provider.description}</p>
            </div>
            <span className={isConfigured ? 'q-social-provider-status is-ready' : 'q-social-provider-status'}>
              {isConfigured ? 'App configured' : 'Setup needed'}
            </span>
          </div>
          <p className="q-social-provider-products">{provider.products}</p>
          <details className="q-social-provider-details">
            <summary>Required permissions</summary>
            <code>{provider.scopes}</code>
          </details>
          {canConfigure && <div className="q-social-config-fields">
            <label className="field">
              <span>{provider.label} client ID</span>
              <input value={drafts[provider.id].clientId} onChange={event => setConfigField(provider.id, 'clientId', event.target.value)} placeholder="Paste the developer app client ID" autoComplete="off" />
            </label>
            <label className="field">
              <span>Client secret</span>
              <input type="password" value={drafts[provider.id].clientSecret} onChange={event => setConfigField(provider.id, 'clientSecret', event.target.value)} placeholder={isConfigured ? 'Enter a new secret only when rotating it' : 'Paste the developer app client secret'} autoComplete="new-password" />
            </label>
            <button type="button" className="btn" disabled={isSaving || !drafts[provider.id].clientId.trim() || !drafts[provider.id].clientSecret.trim()} onClick={() => void configure(provider.id)}>
              <Icon name="lock" size={14} />{isSaving ? 'Saving to Vault…' : 'Save OAuth app'}
            </button>
          </div>}
          {!canConfigure && !isConfigured && <p className="dim q-social-owner-note">The Quorlyth platform owner must configure this developer app before accounts can connect.</p>}
          <div className="q-social-provider-connect-row">
            <span className="dim">
              {provider.id === 'meta'
                ? accounts.length + ' Facebook Page' + (accounts.length === 1 ? '' : 's') + ' · ' + instagramAccounts.length + ' Instagram account' + (instagramAccounts.length === 1 ? '' : 's')
                : accounts.length + ' connected account' + (accounts.length === 1 ? '' : 's')}
            </span>
            <button type="button" className="btn p" disabled={!isConfigured || isConnecting || !!busy} onClick={() => void connect(provider.id)}>
              <Icon name="link" size={14} />{isConnecting ? 'Opening provider…' : 'Connect ' + provider.label}
            </button>
          </div>
        </article>
      })}
    </div>

    <div className="q-social-callback">
      <div>
        <strong>OAuth callback URL</strong>
        <p className="dim">Register this exact address in each provider's developer app.</p>
        <code>{REDIRECT_URI}</code>
      </div>
      <button type="button" className="btn" onClick={() => void copyRedirect()}>
        <Icon name="copy" size={14} /> Copy
      </button>
    </div>

    <p className="q-social-security-note">
      Provider access and refresh tokens are encrypted in Supabase Vault. Quorlyth only returns account names and connection status to your browser. Disconnecting an account deletes its saved tokens.
    </p>
    <div className="q-social-not-supported">
      <strong>TikTok direct posting</strong>
      <p className="dim">Not enabled in this release. TikTok requires Content Posting API approval, the video.publish scope and a compliance audit before posts can be made public. You can continue using the existing copy-and-open flow meanwhile.</p>
    </div>
  </section>
}
