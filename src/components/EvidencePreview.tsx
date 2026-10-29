import { useMemo } from 'react'

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
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg)(?:$|[?#\s])/i.test(path)) return 'image'
  if (mime.startsWith('video/') || /\.(mp4|webm|mov|m4v|ogv)(?:$|[?#\s])/i.test(path)) return 'video'
  if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|opus)(?:$|[?#\s])/i.test(path)) return 'audio'
  if (mime === 'application/pdf' || /\.pdf(?:$|[?#\s])/i.test(path)) return 'pdf'
  if (/github\.com$/i.test(url.hostname) || /(^|\.)github\.com$/i.test(url.hostname)) return 'github'
  if (/(^|\.)youtu\.be$/i.test(url.hostname) || /(^|\.)youtube\.com$/i.test(url.hostname)) return 'youtube'
  if (/(^|\.)vimeo\.com$/i.test(url.hostname)) return 'vimeo'
  if (/(^|\.)figma\.com$/i.test(url.hostname)) return 'figma'
  if (/(^|\.)drive\.google\.com$/i.test(url.hostname) || /(^|\.)docs\.google\.com$/i.test(url.hostname)) return 'google-docs'
  if (/(^|\.)notion\.so$/i.test(url.hostname) || /(^|\.)notion\.site$/i.test(url.hostname)) return 'notion'
  if (/(^|\.)loom\.com$/i.test(url.hostname)) return 'loom'
  if (/\.(zip|7z|rar|docx?|xlsx?|pptx?|csv|txt|md|json)(?:$|[?#\s])/i.test(path)) return 'document'
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
  return ''
}

export function EvidencePreview({ url: rawUrl, name = 'Evidence', mimeType = '', summary = '', compact = false }: EvidencePreviewProps) {
  const parsed = useMemo(() => safeUrl(rawUrl), [rawUrl])
  if (!parsed) return <div className="ql-evidence-preview ql-evidence-preview--unavailable"><strong>{name}</strong><span>Preview unavailable: this is not a valid HTTP(S) link.</span></div>

  const type = classify(parsed, mimeType, name)
  const embed = embedUrl(parsed, type)
  const host = parsed.hostname.replace(/^www\./i, '')
  const title = summary.trim() || name
  const canEmbed = !!embed

  return <section className={'ql-evidence-preview' + (compact ? ' ql-evidence-preview--compact' : '')} aria-label={'Evidence preview: ' + title}>
    <div className="ql-evidence-preview__heading">
      <span className="ql-evidence-preview__type">{({ image: 'Image', video: 'Video', audio: 'Audio', pdf: 'PDF document', github: 'GitHub source', youtube: 'YouTube video', vimeo: 'Vimeo video', figma: 'Figma design', 'google-docs': 'Google document', notion: 'Notion page', loom: 'Loom recording', document: 'Document', link: 'External link' } as Record<string, string>)[type]}</span>
      <strong title={title}>{title}</strong>
      <small>{host}</small>
    </div>
    {!compact && type === 'image' && <a className="ql-evidence-preview__media" href={parsed.href} target="_blank" rel="noopener noreferrer"><img src={parsed.href} alt={name} loading="lazy" /></a>}
    {!compact && type === 'video' && <video className="ql-evidence-preview__media" controls preload="metadata" src={parsed.href}>Your browser cannot play this video.</video>}
    {!compact && type === 'audio' && <audio className="ql-evidence-preview__audio" controls preload="metadata" src={parsed.href}>Your browser cannot play this audio.</audio>}
    {!compact && type === 'pdf' && <iframe className="ql-evidence-preview__pdf" src={parsed.href + '#view=FitH'} title={'PDF preview: ' + name} loading="lazy" />}
    {!compact && canEmbed && <div className="ql-evidence-preview__embed"><iframe src={embed} title={type + ' preview: ' + name} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>}
    {!compact && type === 'github' && <p className="ql-evidence-preview__note">Recognized GitHub URL. Open the source record to inspect repository files, commits, pull requests, or releases. Link recognition does not itself verify the submitter or prove the work meets its acceptance criteria.</p>}
    {!compact && ['figma', 'google-docs', 'notion', 'document', 'link'].includes(type) && <p className="ql-evidence-preview__note">{type === 'figma' ? 'Recognized Figma design link.' : type === 'google-docs' ? 'Recognized Google Drive or Docs link. Access may require permission.' : type === 'notion' ? 'Recognized Notion page link. Access may require permission.' : type === 'document' ? 'Recognized document file link.' : 'External website. Some sites block embedded previews, so open the original link to inspect it.'}</p>}
    <a className="ql-evidence-preview__open" href={parsed.href} target="_blank" rel="noopener noreferrer">Open original <span aria-hidden="true">↗</span></a>
  </section>
}
