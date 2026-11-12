import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Gate } from './Gate'
import { useApp } from '../data/AppProvider'
import { when } from '../lib/util'
import { ResourceAccessRequest } from '../lib/types'
import '../styles/resource-access.css'

export type ResourceAccessType = 'community' | 'workspace' | 'idea'

export function resourceAccessRequestPath(type: ResourceAccessType, resourceId: string, userId: string) {
  return 'resourceAccessRequests/' + type + '__' + resourceId + '__' + userId
}

function useResourceAccessRequests(type: ResourceAccessType, resourceId: string) {
  const a = useApp()
  const [requests, setRequests] = useState<ResourceAccessRequest[]>([])

  useEffect(() => {
    const store = a.backend?.store
    if (!store || !a.me) {
      setRequests([])
      return
    }
    let active = true
    const off = store.subscribe('resourceAccessRequests', docs => {
      if (!active) return
      setRequests(docs
        .map(doc => ({ ...doc.data, id: doc.id }) as ResourceAccessRequest)
        .filter(request => (request.resourceType === type && request.resourceId === resourceId) || (type === 'community' && request.resourceType === 'idea' && a.data.ideas.some(idea => idea.id === request.resourceId && idea.cid === resourceId)))
        .sort((first, second) => second.requestedAt - first.requestedAt))
    }, error => {
      console.warn('Resource access requests could not refresh:', error)
    })
    return () => { active = false; off() }
  }, [a.backend?.store, a.me?.id, a.data.ideas, type, resourceId])

  return requests
}

export function ResourceAccessRoute() {
  const { type = '', id = '' } = useParams()
  const validType = type === 'community' || type === 'workspace' || type === 'idea' ? type : null
  return <Gate>
    {validType && id
      ? <ResourceAccessRequestPage type={validType} resourceId={id} />
      : <div className="glass pad"><h2>Access link unavailable</h2><p className="mut">The resource link is incomplete or invalid.</p></div>}
  </Gate>
}

export function ResourceAccessRequestPage({ type, resourceId }: { type: ResourceAccessType; resourceId: string }) {
  const a = useApp()
  const nav = useNavigate()
  const requests = useResourceAccessRequests(type, resourceId)
  const mine = requests.find(request => request.userId === a.me?.id)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const noun = type === 'community' ? 'community' : type === 'workspace' ? 'workspace' : 'idea'
  const destination = type === 'community' ? '/communities/' + encodeURIComponent(resourceId) : type === 'workspace' ? '/workspaces/' + encodeURIComponent(resourceId) : '/idea/' + encodeURIComponent(resourceId)

  async function submit() {
    if (!a.me || !a.backend) return setError('Sign in again before requesting access.')
    if (busy) return
    setError('')
    setBusy(true)
    try {
      const path = resourceAccessRequestPath(type, resourceId, a.me.id)
      const existing = await a.backend.store.get(path)
      if (existing?.status === 'pending') {
        setError('Your request is already waiting for review.')
        return
      }
      if (existing?.status === 'approved') {
        nav(destination)
        return
      }
      await a.backend.requestResourceAccess(type, resourceId, message.trim().slice(0, 500))
      a.toast('Access request sent to the resource owner.')
    } catch (failure: any) {
      console.error('Resource access request failed:', failure)
      setError(failure?.message || 'Could not send the access request. Refresh and try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="lg q-resource-access">
    <div className="glass stage" style={{ minHeight: 300, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 32 }}>
      <div>
        <div className="score" style={{ margin: '0 auto 18px' }}><Icon name="lock" size={28} /></div>
        <p className="dim">RESOURCE ACCESS</p>
        <h2 style={{ fontSize: 32, marginTop: 8 }}>This {noun} is private.</h2>
        <p className="mut" style={{ maxWidth: 470, margin: '12px auto 0' }}>{type === 'idea' ? 'This idea belongs to a private community. Your request goes to that community’s owner, and approval will open the idea and its associated community content.' : `You need the resource owner’s approval before this page can be opened. Your request goes directly to the person who manages this ${noun}.`}</p>
      </div>
    </div>
    <div className="glass fm">
      {mine?.status === 'approved' ? <>
        <div className="done">
          <div className="score"><Icon name="approve" size={30} /></div>
          <h2>Access approved.</h2>
          <p className="mut">Your permission is active. Open the {noun} using the button below.</p>
          <div className="acts" style={{ justifyContent: 'center' }}><button className="btn p" onClick={() => nav(destination)}>Open {noun}</button></div>
        </div>
      </> : mine?.status === 'pending' ? <>
        <h2 style={{ fontSize: 26 }}>Request sent.</h2>
        <p className="mut" style={{ marginTop: 8 }}>Your request is in the resource owner’s access queue. Return here to check the decision.</p>
        <div className="row" style={{ cursor: 'default', marginTop: 18 }}>
          <Icon name="status" />
          <div className="t"><h3 style={{ fontSize: 15 }}>Waiting for review</h3><p className="dim">Sent {when(mine.requestedAt)}. You do not need to send another request.</p></div>
        </div>
      </> : <>
        {mine?.status === 'declined' && <p className="chip" style={{ marginBottom: 14 }}><Icon name="alert" size={13} />Your previous request was declined. You can send a new request with more context.</p>}
        <h2 style={{ fontSize: 26 }}>Ask for access.</h2>
        <p className="mut" style={{ marginTop: 7 }}>Add a short note for the owner. Approval is limited to this {noun}.</p>
        <label className="field" style={{ marginTop: 18 }}>
          <span>Message <small>Optional · up to 500 characters</small></span>
          <textarea value={message} maxLength={500} onChange={event => setMessage(event.target.value)} placeholder="Let the owner know why you need access." />
        </label>
        {error && <p className="q-resource-access__error" role="alert"><Icon name="alert" size={14} />{error}</p>}
        <button type="button" className="btn p wide" disabled={busy} onClick={() => void submit()}>
          <Icon name="lock" size={15} />{busy ? 'Sending request…' : mine?.status === 'declined' ? 'Request access again' : 'Send access request'}
        </button>
      </>}
    </div>
  </div>
}

export function ResourceAccessRequestsPanel({ type, resourceId }: { type: ResourceAccessType; resourceId: string }) {
  const a = useApp()
  const requests = useResourceAccessRequests(type, resourceId)
  const pending = useMemo(() => requests.filter(request => request.status === 'pending'), [requests])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  async function review(request: ResourceAccessRequest, status: 'approved' | 'declined') {
    if (!a.backend || busyId) return
    setError('')
    setBusyId(request.userId)
    try {
      await a.backend.reviewResourceAccessRequest(request.resourceType, request.resourceId, request.userId, status)
      a.toast(status === 'approved' ? 'Access granted for this resource.' : 'Access request declined.')
    } catch (failure: any) {
      console.error('Resource access review failed:', failure)
      setError(failure?.message || 'Could not save the decision. Refresh and try again.')
    } finally {
      setBusyId('')
    }
  }

  return <section className="glass pad q-resource-access__queue">
    <div className="q-resource-access__queue-heading">
      <div><p className="dim">RESOURCE ACCESS</p><h3>Access requests</h3><p className="mut">Only requests for this {type === 'community' ? 'community' : 'workspace'} appear here. Idea requests from this community are included.</p></div>
      <span className="chip">{pending.length} pending</span>
    </div>
    {error && <p className="q-resource-access__error" role="alert"><Icon name="alert" size={14} />{error}</p>}
    {pending.length ? <div className="q-resource-access__request-list">
      {pending.map(request => <article className="q-resource-access__request" key={request.userId}>
        <div className="q-resource-access__request-copy">
          <strong>{a.nm(request.userId)}</strong>
          {request.resourceType === 'idea' && <small>Idea access · {a.data.ideas.find(idea => idea.id === request.resourceId)?.title || 'Private idea'}</small>}
          <small>Requested {when(request.requestedAt)}</small>
          <p>{request.message?.trim() || 'No message was included.'}</p>
        </div>
        <div className="acts" style={{ margin: 0 }}>
          <button type="button" className="btn p" disabled={!!busyId} onClick={() => void review(request, 'approved')}>{busyId === request.userId ? 'Saving…' : 'Approve'}</button>
          <button type="button" className="btn" disabled={!!busyId} onClick={() => void review(request, 'declined')}>Decline</button>
        </div>
      </article>)}
    </div> : <div className="q-resource-access__empty"><Icon name="check" size={18} /><span>No pending access requests.</span></div>}
  </section>
}
