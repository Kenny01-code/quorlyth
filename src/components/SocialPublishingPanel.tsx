import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { useApp } from '../data/AppProvider'
import { loadSocialAccounts, socialAccountsRequest, SocialConnection } from '../lib/socialAccounts'

type PublishResult = { ok: true; provider: string; postId: string; postUrl?: string; accountName?: string }

export function SocialPublishingPanel({ text, link, preferredPlatform }: {
  text: string
  link: string
  preferredPlatform?: string
}) {
  const a = useApp()
  const navigate = useNavigate()
  const [connections, setConnections] = useState<SocialConnection[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [boardId, setBoardId] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [published, setPublished] = useState<PublishResult | null>(null)

  useEffect(() => {
    let alive = true
    loadSocialAccounts(a.backend).then(result => {
      if (!alive) return
      const items = (result.connections || []).filter(connection =>
        ['x', 'linkedin', 'facebook', 'instagram', 'pinterest'].includes(connection.provider)
      )
      setConnections(items)
      const preferred = preferredPlatform === 'x' || preferredPlatform === 'linkedin' || preferredPlatform === 'facebook'
        ? preferredPlatform
        : preferredPlatform === 'instagram' ? 'instagram'
          : preferredPlatform === 'youtube' ? '' : ''
      const initial = items.find(item => item.provider === preferred) || items[0]
      setSelectedId(initial?.connection_id || '')
      setBoardId(String(initial?.metadata?.defaultBoardId || initial?.metadata?.boards?.[0]?.id || ''))
    }).catch(cause => {
      if (alive) setError(cause instanceof Error ? cause.message : 'Could not load connected accounts.')
    }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [a.backend, preferredPlatform])

  const selected = useMemo(() => connections.find(item => item.connection_id === selectedId) || null, [connections, selectedId])
  const boards = selected?.provider === 'pinterest' ? (selected.metadata?.boards || []) : []
  const needsMedia = selected?.provider === 'instagram' || selected?.provider === 'pinterest'

  const chooseConnection = (id: string) => {
    setSelectedId(id)
    const next = connections.find(item => item.connection_id === id)
    setBoardId(String(next?.metadata?.defaultBoardId || next?.metadata?.boards?.[0]?.id || ''))
    setError('')
    setPublished(null)
  }

  const publish = async () => {
    if (!selected) return
    if (!text.trim()) return setError('The post caption is empty.')
    if (needsMedia && !mediaUrl.trim()) return setError('Add a public image URL for this channel before publishing.')
    if (selected.provider === 'pinterest' && !boardId) return setError('Choose a Pinterest board for this Pin.')
    setBusy(true)
    setError('')
    setPublished(null)
    try {
      const result = await socialAccountsRequest<PublishResult>(a.backend, {
        action: 'publish',
        connectionId: selected.connection_id,
        text,
        link,
        mediaUrl: mediaUrl.trim(),
        boardId,
        title: text.trim().split('\n')[0].slice(0, 100),
      })
      setPublished(result)
      a.toast('Published to ' + (result.accountName || selected.account_name || selected.provider) + '.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The social network could not publish this post.')
    } finally {
      setBusy(false)
    }
  }

  return <section className="q-social-direct-publish">
    <div className="q-social-direct-heading">
      <div>
        <p className="ql-eyebrow">DIRECT PUBLISHING</p>
        <h3>Publish from Quorlyth</h3>
        <p className="dim">Send this prepared caption to a connected channel. Your post is only published when you press the button below.</p>
      </div>
      <span className="q-social-direct-count">{connections.length} connected</span>
    </div>

    {loading ? <p className="dim">Checking connected channels…</p> : !connections.length ? <div className="q-social-no-connections">
      <p className="dim">Connect X, LinkedIn, a Facebook Page, an Instagram professional account or Pinterest to publish directly here.</p>
      <button type="button" className="btn p" onClick={() => navigate('/settings?tab=social')}>
        <Icon name="link-2" size={14} /> Connect a social account
      </button>
    </div> : <>
      <label className="field">
        <span>Publish to account</span>
        <select value={selectedId} onChange={event => chooseConnection(event.target.value)}>
          {connections.map(connection => <option key={connection.connection_id} value={connection.connection_id}>
            {connection.provider === 'x' ? 'X' : connection.provider === 'linkedin' ? 'LinkedIn' : connection.provider === 'facebook' ? 'Facebook Page' : connection.provider === 'instagram' ? 'Instagram' : 'Pinterest'} · {connection.account_name || connection.username || connection.provider_account_id}
          </option>)}
        </select>
      </label>
      {needsMedia && <label className="field">
        <span>Public image URL</span>
        <input value={mediaUrl} onChange={event => setMediaUrl(event.target.value)} placeholder="https://your-site.com/image.jpg" inputMode="url" />
        <small className="dim">The image must be publicly reachable by the social network. Private Quorlyth attachments are not used as public media URLs.</small>
      </label>}
      {selected?.provider === 'pinterest' && <label className="field">
        <span>Pinterest board</span>
        <select value={boardId} onChange={event => setBoardId(event.target.value)}>
          <option value="">Choose a board</option>
          {boards.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}
        </select>
      </label>}
      {error && <p className="q-social-alert" role="alert">{error}</p>}
      {published && <p className="q-social-notice" role="status">
        Published successfully. {published.postUrl && <a href={published.postUrl} target="_blank" rel="noopener noreferrer">View post <Icon name="arrow-up-right" size={12} /></a>}
      </p>}
      <div className="q-social-publish-actions">
        <button type="button" className="btn p" disabled={busy || !selected} onClick={() => void publish()}>
          <Icon name="send" size={14} />{busy ? 'Publishing…' : 'Publish now'}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => navigate('/settings?tab=social')}>Manage accounts</button>
      </div>
    </>}
    <p className="q-social-security-note">Quorlyth sends only the caption, link and any public media URL you supply. Provider tokens stay on the server in Supabase Vault.</p>
  </section>
}
