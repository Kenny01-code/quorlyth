import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { Gate } from '../components/Gate'
import { Chip } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { when } from '../lib/util'
import { useDraftState } from '../lib/useDraftState'

export function Access() {
  const a = useApp()
  const nav = useNavigate()
  if (!a.me && !a.demo) return <div className="lg">
    <div className="glass stage" style={{ minHeight: 360, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 32 }}>
      <div><div className="score" style={{ margin: '0 auto 20px' }}><Icon name="invite" size={28} /></div><p className="dim">Request access</p><h2 style={{ fontSize: 34, marginTop: 8 }}>A space with its own community.</h2><p className="mut" style={{ maxWidth: 440, margin: '12px auto 22px' }}>Sign in to send an access request to the owner, or explore the interactive demo without an account.</p><div className="acts" style={{ justifyContent: 'center' }}><button className="btn p" onClick={() => nav('/signin?next=%2Faccess')}>Sign in to request access</button><button className="btn" onClick={() => { a.enterDemo(); nav('/dashboard') }}><Icon name="spark" size={15} />Try Demo</button></div></div>
    </div>
  </div>
  return <Gate><Inner /></Gate>
}

function Inner() {
  const a = useApp()
  const nav = useNavigate()
  const me = a.me!
  const rq = a.data.requests.find(r => r.id === me.id)
  const dc = a.data.decisions[me.id]
  const blankRequest = { platforms: [] as string[], audience: '', note: '' }
  const [requestDraft, setRequestDraft, clearRequestDraft] = useDraftState(`q-draft:${me.id}:access-request`, blankRequest)
  const { platforms: pl, audience: au, note } = requestDraft
  const setPl = (platforms: string[]) => setRequestDraft(d => ({ ...d, platforms }))
  const setAu = (audience: string) => setRequestDraft(d => ({ ...d, audience }))
  const setNote = (value: string) => setRequestDraft(d => ({ ...d, note: value }))
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(false)
  let body
  if (a.owner && !preview) body = <><h2 style={{ fontSize: 34 }}>You run this space.</h2><p className="mut" style={{ marginTop: 10 }}>Requests from members appear in Settings.</p><div className="acts"><button className="btn p" onClick={() => nav('/settings')}><Icon name="settings" />Open requests</button></div></>
  else if (!preview && dc?.status === 'approved') body = <div className="done"><div className="score"><Icon name="approve" size={34} /></div><h2>You are in.</h2><p className="mut" style={{ marginTop: 12 }}>The owner approved your request.</p><div className="acts" style={{ justifyContent: 'center' }}><button className="btn p" onClick={() => nav('/communities')}>Browse communities</button></div></div>
  else if (!preview && rq && !(dc && dc.at > rq.at)) body = <><h2 style={{ fontSize: 34 }}>Request sent.</h2><p className="mut" style={{ marginTop: 10 }}>Waiting for the owner to review it. Sent {when(rq.at)}.</p><div className="row" style={{ cursor: 'default', marginTop: 20 }}><Icon name="status" /><div className="t"><h3 style={{ fontSize: 15 }}>Pending review</h3><p className="dim">{(rq.platforms || []).join(', ')}{rq.aud ? ' with an audience of ' + rq.aud : ''}</p></div></div><div className="acts"><button className="btn" onClick={() => a.backend!.store.delete('requests/' + me.id)}>Withdraw request</button></div></>
  else body = <>
    {dc && <p className="chip" style={{ marginBottom: 16 }}><Icon name="alert" size={12} />Your last request was declined. You can send a new one.</p>}
    <h2 style={{ fontSize: 34 }}>Request access.</h2><p className="mut" style={{ marginTop: 10 }}>A few details help the owner decide.</p>
    <p className="dim" style={{ marginTop: 12 }}>Your unfinished request is saved as a draft on this device.</p>
    <div className="field"><span>Where is your audience</span><div className="acts" style={{ margin: 0 }}>{['Instagram', 'YouTube', 'TikTok', 'X', 'Twitch', 'Other'].map(c => <Chip key={c} on={pl.includes(c)} onClick={() => setPl(pl.includes(c) ? pl.filter(x => x !== c) : [...pl, c])}>{c}</Chip>)}</div></div>
    <div className="field"><span>Audience size</span><div className="acts" style={{ margin: 0 }}>{['Under 10k', '10k to 100k', '100k to 1M', 'Over 1M'].map(c => <Chip key={c} on={au === c} onClick={() => setAu(c)}>{c}</Chip>)}</div></div>
    <label className="field"><span>Why do you want to join</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="A few words are enough" /></label>
    <div id="rer" style={{ opacity: err ? 1 : 0 }}>{err && <><Icon name="alert" size={14} />{err}</>}</div>
    <button className="btn p wide" onClick={async () => { if (preview) return a.toast('Preview only. Sign in as a member to send a request.'); if (!au) return setErr('Choose your audience size.'); if (await a.sendRequest({ platforms: pl, aud: au, note: note.trim() })) clearRequestDraft(blankRequest) }}>Send request</button>
  </>
  return (
    <div className="lg">
      <div className="glass stage" style={{ minHeight: 520, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 40 }}>
        <div className="fmk xl"><i className="hh" /><Logo size={84} breathe /></div>
        <h2 style={{ fontSize: 34 }}>Access is approved by the owner.</h2>
        <p className="mut" style={{ margin: '14px auto 0', maxWidth: 340 }}>Tell the owner a little about you. They will review your request and you will see the answer here.</p>
        {a.owner && <button className="btn" style={{ marginTop: 20 }} onClick={() => setPreview(p => !p)}>{preview ? 'Exit form preview' : 'Preview request form'}</button>}
      </div>
      <div className="glass fm"><div>{body}</div></div>
    </div>
  )
}
