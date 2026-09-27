import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Av } from './ui'
import { useApp } from '../data/AppProvider'
import { Idea, STATUS_LABEL } from '../lib/types'
import { when } from '../lib/util'

export function Tags({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null
  return <div className="acts" style={{ margin: 0, gap: 6 }}>{tags.map(t => <span key={t} className="chip"><Icon name="tag" size={12} />{t}</span>)}</div>
}

export function IdeaCard({ idea, extra }: { idea: Idea; extra?: React.ReactNode }) {
  const a = useApp()
  const nav = useNavigate()
  const r = a.data.reviews[idea.id]
  const s = a.statusOf(idea.id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div className="glass idea lift" tabIndex={0} role="link" onClick={() => nav('/idea/' + idea.id)} onKeyDown={e => e.key === 'Enter' && nav('/idea/' + idea.id)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="chip">{r?.score != null ? <><Icon name="spark" size={14} />{r.score}</> : STATUS_LABEL[s]}</span>
          <Av id={idea.authorId} size={28} />
        </div>
        <h3 style={{ fontSize: 20, fontWeight: 300, letterSpacing: '-.02em' }}>{idea.title}</h3>
        <p className="mut">{(idea.body || '').slice(0, 140)}</p>
        <Tags tags={idea.tags} />
        <div className="f"><span><Icon name="support" size={16} />{a.votesOf(idea.id)}</span><span>{a.nm(idea.authorId).split(' ')[0]}, {when(idea.at)}</span></div>
      </div>
      {extra}
    </div>
  )
}
