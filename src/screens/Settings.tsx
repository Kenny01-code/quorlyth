import { useState } from 'react'
import { Icon, GoogleG } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { ShareCard } from '../components/ShareCard'
import { Av, Chip, Head } from '../components/ui'
import { download } from './Analytics'
import { useApp } from '../data/AppProvider'
import { cn, when } from '../lib/util'
import { useDraftState } from '../lib/useDraftState'

export function Settings() {
  return <Gate owner><Inner /></Gate>
}

function Inner() {
  const a = useApp()
  const s = a.data.settings || {}
  const [tab, setTab] = useState(0)
  const initialSpace = { name: s.name || '', tag: s.tag || '', ann: s.ann || '', appr: !!s.appr }
  const [spaceDraft, setSpaceDraft, clearSpaceDraft] = useDraftState(`q-draft:${a.me?.id}:settings:space`, initialSpace)
  const { name, tag, ann, appr } = spaceDraft
  const setName = (name: string) => setSpaceDraft(d => ({ ...d, name }))
  const setTag = (tag: string) => setSpaceDraft(d => ({ ...d, tag }))
  const setAnn = (ann: string) => setSpaceDraft(d => ({ ...d, ann }))
  const setAppr = (appr: boolean) => setSpaceDraft(d => ({ ...d, appr }))
  const initialWeights = [s.wo ?? 40, s.wf ?? 25, s.wr ?? 35]
  const [w, setW, clearWeightsDraft] = useDraftState(`q-draft:${a.me?.id}:settings:weights`, initialWeights)
  const [emails, setEmails, clearInviteDraft] = useDraftState(`q-draft:${a.me?.id}:settings:invite`, '')
  const url = location.origin
  const text = encodeURIComponent('Join my space on Quorlyth: ' + url)
  const tabs = ['Space', 'AI weights', 'Requests', 'Data', 'Invite']
  const reqs = [...a.data.requests].sort((x, y) => y.at - x.at)

  return (
    <>
      <Head kicker="Settings" title="Make it yours." />
      <div className="grid q" style={{ gridTemplateColumns: '.6fr 1.4fr' }}>
        <div className="glass" style={{ padding: 12 }}>
          {tabs.map((t, i) => <div key={t} className={cn('row', tab === i && 'on')} tabIndex={0} onClick={() => setTab(i)} onKeyDown={e => e.key === 'Enter' && setTab(i)}><div className="t"><h3 style={{ fontSize: 15 }}>{t}</h3></div></div>)}
        </div>
        <div className="glass pad">
          {tab === 0 && <>
            <h3>Your space</h3><p className="dim" style={{ marginTop: 4 }}>Unfinished settings are saved as a draft on this device.</p>
            <label className="field"><span>Space name</span><input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Your name or brand" /></label>
            <label className="field"><span>One line about it</span><input value={tag} maxLength={120} onChange={e => setTag(e.target.value)} placeholder="Where my community shapes what comes next" /></label>
            <label className="field"><span>Announcement</span><textarea value={ann} maxLength={240} onChange={e => setAnn(e.target.value)} placeholder="A note everyone sees on the dashboard" /></label>
            <div className="set"><div><h3 style={{ fontSize: 15 }}>Approve who can post</h3><p className="dim">People must be approved before they share ideas</p></div><button className={cn('tg', appr && 'on')} role="switch" aria-checked={appr} aria-label="Approve who can post" onClick={() => setAppr(!appr)}><i /></button></div>
            <div className="acts"><button className="btn p" onClick={async () => { if (!name.trim()) return a.toast('Give your space a name'); if (await a.saveSettings({ name: name.trim(), tag: tag.trim(), ann: ann.trim(), appr })) clearSpaceDraft(spaceDraft) }}><Icon name="save" size={16} />Save changes</button><button className="btn" onClick={() => clearSpaceDraft(initialSpace)}><Icon name="rotate" size={16} />Discard draft</button></div>
          </>}
          {tab === 1 && <>
            <h3>How QuorlythBot ranks ideas</h3><p className="dim" style={{ margin: '6px 0 10px' }}>Set how much each signal matters.</p>
            {['Originality', 'Feasibility', 'Audience relevance'].map((l, i) => <div key={l} className="set" style={{ display: 'block' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ fontSize: 15 }}>{l}</h3><span>{w[i]}%</span></div><input type="range" min={0} max={100} value={w[i]} aria-label={l} style={{ marginTop: 18 }} onChange={e => setW(w.map((x, k) => (k === i ? +e.target.value : x)))} /></div>)}
            <div className="acts"><button className="btn p" onClick={async () => { if (await a.saveSettings({ wo: w[0], wf: w[1], wr: w[2] })) clearWeightsDraft(w) }}>Save weights</button><button className="btn" onClick={async () => { setW([40, 25, 35]); if (await a.saveSettings({ wo: 40, wf: 25, wr: 35 })) clearWeightsDraft([40, 25, 35]) }}><Icon name="rotate" size={16} />Reset</button></div>
          </>}
          {tab === 2 && <>
            <h3>Access requests</h3>
            {reqs.length ? reqs.map(r => {
              const d = a.data.decisions[r.id]; const open = !d || d.at < r.at
              return (
                <div key={r.id} className="set" style={{ alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: 12 }}><div><Av id={r.id} size={38} /></div><div><h3 style={{ fontSize: 15 }}>{a.nm(r.id)}</h3><p className="dim">{(r.platforms || []).join(', ')}{r.aud ? ', ' + r.aud : ''}, {when(r.at)}</p>{r.note && <p className="mut" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{r.note}</p>}</div></div>
                  <div className="acts" style={{ margin: 0 }}>{open ? <><button className="btn p" style={{ padding: '9px 18px' }} onClick={() => a.decide(r.id, 'approved')}>Approve</button><button className="btn" style={{ padding: '9px 18px' }} onClick={() => a.decide(r.id, 'declined')}>Decline</button></> : <span className="chip">{d!.status === 'approved' ? 'Approved' : 'Declined'}</span>}</div>
                </div>
              )
            }) : <p className="mut" style={{ padding: '20px 0' }}>No requests yet.</p>}
          </>}
          {tab === 3 && <>
            <h3>Your data</h3><p className="dim" style={{ margin: '6px 0 10px' }}>Everything in this space belongs to you.</p>
            <div className="acts"><button className="btn" onClick={() => download('quorlyth-export.json', 'application/json', JSON.stringify({ exported: new Date().toISOString(), space: a.data.settings, communities: a.data.communities, ideas: a.data.ideas, reviews: a.data.reviews, promotions: a.data.promotions }, null, 2))}><Icon name="publish" size={16} />Export everything (JSON)</button></div>
          </>}
          {tab === 4 && <>
            <h3>Let people in</h3><p className="dim" style={{ margin: '6px 0 16px' }}>People sign in with Google or their email. Share the link, or approve them yourself under Requests.</p>
            <div className="grid g3" style={{ marginBottom: 6 }}>
              <div className="glass pad" style={{ padding: 18 }}><h3 style={{ fontSize: 15 }}>Invite by email</h3><label className="field"><span>Their emails, separated by commas</span><input value={emails} onChange={e => setEmails(e.target.value)} placeholder="friend@email.com" /></label><div className="acts"><a className="btn p" href={`mailto:${encodeURIComponent(emails.replace(/\s+/g, ''))}?subject=${encodeURIComponent('Join me on Quorlyth')}&body=${text}`} onClick={() => clearInviteDraft('')}><Icon name="mail" size={16} />Write the email</a><button className="chip" onClick={() => clearInviteDraft('')}>Discard draft</button></div></div>
              <div className="glass pad" style={{ padding: 18 }}><h3 style={{ fontSize: 15 }}>Share a link</h3><p className="lnk" style={{ marginTop: 10 }}>{url}</p><div className="acts"><button className="btn p" onClick={() => navigator.clipboard.writeText(url).then(() => a.toast('Link copied'))}><Icon name="link" size={16} />Copy link</button><a className="btn" href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener">WhatsApp</a><a className="btn" href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent('Join my space on Quorlyth')}`} target="_blank" rel="noopener">Telegram</a><a className="btn" href={`https://twitter.com/intent/tweet?text=${text}`} target="_blank" rel="noopener">X</a></div></div>
              <div className="glass pad" style={{ padding: 18 }}><h3 style={{ fontSize: 15 }}>Approve people yourself</h3><p className="dim" style={{ margin: '8px 0 12px' }}>Turn on approval and members send a request you can accept under Requests.</p><div className="acts" style={{ margin: 0 }}><Chip onClick={() => setTab(0)}>Space settings</Chip><Chip onClick={() => setTab(2)}>View requests</Chip></div></div>
            </div>
            <ShareCard title="Scan to join" url={url} sub="Anyone you share this with signs in first." />
          </>}
        </div>
      </div>
    </>
  )
}
