import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { Av, Bar, Chip, Empty, Head } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { reviewIdeas } from '../ai/review'
import { STATUS_LABEL } from '../lib/types'
import { cn } from '../lib/util'

export function Queue() {
  return <Gate owner><Inner /></Gate>
}


function Inner() {
  const a = useApp()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const qc = sp.get('c') || ''
  const [sel, setSel] = useState<string>('')
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')
  const ctl = useRef<AbortController | null>(null)
  const { data } = a
  const w = { o: data.settings?.wo ?? 40, f: data.settings?.wf ?? 25, r: data.settings?.wr ?? 35 }
  const inScope = data.ideas.filter(i => !qc || i.cid === qc)
  const list = inScope.filter(i => ['review', 'held', 'selected'].includes(a.statusOf(i.id))).sort((x, y) => (data.reviews[y.id]?.score ?? -1) - (data.reviews[x.id]?.score ?? -1))
  const d = list.find(i => i.id === sel) || list[0]
  const unreviewed = list.filter(i => data.reviews[i.id]?.score == null).length

  async function run(all = false, only?: string) {
    if (status) return
    const base = (only ? data.ideas.filter(i => i.id === only) : inScope).filter(i => a.statusOf(i.id) !== 'declined')
    const todo = all || only ? base : base.filter(i => data.reviews[i.id]?.score == null)
    if (!todo.length) { setErr(base.length ? 'Every idea here already has a review. Choose Review all again.' : 'There are no ideas to review yet.'); return }
    setErr(''); ctl.current = new AbortController()
    try {
      const done = await reviewIdeas(a, todo, { community: qc ? data.communities.find(c => c.id === qc)?.name : undefined, signal: ctl.current.signal, onProgress: setStatus })
      a.toast(`${done} idea${done === 1 ? '' : 's'} reviewed`)
    } catch (e: any) { if (e.name !== 'AbortError') setErr(e.message || 'The AI review could not finish.') }
    setStatus(''); ctl.current = null
  }

  const m = (l: string, v?: number) => v == null ? null : <div style={{ marginTop: 18 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mut">{l}</span><span>{v}</span></div><Bar value={v} /></div>
  const r = d ? data.reviews[d.id] : undefined

  return (
    <>
      <Head kicker="Review queue" title="Ranked for you. Chosen by you."
        right={status ? <button className="btn" onClick={() => ctl.current?.abort()}><Icon name="decline" size={16} />Stop</button> : <>
          <button className="btn p" onClick={() => run()}><span className="aiic"><Icon name="spark" size={16} /></span>Run AI review{unreviewed ? ` (${unreviewed})` : ''}</button>{' '}
          {list.length > unreviewed && <button className="btn" onClick={() => run(true)}>Review all again</button>}</>} />
      {status && <p className="aistat">{status}</p>}
      {err && <p className="aistat" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="alert" size={16} />{err}</p>}
      <div style={{ marginBottom: 18 }}>
        <Chip on={!qc} onClick={() => setSp({})}>All</Chip>{' '}
        {data.communities.map(c => <span key={c.id}><Chip on={qc === c.id} onClick={() => setSp({ c: c.id })}>{c.name}</Chip>{' '}</span>)}
      </div>
      {!list.length ? <Empty icon="queue" title="Nothing to review" text="New ideas from members will appear here." /> : d && (
        <div className="grid q">
          <div className="glass" style={{ padding: 12 }}>
            {list.map(i => {
              const rr = data.reviews[i.id]
              return (
                <div key={i.id} className={cn('row', i.id === d.id && 'on')} tabIndex={0} onClick={() => setSel(i.id)} onKeyDown={e => e.key === 'Enter' && setSel(i.id)}>
                  <div className="score">{rr?.score ?? '–'}</div>
                  <div className="t"><h3>{i.title}</h3><p className="dim">{a.nm(i.authorId)}, {STATUS_LABEL[a.statusOf(i.id)]}</p></div>
                </div>
              )
            })}
          </div>
          <div className="glass pad lift">
            <span className="chip">{STATUS_LABEL[a.statusOf(d.id)]}</span>
            <h2 style={{ margin: '18px 0 12px' }}>{d.title}</h2>
            <p className="mut" style={{ whiteSpace: 'pre-wrap' }}>{d.body}</p>
            {r?.score != null ? <>{m('Originality', r.o)}{m('Feasibility', r.f)}{m('Audience relevance', r.r)}<div className="reason" style={{ marginTop: 28 }}><span className="dim">Why this score</span><p>{r.reason}</p></div></>
              : <p className="dim" style={{ marginTop: 20 }}>Not reviewed by the AI yet.</p>}
            <div className="reason"><span className="dim">Contributor</span><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Av id={d.authorId} size={30} /><span>{a.nm(d.authorId)}</span><span className="dim">{a.votesOf(d.id)} backing</span></div></div>
            <div className="acts">
              <button className="btn" onClick={() => run(false, d.id)}><span className="aiic"><Icon name="spark" size={16} /></span>Review with AI</button>
              <button className="btn p" onClick={() => a.setStatus(d.id, 'selected')}><Icon name="approve" />Select</button>
              <button className="btn" onClick={() => a.setStatus(d.id, 'held')}><Icon name="hold" />Hold</button>
              <button className="btn" onClick={() => a.setStatus(d.id, 'declined')}><Icon name="decline" />Decline</button>
              {a.statusOf(d.id) === 'selected' && <button className="btn" onClick={() => nav('/promote?idea=' + d.id)}><Icon name="promote" />Promote</button>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
