import { useEffect, useRef, useState } from 'react'

/** Lazily mounts the tiny 3D region globe only when the sign-in panel is visible. */
export function SignInGlobe() {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

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
        const { mountSignInGlobe } = await import('./signinGlobeScene')
        if (cancelled) return
        dispose = mountSignInGlobe(surface, element)
        setReady(true)
      } catch {
        // The CSS globe fallback remains visible if WebGL is unavailable.
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

    if (typeof IntersectionObserver === 'undefined') {
      scheduleMount()
    } else {
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
    <div
      ref={host}
      className={'q-signin-mini-map q-signin-globe' + (ready ? ' is-ready' : '')}
      role="img"
      aria-label="A rotating three-dimensional globe highlighting Nigeria and Africa"
    >
      <div className="q-signin-globe__fallback" aria-hidden="true" />
      <canvas ref={canvas} className="q-signin-globe__canvas" aria-hidden="true" />
      <span className="q-signin-globe__orbit" aria-hidden="true" />
    </div>
  )
}
