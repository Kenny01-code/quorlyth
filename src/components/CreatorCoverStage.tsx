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
      void mount()
    } else {
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          observer.disconnect()
          void mount()
        }
      }, { rootMargin: '180px 0px' })
      observer.observe(element)
      return () => {
        cancelled = true
        observer.disconnect()
        dispose?.()
      }
    }

    return () => {
      cancelled = true
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
