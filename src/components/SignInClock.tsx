import { useEffect, useRef, useState } from 'react'

type LocalTime = { hour: string; minute: string; second: string; period: string; full: string; hourAngle: number; minuteAngle: number; secondAngle: number }

function readLocalTime(): LocalTime {
  const now = new Date()
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
  }).formatToParts(now)
  const value = (type: string) => parts.find(part => part.type === type)?.value || ''
  const hour = value('hour')
  const minute = value('minute')
  const second = value('second')
  const period = value('dayPeriod')
  const seconds = now.getSeconds() + now.getMilliseconds() / 1000
  const minutes = now.getMinutes()
  const hours = now.getHours() % 12
  return {
    hour, minute, second, period,
    full: [hour + ':' + minute + ':' + second, period].filter(Boolean).join(' '),
    hourAngle: -((hours + minutes / 60 + seconds / 3600) * Math.PI / 6),
    minuteAngle: -((minutes + seconds / 60) * Math.PI / 30),
    secondAngle: -(seconds * Math.PI / 30),
  }
}

/** A compact live chronograph with a Three.js dial and digital local time. */
export function SignInClock() {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [time, setTime] = useState<LocalTime>(() => readLocalTime())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const update = () => setTime(readLocalTime())
    update()
    const interval = window.setInterval(update, 1000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const element = host.current
    const surface = canvas.current
    if (!element || !surface) return
    let cancelled = false
    let requested = false
    let dispose: (() => void) | undefined
    let idleHandle: number | null = null
    let fallbackTimer: number | null = null
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
      cancelIdleCallback?: (handle: number) => void
    }

    const mount = async () => {
      if (requested || cancelled) return
      requested = true
      try {
        const { mountSignInClock } = await import('./signinClockScene')
        if (cancelled) return
        dispose = mountSignInClock(surface, element)
        setReady(true)
      } catch {
        // The CSS clock face and digital time remain available without WebGL.
      }
    }
    const scheduleMount = () => {
      if (requested || cancelled) return
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleHandle = idleWindow.requestIdleCallback(() => { void mount() }, { timeout: 1200 })
      } else {
        fallbackTimer = window.setTimeout(() => { void mount() }, 180)
      }
    }
    const cancelScheduledMount = () => {
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle)
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
      idleHandle = null
      fallbackTimer = null
    }

    if (typeof IntersectionObserver === 'undefined') scheduleMount()
    else {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect()
          scheduleMount()
        }
      }, { rootMargin: '100px 0px' })
      observer.observe(element)
      return () => {
        cancelled = true
        observer.disconnect()
        cancelScheduledMount()
        dispose?.()
      }
    }
    return () => {
      cancelled = true
      cancelScheduledMount()
      dispose?.()
    }
  }, [])

  return (
    <aside ref={host} className={'q-signin-clock' + (ready ? ' is-ready' : '')} aria-label={'Current local time ' + time.full}>
      <div className="q-signin-clock__dial" aria-hidden="true">
        <div className="q-signin-clock__fallback">
          <i className="q-signin-clock__fallback-hour" style={{ transform: 'translateX(-50%) rotate(' + time.hourAngle + 'rad)' }} />
          <i className="q-signin-clock__fallback-minute" style={{ transform: 'translateX(-50%) rotate(' + time.minuteAngle + 'rad)' }} />
          <i className="q-signin-clock__fallback-second" style={{ transform: 'translateX(-50%) rotate(' + time.secondAngle + 'rad)' }} />
          <b />
        </div>
        <canvas ref={canvas} className="q-signin-clock__canvas" />
      </div>
      <div className="q-signin-clock__readout" aria-live="off">
        <span className="q-signin-clock__main">{time.hour}:{time.minute}</span>
        <span className="q-signin-clock__sub">{time.second} <i>{time.period}</i></span>
      </div>
    </aside>
  )
}
