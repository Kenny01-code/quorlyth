import { useEffect, useMemo, useState } from 'react'

type EvidencePreviewProps = {
  url: string
  name?: string
  mimeType?: string
  summary?: string
  compact?: boolean
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
  if (type === 'figma') {
    return 'https://www.figma.com/embed?embed_host=share&url=' + encodeURIComponent(url.href)
  }
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
  const [viewerOpen, setViewerOpen] = useState(false)
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

  const type = classify(parsed, mimeType, name)
  const embed = embedUrl(parsed, type)
  const host = parsed.hostname.replace(/^www\./i, '')
  const title = summary.trim() || name
  const label = ({ image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF document', github: 'GitHub source', youtube: 'YouTube video', vimeo: 'Vimeo video', figma: 'Figma design', 'google-docs': 'Google document', notion: 'Notion page', loom: 'Loom recording', document: 'Document', link: 'Website' } as Record<string, string>)[type] || 'Evidence'
  const sourceBlocksEmbedding = ['github', 'notion', 'document', 'link'].includes(type)
  const showFrame = ['pdf', 'youtube', 'vimeo', 'figma', 'google-docs', 'notion', 'loom', 'github', 'document', 'link'].includes(type)
  const frameSrc = embed || parsed.href

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
      {!compact && type === 'github' && <p className="ql-evidence-preview__note">Repository/source link recognized. Open the in-app viewer for a quick inspection; authentication or source-site restrictions may limit the embedded view.</p>}
      {!compact && ['figma', 'google-docs', 'notion', 'document', 'link'].includes(type) && <p className="ql-evidence-preview__note">{type === 'figma' ? 'Figma design preview.' : type === 'google-docs' ? 'Google Drive preview. The file must be shared with this account or publicly available to render.' : type === 'notion' ? 'Notion preview. Workspace permissions and the source site may restrict embedding.' : type === 'document' ? 'Document preview opens inside Quorlyth. Some file types require a browser viewer or download support.' : 'Website preview stays inside Quorlyth. Some websites block embedded viewing for security.'}</p>}
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
          {type === 'video' && <video className="ql-evidence-viewer__media" src={parsed.href} controls autoPlay={false} />}
          {type === 'audio' && <audio className="ql-evidence-viewer__audio" src={parsed.href} controls />}
          {type === 'pdf' && <iframe className="ql-evidence-viewer__frame ql-evidence-viewer__frame--pdf" src={parsed.href + '#view=FitH'} title={'PDF preview: ' + title} />}
          {showFrame && type !== 'pdf' && <iframe className="ql-evidence-viewer__frame" src={frameSrc} title={type + ' in-app preview: ' + title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />}
          {sourceBlocksEmbedding && <p className="ql-evidence-viewer__hint">This preview remains inside Quorlyth. Some source sites disable embedding, require their own sign-in, or do not render certain office/archive formats in a browser. In those cases, Quorlyth cannot force the source to expose a preview.</p>}
        </div>
        <footer className="ql-evidence-viewer__footer"><span>Evidence preview · does not open a new tab</span><button type="button" className="btn p" onClick={() => setViewerOpen(false)}>Done</button></footer>
      </section>
    </div>}
  </>
}
