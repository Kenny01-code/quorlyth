import { useEffect, useRef, useState } from 'react'

/**
 * Lazy-loaded Three.js artwork for an individual Community Space cover.
 * The shared copper scene is only requested when the cover approaches view.
 */
export function CommunityCoverStage() {
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
        const { mountCreatorCoverScene } = await import('./creatorCoverScene')
        if (cancelled) return
        dispose = mountCreatorCoverScene(surface, element)
        setReady(true)
      } catch {
        // The CSS-lit copper fallback remains visible when WebGL is unavailable.
      }
    }

    const scheduleMount = () => {
      if (requested || cancelled) return
      if (typeof idleWindow.requestIdleCallback === 'function') {
        idleHandle = idleWindow.requestIdleCallback(() => { void mount() }, { timeout: 1400 })
      } else {
        fallbackTimer = window.setTimeout(() => { void mount() }, 240)
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
    <div
      ref={host}
      className="ccv-space-cover__scene"
      data-ready={ready ? 'true' : 'false'}
      aria-hidden="true"
    >
      <div className="ccv-space-cover__glow" />
      <canvas ref={canvas} className="ccv-space-cover__canvas" />
      <div className="ccv-space-cover__vignette" />
      <span className="ccv-space-cover__signature">QUORLYTH / SIGNAL IN MOTION</span>
    </div>
  )
}
