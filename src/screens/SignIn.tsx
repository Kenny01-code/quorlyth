import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Icon, GoogleG } from '../lib/Icon'
import { Logo } from '../lib/Logo'
import { useApp } from '../data/AppProvider'
import { Robot, RobotApi } from '../bot/Robot'
import { speakText, type SpeechPlayback } from '../ai/client'
import { useRef } from 'react'
import '../styles/signin-performance.css'
import '../styles/signin-luxury.css'
import '../styles/signin-live-map.css'

function signinWelcomeKey(identity?: string) {
  const value = (identity || '').trim().toLowerCase()
  if (!value) return ''
  // Hash the identifier so an email address is never written into a storage key.
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  }
  return 'quorlyth:signin-welcomed:v2:' + (hash >>> 0).toString(36)
}

function hasSigninWelcome(identity?: string) {
  try {
    const key = signinWelcomeKey(identity)
    return key ? localStorage.getItem(key) === '1' : localStorage.getItem('qseen') === '1'
  } catch { return false }
}

function markSigninWelcome(identity?: string) {
  try {
    const key = signinWelcomeKey(identity)
    if (key) localStorage.setItem(key, '1')
    localStorage.setItem('qseen', '1')
  } catch { /* Welcome speech must still work when browser storage is disabled. */ }
}

function friendlyAuthError(error: unknown, fallback: string) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'You are offline. Reconnect to the internet and try again. Your form entries are still here.'
  }
  const message = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message || '')
    : typeof error === 'string' ? error : ''
  if (/failed to fetch|networkerror|network request failed|load failed|timeout|connection.*lost/i.test(message)) {
    return 'Quorlyth could not reach the sign-in service. Check your Wi-Fi or mobile data, then try again.'
  }
  return message || fallback
}

const SIGNIN_MAP_ZOOM = 15
const SIGNIN_MAP_TILE_SIZE = 256
const SIGNIN_ZONE_CENTRES: Record<string, [number, number]> = {
  'Africa/Lagos': [6.5244, 3.3792],
  'Africa/Accra': [5.6037, -0.1870],
  'Africa/Nairobi': [-1.2921, 36.8219],
  'Africa/Johannesburg': [-26.2041, 28.0473],
  'Europe/Paris': [48.8566, 2.3522],
  'Europe/London': [51.5072, -0.1276],
  'Europe/Berlin': [52.5200, 13.4050],
  'Europe/Madrid': [40.4168, -3.7038],
  'America/New_York': [40.7128, -74.0060],
  'America/Chicago': [41.8781, -87.6298],
  'America/Los_Angeles': [34.0522, -118.2437],
  'America/Toronto': [43.6532, -79.3832],
  'America/Sao_Paulo': [-23.5505, -46.6333],
  'Asia/Dubai': [25.2048, 55.2708],
  'Asia/Kolkata': [19.0760, 72.8777],
  'Asia/Singapore': [1.3521, 103.8198],
  'Asia/Tokyo': [35.6762, 139.6503],
  'Australia/Sydney': [-33.8688, 151.2093],
}

type SignInGeoPoint = {
  latitude: number
  longitude: number
  accuracy: number
  timestamp: number
}

function getSigninMapTiles(latitude: number, longitude: number) {
  const zoom = SIGNIN_MAP_ZOOM
  const scale = Math.pow(2, zoom)
  const safeLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude))
  const radians = safeLatitude * Math.PI / 180
  const x = ((longitude + 180) / 360) * scale
  const y = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * scale
  const centreX = Math.floor(x)
  const centreY = Math.floor(y)
  const fractionX = x - centreX
  const fractionY = y - centreY

  return [-1, 0, 1].flatMap(row => [-1, 0, 1].map(column => {
    const rawX = centreX + column
    const tileY = centreY + row
    if (tileY < 0 || tileY >= scale) return null
    const tileX = ((rawX % scale) + scale) % scale
    return {
      key: zoom + '-' + tileX + '-' + tileY,
      src: 'https://tile.openstreetmap.org/' + zoom + '/' + tileX + '/' + tileY + '.png',
      left: 'calc(50% + ' + ((column - fractionX) * SIGNIN_MAP_TILE_SIZE).toFixed(2) + 'px)',
      top: 'calc(50% + ' + ((row - fractionY) * SIGNIN_MAP_TILE_SIZE).toFixed(2) + 'px)',
    }
  })).filter((tile): tile is NonNullable<typeof tile> => tile !== null)
}

function LocalContextPreview() {
  const [now, setNow] = useState(() => Date.now())
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine)
  const [geoPoint, setGeoPoint] = useState<SignInGeoPoint | null>(null)
  const [geoState, setGeoState] = useState<'preview' | 'requesting' | 'live' | 'error'>('preview')
  const [geoError, setGeoError] = useState('')
  const geoWatch = useRef<number | null>(null)
  const zone = (() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Device time zone' }
    catch { return 'Device time zone' }
  })()
  const zoneParts = zone.split('/')
  const fallbackPlace = (zoneParts[zoneParts.length - 1] || 'Local region').replace(/_/g, ' ')
  const place = zone === 'Africa/Lagos' ? 'Lagos' : fallbackPlace
  const area = zone === 'Africa/Lagos' ? 'Nigeria' : (zoneParts[0] || 'Device').replace(/_/g, ' ')
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now)
  const date = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(now)
  const approximateCentre = SIGNIN_ZONE_CENTRES[zone] || [0, 0]
  const mapLatitude = geoPoint?.latitude ?? approximateCentre[0]
  const mapLongitude = geoPoint?.longitude ?? approximateCentre[1]
  const tiles = getSigninMapTiles(mapLatitude, mapLongitude)
  const pointAge = geoPoint ? Math.max(0, Math.floor((now - geoPoint.timestamp) / 1000)) : 0
  const updatedLabel = pointAge < 5 ? 'JUST NOW' : pointAge < 60 ? pointAge + 'S AGO' : Math.floor(pointAge / 60) + 'M AGO'

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000)
    const sync = () => setOnline(navigator.onLine)
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
    return () => {
      window.clearInterval(tick)
      window.removeEventListener('online', sync)
      window.removeEventListener('offline', sync)
      if (geoWatch.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatch.current)
        geoWatch.current = null
      }
    }
  }, [])

  function stopLiveLocation() {
    if (geoWatch.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatch.current)
      geoWatch.current = null
    }
    setGeoPoint(null)
    setGeoError('')
    setGeoState('preview')
  }

  function startLiveLocation() {
    if (geoState === 'live') {
      stopLiveLocation()
      return
    }
    if (!window.isSecureContext || !navigator.geolocation) {
      setGeoState('error')
      setGeoError('Live location needs a secure connection and a supported browser.')
      return
    }
    if (geoWatch.current !== null) navigator.geolocation.clearWatch(geoWatch.current)
    setGeoPoint(null)
    setGeoError('')
    setGeoState('requesting')
    geoWatch.current = navigator.geolocation.watchPosition(
      position => {
        setGeoPoint({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp || Date.now(),
        })
        setGeoState('live')
        setGeoError('')
      },
      error => {
        if (geoWatch.current !== null) {
          navigator.geolocation.clearWatch(geoWatch.current)
          geoWatch.current = null
        }
        setGeoState('error')
        setGeoError(error.code === 1
          ? 'Location access was declined. Allow it in your browser settings, then retry.'
          : error.code === 2
            ? 'Your device could not find a location. Check GPS or Wi-Fi and retry.'
            : 'Location took too long. Try again when your signal is stronger.')
      },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    )
  }

  const coordinateLabel = geoPoint
    ? Math.abs(geoPoint.latitude).toFixed(3) + '° ' + (geoPoint.latitude >= 0 ? 'N' : 'S') +
      '  ·  ' + Math.abs(geoPoint.longitude).toFixed(3) + '° ' + (geoPoint.longitude >= 0 ? 'E' : 'W')
    : area + ' · ' + date

  return (
    <aside className={'q-signin-live-context' + (geoPoint ? ' is-live' : '') + (geoState === 'error' ? ' has-error' : '')} aria-label="Live map and local device context">
      <div className="q-signin-context-copy">
        <span className="q-signin-context-kicker">{geoPoint ? 'LIVE LOCATION' : 'REGIONAL MAP PREVIEW'}</span>
        <strong>{geoPoint ? 'You are here' : place}</strong>
        <span className="q-signin-context-time">{time}</span>
        <small>{coordinateLabel}</small>
      </div>
      <div className={'q-signin-map-viewport' + (geoPoint ? ' is-tracking' : '')} role="img" aria-label={geoPoint ? 'Live street map following your device location' : 'Street map preview around ' + place}>
        <div className="q-signin-map-tiles">
          {tiles.map(tile => (
            <img
              key={tile.key}
              className="q-signin-map-tile"
              src={tile.src}
              alt=""
              aria-hidden="true"
              draggable={false}
              loading="lazy"
              decoding="async"
              style={{ left: tile.left, top: tile.top }}
            />
          ))}
        </div>
        <div className="q-signin-map-tint" />
        <div className="q-signin-map-grid" />
        <span className={'q-signin-map-marker' + (geoPoint ? ' is-live' : ' is-preview')}><i /></span>
        <span className="q-signin-map-heading">N</span>
        <a className="q-signin-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
      </div>
      <div className="q-signin-context-status">
        <i className={geoPoint ? 'is-online' : geoState === 'error' ? 'is-offline' : 'is-preview'} />
        <span>{geoPoint ? 'TRACKING LIVE' : geoState === 'requesting' ? 'FINDING DEVICE' : geoState === 'error' ? 'LOCATION BLOCKED' : 'CITY PREVIEW'}</span>
        <small>{geoPoint ? '±' + Math.round(geoPoint.accuracy) + ' M · ' + updatedLabel : online ? 'GPS NOT SHARED' : 'NETWORK OFFLINE'}</small>
      </div>
      <button className="q-signin-map-action" type="button" onClick={startLiveLocation} disabled={geoState === 'requesting'}>
        <span className="q-signin-map-action-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16"><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M8 4.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z" /></svg>
        </span>
        {geoState === 'requesting' ? 'Locating device…' : geoPoint ? 'Stop live location' : geoState === 'error' ? 'Try location again' : 'Enable live location'}
      </button>
      {geoError && <p className="q-signin-context-error" role="status">{geoError}</p>}
      <p className="q-signin-context-foot">{geoPoint
        ? 'Updates while this screen is open. Your location is not saved to Quorlyth.'
        : 'Region is estimated from your device time zone. No GPS location is accessed. Enable live location to opt in.'}</p>
    </aside>
  )
}
function Stage({
  greeting,
  returningGreeting,
  accountKey,
  firstTimeOverride,
  autoSpeak = false,
}: {
  greeting: string
  returningGreeting?: string
  accountKey?: string
  firstTimeOverride?: boolean
  autoSpeak?: boolean
}) {
  const r = useRef<RobotApi | null>(null)
  const { toast } = useApp()
  const [first, setFirst] = useState(() => {
    const seen = hasSigninWelcome(accountKey)
    return !seen && (firstTimeOverride ?? true)
  })
  useEffect(() => {
    const seen = hasSigninWelcome(accountKey)
    setFirst(!seen && (firstTimeOverride ?? true))
  }, [accountKey, firstTimeOverride])
  const activeGreeting = first ? greeting : (returningGreeting || greeting)
  const [helloState, setHelloState] = useState<'idle' | 'loading' | 'playing' | 'error'>('idle')
  const [helloStatus, setHelloStatus] = useState('')
  const helloController = useRef<AbortController | null>(null)
  const helloPlayback = useRef<SpeechPlayback | null>(null)
  const helloStartTimer = useRef<number | null>(null)
  const helloAutoStartTimer = useRef<number | null>(null)
  const autoHelloStarted = useRef(false)
  const helloRun = useRef(0)

  function preferredVoice() {
    try {
      const saved = localStorage.getItem('quorlyth:welcome-voice') || 'shimmer'
      return ['marin', 'sage', 'shimmer', 'cedar', 'echo', 'ballad', 'coral', 'alloy', 'ash', 'nova', 'onyx', 'fable', 'verse'].includes(saved)
        ? saved
        : 'shimmer'
    } catch { return 'shimmer' }
  }

  function preferredAccent() {
    try {
      const saved = localStorage.getItem('quorlyth:welcome-accent') || 'auto'
      return ['auto', 'nigerian', 'american', 'british', 'international'].includes(saved) ? saved as any : 'auto'
    } catch { return 'auto' }
  }

  function clearHelloTimer() {
    if (helloStartTimer.current !== null) {
      window.clearTimeout(helloStartTimer.current)
      helloStartTimer.current = null
    }
  }

  function stopHello() {
    helloRun.current += 1
    clearHelloTimer()
    helloController.current?.abort()
    helloController.current = null
    helloPlayback.current?.stop()
    helloPlayback.current = null
    r.current?.talk(false)
    setHelloState('idle')
    setHelloStatus('Voice preview stopped.')
  }

  async function hello(automatic = false) {
    autoHelloStarted.current = true
    if (helloAutoStartTimer.current !== null) { window.clearTimeout(helloAutoStartTimer.current); helloAutoStartTimer.current = null }
    clearHelloTimer()
    helloController.current?.abort()
    helloController.current = null
    helloPlayback.current?.stop()
    helloPlayback.current = null
    const run = ++helloRun.current
    const controller = new AbortController()
    helloController.current = controller
    let usedBrowserFallback = false
    let didStart = false
    let failureReported = false
    const reportFailure = (message: string, quiet = automatic) => {
      if (run !== helloRun.current || controller.signal.aborted || failureReported) return
      failureReported = true
      clearHelloTimer()
      controller.abort()
      helloPlayback.current?.stop()
      helloPlayback.current = null
      r.current?.talk(false)
      setHelloState('error')
      setHelloStatus(message)
      if (!quiet) toast(message)
    }

    setHelloState('loading')
    setHelloStatus(navigator.onLine
      ? 'Preparing QuorlythBot’s voice…'
      : 'You are offline. Trying your device voice…')
    r.current?.welcome()
    // Start the hard deadline before any provider request so a stuck buffered retry cannot leave the control loading forever.
    helloStartTimer.current = window.setTimeout(() => {
      if (run === helloRun.current && !failureReported) {
        reportFailure(!navigator.onLine
          ? 'You are offline. Reconnect to sign in. You can still retry the greeting with your device voice.'
          : automatic
            ? 'The greeting did not start automatically. Tap Hear a hello to try again.'
            : 'Voice playback timed out before audio started. Tap Hear a hello to retry, and check your device audio.')
      }
    }, 10_000)
    try {
      const playback = await speakText(
        activeGreeting,
        preferredVoice(),
        () => {
          if (run !== helloRun.current || controller.signal.aborted || failureReported) return
          didStart = true
          clearHelloTimer()
          r.current?.talk(true)
          setHelloState('playing')
          setHelloStatus(usedBrowserFallback ? 'Speaking with your device voice.' : 'QuorlythBot is speaking.')
          markSigninWelcome(accountKey)
        },
        () => {
          if (run !== helloRun.current || failureReported) return
          clearHelloTimer()
          helloPlayback.current = null
          r.current?.talk(false)
          setHelloState('idle')
          setHelloStatus('Voice preview finished.')
        },
        {
          accent: preferredAccent(),
          signal: controller.signal,
          // ElevenLabs remains preferred, but configured cloud and device fallbacks stay enabled.
          elevenLabsOnly: false,
          allowBrowserFallback: true,
          browserFallbackTimeoutMs: 1800,
          preferElevenLabsVoice: true,
          liveTalk: false,
          onBrowserFallback: () => {
            usedBrowserFallback = true
            if (run === helloRun.current) setHelloStatus(navigator.onLine
              ? 'Switching to your device voice…'
              : 'Offline. Speaking with your device voice…')
          },
          onPlaybackError: error => {
            const blocked = error?.name === 'NotAllowedError' || /not allowed|user gesture|user activation/i.test(error?.message || '')
            const message = !navigator.onLine
              ? 'You are offline. Reconnect to sign in. You can still retry the greeting with your device voice.'
              : automatic
                ? blocked
                  ? 'Your browser blocked automatic audio. Tap Hear a hello to start the greeting.'
                  : 'QuorlythBot could not start audio automatically. Tap Hear a hello to try again.'
                : error?.message || 'Your device could not start voice playback. Check its audio output and try again.'
            reportFailure(message, automatic)
          },
        },
      )
      if (run !== helloRun.current || controller.signal.aborted || failureReported) {
        playback.stop()
        return
      }
      helloPlayback.current = playback
      if (!didStart) setHelloStatus('Waiting for audio…')
    } catch (error) {
      if (run !== helloRun.current || controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) return
      const blocked = error instanceof Error && (error.name === 'NotAllowedError' || /not allowed|user gesture|user activation/i.test(error.message))
      const message = !navigator.onLine
        ? 'You are offline. Reconnect to sign in. You can still try the greeting with your device voice.'
        : automatic
          ? blocked
            ? 'Your browser blocked automatic audio. Tap Hear a hello to start the greeting.'
            : 'QuorlythBot could not start audio automatically. Tap Hear a hello to try again.'
          : error instanceof Error ? error.message : 'Natural voice playback is unavailable on this device.'
      reportFailure(message, automatic)
    } finally {
      if (helloController.current === controller) helloController.current = null
    }
  }

  // The sign-in form attempts its welcome once after the robot is ready. Browsers
  // may block audible autoplay; the visible control then becomes the one-tap fallback.
  useEffect(() => () => {
    helloRun.current += 1
    if (helloAutoStartTimer.current !== null) window.clearTimeout(helloAutoStartTimer.current)
    helloAutoStartTimer.current = null
    clearHelloTimer()
    helloController.current?.abort()
    helloController.current = null
    helloPlayback.current?.stop()
    helloPlayback.current = null
    r.current?.talk(false)
  }, [])

  return (
    <div className="glass stage ok" id="stg">
      <Robot ref={r} defer theme="burnished" onReady={() => {
        if (autoSpeak) {
          if (autoHelloStarted.current) return
          helloAutoStartTimer.current = window.setTimeout(() => {
            helloAutoStartTimer.current = null
            if (!autoHelloStarted.current) void hello(true)
          }, 350)
          return
        }
        window.setTimeout(() => (first ? r.current?.welcome() : r.current?.wave()), 400)
      }} />
      <div className="c1 glass"><span className="chip"><Icon name="private" size={12} />Private session</span></div>
      <LocalContextPreview />
      <button
        type="button"
        className="chip hello"
        disabled={helloState === 'loading'}
        aria-label={helloState === 'playing' ? 'Stop voice preview' : helloState === 'loading' ? 'Starting voice preview' : helloState === 'error' ? 'Tap to hear hello' : 'Hear a hello'}
        onClick={() => helloState === 'playing' ? stopHello() : void hello()}
      >
        <Icon name="voice" size={14} />
        {helloState === 'loading' ? 'Starting voice…' : helloState === 'playing' ? 'Stop hello' : helloState === 'error' ? 'Tap to hear hello' : 'Hear a hello'}
      </button>
      {helloStatus && <p className={helloState === 'error' ? 'q-signin-hello-status is-error' : 'q-signin-hello-status'} role="status" aria-live="polite">{helloStatus}</p>}
      <div className="cap"><p className="dim">QuorlythBot</p><h3 style={{ fontSize: 22, fontWeight: 200, marginTop: 4 }}>{first ? 'Your room is ready.' : 'Good to have you back.'}</h3></div>
    </div>
  )
}
export function SignIn() {
  const { backend, me, toast, enterDemo, signOut } = useApp()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const requested = params.get('next') || ''
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard'
  const [email, setEmail] = useState(() => {
    try {
      return params.get('email')?.trim() || (
        params.get('recovery') === '1' && params.get('otp') === '1'
          ? sessionStorage.getItem('quorlyth:recovery-email') || ''
          : ''
      )
    } catch { return '' }
  })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset' | 'otp' | 'recovery'>(() => {
    if (params.get('recovery') === '1') return params.get('otp') === '1' ? 'otp' : 'recovery'
    return params.get('mode') === 'signup' ? 'signup' : 'signin'
  })
  const [resetMethod, setResetMethod] = useState<'link' | 'otp'>('otp')
  const [otp, setOtp] = useState('')
  const [notice, setNotice] = useState<'verify' | 'reset' | ''>('')
  const [showPassword, setShowPassword] = useState(false)
  const local = backend?.auth.mode === 'local'
  const dest = () => {
    const target = sessionStorage.getItem('qreturn') || next
    sessionStorage.removeItem('qreturn')
    return target.startsWith('/') && !target.startsWith('//') ? target : '/dashboard'
  }
  const authRedirectUrl = () => new URL('/signin?next=' + encodeURIComponent(next), window.location.origin).toString()

  useEffect(() => {
    if (requested) sessionStorage.setItem('qreturn', next)
    if (me && mode !== 'recovery' && mode !== 'otp') {
      const dest = sessionStorage.getItem('qreturn')
      if (dest) {
        sessionStorage.removeItem('qreturn')
        nav(dest, { replace: true })
      }
    }
  }, [requested, next, me?.id, mode, nav])

  if (me && mode !== 'recovery' && mode !== 'otp') {
    return (
      <div className="lg"><Stage
        accountKey={me.email}
        firstTimeOverride={!!me.createdAt && Date.now() - me.createdAt < 24 * 60 * 60 * 1000}
        greeting={`Welcome to your new Quorlyth space, ${me.name.split(' ')[0]}.`}
        returningGreeting={`Welcome back, ${me.name.split(' ')[0]}. Your Quorlyth space is ready.`}
        autoSpeak
      />
        <div className="glass fm"><h2 style={{ fontSize: 40 }}>Welcome back, {me.name.split(' ')[0]}.</h2>
          <div className="acts"><button className="btn p" onClick={() => nav('/dashboard')}><Icon name="home" />Open dashboard</button>
            <button className="btn" disabled={busy} onClick={async () => { setBusy(true); try { await signOut(); sessionStorage.removeItem('qreturn'); nav('/signin', { replace: true }); toast('Signed out. You can sign in again below.') } catch (error: any) { toast(error?.message || 'Could not sign out. Please try again.') } finally { setBusy(false) } }}>{busy ? 'Signing out…' : 'Sign out'}</button></div></div></div>
    )
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (mode !== 'recovery' && !/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email address')
    if (mode === 'otp' && !/^\d{6}$/.test(otp.trim())) return toast('Enter the 6-digit code from your email')
    setBusy(true)
    try {
      if (mode === 'reset') {
        await backend!.auth.resetPassword(email.trim())
        if (resetMethod === 'otp') {
          try { sessionStorage.setItem('quorlyth:recovery-email', email.trim()) } catch {}
          setOtp('')
          setMode('otp')
          nav('/signin?recovery=1&otp=1', { replace: true })
          toast('Check your inbox for the 6-digit recovery code.')
        } else {
          setNotice('reset')
        }
      } else if (mode === 'otp') {
        await backend!.auth.verifyRecoveryOtp(email.trim(), otp.trim())
        setOtp('')
        setPassword('')
        setConfirm('')
        setMode('recovery')
        nav('/signin?recovery=1', { replace: true })
        toast('Code verified. Choose a new password.')
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
        if (password !== confirm) throw new Error('Those passwords do not match.')
        const r = await backend!.auth.signUpEmail(email.trim(), password, authRedirectUrl())
        if (r.sentLink) setNotice('verify')
        else nav(dest(), { replace: true })
      } else if (mode === 'recovery') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
        if (password !== confirm) throw new Error('Those passwords do not match.')
        await backend!.auth.updatePassword(password)
        toast('Password updated')
        setMode('signin')
        setPassword('')
        setConfirm('')
        try { sessionStorage.removeItem('quorlyth:recovery-email') } catch {}
        nav(dest(), { replace: true })
      } else {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.')
        await backend!.auth.signInEmail(email.trim(), password)
        nav(dest(), { replace: true })
      }
    } catch (er: any) {
      toast(friendlyAuthError(er, mode === 'otp' ? 'Could not verify recovery code' : 'Could not complete authentication'))
    } finally {
      setBusy(false)
    }
  }
  async function resendRecoveryCode() {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return toast('Enter the email address you used for your account')
    setBusy(true)
    try {
      await backend!.auth.resetPassword(email.trim())
      setOtp('')
      toast('If an account uses this email, a fresh recovery code will arrive shortly.')
    } catch (er: any) {
      toast(friendlyAuthError(er, 'Could not request another code. Please wait a moment and try again.'))
    } finally {
      setBusy(false)
    }
  }
  async function google() {
    try { await backend!.auth.signInGoogle(authRedirectUrl()) } catch (er: any) { toast(friendlyAuthError(er, 'Google sign in is not set up')) }
  }
  async function copyPageLink() {
    try { await navigator.clipboard.writeText(window.location.href); toast('Page link copied') }
    catch { toast('Could not copy the page link') }
  }
  async function continueAfterEmail() {
    try {
      const current = await backend!.auth.current()
      if (!current) return toast('Sign in or verify your email first')
      window.location.assign(dest())
    } catch (er: any) { toast(friendlyAuthError(er, 'Could not check your sign-in')) }
  }

  return (
    <div className="lg">
      <Stage
        accountKey={email.trim().toLowerCase()}
        firstTimeOverride={mode === 'signup'}
        greeting="Welcome to Quorlyth. I’m your community copilot. I can help you find your way around, surface promising ideas, and keep collaborations moving."
        returningGreeting="Hello. I’m QuorlythBot. I can help you catch up on what has changed and pick up where you left off."
        autoSpeak={mode === 'signin'}
      />
      <div className="glass fm">
        {notice ? (
          <div className="done"><div className="score"><Icon name="mail" size={30} /></div>
            <h2>{notice === 'verify' ? 'Check your inbox.' : 'Check your inbox.'}</h2>
            <p className="mut" style={{ marginTop: 12 }}>{notice === 'verify' ? `We sent a verification link to ${email}.` : `We sent password reset instructions to ${email}.`}</p>
            {notice === 'verify' && <button className="btn p" style={{ marginTop: 24 }} onClick={continueAfterEmail}>I have signed in</button>}
            {notice === 'reset' && <button className="btn p" style={{ marginTop: 24 }} onClick={() => { setNotice(''); setMode('signin') }}>Return to sign in</button>}
            <button className="btn" style={{ marginTop: 12 }} onClick={copyPageLink}>Copy page link</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <h2 style={{ fontSize: 40 }}>{mode === 'signup' ? 'Create your account.' : mode === 'reset' ? 'Reset password.' : mode === 'otp' ? 'Enter your recovery code.' : mode === 'recovery' ? 'Choose a new password.' : 'Welcome.'}</h2>
            <p className="mut" style={{ marginTop: 10 }}>{mode === 'signup' ? 'Use your email to join the space.' : mode === 'reset' ? 'Choose how you want to recover your account.' : mode === 'otp' ? 'Enter the 6-digit code from the password recovery email.' : mode === 'recovery' ? 'Choose a new password for your account.' : 'Sign in to enter your space.'}</p>
            {mode === 'signin' && <button type="button" className="btn wide" style={{ marginTop: 22 }} onClick={() => { enterDemo(); nav('/dashboard') }}><Icon name="spark" size={16} />Explore Demo Space</button>}
            {(mode === 'signin' || mode === 'signup') && <>
              <button type="button" className="btn p wide" style={{ marginTop: 24 }} onClick={google}><GoogleG />Continue with Google</button>
              <div className="dv">or with email</div>
            </>}
            {mode === 'reset' && <div className="field">
              <span>Recovery method</span>
              <div className="acts" style={{ margin: 0, gap: 8 }}>
                <button type="button" className={resetMethod === 'link' ? 'btn p' : 'btn'} onClick={() => setResetMethod('link')} aria-pressed={resetMethod === 'link'}><Icon name="link" size={15} />Email link</button>
                <button type="button" className={resetMethod === 'otp' ? 'btn p' : 'btn'} onClick={() => setResetMethod('otp')} aria-pressed={resetMethod === 'otp'}><Icon name="key-round" size={15} />OTP code</button>
              </div>
            </div>}
            {mode !== 'recovery' && <label className="field"><span>Email</span>
              <div className="iw"><Icon name="mail" /><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@studio.com" autoComplete="email" required /></div></label>}
            {mode === 'otp' && <label className="field"><span>6-digit recovery code</span>
              <div className="iw"><Icon name="key-round" /><input type="text" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></div>
            </label>}
            {mode !== 'reset' && mode !== 'otp' && <label className="field"><span>{mode === 'recovery' ? 'New password' : 'Password'}</span>
              <div className="iw"><Icon name="private" /><input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={mode === 'signin' ? 'Your password' : 'At least 8 characters'} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} minLength={8} required /><button type="button" className="eye" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} title={showPassword ? 'Hide password' : 'Show password'}><Icon name="eye" size={16} /></button></div></label>}
            {(mode === 'signup' || mode === 'recovery') && <label className="field"><span>Confirm password</span>
              <div className="iw"><Icon name="private" /><input type={showPassword ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Enter it again" autoComplete="new-password" minLength={8} required /></div></label>}
            <button className="btn wide" disabled={busy}>{busy ? 'Please wait...' : mode === 'signup' ? 'Create account' : mode === 'reset' ? (resetMethod === 'otp' ? 'Send OTP code' : 'Send reset link') : mode === 'otp' ? 'Verify code' : mode === 'recovery' ? 'Save new password' : 'Sign in'}</button>
            {local && <p className="dim" style={{ marginTop: 14, fontSize: 12 }}>Demo accounts are stored in this browser. Configure Supabase for shared accounts and Google sign-in.</p>}
            <div className="acts" style={{ justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
              {mode === 'signin' && <><button type="button" className="chip" onClick={() => { setMode('signup'); setNotice('') }}>Create account</button>{!local && <button type="button" className="chip" onClick={() => setMode('reset')}>Forgot password?</button>}<button type="button" className="chip" onClick={continueAfterEmail}>I have signed in</button></>}
              {mode === 'signup' && <button type="button" className="chip" onClick={() => setMode('signin')}>Already have an account? Sign in</button>}
              {mode === 'otp' && <button type="button" className="chip" disabled={busy} onClick={() => void resendRecoveryCode()}>Resend code</button>}
              {(mode === 'reset' || mode === 'otp' || mode === 'recovery') && <button type="button" className="chip" onClick={() => { setMode('signin'); setPassword(''); setConfirm(''); setOtp(''); setNotice(''); try { sessionStorage.removeItem('quorlyth:recovery-email') } catch {}; nav('/signin', { replace: true }) }}>Back to sign in</button>}
              <button type="button" className="chip" onClick={copyPageLink}>Copy page link</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
