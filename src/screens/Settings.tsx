import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Icon, GoogleG } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { Gate } from '../components/Gate'
import { ShareCard } from '../components/ShareCard'
import { Av, Chip, Head } from '../components/ui'
import { download } from './Analytics'
import { useApp } from '../data/AppProvider'
import { cn, when } from '../lib/util'
import { useDraftState } from '../lib/useDraftState'
import { useUserState } from '../lib/userState'
import { useNotifs } from '../lib/notifs'

export function Settings() {
  return <Gate><Inner /></Gate>
}

function Inner() {
  const a = useApp()
  const userState = useUserState()
  const [searchParams, setSearchParams] = useSearchParams()
  const notifications = useNotifs(a, userState.st)
  const s = a.data.settings || {}
  const [tab, setTab] = useState(() => a.platformAdmin && searchParams.get('tab') === 'requests' ? 2 : 0)
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
  const tabs = a.platformAdmin ? ['Space', 'AI weights', 'Requests', 'Data', 'Invite', 'Personal'] : ['Personal']
  const reqs = [...a.data.requests].sort((x, y) => y.at - x.at)
  const openReqs = reqs.filter(r => { const d = a.data.decisions[r.id]; return !d || d.at < r.at })
  const unreadRequestKeys = notifications.filter(n => n.kind === 'settings' && n.unread).map(n => n.key)

  useEffect(() => {
    if (a.platformAdmin && searchParams.get('tab') === 'requests') setTab(2)
  }, [searchParams, a.platformAdmin])
  useEffect(() => {
    if (a.platformAdmin && tab === 2 && unreadRequestKeys.length) void userState.patch({ read: Object.fromEntries(unreadRequestKeys.map(key => [key, true])) })
  }, [tab, unreadRequestKeys.join('|'), a.platformAdmin])

  return (
    <>
      <Head kicker="Settings" title="Make it yours." />
      <div className="grid q" style={{ gridTemplateColumns: '.6fr 1.4fr' }}>
        <div className="glass" style={{ padding: 12 }}>
          {tabs.map((t, i) => <div key={t} className={cn('row', tab === i && 'on')} tabIndex={0} onClick={() => { setTab(i); setSearchParams(i === 2 ? { tab: 'requests' } : {}, { replace: true }) }} onKeyDown={e => { if (e.key === 'Enter') { setTab(i); setSearchParams(i === 2 ? { tab: 'requests' } : {}, { replace: true }) } }}><div className="t"><h3 style={{ fontSize: 15 }}>{t}</h3></div>{i === 2 && openReqs.length > 0 && <b className={cn('nav-count', unreadRequestKeys.length > 0 && 'pulse')}>{openReqs.length > 9 ? '9+' : openReqs.length}</b>}</div>)}
        </div>
        <div className="glass pad">
          {(!a.platformAdmin && tab === 0 || a.platformAdmin && tab === 5) && <PersonalSettings />}
          {a.platformAdmin && tab === 0 && <>
            <h3>Your space</h3><p className="dim" style={{ marginTop: 4 }}>Unfinished settings are saved as a draft on this device.</p>
            <label className="field"><span>Space name</span><input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Your name or brand" /></label>
            <label className="field"><span>One line about it</span><input value={tag} maxLength={120} onChange={e => setTag(e.target.value)} placeholder="Where my community shapes what comes next" /></label>
            <label className="field"><span>Announcement</span><textarea value={ann} maxLength={240} onChange={e => setAnn(e.target.value)} placeholder="A note everyone sees on the dashboard" /></label>
            <div className="set"><div><h3 style={{ fontSize: 15 }}>Approve who can post</h3><p className="dim">People must be approved before they share ideas</p></div><button className={cn('tg', appr && 'on')} role="switch" aria-checked={appr} aria-label="Approve who can post" onClick={() => setAppr(!appr)}><i /></button></div>
            <div className="acts"><button className="btn p" onClick={async () => { if (!name.trim()) return a.toast('Give your space a name'); if (await a.saveSettings({ name: name.trim(), tag: tag.trim(), ann: ann.trim(), appr })) clearSpaceDraft(spaceDraft) }}><Icon name="save" size={16} />Save changes</button><button className="btn" onClick={() => clearSpaceDraft(initialSpace)}><Icon name="rotate" size={16} />Discard draft</button></div>
          </>}
          {a.platformAdmin && tab === 1 && <>
            <h3>How QuorlythBot ranks ideas</h3><p className="dim" style={{ margin: '6px 0 10px' }}>Set how much each signal matters.</p>
            {['Originality', 'Feasibility', 'Audience relevance'].map((l, i) => <div key={l} className="set" style={{ display: 'block' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ fontSize: 15 }}>{l}</h3><span>{w[i]}%</span></div><input type="range" min={0} max={100} value={w[i]} aria-label={l} style={{ marginTop: 18 }} onChange={e => setW(w.map((x, k) => (k === i ? +e.target.value : x)))} /></div>)}
            <div className="acts"><button className="btn p" onClick={async () => { if (await a.saveSettings({ wo: w[0], wf: w[1], wr: w[2] })) clearWeightsDraft(w) }}>Save weights</button><button className="btn" onClick={async () => { setW([40, 25, 35]); if (await a.saveSettings({ wo: 40, wf: 25, wr: 35 })) clearWeightsDraft([40, 25, 35]) }}><Icon name="rotate" size={16} />Reset</button></div>
          </>}
          {a.platformAdmin && tab === 2 && <>
            <h3>Platform access requests</h3><p className="dim" style={{ marginTop: 4 }}>Only platform administrators can review requests to enter Quorlyth. Community join requests are managed inside each community.</p>
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
          {a.platformAdmin && tab === 3 && <>
            <h3>Your data</h3><p className="dim" style={{ margin: '6px 0 10px' }}>Everything in this space belongs to you.</p>
            <div className="acts"><button className="btn" onClick={() => download('quorlyth-export.json', 'application/json', JSON.stringify({ exported: new Date().toISOString(), space: a.data.settings, communities: a.data.communities, ideas: a.data.ideas, reviews: a.data.reviews, promotions: a.data.promotions }, null, 2))}><Icon name="publish" size={16} />Export everything (JSON)</button></div>
          </>}
          {a.platformAdmin && tab === 4 && <>
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


function PersonalSettings() {
  const a = useApp()
  const userState = useUserState()
  const profile = a.data.profiles[a.me?.id || ''] || {}
  const [name, setName] = useState(profile.name || a.me?.name || '')
  const [headline, setHeadline] = useState(profile.head || '')
  const [bio, setBio] = useState(profile.bio || '')
  const [photo, setPhoto] = useState(profile.photo || a.me?.avatarUrl || '')
  const preferences = userState.st.preferences || {}
  const [visibility, setVisibility] = useState<'public' | 'members' | 'private'>(preferences.profileVisibility || 'members')
  const [emailNotifications, setEmailNotifications] = useState(preferences.emailNotifications ?? true)
  const [desktopNotifications, setDesktopNotifications] = useState(preferences.desktopNotifications ?? true)
  const [soundEnabled, setSoundEnabled] = useState(preferences.sound ?? true)
  useEffect(() => {
    setName(profile.name || a.me?.name || '')
    setHeadline(profile.head || '')
    setBio(profile.bio || '')
    setPhoto(profile.photo || a.me?.avatarUrl || '')
  }, [a.me?.id, profile.name, profile.head, profile.bio, profile.photo])
  useEffect(() => {
    setVisibility(preferences.profileVisibility || 'members')
    setEmailNotifications(preferences.emailNotifications ?? true)
    setDesktopNotifications(preferences.desktopNotifications ?? true)
    setSoundEnabled(preferences.sound ?? true)
  }, [a.me?.id, userState.st.preferences])
  return <>
    <h3>Your personal settings</h3>
    <p className="dim" style={{ margin: '6px 0 16px' }}>These preferences belong to your account, not to a community or another member. They sync through your Quorlyth account.</p>
    <label className="field"><span>Display name</span><input value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="Your display name" /></label>
    <label className="field"><span>Headline</span><input value={headline} maxLength={120} onChange={e => setHeadline(e.target.value)} placeholder="What you do or what you care about" /></label>
    <label className="field"><span>About you</span><textarea value={bio} maxLength={600} onChange={e => setBio(e.target.value)} placeholder="A short introduction for your profile" /></label>
    <label className="field"><span>Avatar image URL</span><input value={photo} maxLength={1000} onChange={e => setPhoto(e.target.value)} placeholder="https://…" inputMode="url" /></label>
    <label className="field"><span>Profile visibility</span><select value={visibility} onChange={e => setVisibility(e.target.value as typeof visibility)}><option value="public">Public profile</option><option value="members">Signed-in members</option><option value="private">Private profile</option></select></label>
    <div className="set"><div><h3 style={{ fontSize: 15 }}>Email notifications</h3><p className="dim">Your preference for optional email updates.</p></div><button className={cn('tg', emailNotifications && 'on')} role="switch" aria-checked={emailNotifications} onClick={() => setEmailNotifications(v => !v)}><i /></button></div>
    <div className="set"><div><h3 style={{ fontSize: 15 }}>Desktop notifications</h3><p className="dim">Browser notifications when supported and permitted.</p></div><button className={cn('tg', desktopNotifications && 'on')} role="switch" aria-checked={desktopNotifications} onClick={() => setDesktopNotifications(v => !v)}><i /></button></div>
    <div className="set"><div><h3 style={{ fontSize: 15 }}>Notification sounds</h3><p className="dim">Remember your preference for notification sounds.</p></div><button className={cn('tg', soundEnabled && 'on')} role="switch" aria-checked={soundEnabled} onClick={() => setSoundEnabled(v => !v)}><i /></button></div>
    <div className="acts"><button className="btn p" onClick={async () => {
      const saved = await a.saveProfile({ name: name.trim(), head: headline.trim(), bio: bio.trim(), photo: photo.trim() })
      if (!saved) return
      await userState.patch({ preferences: { profileVisibility: visibility, emailNotifications, desktopNotifications, sound: soundEnabled } })
      a.toast('Personal settings saved')
    }}><Icon name="save" size={16} />Save personal settings</button></div>
    <div className="glass pad" style={{ marginTop: 20, padding: 18, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ width: 62, height: 62, flex: '0 0 62px', display: 'grid', placeItems: 'center', border: '1px solid rgba(255,255,255,.12)', borderRadius: 16, background: 'rgba(255,255,255,.025)' }}>
        <Logo size={48} />
      </div>
      <div style={{ flex: '1 1 220px', minWidth: 0 }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Quorlyth logo</h3>
        <p className="dim" style={{ fontSize: 12, lineHeight: 1.5, margin: 0 }}>Download the original site mark as a transparent, scalable SVG for documents, projects, and designs.</p>
      </div>
      <a className="btn p" href="/quorlyth-logo.svg" download="quorlyth-logo.svg" aria-label="Download the Quorlyth site logo as an SVG">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3" /></svg>
        Download logo
      </a>
    </div>
    <p className="dim" style={{ marginTop: 12, fontSize: 12 }}>Notification preferences are saved to your account. Email delivery depends on configured notification services.</p>
  </>
}
