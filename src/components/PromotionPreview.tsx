import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Av } from './ui'
import { useApp } from '../data/AppProvider'
import { Idea, Promotion } from '../lib/types'
import { when } from '../lib/util'

const PLATFORM_LABEL: Record<string, string> = {
  instagram: 'Instagram',
  x: 'X',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
}

export function PromotionPreview({ idea, promotion, compact = false }: {
  idea: Idea
  promotion: Promotion
  compact?: boolean
}) {
  const a = useApp()
  const nav = useNavigate()
  const community = a.data.communities.find(item => item.id === idea.cid)
  const platform = promotion.platform ? PLATFORM_LABEL[promotion.platform] || promotion.platform : 'Social post'
  const previewText = compact && promotion.text.length > 250
    ? promotion.text.slice(0, 250).trimEnd() + '…'
    : promotion.text

  const copyPost = async () => {
    try {
      await navigator.clipboard.writeText(promotion.text)
      a.toast('Share-ready post copied')
    } catch {
      a.toast('Could not copy automatically. Open the preview and select the post text to copy it.')
    }
  }

  return (
    <article className={`promotion-preview glass ${compact ? 'promotion-preview-compact' : ''}`}>
      <header className="promotion-preview-header">
        <span className="promotion-preview-mark"><Icon name="publish" size={17} /></span>
        <div className="promotion-preview-heading">
          <p className="promotion-eyebrow">PROMOTION PREVIEW</p>
          <h3>{compact ? 'Ready to share' : 'What was promoted'}</h3>
        </div>
        <span className="chip promotion-platform">{platform}</span>
      </header>

      <section className="promotion-source">
        <p className="promotion-section-label">ORIGINAL COMMUNITY IDEA</p>
        <h4>{idea.title}</h4>
        {!compact && idea.body && <p className="promotion-source-body">{idea.body}</p>}
        <div className="promotion-source-meta">
          <Av id={idea.authorId} size={25} />
          <span>Idea by <strong>{a.nm(idea.authorId)}</strong></span>
          <span className="promotion-meta-dot" aria-hidden="true">·</span>
          <span>{community?.name || 'Community'}</span>
        </div>
      </section>

      <section className="promotion-post">
        <div className="promotion-post-heading">
          <p className="promotion-section-label">SHARE-READY COPY</p>
          <span className="dim">{when(promotion.at)}</span>
        </div>
        <p className="promotion-post-copy">{previewText}</p>
        {compact && promotion.text.length > 250 && <p className="promotion-more-note">Preview shortened · open the idea to see the full copy</p>}
      </section>

      {!compact && !!promotion.credits?.length && <section className="promotion-credits">
        <p className="promotion-section-label">COMMUNITY CREDITS</p>
        <div className="promotion-credit-list">
          {promotion.credits.slice(0, 8).map(userId => <div className="promotion-credit" key={userId}><Av id={userId} size={24} /><span>{a.nm(userId)}</span></div>)}
          {promotion.credits.length > 8 && <span className="dim">+{promotion.credits.length - 8} more</span>}
        </div>
      </section>}

      <footer className="promotion-preview-footer">
        <div className="promotion-prepared-by">
          <Av id={promotion.by} size={25} />
          <div>
            <p className="promotion-prepared-name">{a.nm(promotion.by)}</p>
            <p className="dim promotion-prepared-caption">Prepared for sharing</p>
          </div>
        </div>
        <div className="acts promotion-preview-actions">
          <button type="button" className="btn" onClick={() => void copyPost()}><Icon name="copy" size={14} />Copy post</button>
          <button type="button" className="btn p" onClick={() => nav(compact ? '/idea/' + idea.id : '/communities/' + idea.cid)}><Icon name="arrow-up-right" size={14} />{compact ? 'Full preview' : 'Back to community'}</button>
        </div>
      </footer>
    </article>
  )
}
