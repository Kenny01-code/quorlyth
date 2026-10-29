import { useEffect, useMemo, useState } from 'react'

type EvidencePreviewProps = {
  url: string
  name?: string
  mimeType?: string
  summary?: string
  compact?: boolean
}
type GithubPreviewState = {
  status: 'idle' | 'loading' | 'ready' | 'error'
  data: Record<string, any> | null
  content: string
  error: string
}

function safeUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed : null
  } catch {
    return null
  }
}

function classify(url: URL, mimeType = '', name = '') {
  const path = (url.pathname + ' ' + name).toLowerCase()
  const mime = mimeType.toLowerCase()
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg|bmp)(?:$|[?#\s])/i.test(path)) return 'image'
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#\s])/i.test(path)) return 'video'
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|opus)(?:$|[?#\s])/i.test(path)) return 'audio'
  if (mime === 'application/pdf' || /\.pdf(?:$|[?#\s])/i.test(path)) return 'pdf'
  if (/(^|\.)github\.com$/i.test(url.hostname)) return 'github'
  if (/(^|\.)youtu\.be$/i.test(url.hostname) || /(^|\.)youtube\.com$/i.test(url.hostname)) return 'youtube'
  if (/(^|\.)vimeo\.com$/i.test(url.hostname)) return 'vimeo'
  if (/(^|\.)figma\.com$/i.test(url.hostname)) return 'figma'
  if (/(^|\.)drive\.google\.com$/i.test(url.hostname) || /(^|\.)docs\.google\.com$/i.test(url.hostname)) return 'google-docs'
  if (/(^|\.)notion\.so$/i.test(url.hostname) || /(^|\.)notion\.site$/i.test(url.hostname)) return 'notion'
  if (/(^|\.)loom\.com$/i.test(url.hostname)) return 'loom'
  if (/\.(zip|7z|rar|docx?|xlsx?|pptx?|csv|txt|md|json|xml|html)(?:$|[?#\s])/i.test(path)) return 'document'
  return 'link'
}

function githubApiUrl(url: URL): string | null {
  if (url.hostname.toLowerCase() !== 'github.com') return null
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null
  const owner = encodeURIComponent(parts[0])
  const repo = encodeURIComponent(parts[1].replace(/\.git$/i, ''))
  const base = 'https://api.github.com/repos/' + owner + '/' + repo
  const kind = parts[2]
  if ((kind === 'commit' || kind === 'commits') && parts[3]) return base + '/commits/' + encodeURIComponent(parts[3])
  if ((kind === 'pull' || kind === 'pulls') && parts[3]) return base + '/pulls/' + encodeURIComponent(parts[3])
  if (kind === 'issues' && parts[3]) return base + '/issues/' + encodeURIComponent(parts[3])
  if (kind === 'releases' && parts[3] === 'tag' && parts[4]) return base + '/releases/tags/' + encodeURIComponent(parts.slice(4).join('/'))
  if (kind === 'blob' && parts[3] && parts.length > 4) {
    const filePath = parts.slice(4).map(part => encodeURIComponent(part)).join('/')
    return base + '/contents/' + filePath + '?ref=' + encodeURIComponent(parts[3])
  }
  return base
}

function isTextGitHubFile(url: URL) {
  return /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|swift|html?|css|scss|json|ya?ml|toml|ini|md|mdx|txt|csv|sql|sh|bash|xml|graphql|gql|prisma|env\.example)$/i.test(url.pathname)
}

function decodeBase64Utf8(value: string) {
  const binary = atob(value.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function embedUrl(url: URL, type: string) {
  if (type === 'youtube') {
    const id = url.hostname.toLowerCase().includes('youtu.be')
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1]
    return id ? 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) : ''
  }
  if (type === 'vimeo') {
    const id = url.pathname.match(/\/(\d+)/)?.[1]
    return id ? 'https://player.vimeo.com/video/' + encodeURIComponent(id) : ''
  }
  if (type === 'loom') {
    const id = url.pathname.match(/\/(?:share|embed)\/([^/?]+)/)?.[1]
    return id ? 'https://www.loom.com/embed/' + encodeURIComponent(id) : ''
  }
  if (type === 'figma') return 'https://www.figma.com/embed?embed_host=share&url=' + encodeURIComponent(url.href)
  if (type === 'google-docs') {
    const driveId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1]
    if (driveId) return 'https://drive.google.com/file/d/' + encodeURIComponent(driveId) + '/preview'
    const officeDoc = url.pathname.match(/\/(document|spreadsheets|presentation)\/d\/([^/]+)/)
    if (officeDoc) return 'https://docs.google.com/' + officeDoc[1] + '/d/' + encodeURIComponent(officeDoc[2]) + '/preview'
  }
  return ''
}

export function EvidencePreview({ url: rawUrl, name = 'Evidence', mimeType = '', summary = '', compact = false }: EvidencePreviewProps) {
  const parsed = useMemo(() => safeUrl(rawUrl), [rawUrl])
  const type = parsed ? classify(parsed, mimeType, name) : 'link'
  const githubApi = useMemo(() => parsed && type === 'github' ? githubApiUrl(parsed) : null, [parsed, type])
  const [viewerOpen, setViewerOpen] = useState(false)
  const [githubPreview, setGithubPreview] = useState<GithubPreviewState>({ status: 'idle', data: null, content: '', error: '' })

  useEffect(() => {
    if (!viewerOpen || type !== 'github' || !githubApi) {
      if (!viewerOpen) setGithubPreview({ status: 'idle', data: null, content: '', error: '' })
      return
    }
    const controller = new AbortController()
    setGithubPreview({ status: 'loading', data: null, content: '', error: '' })
    void fetch(githubApi, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    }).then(async response => {
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const suffix = response.status === 404 ? 'This GitHub record may be private or unavailable.' : response.status === 403 ? 'GitHub may be rate-limiting this preview.' : 'GitHub could not load this record.'
        throw new Error(suffix)
      }
      // GitHub's pull-request detail endpoint omits the changed-file list. Fetch
      // its companion files endpoint so the reviewer can inspect actual diffs here.
      if (type === 'github' && parsed && /\/(?:pull|pulls)\/\d+\/?$/i.test(parsed.pathname)) {
        try {
          const filesResponse = await fetch(githubApi + '/files?per_page=20', {
            signal: controller.signal,
            headers: { Accept: 'application/vnd.github+json' },
          })
          if (filesResponse.ok) {
            const files = await filesResponse.json()
            if (Array.isArray(files)) data.files = files
          }
        } catch (error) {
          if (controller.signal.aborted) return
          // Keep the pull-request summary visible if GitHub's secondary endpoint
          // is restricted or rate limited.
        }
      }
      let content = ''
      if (typeof data.content === 'string' && data.encoding === 'base64' && parsed && isTextGitHubFile(parsed)) {
        try { content = decodeBase64Utf8(data.content).slice(0, 80000) }
        catch { content = '' }
      }
      if (!controller.signal.aborted) setGithubPreview({ status: 'ready', data, content, error: '' })
    }).catch(error => {
      if (controller.signal.aborted) return
      setGithubPreview({
        status: 'error',
        data: null,
        content: '',
        error: error instanceof Error ? error.message : 'GitHub preview could not be loaded.',
      })
    })
    return () => controller.abort()
  }, [viewerOpen, type, githubApi, parsed])

  useEffect(() => {
    if (!viewerOpen) return
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewerOpen(false)
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [viewerOpen])

  if (!parsed) return <div className="ql-evidence-preview ql-evidence-preview--unavailable"><strong>{name}</strong><span>Preview unavailable: this is not a valid HTTP(S) link.</span></div>

  const embed = embedUrl(parsed, type)
  const host = parsed.hostname.replace(/^www\./i, '')
  const title = summary.trim() || name
  const label = ({ image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF document', github: 'GitHub source', youtube: 'YouTube video', vimeo: 'Vimeo video', figma: 'Figma design', 'google-docs': 'Google document', notion: 'Notion page', loom: 'Loom recording', document: 'Document', link: 'Website' } as Record<string, string>)[type] || 'Evidence'
  const sourceBlocksEmbedding = ['notion', 'document', 'link'].includes(type)
  const showFrame = ['pdf', 'youtube', 'vimeo', 'figma', 'google-docs', 'notion', 'loom', 'document', 'link'].includes(type)
  const frameSrc = embed || parsed.href
  const githubData = githubPreview.data
  const githubHeading = githubData
    ? (githubData.full_name || githubData.title || githubData.path || githubData.name || 'GitHub source')
    : 'GitHub source'
  const githubDescription = githubData
    ? (githubData.description || githubData.commit?.message || githubData.body || githubData.message || '')
    : ''
  const githubAuthor = githubData?.owner?.login || githubData?.user?.login || githubData?.commit?.author?.name || githubData?.commit?.author?.login || ''
  const githubStatus = githubData?.merged ? 'Merged pull request'
    : githubData?.state ? String(githubData.state)
    : githubData?.default_branch ? 'Default branch · ' + githubData.default_branch : ''
  const githubFiles = Array.isArray(githubData?.files) ? githubData.files.slice(0, 20) : []

  return <>
    <section className={'ql-evidence-preview' + (compact ? ' ql-evidence-preview--compact' : '')} aria-label={'Evidence preview: ' + title}>
      <div className="ql-evidence-preview__heading">
        <span className="ql-evidence-preview__type">{label}</span>
        <strong title={title}>{title}</strong>
        <small>{host}</small>
      </div>
      {!compact && type === 'image' && <button type="button" className="ql-evidence-preview__media ql-evidence-preview__media-button" onClick={() => setViewerOpen(true)} aria-label={'Preview ' + name + ' inside Quorlyth'}><img src={parsed.href} alt={name} loading="lazy" /></button>}
      {!compact && type === 'video' && <video className="ql-evidence-preview__media" controls preload="metadata" src={parsed.href}>Your browser cannot play this video.</video>}
      {!compact && type === 'audio' && <audio className="ql-evidence-preview__audio" controls preload="metadata" src={parsed.href}>Your browser cannot play this audio.</audio>}
      {!compact && type === 'pdf' && <iframe className="ql-evidence-preview__pdf" src={parsed.href + '#view=FitH'} title={'PDF preview: ' + name} loading="lazy" />}
      {!compact && embed && <div className="ql-evidence-preview__embed"><iframe src={embed} title={type + ' preview: ' + name} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>}
      {!compact && type === 'github' && <p className="ql-evidence-preview__note">Public GitHub metadata, source file text, commit details and pull request information can be previewed here when the API allows it.</p>}
      {!compact && ['figma', 'google-docs', 'notion', 'document', 'link'].includes(type) && <p className="ql-evidence-preview__note">{type === 'figma' ? 'Figma design preview.' : type === 'google-docs' ? 'Google Drive preview. The file must be shared with this account or publicly available to render.' : type === 'notion' ? 'Notion preview. Workspace permissions and the source site may restrict embedding.' : type === 'document' ? 'Document preview opens inside Quorlyth. Some office/archive formats are not natively renderable in a browser.' : 'Website preview stays inside Quorlyth. Some websites block embedded viewing for security.'}</p>}
      <button type="button" className="ql-evidence-preview__open" onClick={() => setViewerOpen(true)} aria-haspopup="dialog">Preview in Quorlyth <span aria-hidden="true">↗</span></button>
    </section>
    {viewerOpen && <div className="ql-evidence-viewer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setViewerOpen(false) }}>
      <section className="ql-evidence-viewer__panel" role="dialog" aria-modal="true" aria-label={'Preview: ' + title}>
        <header className="ql-evidence-viewer__header">
          <div className="ql-evidence-viewer__title"><span className="ql-evidence-preview__type">{label}</span><strong>{title}</strong><small>{host}</small></div>
          <button type="button" className="ql-evidence-viewer__close" onClick={() => setViewerOpen(false)} aria-label="Close evidence preview">×</button>
        </header>
        <div className="ql-evidence-viewer__body">
          {type === 'image' && <img className="ql-evidence-viewer__image" src={parsed.href} alt={name} />}
          {type === 'video' && <video className="ql-evidence-viewer__media" src={parsed.href} controls />}
          {type === 'audio' && <audio className="ql-evidence-viewer__audio" src={parsed.href} controls />}
          {type === 'pdf' && <iframe className="ql-evidence-viewer__frame ql-evidence-viewer__frame--pdf" src={parsed.href + '#view=FitH'} title={'PDF preview: ' + title} />}
          {type === 'github' && <div className="ql-github-preview">
            {githubPreview.status === 'loading' && <div className="ql-github-preview__loading"><i /><strong>Loading public source details…</strong><small>Fetching a read-only preview from GitHub's API.</small></div>}
            {githubPreview.status === 'error' && <div className="ql-github-preview__empty"><strong>Source preview unavailable</strong><p>{githubPreview.error}</p><small>This may be a private record, a restricted endpoint, or a temporary API limit.</small></div>}
            {githubPreview.status === 'ready' && githubData && <>
              <div className="ql-github-preview__top"><div><p className="ql-eyebrow">PUBLIC SOURCE RECORD</p><h3>{githubHeading}</h3></div>{githubStatus && <span className="ql-github-preview__badge">{githubStatus}</span>}</div>
              {githubDescription && <p className="ql-github-preview__description">{String(githubDescription).slice(0, 5000)}</p>}
              <div className="ql-github-preview__meta">
                {githubAuthor && <span>Author <strong>{githubAuthor}</strong></span>}
                {githubData.stargazers_count !== undefined && <span>Stars <strong>{githubData.stargazers_count}</strong></span>}
                {githubData.open_issues_count !== undefined && <span>Open issues <strong>{githubData.open_issues_count}</strong></span>}
                {githubData.stats && <span>Changes <strong>+{githubData.stats.additions || 0} / -{githubData.stats.deletions || 0}</strong></span>}
                {githubData.default_branch && <span>Default branch <strong>{githubData.default_branch}</strong></span>}
                {githubData.html_url && <span>Source <strong>{String(githubData.html_url).replace(/^https?:\/\//, '')}</strong></span>}
              </div>
              {githubPreview.content && <section className="ql-github-preview__file"><div className="ql-github-preview__file-heading"><strong>{githubData.path || githubData.name || 'Source file'}</strong><small>{githubData.size !== undefined ? githubData.size + ' bytes' : 'Text preview'} · first 80 KB</small></div><pre><code>{githubPreview.content}</code></pre></section>}
              {githubFiles.length > 0 && <section className="ql-github-preview__files"><p className="ql-eyebrow">CHANGED FILES · {githubData.files.length}</p>{githubFiles.map((file: any) => <details key={file.filename} className="ql-github-preview__file-entry"><summary><span>{file.filename}</span><small>+{file.additions || 0} / -{file.deletions || 0}</small></summary>{file.patch && <pre><code>{String(file.patch).slice(0, 14000)}</code></pre>}{!file.patch && <p>Binary or oversized diff: no inline patch is available.</p>}</details>)}</section>}
              {githubData.head?.ref && <p className="ql-github-preview__description">Pull request branch: {githubData.head.ref}{githubData.base?.ref ? ' → ' + githubData.base.ref : ''}</p>}
            </>}
          </div>}
          {showFrame && type !== 'pdf' && <iframe className="ql-evidence-viewer__frame" src={frameSrc} title={type + ' in-app preview: ' + title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />}
          {sourceBlocksEmbedding && <p className="ql-evidence-viewer__hint">This preview remains inside Quorlyth. Some source sites disable embedding, require their own sign-in, or do not render certain office/archive formats in a browser. In those cases, Quorlyth cannot force the source to expose a preview.</p>}
        </div>
        <footer className="ql-evidence-viewer__footer"><span>Evidence preview · does not open a new tab</span><button type="button" className="btn p" onClick={() => setViewerOpen(false)}>Done</button></footer>
      </section>
    </div>}
  </>
}
