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
  const managedCommunityIds = new Set(data.communities.filter(c => a.ownsCommunity(c.id)).map(c => c.id))
  const accessibleCommunities = a.owner ? data.communities : data.communities.filter(c => managedCommunityIds.has(c.id))
  const inScope = data.ideas.filter(i => (a.owner || managedCommunityIds.has(i.cid)) && (!qc || i.cid === qc))
  const list = inScope.filter(i => ['review', 'held', 'selected'].includes(a.statusOf(i.id))).sort((x, y) => (data.reviews[y.id]?.score ?? -1) - (data.reviews[x.id]?.score ?? -1))
  const d = list.find(i => i.id === sel) || list[0]
  const unreviewed = list.filter(i => data.reviews[i.id]?.score == null).length

  async function run(all = false, only?: string) {
    if (status) return
    // Never let a direct single-item review escape the current user's community scope.
    const base = (only ? inScope.filter(i => i.id === only) : inScope)
      .filter(i => ['review', 'held', 'selected'].includes(a.statusOf(i.id)))
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
  const backers = d ? Object.entries(data.votes).filter(([, ideas]) => !!ideas?.[d.id]).map(([uid]) => uid) : []
  const applications = d ? data.volunteers.filter(application => application.ideaId === d.id).sort((x, y) => y.at - x.at) : []
  const canManageSelectedIdea = !!d && a.canManageCommunity(d.cid)

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
        {accessibleCommunities.map(c => <span key={c.id}><Chip on={qc === c.id} onClick={() => setSp({ c: c.id })}>{c.name}</Chip>{' '}</span>)}
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
            {r?.score != null ? <>{m('Originality', r.o)}{m('Feasibility', r.f)}{m('Audience relevance', r.r)}<div className="reason" style={{ marginTop: 28 }}><span className="dim">Why this score</span><p>{r.reason}</p></div>{r.youtubeSignals && <div className="reason" style={{ marginTop: 12 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><strong>YouTube / Social signals</strong><span className="chip">{({ available: 'Live public metrics', partial: 'Partial data', no_results: 'No recent matches', not_configured: 'Not configured', quota_exceeded: 'Quota reached', budget_limited: 'Search budget reached', unavailable: 'Temporarily unavailable', invalid_query: 'Not enough keywords' } as Record<string, string>)[r.youtubeSignals.status] || 'External signals'}</span></div><p className="mut" style={{ marginTop: 8 }}>{r.youtubeSignals.message}</p>{r.youtubeRationale && <p style={{ marginTop: 8 }}>{r.youtubeRationale}</p>}{r.youtubeSignals.query && <p className="dim" style={{ marginTop: 6, fontSize: 12 }}>Search topics: {r.youtubeSignals.query}</p>}{r.youtubeSignals.videos?.length ? <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>{r.youtubeSignals.videos.slice(0, 3).map(video => <div key={video.videoId} style={{ borderTop: '1px solid var(--line)', paddingTop: 9 }}><a href={video.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 500, overflowWrap: 'anywhere' }}>{video.title}</a><p className="dim" style={{ marginTop: 3, fontSize: 12 }}>{video.channelTitle}{video.publishedAt ? ' · ' + new Date(video.publishedAt).toLocaleDateString() : ''}</p><p className="dim" style={{ marginTop: 3, fontSize: 12 }}>Views: {video.viewCount == null ? 'Not public' : video.viewCount.toLocaleString()} · Likes: {video.likeCount == null ? 'Not public' : video.likeCount.toLocaleString()} · Comments: {video.commentCount == null ? 'Not public' : video.commentCount.toLocaleString()}</p></div>)}</div> : null}<p className="dim" style={{ marginTop: 10, fontSize: 11 }}>External YouTube data is separate from Quorlyth votes and member activity. Last checked: {new Date(r.youtubeSignals.fetchedAt).toLocaleString()}</p></div>}</>
              : <p className="dim" style={{ marginTop: 20 }}>Not reviewed by the AI yet.</p>}
            <div className="reason">
              <span className="dim">Idea author</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="chip" aria-label={"View " + a.nm(d.authorId) + "'s profile"} onClick={() => nav('/me/' + d.authorId)} style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Av id={d.authorId} size={30} />{a.nm(d.authorId)}</button>
              </div>
            </div>
            <div className="reason">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="dim">People backing this idea</span>
                <span className="chip">{backers.length} {backers.length === 1 ? 'backer' : 'backers'}</span>
              </div>
              {backers.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {backers.map(uid => <button key={uid} type="button" className="chip" title={"Open " + a.nm(uid) + "'s profile"} aria-label={"View " + a.nm(uid) + "'s profile"} onClick={() => nav('/me/' + uid)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 10px', minHeight: 42 }}>
                  <Av id={uid} size={28} /><span>{a.nm(uid)}</span>
                </button>)}
              </div> : <p className="mut" style={{ marginTop: 10, fontSize: 13 }}>No members have backed this idea yet.</p>}
            </div>
            <div className="reason">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="dim">Collaboration applications</span>
                <span className="chip">{applications.length} {applications.length === 1 ? 'application' : 'applications'}</span>
              </div>
              {applications.length ? <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                {applications.map(application => <div key={application.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <button type="button" className="chip" aria-label={"View " + a.nm(application.applicantId) + "'s profile"} onClick={() => nav('/me/' + application.applicantId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <Av id={application.applicantId} size={32} /><span>{a.nm(application.applicantId)}</span>
                    </button>
                    <span className="chip">{application.status === 'pending' ? 'Pending' : application.status === 'accepted' ? 'Accepted' : 'Declined'}</span>
                  </div>
                  {application.message && <p className="mut" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{application.message}</p>}
                  {canManageSelectedIdea && application.status === 'pending' && <div className="acts" style={{ margin: 0 }}>
                    <button type="button" className="btn p" onClick={() => void a.decideVolunteer(application.id, 'accepted')}><Icon name="approve" size={15} />Accept applicant</button>
                    <button type="button" className="btn" onClick={() => void a.decideVolunteer(application.id, 'declined')}><Icon name="decline" size={15} />Decline</button>
                  </div>}
                </div>)}
              </div> : <p className="mut" style={{ marginTop: 10, fontSize: 13 }}>No collaboration applications for this idea yet.</p>}
            </div>
            <div className="acts">
              <button className="btn" onClick={() => run(false, d.id)}><span className="aiic"><Icon name="spark" size={16} /></span>Review with AI</button>
              <button className="btn p" onClick={() => a.setStatus(d.id, 'selected')}><Icon name="approve" />Select</button>
              <button className="btn" onClick={() => a.setStatus(d.id, 'held')}><Icon name="hold" />Hold</button>
              <button className="btn" onClick={() => a.setStatus(d.id, 'declined')}><Icon name="decline" />Decline</button>
              {a.statusOf(d.id) === 'selected' && <><button className="btn p" onClick={() => nav('/projects?idea=' + encodeURIComponent(d.id))}><Icon name={data.projects[d.id] ? 'insight' : 'contribute'} />{data.projects[d.id] ? 'Manage project' : 'Create project'}</button><button className="btn" onClick={() => nav('/promote?idea=' + encodeURIComponent(d.id))}><Icon name="promote" />Prepare promotion</button></>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
