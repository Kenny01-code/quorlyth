import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { Av, Bar, Chip, Empty, Head } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { reviewIdeas } from '../ai/review'
import { STATUS_LABEL, YouTubeSocialSignals } from '../lib/types'
import { cn, when } from '../lib/util'


function YouTubePreview({ signal, onRefresh, refreshing }: {
  signal: YouTubeSocialSignals
  onRefresh: () => void
  refreshing: boolean
}) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const checkedAt = signal.fetchedAt ? new Date(signal.fetchedAt) : null
  const snapshotExpired = !!signal.expiresAt && signal.expiresAt <= Date.now()
  const labels: Record<string, string> = {
    available: 'Public data available',
    partial: 'Partial public data',
    no_results: 'No matching videos',
    not_configured: 'YouTube lookup not configured',
    quota_exceeded: 'YouTube quota reached',
    budget_limited: 'Search budget reached',
    unavailable: 'YouTube temporarily unavailable',
    invalid_query: 'More topic detail needed',
  }
  const number = (value: number | null) => value == null ? 'Not public' : new Intl.NumberFormat().format(value)

  return (
    <section className="reason" style={{
      marginTop: 14, padding: 16, borderRadius: 18,
      border: '1px solid var(--line)',
      background: 'linear-gradient(145deg, rgba(255,255,255,.055), rgba(255,255,255,.012))',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="chip">YouTube research</span>
            <span className="chip">{labels[signal.status] || 'External signals'}</span>
            <span className="chip">{snapshotExpired ? 'Refresh recommended' : 'Latest saved snapshot'}</span>
          </div>
          <h3 style={{ fontSize: 17, marginTop: 12 }}>Videos related to this idea</h3>
          <p className="mut" style={{ marginTop: 5, fontSize: 13 }}>
            Real public YouTube results and per-video counts from the last lookup. These are external signals, not Quorlyth votes or proof of audience demand.
          </p>
        </div>
        <button type="button" className="btn" onClick={onRefresh} disabled={refreshing} style={{ flexShrink: 0 }}>
          <Icon name="refresh-cw" size={14} />{refreshing ? 'Refreshing…' : 'Refresh YouTube + re-run AI'}
        </button>
      </div>

      {signal.message && <p className="mut" style={{ marginTop: 12 }}>{signal.message}</p>}
      {signal.query && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
        <span className="dim" style={{ fontSize: 12 }}>Search terms</span>
        {signal.query.split(/[,;|]/).map(term => term.trim()).filter(Boolean).slice(0, 8).map((term, index) =>
          <span className="chip" key={term + index} style={{ fontSize: 11 }}>{term}</span>
        )}
      </div>}

      {signal.videos?.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 235px), 1fr))', gap: 12, marginTop: 14 }}>
          {signal.videos.slice(0, 6).map(video => {
            const watching = playingId === video.videoId
            const href = video.url || ('https://www.youtube.com/watch?v=' + encodeURIComponent(video.videoId))
            return (
              <article key={video.videoId} style={{
                minWidth: 0, overflow: 'hidden', borderRadius: 14,
                border: '1px solid var(--line)', background: 'rgba(0,0,0,.22)',
              }}>
                {watching ? (
                  <div style={{ aspectRatio: '16 / 9', background: '#050505' }}>
                    <iframe
                      title={'YouTube preview: ' + video.title}
                      src={'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(video.videoId) + '?autoplay=1&rel=0'}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      referrerPolicy="strict-origin-when-cross-origin"
                      style={{ display: 'block', width: '100%', height: '100%', border: 0 }}
                    />
                  </div>
                ) : (
                  <button type="button" onClick={() => setPlayingId(video.videoId)}
                    aria-label={'Play preview of ' + video.title}
                    style={{ display: 'block', width: '100%', position: 'relative', padding: 0, border: 0, cursor: 'pointer', background: '#080808', aspectRatio: '16 / 9', overflow: 'hidden' }}>
                    <img
                      src={'https://i.ytimg.com/vi/' + encodeURIComponent(video.videoId) + '/hqdefault.jpg'}
                      alt=""
                      loading="lazy"
                      onError={event => { event.currentTarget.style.opacity = '0' }}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: .94 }}
                    />
                    <span aria-hidden="true" style={{
                      position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
                      display: 'grid', placeItems: 'center', width: 50, height: 36, borderRadius: 11,
                      color: '#fff', background: 'rgba(0,0,0,.82)', border: '1px solid rgba(255,255,255,.26)',
                      boxShadow: '0 8px 24px rgba(0,0,0,.35)', fontSize: 17,
                    }}>▶</span>
                  </button>
                )}
                <div style={{ padding: 12 }}>
                  <a href={href} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', fontWeight: 600, lineHeight: 1.4, overflowWrap: 'anywhere', color: 'var(--text)', textDecoration: 'none' }}>
                    {video.title}
                  </a>
                  <p className="dim" style={{ fontSize: 12, marginTop: 6, overflowWrap: 'anywhere' }}>{video.channelTitle || 'YouTube channel'}</p>
                  <p className="dim" style={{ fontSize: 11, marginTop: 3 }}>
                    {video.publishedAt ? 'Published ' + new Date(video.publishedAt).toLocaleDateString() : 'Publish date unavailable'}
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 5, marginTop: 11 }}>
                    {[
                      ['Views', video.viewCount],
                      ['Likes', video.likeCount],
                      ['Comments', video.commentCount],
                    ].map(([label, value]) => (
                      <div key={String(label)} style={{ padding: '7px 6px', borderRadius: 9, background: 'rgba(255,255,255,.045)', minWidth: 0 }}>
                        <p className="dim" style={{ fontSize: 10 }}>{label}</p>
                        <p style={{ fontSize: 12, fontWeight: 600, marginTop: 2, overflowWrap: 'anywhere' }}>{number(value as number | null)}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
                    <button type="button" className="chip" onClick={() => setPlayingId(watching ? null : video.videoId)}>
                      <Icon name={watching ? 'x' : 'play'} size={13} />{watching ? 'Close preview' : 'Play preview'}
                    </button>
                    <a className="chip" href={href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>Watch on YouTube</a>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div style={{ marginTop: 14, border: '1px dashed var(--line)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontWeight: 500 }}>No playable video matches were returned.</p>
          <p className="mut" style={{ fontSize: 13, marginTop: 5 }}>Quorlyth keeps the AI result and explains when YouTube data is unavailable instead of inventing previews or metrics.</p>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 13, paddingTop: 11, borderTop: '1px solid var(--line)' }}>
        <span className="dim" style={{ fontSize: 11 }}>
          {checkedAt ? 'Last checked ' + checkedAt.toLocaleString() : 'Lookup time unavailable'}
          {signal.expiresAt ? ' · Snapshot expires ' + new Date(signal.expiresAt).toLocaleString() : ''}
        </span>
        <a className="lk dim" href="https://www.youtube.com" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>Open YouTube</a>
      </div>
    </section>
  )
}

export function Queue() {
  return <Gate owner><Inner /></Gate>
}


function Inner() {
  const a = useApp()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const qc = sp.get('c') || ''
  const requestedIdeaId = sp.get('idea') || ''
  const [sel, setSel] = useState<string>('')
  const [status, setStatus] = useState('')
  const [err, setErr] = useState('')
  const [reviewingApplication, setReviewingApplication] = useState<string | null>(null)
  const ctl = useRef<AbortController | null>(null)
  const { data } = a
  const w = { o: data.settings?.wo ?? 40, f: data.settings?.wf ?? 25, r: data.settings?.wr ?? 35 }
  const managedCommunityIds = new Set(data.communities.filter(c => a.ownsCommunity(c.id)).map(c => c.id))
  const accessibleCommunities = a.owner ? data.communities : data.communities.filter(c => managedCommunityIds.has(c.id))
  const inScope = data.ideas.filter(i => (a.owner || managedCommunityIds.has(i.cid)) && (!qc || i.cid === qc))
  // Show every idea in the permitted scope, including declined and ready-to-share ideas.
  const list = inScope.filter(i => !requestedIdeaId || i.id === requestedIdeaId).sort((x, y) => (data.reviews[y.id]?.score ?? -1) - (data.reviews[x.id]?.score ?? -1))
  const d = list.find(i => i.id === sel) || list[0]
  const unreviewed = list.filter(i => data.reviews[i.id]?.score == null).length

  async function run(all = false, only?: string, forceYoutubeRefresh = false) {
    if (status) return
    // Never let a direct single-item review escape the current user's community scope.
    const base = only ? inScope.filter(i => i.id === only) : inScope
    const todo = all || only ? base : base.filter(i => data.reviews[i.id]?.score == null)
    if (!todo.length) { setErr(base.length ? 'Every idea here already has a review. Choose Review all again.' : 'There are no ideas to review yet.'); return }
    setErr(''); ctl.current = new AbortController()
    try {
      const done = await reviewIdeas(a, todo, {
        community: qc ? data.communities.find(c => c.id === qc)?.name : undefined,
        signal: ctl.current.signal,
        onProgress: setStatus,
        forceYoutubeRefresh,
      })
      a.toast(`${done} idea${done === 1 ? '' : 's'} reviewed`)
    } catch (e: any) { if (e.name !== 'AbortError') setErr(e.message || 'The AI review could not finish.') }
    setStatus(''); ctl.current = null
  }

  const m = (l: string, v?: number) => v == null ? null : <div style={{ marginTop: 18 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="mut">{l}</span><span>{v}</span></div><Bar value={v} /></div>
  const r = d ? data.reviews[d.id] : undefined
  const backers = d ? Object.entries(data.votes).filter(([, ideas]) => !!ideas?.[d.id]).map(([uid]) => uid) : []
  const applications = d ? data.volunteers.filter(application => application.ideaId === d.id).sort((x, y) => y.at - x.at) : []
  const canManageSelectedIdea = !!d && a.canManageCommunity(d.cid)

  async function reviewApplication(applicationId: string, nextStatus: 'accepted' | 'declined') {
    if (reviewingApplication) return
    setReviewingApplication(applicationId)
    try {
      await a.decideVolunteer(applicationId, nextStatus)
    } finally {
      setReviewingApplication(current => current === applicationId ? null : current)
    }
  }

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
      <p className="dim" style={{ marginTop: -7, marginBottom: 16, fontSize: 13 }}>
        {list.length} idea{list.length === 1 ? '' : 's'} in this scope. AI review covers every status, including declined and ready-to-share ideas; Run AI review scores ideas without a review, while Review all again reruns every idea.
      </p>
      {!list.length ? <Empty icon="queue" title="No ideas in this space yet" text="Ideas from this community will appear here as members contribute." /> : d && (
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
            {r?.score != null ? <>{m('Originality', r.o)}{m('Feasibility', r.f)}{m('Audience relevance', r.r)}<div className="reason" style={{ marginTop: 28 }}><span className="dim">Why this score</span><p>{r.reason}</p></div>{r.youtubeSignals && <YouTubePreview key={d.id} signal={r.youtubeSignals} refreshing={!!status} onRefresh={() => { void run(false, d.id, true) }} />}</>
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
                  <p className="dim" style={{ fontSize: 11 }}>
                    Applied {when(application.at) || 'recently'}{application.reviewedAt ? ' · Reviewed ' + (when(application.reviewedAt) || 'recently') : ''}
                  </p>
                  {application.status === 'accepted' && <button type="button" className="btn" onClick={() => nav('/collaboration/' + d.id)}><Icon name="collab" size={15} />Open collaboration space</button>}
                  {canManageSelectedIdea && application.status === 'pending' && <div className="acts" style={{ margin: 0 }}>
                    <button type="button" className="btn p" disabled={reviewingApplication !== null} onClick={() => void reviewApplication(application.id, 'accepted')}><Icon name="approve" size={15} />{reviewingApplication === application.id ? 'Accepting…' : 'Accept applicant'}</button>
                    <button type="button" className="btn" disabled={reviewingApplication !== null} onClick={() => void reviewApplication(application.id, 'declined')}><Icon name="decline" size={15} />{reviewingApplication === application.id ? 'Saving…' : 'Decline'}</button>
                  </div>}
                </div>)}
              </div> : <p className="mut" style={{ marginTop: 10, fontSize: 13 }}>No collaboration applications for this idea yet.</p>}
            </div>
            <div className="acts">
              <button className="btn" disabled={!!status} onClick={() => void run(false, d.id)}><span className="aiic"><Icon name="spark" size={16} /></span>{status ? 'Reviewing…' : 'Re-run AI review'}</button>
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
