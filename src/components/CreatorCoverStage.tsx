import { useEffect, useRef, useState } from 'react'

/**
 * Lightweight, lazy-mounted cover stage. The Three.js scene is requested only
 * when the hero approaches the viewport, and its render loop pauses off-screen.
 */
export function CreatorCoverStage() {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const element = host.current
    const surface = canvas.current
    if (!element || !surface) return

    let cancelled = false
    let dispose: (() => void) | undefined
    let requested = false
    let idleHandle: number | null = null
    let fallbackTimer: number | null = null
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: (deadline: { didTimeout: boolean; timeRemaining: () => number }) => void,
        options?: { timeout: number },
      ) => number
      cancelIdleCallback?: (handle: number) => void
    }

    const scheduleMount = () => {
      if (requested || cancelled) return
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleHandle = idleWindow.requestIdleCallback(() => { void mount() }, { timeout: 1400 })
      } else {
        // Give the landing copy and navigation a clean first paint before WebGL work.
        fallbackTimer = window.setTimeout(() => { void mount() }, 240)
      }
    }

    const cancelScheduledMount = () => {
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle)
      if (fallbackTimer !== null) window.clearTimeout(fallbackTimer)
      idleHandle = null
      fallbackTimer = null
    }

    const mount = async () => {
      if (requested || cancelled) return
      requested = true
      try {
        const { mountCreatorCoverScene } = await import('./creatorCoverScene')
        if (cancelled) return
        dispose = mountCreatorCoverScene(surface, element)
        setReady(true)
      } catch {
        // The CSS-lit fallback remains visible if WebGL is unavailable.
      }
    }

    if (typeof IntersectionObserver === 'undefined') {
      scheduleMount()
    } else {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect()
          scheduleMount()
        }
      }, { rootMargin: '180px 0px' })
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
    <div ref={host} className="qth-cover-stage" data-ready={ready ? 'true' : 'false'} aria-hidden="true">
      <div className="qth-cover-atmosphere" />
      <canvas ref={canvas} className="qth-cover-canvas" />
      <div className="qth-cover-vignette" />
      <div className="qth-cover-caption">
        <span>QUORLYTH / 01</span>
        <i />
        <span>COMMUNITY IN MOTION</span>
      </div>
    </div>
  )
}
