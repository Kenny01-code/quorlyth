import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { useApp } from '../data/AppProvider'

type AccessMode = 'community' | 'platform'

export function Access() {
  const a = useApp()
  const nav = useNavigate()
  const loc = useLocation()
  const params = new URLSearchParams(loc.search)
  const queryCommunity = params.get('community') || ''
  const initialMode: AccessMode = queryCommunity || params.get('tab') === 'community' ? 'community' : 'platform'
  const [mode, setMode] = useState<AccessMode>(initialMode)
  const [selectedId, setSelectedId] = useState(queryCommunity)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [previewForm, setPreviewForm] = useState(false)
  const [guestName, setGuestName] = useState(a.me?.name || '')
  const [guestEmail, setGuestEmail] = useState(a.me?.email || '')
  const [guestMessage, setGuestMessage] = useState('')
  const [guestSent, setGuestSent] = useState(false)
  const [platformApprovalStatus, setPlatformApprovalStatus] = useState<'pending' | 'approved' | 'declined' | null>(null)
  const [audience, setAudience] = useState('')
  const [platforms, setPlatforms] = useState<string[]>([])
  const [memberNote, setMemberNote] = useState('')

  useEffect(() => {
    const nextParams = new URLSearchParams(loc.search)
    const nextCommunity = nextParams.get('community') || ''
    setSelectedId(nextCommunity)
    setMode(nextCommunity || nextParams.get('tab') === 'community' ? 'community' : 'platform')
    setMessage('')
    setError('')
  }, [loc.search])

  useEffect(() => {
    if (a.me?.name) setGuestName(a.me.name)
    if (a.me?.email) setGuestEmail(a.me.email)
  }, [a.me?.id, a.me?.name, a.me?.email])

  useEffect(() => {
    let active = true
    if (!a.me || !a.backend?.getPlatformAccessStatus) {
      setPlatformApprovalStatus(null)
      return
    }
    void a.backend.getPlatformAccessStatus()
      .then(status => { if (active) setPlatformApprovalStatus(status) })
      .catch(error => {
        console.warn('Could not refresh platform access status:', error)
        if (active) setPlatformApprovalStatus(null)
      })
    return () => { active = false }
  }, [a.backend, a.me?.id])

  const communities = a.data.communities
    .filter(community => community.vis !== 'unlisted' && !community.arch && community.joinApproval)
    .sort((left, right) => left.name.localeCompare(right.name))
  const selected = communities.find(community => community.id === selectedId)
  const platformAdmin = !!a.platformAdmin
  const decision = a.me ? a.data.decisions[a.me.id] : undefined
  const approved = platformAdmin || decision?.status === 'approved' || platformApprovalStatus === 'approved'
  const request = a.me ? a.data.requests.find(item => item.id === a.me!.id) : undefined
  const requestDecision = a.me ? a.data.decisions[a.me.id] : undefined
  const pending = (!!request && !(requestDecision && requestDecision.at > request.at)) || platformApprovalStatus === 'pending'
  const selectedRequest = selected && a.me
    ? a.data.joinRequests.find(item => item.cid === selected.id && item.userId === a.me!.id)
    : undefined
  const selectedIsManager = !!selected && !!a.me && a.canManageCommunity(selected.id)
  const selectedIsMember = !!selected && !!a.me && (a.joined(selected.id) || selectedRequest?.status === 'approved')
  const canApplyToCommunity = !!a.me && approved && !a.demo

  function switchMode(next: AccessMode) {
    setMode(next)
    setPreviewForm(false)
    setError('')
    const query = next === 'community'
      ? '?tab=community' + (selectedId ? '&community=' + encodeURIComponent(selectedId) : '')
      : '?tab=platform'
    nav('/access' + query, { replace: true })
  }

  function chooseCommunity(id: string) {
    setSelectedId(id)
    setMessage('')
    setError('')
    nav('/access?tab=community' + (id ? '&community=' + encodeURIComponent(id) : ''), { replace: true })
  }

  async function submitCommunityApplication() {
    if (!selected) {
      setError('Choose a community first.')
      return
    }
    if (!canApplyToCommunity) {
      setError('Platform access must be approved before you can apply to a community. Start with Platform access.')
      return
    }
    if (message.trim().length < 30) {
      setError('Please write at least 30 characters so the owner has enough context.')
      return
    }
    if (message.trim().length > 500) {
      setError('Your message must be 500 characters or fewer.')
      return
    }
    setSending(true)
    setError('')
    try {
      const sent = await a.requestCommunityJoin(selected.id, message.trim())
      if (sent) setMessage('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your application could not be sent. Please try again.')
    } finally {
      setSending(false)
    }
  }

  async function submitPlatformApplication() {
    setError('')
    if (!guestName.trim() || guestName.trim().length > 80) {
      setError('Enter your name (up to 80 characters).')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
      setError('Enter a valid email address.')
      return
    }
    if (!a.me && !guestMessage.trim()) {
      setError('Add a short note so the platform team can review your request.')
      return
    }
    setSending(true)
    try {
      if (a.me) {
        if (!audience) {
          setError('Choose your audience size.')
          return
        }
        await a.sendRequest({ platforms, aud: audience, note: memberNote.trim() })
      } else {
        if (!a.backend?.submitPlatformAccessRequest) {
          throw new Error('Visitor requests are unavailable in this environment. Please try again later.')
        }
        await a.backend.submitPlatformAccessRequest({
          fullName: guestName.trim(),
          email: guestEmail.trim().toLowerCase(),
          message: guestMessage.trim(),
        })
        setGuestSent(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your request could not be sent. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const isCommunity = mode === 'community'
  const leftTitle = isCommunity
    ? 'Apply to a community.'
    : platformAdmin
      ? 'You manage platform access.'
      : approved
        ? 'Your platform access is approved.'
        : 'Request access to Quorlyth.'
  const leftDescription = isCommunity
    ? 'This is a direct application to the selected community owner. It does not go to the platform administrator unless they also own that community.'
    : platformAdmin
      ? 'Global requests to enter Quorlyth are reviewed by authorized platform administrators.'
      : approved
        ? 'Your platform access is approved. You can now apply to the communities you want to join.'
        : 'Start here. Visitors can request platform access without creating an account or signing in.'

  return (
    <main className="q-access-page">
      <div className={`q-access-layout ${isCommunity ? 'is-community' : 'is-platform'}`}>
        <section className="q-access-card q-access-intro">
          <div className="q-access-orb" aria-hidden="true"><Logo size={84} breathe /></div>
          <div className="q-access-intro-copy">
            <h1>{leftTitle}</h1>
            <p>{leftDescription}</p>
          </div>
          <div className="q-access-switch" role="tablist" aria-label="Choose an access request type">
            <button type="button" role="tab" aria-selected={isCommunity} className={isCommunity ? 'active' : ''} onClick={() => switchMode('community')}>Apply to a community</button>
            <button type="button" role="tab" aria-selected={!isCommunity} className={!isCommunity ? 'active' : ''} onClick={() => switchMode('platform')}>Platform access</button>
          </div>
          {platformAdmin && !isCommunity && (
            <button type="button" className="q-access-preview" onClick={() => setPreviewForm(value => !value)}>
              {previewForm ? 'Exit request form preview' : 'Preview request form'}
            </button>
          )}
        </section>

        <section className="q-access-card q-access-form">
          {isCommunity ? (
            <CommunityApplicationPanel
              a={a}
              communities={communities}
              selectedId={selectedId}
              selected={selected}
              message={message}
              sending={sending}
              error={error}
              selectedRequest={selectedRequest}
              selectedIsManager={selectedIsManager}
              selectedIsMember={selectedIsMember}
              canApply={canApplyToCommunity}
              onCommunityChange={chooseCommunity}
              onMessageChange={value => { setMessage(value); setError('') }}
              onSubmit={() => void submitCommunityApplication()}
              onSwitchPlatform={() => switchMode('platform')}
              onOpenCommunity={() => selected && nav('/communities/' + selected.id)}
              onManage={() => selected && nav('/communities/' + selected.id + '?tab=join-requests')}
            />
          ) : (
            <PlatformAccessPanel
              a={a}
              platformAdmin={platformAdmin}
              approved={approved}
              pending={pending}
              declined={requestDecision?.status === 'declined' || platformApprovalStatus === 'declined'}
              guestSent={guestSent}
              previewForm={previewForm}
              guestName={guestName}
              guestEmail={guestEmail}
              guestMessage={guestMessage}
              audience={audience}
              platforms={platforms}
              memberNote={memberNote}
              sending={sending}
              error={error}
              onNameChange={setGuestName}
              onEmailChange={setGuestEmail}
              onGuestMessageChange={setGuestMessage}
              onAudienceChange={setAudience}
              onPlatformsChange={setPlatforms}
              onMemberNoteChange={setMemberNote}
              onSubmit={() => void submitPlatformApplication()}
              onOpenRequests={() => nav('/settings?tab=requests')}
              onCommunity={() => switchMode('community')}
              onCreateAccount={() => nav('/signin?next=%2Faccess&email=' + encodeURIComponent(guestEmail.trim()))}
              onBrowse={() => nav('/communities')}
            />
          )}
        </section>
      </div>
    </main>
  )
}

function CommunityApplicationPanel({ a, communities, selectedId, selected, message, sending, error, selectedRequest, selectedIsManager, selectedIsMember, canApply, onCommunityChange, onMessageChange, onSubmit, onSwitchPlatform, onOpenCommunity, onManage }: any) {
  const ownerId = selected?.ownerId || selected?.createdBy || ''
  const ownerName = ownerId ? a.nm(ownerId) : 'the community owner'
  const messageLength = message.trim().length

  if (selectedIsManager) {
    return (
      <div className="q-access-centered-status">
        <p className="q-access-eyebrow">COMMUNITY MANAGEMENT</p>
        <h2>You manage this community.</h2>
        <p>Applications for this community are reviewed in your existing Join requests queue.</p>
        <button type="button" className="q-access-primary" onClick={onManage}>Open join requests</button>
      </div>
    )
  }
  if (selectedIsMember) {
    return (
      <div className="q-access-centered-status">
        <p className="q-access-eyebrow">COMMUNITY ACCESS</p>
        <h2>You already have access.</h2>
        <p>Your membership is active or your application has been approved.</p>
        <button type="button" className="q-access-primary" onClick={onOpenCommunity}>Open community</button>
      </div>
    )
  }
  if (selectedRequest?.status === 'pending') {
    return (
      <div className="q-access-centered-status">
        <p className="q-access-eyebrow">APPLICATION SENT</p>
        <h2>Your application is with the owner.</h2>
        <p>{ownerName} can approve or decline your request from the community's Join requests area.</p>
        {selectedRequest.message && <blockquote>{selectedRequest.message}</blockquote>}
      </div>
    )
  }

  return (
    <div className="q-access-community-form">
      <h2>Tell the owner why you want to join.</h2>
      <p className="q-access-description">Your application is delivered to the owner of the selected community. They can approve or decline it in Join requests.</p>
      <label className="q-access-tag" htmlFor="q-access-community">Community</label>
      <select id="q-access-community" className="q-access-select" value={selectedId} onChange={event => onCommunityChange(event.target.value)}>
        <option value="">Choose a community accepting requests</option>
        {communities.map((community: any) => <option key={community.id} value={community.id}>{community.name}</option>)}
      </select>
      <label className="q-access-tag q-access-message-tag" htmlFor="q-access-message">Why should the community welcome you?</label>
      <textarea id="q-access-message" className="q-access-textarea" value={message} maxLength={500} onChange={event => onMessageChange(event.target.value)} placeholder="Share what interests you, what you could contribute, or how you hope to take part." />
      <p className="q-access-counter">{messageLength}/500 characters · At least 30 characters required</p>
      {selected && <p className="q-access-owner-note">This request goes directly to {ownerName}, not to the platform-wide queue.</p>}
      {!canApply && (
        <div className="q-access-stage-note">
          <Icon name="lock" size={15} />
          <span>Platform access must be approved first. Submit a Platform access request, then return here to apply.</span>
          <button type="button" onClick={onSwitchPlatform}>Request platform access</button>
        </div>
      )}
      {error && <p className="q-access-error" role="alert">{error}</p>}
      <button type="button" className="q-access-primary q-access-submit" disabled={!canApply || !selected || messageLength < 30 || sending} onClick={onSubmit}>
        {sending ? 'Sending application…' : 'Send to community owner'}
      </button>
    </div>
  )
}

function PlatformAccessPanel({ a, platformAdmin, approved, pending, declined, guestSent, previewForm, guestName, guestEmail, guestMessage, audience, platforms, memberNote, sending, error, onNameChange, onEmailChange, onGuestMessageChange, onAudienceChange, onPlatformsChange, onMemberNoteChange, onSubmit, onOpenRequests, onCommunity, onBrowse, onCreateAccount }: any) {
  if (platformAdmin && !previewForm) {
    return (
      <div className="q-access-platform-admin">
        <h2>You manage platform access.</h2>
        <p className="q-access-description">Global requests to enter Quorlyth are reviewed by authorized platform administrators.</p>
        <button type="button" className="q-access-primary q-access-open-requests" onClick={onOpenRequests}><Icon name="settings" size={17} />Open platform requests</button>
      </div>
    )
  }
  if (approved && !previewForm) {
    return (
      <div className="q-access-centered-status">
        <p className="q-access-eyebrow">PLATFORM ACCESS APPROVED</p>
        <h2>You can now apply to a community.</h2>
        <p>Your platform access is approved. Choose a community and send an application directly to its owner.</p>
        <button type="button" className="q-access-primary" onClick={onCommunity}>Apply to a community</button>
        <button type="button" className="q-access-secondary" onClick={onBrowse}>Browse communities</button>
      </div>
    )
  }
  if (pending && !previewForm) {
    return (
      <div className="q-access-centered-status">
        <p className="q-access-eyebrow">PLATFORM ACCESS</p>
        <h2>Your request is under review.</h2>
        <p>Authorized platform administrators will review your request. Once approved, you can continue to community applications.</p>
      </div>
    )
  }
  if (guestSent && !previewForm) {
    return (
      <div className="q-access-centered-status">
        <p className="q-access-eyebrow">REQUEST RECEIVED</p>
        <h2>Your request has been sent.</h2>
        <p>The platform team will review your request. Next, create your Quorlyth account using <strong>{guestEmail}</strong> before the request is reviewed. This lets the platform link approval to the correct account.</p>
        <button type="button" className="q-access-primary" onClick={onCreateAccount}>Create account or sign in</button>
        <button type="button" className="q-access-secondary" onClick={onCommunity}>View community application page</button>
      </div>
    )
  }

  return (
    <div className="q-access-platform-form">
      <h2>{previewForm ? 'Preview the platform request form.' : 'Request access to Quorlyth.'}</h2>
      <p className="q-access-description">Global requests to enter Quorlyth are reviewed by authorized platform administrators. You can submit this request as a visitor without signing in.</p>
      {!a.me ? (
        <>
          <label className="q-access-tag" htmlFor="q-access-name">Your name</label>
          <input id="q-access-name" className="q-access-input" value={guestName} maxLength={80} onChange={event => onNameChange(event.target.value)} placeholder="Enter your name" />
          <label className="q-access-tag q-access-message-tag" htmlFor="q-access-email">Email address</label>
          <input id="q-access-email" className="q-access-input" type="email" value={guestEmail} maxLength={320} onChange={event => onEmailChange(event.target.value)} placeholder="you@example.com" />
          <label className="q-access-tag q-access-message-tag" htmlFor="q-access-platform-message">Why would you like to join Quorlyth?</label>
          <textarea id="q-access-platform-message" className="q-access-textarea q-access-platform-textarea" value={guestMessage} maxLength={1000} onChange={event => onGuestMessageChange(event.target.value)} placeholder="Tell the platform team a little about yourself and what you hope to do on Quorlyth." />
        </>
      ) : (
        <>
          <label className="q-access-tag">Community or audience platforms</label>
          <div className="q-access-chip-grid">{['Instagram', 'YouTube', 'TikTok', 'X', 'Twitch', 'Other'].map((item: string) => <button key={item} type="button" className={platforms.includes(item) ? 'selected' : ''} onClick={() => onPlatformsChange(platforms.includes(item) ? platforms.filter((value: string) => value !== item) : [...platforms, item])}>{item}</button>)}</div>
          <label className="q-access-tag q-access-message-tag" htmlFor="q-access-audience">Audience size</label>
          <select id="q-access-audience" className="q-access-select" value={audience} onChange={event => onAudienceChange(event.target.value)}>
            <option value="">Choose your audience size</option>
            {['Under 10k', '10k to 100k', '100k to 1M', 'Over 1M'].map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <label className="q-access-tag q-access-message-tag" htmlFor="q-access-member-note">Why would you like to access Quorlyth?</label>
          <textarea id="q-access-member-note" className="q-access-textarea q-access-platform-textarea" value={memberNote} maxLength={1000} onChange={event => onMemberNoteChange(event.target.value)} placeholder="A few words are enough." />
        </>
      )}
      {error && <p className="q-access-error" role="alert">{error}</p>}
      <button type="button" className="q-access-primary q-access-submit" disabled={sending || (a.me ? !audience : !guestName.trim() || !guestEmail.trim() || !guestMessage.trim()) || previewForm} onClick={onSubmit}>
        {previewForm ? 'Preview only' : sending ? 'Sending request…' : 'Send platform access request'}
      </button>
      {previewForm && <p className="q-access-counter">Preview mode only. This will not submit a real request.</p>}
    </div>
  )
}
