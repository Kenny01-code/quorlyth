import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../lib/Icon'
import { DocStore } from '../data/docstore'

type CallMode = 'voice' | 'video'
type CallState = 'preparing' | 'ringing' | 'accepted' | 'declined' | 'ended'
type CallSession = {
  id: string
  conversationId: string
  callerId: string
  calleeId: string
  mode: CallMode
  state: CallState
  createdAt: number
  offer?: RTCSessionDescriptionInit
  answer?: RTCSessionDescriptionInit
  answeredAt?: number
  endedAt?: number
}
type CallSignal = {
  id: string
  callId: string
  conversationId: string
  fromId: string
  toId: string
  candidate: RTCIceCandidateInit
  at: number
}
type ActiveConversation = { id: string; type: 'direct' | 'group'; members: string[] } | null

const makeId = () => typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : 'call-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
const rtcConfig: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

export function useChatCalls({
  active,
  meId,
  store,
  nameFor,
  onToast,
}: {
  active: ActiveConversation
  meId: string
  store?: DocStore
  nameFor: (id: string) => string
  onToast: (message: string) => void
}): { controls: ReactNode; overlay: ReactNode } {
  const [calls, setCalls] = useState<CallSession[]>([])
  const [signals, setSignals] = useState<CallSignal[]>([])
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [callStatus, setCallStatus] = useState('Connecting securely…')
  const [callError, setCallError] = useState('')
  const [peerRevision, setPeerRevision] = useState(0)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const localRef = useRef<MediaStream | null>(null)
  const activeCallRef = useRef<string | null>(null)
  const processedSignals = useRef<Set<string>>(new Set())
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([])
  const applyingDescription = useRef(false)
  const remoteVideo = useRef<HTMLVideoElement>(null)
  const localVideo = useRef<HTMLVideoElement>(null)
  const endedLocally = useRef<Set<string>>(new Set())

  useEffect(() => { activeCallRef.current = activeCallId }, [activeCallId])

  useEffect(() => {
    if (!store || !meId) {
      setCalls([])
      setSignals([])
      return
    }
    const report = (error: unknown) => {
      console.warn('Quorlyth call signaling could not sync. Apply the WebRTC calls migration.', error)
    }
    const offCalls = store.subscribe('calls', docs => {
      setCalls(docs.map(d => ({ id: d.id, ...d.data } as CallSession))
        .filter(c => c && typeof c.conversationId === 'string' && (c.callerId === meId || c.calleeId === meId))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)))
    }, report)
    const offSignals = store.subscribe('callSignals', docs => {
      setSignals(docs.map(d => ({ id: d.id, ...d.data } as CallSignal))
        .filter(s => typeof s.callId === 'string' && typeof s.toId === 'string' && s.toId === meId && !!s.candidate))
    }, report)
    return () => { offCalls(); offSignals() }
  }, [store, meId])

  const incomingCall = useMemo(() => calls.find(c =>
    c.calleeId === meId &&
    c.state === 'ringing' &&
    Date.now() - (c.createdAt || 0) < 120000
  ) || null, [calls, meId])

  const activeCall = calls.find(c => c.id === activeCallId) || null
  const otherPartyId = activeCall
    ? (activeCall.callerId === meId ? activeCall.calleeId : activeCall.callerId)
    : ''
  const callPeerName = otherPartyId ? nameFor(otherPartyId) : ''

  // Incoming calls are surfaced even if the recipient is looking at another conversation.
  useEffect(() => {
    if (activeCallId) return
    const candidate = incomingCall || calls.find(c =>
      c.callerId === meId &&
      (c.state === 'preparing' || c.state === 'ringing' || c.state === 'accepted') &&
      Date.now() - (c.createdAt || 0) < 120000
    )
    if (candidate) setActiveCallId(candidate.id)
  }, [activeCallId, incomingCall, calls, meId])

  const releaseMedia = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.onicecandidate = null
      peerRef.current.ontrack = null
      peerRef.current.onconnectionstatechange = null
      peerRef.current.close()
      peerRef.current = null
    }
    if (localRef.current) localRef.current.getTracks().forEach(track => track.stop())
    localRef.current = null
    setLocalStream(null)
    setRemoteStream(null)
    setMuted(false)
    setCameraOff(false)
    pendingCandidates.current = []
    processedSignals.current.clear()
    applyingDescription.current = false
    setPeerRevision(n => n + 1)
  }, [])

  const writeSignal = useCallback(async (call: CallSession, targetId: string, candidate: RTCIceCandidateInit) => {
    if (!store) return
    const id = makeId()
    const signal: CallSignal = {
      id,
      callId: call.id,
      conversationId: call.conversationId,
      fromId: meId,
      toId: targetId,
      candidate,
      at: Date.now(),
    }
    try { await store.set('callSignals/' + id, signal) }
    catch (error) {
      console.warn('Could not send a WebRTC ICE candidate', error)
      setCallError('Call signaling was blocked by the database. Apply the WebRTC calls migration.')
    }
  }, [store, meId])

  const createPeer = useCallback((call: CallSession, remoteId: string, stream: MediaStream) => {
    const pc = new RTCPeerConnection(rtcConfig)
    peerRef.current = pc
    localRef.current = stream
    setLocalStream(stream)
    stream.getTracks().forEach(track => pc.addTrack(track, stream))
    pc.ontrack = event => {
      const next = event.streams?.[0]
      if (next) setRemoteStream(next)
      else {
        setRemoteStream(existing => {
          const combined = existing || new MediaStream()
          if (!combined.getTracks().some(track => track.id === event.track.id)) combined.addTrack(event.track)
          return combined
        })
      }
    }
    pc.onicecandidate = event => {
      if (event.candidate) void writeSignal(call, remoteId, event.candidate.toJSON())
    }
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallStatus('Connected')
      else if (pc.connectionState === 'connecting') setCallStatus('Connecting…')
      else if (pc.connectionState === 'failed') {
        setCallStatus('Connection failed')
        setCallError('The network could not establish a direct call. A TURN relay may be required on restrictive networks.')
      } else if (pc.connectionState === 'disconnected') setCallStatus('Reconnecting…')
    }
    setPeerRevision(n => n + 1)
    return pc
  }, [writeSignal])

  const flushCandidates = useCallback(async () => {
    const pc = peerRef.current
    if (!pc?.remoteDescription || !pendingCandidates.current.length) return
    const pending = pendingCandidates.current.splice(0)
    for (const candidate of pending) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)) }
      catch (error) { console.warn('Could not apply a queued WebRTC candidate', error) }
    }
  }, [])

  const ensureMedia = useCallback(async (mode: CallMode) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Your browser does not support microphone and camera access. Use a current browser on HTTPS.')
    }
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video' ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } : false,
    })
  }, [])

  const startCall = useCallback(async (mode: CallMode) => {
    if (!store || !meId || !active || active.type !== 'direct') return
    if (activeCallRef.current) {
      onToast('Finish your current call before starting another.')
      return
    }
    const calleeId = active.members.find(id => id !== meId) || ''
    if (!calleeId) return
    setCallError('')
    setCallStatus('Requesting microphone and camera…')
    let stream: MediaStream | null = null
    let createdCall: CallSession | null = null
    try {
      stream = await ensureMedia(mode)
      const id = makeId()
      const call: CallSession = {
        id,
        conversationId: active.id,
        callerId: meId,
        calleeId,
        mode,
        state: 'preparing',
        createdAt: Date.now(),
      }
      // Create the authorized signaling row before local ICE gathering begins.
      await store.set('calls/' + id, call)
      createdCall = call
      setCalls(current => [call, ...current.filter(c => c.id !== id)])
      setActiveCallId(id)
      const pc = createPeer(call, calleeId, stream)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const readyCall = { ...call, state: 'ringing' as const, offer: pc.localDescription || offer }
      await store.set('calls/' + id, readyCall)
      setCalls(current => [readyCall, ...current.filter(c => c.id !== id)])
      setCallStatus('Calling ' + nameFor(calleeId) + '…')
    } catch (error) {
      if (createdCall && store) {
        const abandoned = { ...createdCall, state: 'ended' as const, endedAt: Date.now() }
        setCalls(current => [abandoned, ...current.filter(c => c.id !== abandoned.id)])
        void store.set('calls/' + abandoned.id, abandoned).catch(syncError => console.warn('Could not close a failed call setup', syncError))
      }
      stream?.getTracks().forEach(track => track.stop())
      releaseMedia()
      setActiveCallId(null)
      const message = error instanceof Error ? error.message : String(error)
      setCallError(message)
      onToast(message)
    }
  }, [store, meId, active, ensureMedia, createPeer, releaseMedia, nameFor, onToast])

  const acceptCall = useCallback(async (call: CallSession) => {
    if (!store || !meId || call.calleeId !== meId || !call.offer) return
    setCallError('')
    setCallStatus('Requesting microphone and camera…')
    let stream: MediaStream | null = null
    try {
      stream = await ensureMedia(call.mode)
      setActiveCallId(call.id)
      const pc = createPeer(call, call.callerId, stream)
      await pc.setRemoteDescription(new RTCSessionDescription(call.offer))
      applyingDescription.current = true
      await flushCandidates()
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      const accepted = { ...call, state: 'accepted' as const, answer: pc.localDescription || answer, answeredAt: Date.now() }
      await store.set('calls/' + call.id, accepted)
      setCalls(current => [accepted, ...current.filter(c => c.id !== call.id)])
      setCallStatus('Connecting…')
    } catch (error) {
      const declined = { ...call, state: 'declined' as const, endedAt: Date.now() }
      setCalls(current => [declined, ...current.filter(c => c.id !== declined.id)])
      void store.set('calls/' + declined.id, declined).catch(syncError => console.warn('Could not decline an unaccepted call', syncError))
      stream?.getTracks().forEach(track => track.stop())
      releaseMedia()
      setActiveCallId(null)
      const message = error instanceof Error ? error.message : String(error)
      setCallError(message)
      onToast(message)
    }
  }, [store, meId, ensureMedia, createPeer, flushCandidates, releaseMedia, onToast])

  const updateCall = useCallback(async (call: CallSession, state: CallState) => {
    if (!store) return
    const next = { ...call, state, endedAt: Date.now() }
    setCalls(current => [next, ...current.filter(c => c.id !== call.id)])
    try { await store.set('calls/' + call.id, next) }
    catch (error) {
      console.warn('Could not update call state', error)
      setCallError('The call state could not sync. Apply the WebRTC calls migration.')
    }
  }, [store])

  const declineCall = useCallback(async (call: CallSession) => {
    await updateCall(call, 'declined')
    endedLocally.current.add(call.id)
    if (activeCallRef.current === call.id) setActiveCallId(null)
    releaseMedia()
    onToast('Call declined')
  }, [updateCall, releaseMedia, onToast])

  const hangUp = useCallback(async () => {
    const call = calls.find(c => c.id === activeCallRef.current)
    if (!call) { releaseMedia(); setActiveCallId(null); return }
    endedLocally.current.add(call.id)
    releaseMedia()
    setActiveCallId(null)
    await updateCall(call, 'ended')
    onToast('Call ended')
  }, [calls, releaseMedia, updateCall, onToast])

  // The caller applies the answer when it arrives; the callee already applied the offer.
  useEffect(() => {
    const call = activeCall
    const pc = peerRef.current
    if (!call || !pc || call.callerId !== meId || call.state !== 'accepted' || !call.answer || pc.remoteDescription || applyingDescription.current) return
    applyingDescription.current = true
    void pc.setRemoteDescription(new RTCSessionDescription(call.answer)).then(async () => {
      applyingDescription.current = false
      await flushCandidates()
      setPeerRevision(n => n + 1)
    }).catch(error => {
      applyingDescription.current = false
      console.warn('Could not apply the call answer', error)
      setCallError('The other person answered, but the connection could not be completed.')
    })
  }, [activeCall, meId, peerRevision, flushCandidates])

  // ICE candidates can beat the SDP message over realtime; queue them until a remote description exists.
  useEffect(() => {
    const call = activeCall
    if (!call) return
    const pc = peerRef.current
    for (const signal of signals) {
      if (signal.callId !== call.id || signal.toId !== meId || processedSignals.current.has(signal.id)) continue
      processedSignals.current.add(signal.id)
      if (!pc || !pc.remoteDescription) pendingCandidates.current.push(signal.candidate)
      else {
        void pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(error => console.warn('Could not apply a WebRTC candidate', error))
      }
    }
  }, [signals, activeCall, meId, peerRevision])

  useEffect(() => {
    const call = activeCall
    if (!call) return
    if (call.state === 'declined' || call.state === 'ended') {
      if (!endedLocally.current.has(call.id)) {
        releaseMedia()
        onToast(call.state === 'declined' ? 'The call was declined.' : 'The other person ended the call.')
      }
      endedLocally.current.delete(call.id)
      setActiveCallId(null)
      return
    }
  }, [activeCall, meId, releaseMedia, updateCall, onToast])

  useEffect(() => {
    const call = activeCall
    if (!call || call.callerId !== meId || call.state !== 'ringing') return
    const remaining = Math.max(0, 65000 - (Date.now() - call.createdAt))
    const timer = window.setTimeout(() => {
      endedLocally.current.add(call.id)
      releaseMedia()
      setActiveCallId(null)
      void updateCall(call, 'ended')
      onToast('No answer. Call ended.')
    }, remaining)
    return () => window.clearTimeout(timer)
  }, [activeCall, meId, releaseMedia, updateCall, onToast])

  useEffect(() => {
    if (localVideo.current) localVideo.current.srcObject = localStream
    if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream
  }, [localStream, remoteStream, activeCall?.mode])

  useEffect(() => () => releaseMedia(), [releaseMedia])

  const toggleMute = () => {
    const next = !muted
    localRef.current?.getAudioTracks().forEach(track => { track.enabled = !next })
    setMuted(next)
  }
  const toggleCamera = () => {
    const next = !cameraOff
    localRef.current?.getVideoTracks().forEach(track => { track.enabled = !next })
    setCameraOff(next)
  }

  const controls = active && active.type === 'direct' && active.members.some(id => id !== meId) ? (
    <div className="chat-call-actions" aria-label="Call actions">
      <button type="button" className="chat-call-trigger" aria-label="Start voice call" title="Voice call" onClick={() => void startCall('voice')} disabled={!store || !!activeCallId}>
        <Icon name="phone" size={17} /><span>Voice</span>
      </button>
      <button type="button" className="chat-call-trigger chat-call-video-trigger" aria-label="Start video call" title="Video call" onClick={() => void startCall('video')} disabled={!store || !!activeCallId}>
        <Icon name="video" size={17} /><span>Video</span>
      </button>
    </div>
  ) : null

  const overlay = activeCall && typeof document !== 'undefined' ? createPortal(
    <div className="q-call-veil" role="dialog" aria-modal="true" aria-label={activeCall.mode === 'video' ? 'Video call' : 'Voice call'}>
      <section className={'q-call-panel ' + (activeCall.mode === 'video' ? 'is-video' : 'is-voice')}>
        <header className="q-call-head">
          <div><span className="q-call-eyebrow">{activeCall.mode === 'video' ? 'QUORLYTH VIDEO' : 'QUORLYTH VOICE'}</span><h2>{nameFor(otherPartyId)}</h2></div>
          <span className={'q-call-state ' + (activeCall.state === 'accepted' ? 'is-live' : '')}><i />{activeCall.state === 'accepted' ? callStatus : activeCall.state === 'preparing' ? 'Preparing call' : activeCall.callerId === meId ? 'Calling…' : 'Incoming call'}</span>
        </header>
        {callError && <div className="q-call-error" role="alert">{callError}</div>}
        {activeCall.mode === 'video' ? (
          <div className="q-call-video-stage">
            <video ref={remoteVideo} className="q-call-remote-video" autoPlay playsInline />
            {!remoteStream && <div className="q-call-video-placeholder"><span className="q-call-avatar"><Icon name="member" size={35} /></span><b>{nameFor(otherPartyId)}</b><small>{activeCall.state === 'accepted' ? 'Waiting for video…' : 'Video call'}</small></div>}
            <video ref={localVideo} className="q-call-local-video" autoPlay playsInline muted />
          </div>
        ) : (
          <>
            <video ref={remoteVideo} className="q-call-audio-sink" autoPlay playsInline />
            <div className="q-call-voice-stage"><div className="q-call-avatar q-call-avatar-large"><Icon name="member" size={42} /></div><h3>{nameFor(otherPartyId)}</h3><p>{activeCall.state === 'accepted' ? callStatus : activeCall.callerId === meId ? 'Waiting for them to answer' : 'Would you like to answer?'}</p><div className="q-call-soundwave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div></div>
          </>
        )}
        {activeCall.state === 'ringing' && activeCall.calleeId === meId && (
          <div className="q-call-actions q-call-incoming-actions">
            <button type="button" className="q-call-accept" onClick={() => void acceptCall(activeCall)}><Icon name={activeCall.mode === 'video' ? 'video' : 'phone'} size={18} />Accept {activeCall.mode === 'video' ? 'video' : 'voice'} call</button>
            <button type="button" className="q-call-decline" onClick={() => void declineCall(activeCall)}><Icon name="phone-off" size={18} />Decline</button>
          </div>
        )}
        {(activeCall.callerId === meId || activeCall.state === 'accepted' || activeCall.state === 'preparing') && (
          <div className="q-call-actions">
            {activeCall.state === 'accepted' && <button type="button" className={'q-call-control ' + (muted ? 'is-on' : '')} onClick={toggleMute} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} title={muted ? 'Unmute' : 'Mute'}><Icon name={muted ? 'mic-off' : 'mic'} size={18} /><span>{muted ? 'Unmute' : 'Mute'}</span></button>}
            {activeCall.state === 'accepted' && activeCall.mode === 'video' && <button type="button" className={'q-call-control ' + (cameraOff ? 'is-on' : '')} onClick={toggleCamera} aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} title={cameraOff ? 'Turn camera on' : 'Turn camera off'}><Icon name={cameraOff ? 'camera-off' : 'video'} size={18} /><span>{cameraOff ? 'Camera on' : 'Camera off'}</span></button>}
            <button type="button" className="q-call-hangup" onClick={() => void hangUp()}><Icon name="phone-off" size={18} />{activeCall.calleeId === meId && activeCall.state === 'ringing' ? 'Cancel call' : 'End call'}</button>
          </div>
        )}
      </section>
    </div>,
    document.body
  ) : null

  return { controls, overlay }
}
