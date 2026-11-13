import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Av } from './ui'
import { useApp } from '../data/AppProvider'
import { Idea, IdeaAttachment, STATUS_LABEL } from '../lib/types'
import { when } from '../lib/util'
import { PromotionPreview } from './PromotionPreview'
import { isIdeaVideo } from '../lib/ideaMedia'

export function Tags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null
  return <div className="acts" style={{ margin: 0, gap: 6 }}>{tags.map(t => <span key={t} className="chip"><Icon name="tag" size={12} />{t}</span>)}</div>
}

export function IdeaMediaGallery({ idea, compact = false }: { idea: Idea; compact?: boolean }) {
  const a = useApp()
  const [urls, setUrls] = useState<Record<string, string | null>>({})
  const attachments = idea.attachments || []
  const attachmentKey = attachments.map(attachment => attachment.path).join('\n')

  useEffect(() => {
    let active = true
    setUrls({})
    if (!attachments.length) return () => { active = false }
    void Promise.all(attachments.map(async attachment => {
      try {
        if (!a.backend?.getIdeaFileUrl) throw new Error('Idea media is unavailable in this session.')
        return [attachment.path, await a.backend.getIdeaFileUrl(attachment.path)] as const
      } catch (error) {
        console.warn('Could not load an idea attachment:', error)
        return [attachment.path, null] as const
      }
    })).then(results => {
      if (active) setUrls(Object.fromEntries(results))
    })
    return () => { active = false }
  }, [a.backend, attachmentKey])

  if (!attachments.length) return null
  const visible = compact ? attachments.slice(0, 3) : attachments
  return (
    <div
      className={'idea-media-gallery' + (compact ? ' idea-media-gallery--compact' : '')}
      role="group"
      aria-label="Idea attachments"
      onClick={event => event.stopPropagation()}
      onKeyDown={event => event.stopPropagation()}
    >
      <div className="idea-media-grid">
        {visible.map((attachment: IdeaAttachment) => {
          const url = urls[attachment.path]
          return (
            <div className="idea-media-item" key={attachment.path}>
              {url === undefined
                ? <span className="idea-media-state">Loading media…</span>
                : url === null
                  ? <span className="idea-media-state">Attachment unavailable</span>
                  : isIdeaVideo(attachment.mimeType)
                    ? <video src={url} controls preload="metadata" aria-label={'Play ' + attachment.name} />
                    : <img src={url} alt={attachment.name} loading="lazy" />}
              <span className="idea-media-name">{attachment.name}</span>
            </div>
          )
        })}
      </div>
      {attachments.length > visible.length && <span className="idea-media-more">+{attachments.length - visible.length} more</span>}
    </div>
  )
}

export function IdeaCard({ idea, extra }: { idea: Idea; extra?: React.ReactNode }) {
  const a = useApp()
  const nav = useNavigate()
  const r = a.data.reviews[idea.id]
  const s = a.statusOf(idea.id)
  const promotion = a.data.promotions.filter(item => item.ideaId === idea.id).sort((first, second) => second.at - first.at)[0]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div className="glass idea lift" tabIndex={0} role="link" onClick={() => nav('/idea/' + idea.id)} onKeyDown={e => e.key === 'Enter' && nav('/idea/' + idea.id)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="chip">{r?.score != null ? <><Icon name="spark" size={14} />{r.score}</> : STATUS_LABEL[s]}</span>
          <Av id={idea.authorId} size={28} />
        </div>
        <h3 className="idea-card-title" style={{ fontSize: 20, fontWeight: 300, letterSpacing: '-.02em' }}>{idea.title}</h3>
        <p className="mut q-writeup">{(idea.body || '').slice(0, 140)}</p>
        <IdeaMediaGallery idea={idea} compact />
        <Tags tags={idea.tags} />
        <div className="f"><span><Icon name="support" size={16} />{a.votesOf(idea.id)}</span><span>{a.nm(idea.authorId).split(' ')[0]}, {when(idea.at)}</span></div>
      </div>
      {promotion && <PromotionPreview idea={idea} promotion={promotion} compact />}
      {extra}
    </div>
  )
}
