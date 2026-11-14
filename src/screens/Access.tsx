import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { Chip } from '../components/ui'
import { useApp } from '../data/AppProvider'
import { when } from '../lib/util'
import { useDraftState } from '../lib/useDraftState'

export function Access() {
  const a = useApp()
  const nav = useNavigate()
  const loc = useLocation()
  const communityId = new URLSearchParams(loc.search).get('community') || ''
  const communities = a.data.communities
    .filter(community => community.vis !== 'unlisted' && !community.arch && community.joinApproval)
    .sort((left, right) => left.name.localeCompare(right.name))
  const selected = communities.find(community => community.id === communityId)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setMessage('')
    setSending(false)
  }, [communityId])

  function openApplication(communityId: string) {
    const destination = '/access?community=' + encodeURIComponent(communityId)
    if (!a.me && !a.demo) {
      nav('/signin?next=' + encodeURIComponent(destination))
      return
    }
    nav(destination)
  }

  async function submitCommunityApplication() {
    if (!selected) return
    if (!a.me) {
      openApplication(selected.id)
      return
    }
    if (a.canManageCommunity(selected.id) || a.joined(selected.id)) return
    setSending(true)
    try {
      const sent = await a.requestCommunityJoin(selected.id, message.trim())
      if (sent) setMessage('')
    } finally {
      setSending(false)
    }
  }

  const selectedOwnerId = selected?.ownerId || selected?.createdBy || ''
  const selectedOwnerName = selectedOwnerId ? a.nm(selectedOwnerId) : 'Community owner'
  const selectedRequest = selected && a.me
    ? a.data.joinRequests.find(request => request.cid === selected.id && request.userId === a.me!.id)
    : undefined
  const selectedIsManager = !!selected && !!a.me && a.canManageCommunity(selected.id)
  const selectedIsMember = !!selected && !!a.me && (a.joined(selected.id) || selectedRequest?.status === 'approved')

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <section className="glass pad" style={{ display: 'grid', gap: 10 }}>
        <p className="dim" style={{ fontSize: 11, letterSpacing: '.1em' }}>ACCESS / APPLICATIONS</p>
        <h2 style={{ fontSize: 32, lineHeight: 1.15 }}>Choose the community you want to join.</h2>
        <p className="mut" style={{ maxWidth: 720 }}>
          Some communities are open to everyone. Others ask people to apply first. Those applications go directly to the owner of the community you choose, not to the platform-wide access queue.
        </p>
        <div className="acts" style={{ marginTop: 4 }}>
          <button className="btn" onClick={() => nav('/communities')}><Icon name="community" size={16} />Browse all communities</button>
          <span className="chip"><Icon name="lock" size={13} />Owner-reviewed applications</span>
        </div>
      </section>

      <section className="glass pad" style={{ display: 'grid', gap: 14 }}>
        <div className="profile-section-heading">
          <div>
            <p className="dim">COMMUNITY ACCESS</p>
            <h3 style={{ marginBottom: 4 }}>Communities accepting applications</h3>
            <p className="mut">Each application is delivered to that community's owner for review.</p>
          </div>
          <span className="profile-section-mark"><Icon name="invite" size={19} /></span>
        </div>

        {communities.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 12 }}>
            {communities.map(community => {
              const ownerId = community.ownerId || community.createdBy || ''
              const ownerName = ownerId ? a.nm(ownerId) : 'Community owner'
              const request = a.me
                ? a.data.joinRequests.find(item => item.cid === community.id && item.userId === a.me!.id)
                : undefined
              const manager = !!a.me && a.canManageCommunity(community.id)
              const member = !!a.me && (a.joined(community.id) || request?.status === 'approved')
              const pending = request?.status === 'pending'
              const declined = request?.status === 'declined'
              return (
                <article key={community.id} className="glass pad" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                    <span className="score" style={{ flex: '0 0 auto' }}><Icon name={community.icon || 'community'} size={21} /></span>
                    <div style={{ minWidth: 0 }}>
                      <h3 style={{ fontSize: 17, lineHeight: 1.3 }}>{community.name}</h3>
                      <p className="dim" style={{ fontSize: 12, marginTop: 3 }}>Owned by {ownerName}</p>
                    </div>
                  </div>
                  {community.purpose && <p className="mut" style={{ fontSize: 13, lineHeight: 1.55 }}>{community.purpose}</p>}
                  <div className="row" style={{ gap: 7, alignItems: 'center' }}>
                    <Icon name="shield" size={14} />
                    <span className="dim" style={{ fontSize: 12 }}>The owner reviews every application</span>
                  </div>
                  <div className="acts" style={{ marginTop: 'auto' }}>
                    {manager ? (
                      <button className="btn p" onClick={() => nav('/communities/' + community.id + '?tab=join-requests')}>
                        <Icon name="member" size={15} />Manage applications
                      </button>
                    ) : member ? (
                      <button className="btn p" onClick={() => nav('/communities/' + community.id)}>
                        <Icon name="approve" size={15} />Open community
                      </button>
                    ) : pending ? (
                      <button className="btn" onClick={() => openApplication(community.id)}>
                        <Icon name="status" size={15} />Application pending
                      </button>
                    ) : (
                      <button className="btn p" onClick={() => openApplication(community.id)}>
                        <Icon name="invite" size={15} />{declined ? 'Apply again' : 'Apply to join'}
                      </button>
                    )}
                    <button className="btn" onClick={() => nav('/communities/' + community.id)}>View</button>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="glass pad" style={{ textAlign: 'center' }}>
            <Icon name="community" size={26} />
            <h3 style={{ marginTop: 10 }}>No communities are taking applications right now.</h3>
            <p className="mut" style={{ marginTop: 6 }}>Browse listed communities to find open spaces. Owners can turn on "Approve new members" in their community settings to receive applications here.</p>
            <button className="btn p" style={{ marginTop: 14 }} onClick={() => nav('/communities')}>Explore communities</button>
          </div>
        )}
      </section>

      {selected && (
        <section id="community-application" className="glass pad" style={{ display: 'grid', gap: 12, scrollMarginTop: 24 }}>
          <div className="profile-section-heading">
            <div>
              <p className="dim">APPLICATION TO {selected.name.toUpperCase()}</p>
              <h3 style={{ marginBottom: 4 }}>Request to join {selected.name}</h3>
              <p className="mut">Your application will be reviewed by {selectedOwnerName}.</p>
            </div>
            <span className="profile-section-mark"><Icon name="invite" size={19} /></span>
          </div>
          {selectedIsManager ? (
            <>
              <p className="mut">You manage this community. Review applications from your community's member-application queue.</p>
              <div className="acts"><button className="btn p" onClick={() => nav('/communities/' + selected.id + '?tab=join-requests')}><Icon name="member" />Open applications</button></div>
            </>
          ) : selectedIsMember ? (
            <>
              <p className="mut">Your application was approved, or you are already a member of this community.</p>
              <div className="acts"><button className="btn p" onClick={() => nav('/communities/' + selected.id)}>Open community</button></div>
            </>
          ) : !a.me && !a.demo ? (
            <>
              <p className="mut">Sign in first. You'll return to this exact application after signing in.</p>
              <button className="btn p" onClick={() => openApplication(selected.id)}>Sign in to apply</button>
            </>
          ) : selectedRequest?.status === 'pending' ? (
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Icon name="status" size={18} />
              <div className="t">
                <h3 style={{ fontSize: 15 }}>Application sent</h3>
                <p className="dim">Your request is waiting for {selectedOwnerName} to approve or decline it.</p>
                {selectedRequest.message && <p className="mut q-writeup" style={{ marginTop: 8 }}>{selectedRequest.message}</p>}
              </div>
            </div>
          ) : (
            <>
              {selectedRequest?.status === 'declined' && <p className="chip"><Icon name="alert" size={13} />Your previous application was declined. You can send an updated one.</p>}
              <label className="field">
                <span>Why would you like to join? <small>Optional</small></span>
                <textarea value={message} maxLength={500} onChange={event => setMessage(event.target.value)} placeholder="Introduce yourself or tell the owner what interests you about this community." />
              </label>
              <p className="dim" style={{ fontSize: 12 }}>Only this community's owner and authorized managers can review your application.</p>
              <div className="acts">
                <button className="btn p" disabled={sending} onClick={() => void submitCommunityApplication()}>
                  <Icon name="send" size={15} />{sending ? 'Sending application…' : selectedRequest?.status === 'declined' ? 'Send updated application' : 'Send application'}
                </button>
                <button className="btn" onClick={() => nav('/access')}>Cancel</button>
              </div>
            </>
          )}
        </section>
      )}

      {a.me ? <PlatformAccess /> : <GuestPlatformAccess />}
    </div>
  )
}

function GuestPlatformAccess() {
  const a = useApp()
  const nav = useNavigate()
  return (
    <section className="glass pad" style={{ display: 'grid', gap: 10 }}>
      <p className="dim" style={{ fontSize: 11, letterSpacing: '.1em' }}>PLATFORM ACCESS</p>
      <h3>Request access to Quorlyth itself.</h3>
      <p className="mut">This is separate from joining a community. Platform-wide requests are reviewed by the platform owner or an authorized platform administrator.</p>
      <div className="acts">
        <button className="btn p" onClick={() => nav('/signin?next=%2Faccess')}>Sign in to request platform access</button>
        <button className="btn" onClick={() => { a.enterDemo(); nav('/dashboard') }}><Icon name="spark" size={15} />Try Demo</button>
      </div>
    </section>
  )
}

function PlatformAccess() {
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
  const approved = dc?.status === 'approved'
  const pending = !!rq && !(dc && dc.at > rq.at) && !approved
  const declined = !!dc && dc.status === 'declined' && (!rq || dc.at > rq.at)
  const panelTitle = preview
    ? 'Previewing the platform access form.'
    : a.platformAdmin
      ? 'You manage platform access.'
      : approved
        ? 'Your platform access is approved.'
        : pending
          ? 'Your platform request is under review.'
          : declined
            ? 'Your last platform request was declined.'
            : 'Request platform access.'
  const panelDescription = preview
    ? 'This is how a signed-in member can request platform access. Preview mode does not submit a real request.'
    : a.platformAdmin
      ? 'Global requests to enter Quorlyth are reviewed by authorized platform administrators.'
      : approved
        ? 'Your platform approval is saved. You can browse communities and use the features available to your role.'
        : pending
          ? 'Your request is waiting for a platform administrator to review it.'
          : declined
            ? 'You can send a new platform request with updated details.'
            : 'Tell the platform owner a little about yourself so they can review your request.'
  let body
  if (a.platformAdmin && !preview) body = <><h2 style={{ fontSize: 34 }}>You manage platform access.</h2><p className="mut" style={{ marginTop: 10 }}>Global requests to enter Quorlyth are reviewed by authorized platform administrators.</p><div className="acts"><button className="btn p" onClick={() => nav('/settings?tab=requests')}><Icon name="settings" />Open platform requests</button></div></>
  else if (!preview && dc?.status === 'approved') body = <div className="done"><div className="score"><Icon name="approve" size={34} /></div><h2>You are in.</h2><p className="mut" style={{ marginTop: 12 }}>The platform approved your request.</p><div className="acts" style={{ justifyContent: 'center' }}><button className="btn p" onClick={() => nav('/communities')}>Browse communities</button></div></div>
  else if (!preview && rq && !(dc && dc.at > rq.at)) body = <><h2 style={{ fontSize: 34 }}>Request sent.</h2><p className="mut" style={{ marginTop: 10 }}>Waiting for a platform administrator to review it. Sent {when(rq.at)}.</p><div className="row" style={{ cursor: 'default', marginTop: 20 }}><Icon name="status" /><div className="t"><h3 style={{ fontSize: 15 }}>Pending platform review</h3><p className="dim">{(rq.platforms || []).join(', ')}{rq.aud ? ' with an audience of ' + rq.aud : ''}</p></div></div><div className="acts"><button className="btn" onClick={() => a.backend!.store.delete('requests/' + me.id)}>Withdraw request</button></div></>
  else body = <>
    {dc && <p className="chip" style={{ marginBottom: 16 }}><Icon name="alert" size={12} />Your last platform request was declined. You can send a new one.</p>}
    <h2 style={{ fontSize: 34 }}>Request platform access.</h2><p className="mut" style={{ marginTop: 10 }}>A few details help the platform team decide.</p>
    <p className="dim" style={{ marginTop: 12 }}>Your unfinished request is saved as a draft on this device.</p>
    <div className="field"><span>Where is your audience</span><div className="acts" style={{ margin: 0 }}>{['Instagram', 'YouTube', 'TikTok', 'X', 'Twitch', 'Other'].map(c => <Chip key={c} on={pl.includes(c)} onClick={() => setPl(pl.includes(c) ? pl.filter(x => x !== c) : [...pl, c])}>{c}</Chip>)}</div></div>
    <div className="field"><span>Audience size</span><div className="acts" style={{ margin: 0 }}>{['Under 10k', '10k to 100k', '100k to 1M', 'Over 1M'].map(c => <Chip key={c} on={au === c} onClick={() => setAu(c)}>{c}</Chip>)}</div></div>
    <label className="field"><span>Why do you want to access Quorlyth?</span><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="A few words are enough" /></label>
    <div id="rer" style={{ opacity: err ? 1 : 0 }}>{err && <><Icon name="alert" size={14} />{err}</>}</div>
    <button className="btn p wide" onClick={async () => { if (preview) return a.toast('Preview only. Sign in as a member to send a request.'); if (!au) return setErr('Choose your audience size.'); if (await a.sendRequest({ platforms: pl, aud: au, note: note.trim() })) clearRequestDraft(blankRequest) }}>Send platform request</button>
  </>
  return (
    <div className="lg">
      <div className="glass stage" style={{ minHeight: 340, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: 40 }}>
        <div className="fmk xl"><i className="hh" /><Logo size={84} breathe /></div>
        <p className="dim" style={{ fontSize: 11, letterSpacing: '.1em' }}>PLATFORM ACCESS</p>
        <h2 style={{ fontSize: 34 }}>{panelTitle}</h2>
        <p className="mut" style={{ margin: '14px auto 0', maxWidth: 340 }}>{panelDescription}</p>
        {a.platformAdmin && <button className="btn" style={{ marginTop: 20 }} onClick={() => setPreview(p => !p)}>{preview ? 'Exit form preview' : 'Preview request form'}</button>}
      </div>
      <div className="glass fm"><div>{body}</div></div>
    </div>
  )
}
