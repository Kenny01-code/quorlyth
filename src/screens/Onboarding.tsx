import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from '../components/Gate'
import { useApp } from '../data/AppProvider'
import { cn } from '../lib/util'
import { useDraftState } from '../lib/useDraftState'

export function Onboarding() {
  return <Gate><Inner /></Gate>
}

function Inner() {
  const a = useApp()
  const nav = useNavigate()
  const blank = { step: 0, name: a.data.settings?.name || '', tag: a.data.settings?.tag || '', communityName: '', purpose: '' }
  const [draft, setDraft, clearDraft] = useDraftState(`q-draft:${a.me?.id}:onboarding`, blank)
  const { step, name, tag, communityName: cn1, purpose: cp } = draft
  const setStep = (step: number) => setDraft(d => ({ ...d, step }))
  const setName = (name: string) => setDraft(d => ({ ...d, name }))
  const setTag = (tag: string) => setDraft(d => ({ ...d, tag }))
  const setCn1 = (communityName: string) => setDraft(d => ({ ...d, communityName }))
  const setCp = (purpose: string) => setDraft(d => ({ ...d, purpose }))
  const bar = <div className="steps">{[0, 1, 2].map(i => <i key={i} className={cn(i <= step && 'on')} />)}</div>

  if (!a.owner) {
    return (
      <div className="glass pad" style={{ maxWidth: 640, margin: '20px auto', padding: 40 }}>
        <h2>Join your first community.</h2><p className="mut" style={{ margin: '10px 0 24px' }}>Pick what you care about.</p>
        {a.data.communities.length ? a.data.communities.map(c => { const j = a.joined(c.id); return (
          <div key={c.id} className="row" style={{ cursor: 'default' }}><Icon name="community" /><div className="t"><h3 style={{ fontSize: 15 }}>{c.name}</h3><p className="dim">{c.purpose}</p></div>
            <button className={cn('btn', !j && 'p')} style={{ padding: '9px 18px' }} onClick={() => a.join(c.id, !j)}>{j ? 'Joined' : 'Join'}</button></div>) }) : <p className="mut">No communities yet.</p>}
        <div className="acts"><button className="btn p" onClick={() => nav('/dashboard')}>Continue</button></div>
      </div>
    )
  }
  return (
    <div className="glass pad" style={{ maxWidth: 640, margin: '20px auto', padding: 40 }}>
      {bar}
      {step === 0 && <>
        <h2>Name your space.</h2><p className="mut" style={{ marginTop: 10 }}>This is what your community will see first.</p>
        <label className="field"><span>Space name</span><input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Your name or brand" /></label>
        <label className="field"><span>One line about it</span><input value={tag} maxLength={120} onChange={e => setTag(e.target.value)} placeholder="Where my community shapes what comes next" /></label>
        <p className="dim" style={{ marginTop: 10 }}>Your setup is saved as a draft on this device as you go.</p>
        <div className="acts"><button className="btn p" onClick={async () => { if (!name.trim()) return a.toast('Give your space a name'); if (await a.saveSettings({ name: name.trim(), tag: tag.trim() })) setStep(1) }}>Continue</button></div>
      </>}
      {step === 1 && <>
        <h2>Create your first community.</h2><p className="mut" style={{ marginTop: 10 }}>A community is a place around one interest.</p>
        <label className="field"><span>Name</span><input value={cn1} maxLength={60} onChange={e => setCn1(e.target.value)} placeholder="For example, Behind the scenes" /></label>
        <label className="field"><span>What is it for</span><textarea value={cp} maxLength={300} onChange={e => setCp(e.target.value)} placeholder="Share ideas for what I make next" /></label>
        <div className="acts"><button className="btn" onClick={() => setStep(0)}>Back</button><button className="btn p" onClick={async () => { if (!cn1.trim()) return a.toast('Give it a name'); if (await a.createCommunity({ name: cn1.trim(), purpose: cp.trim() })) setStep(2) }}>Create and continue</button></div>
      </>}
      {step === 2 && <div className="done"><div className="score"><Icon name="approve" size={34} /></div><h2>Your space is ready.</h2>
        <p className="mut" style={{ margin: '12px auto 0', maxWidth: 380 }}>Share the link from Settings, Invite, and ideas will start to arrive here.</p>
        <div className="acts" style={{ justifyContent: 'center' }}><button className="btn p" onClick={() => { clearDraft(blank); nav('/dashboard') }}>Open dashboard</button></div></div>}
    </div>
  )
}
