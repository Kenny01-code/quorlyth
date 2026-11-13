import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { RobotApi } from './Robot'

/** High-end Three.js voice orb. It shares RobotApi so live voice actions stay in sync. */
export const Orb = forwardRef<RobotApi | null, { theme?: string; calm?: boolean; drag?: boolean; defer?: boolean; active?: boolean; onReady?: () => void }>(function Orb({ theme = 'terracotta', calm, drag, defer = false, active = true, onReady }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const apiRef = useRef<RobotApi | null>(null)
  const activeRef = useRef(active)
  const themeRef = useRef(theme)
  const calmRef = useRef(calm)
  const dragRef = useRef(drag)
  activeRef.current = active
  themeRef.current = theme
  calmRef.current = calm
  dragRef.current = drag
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading')
  const [attempt, setAttempt] = useState(0)

  useImperativeHandle(ref, () => new Proxy({} as RobotApi, {
    get: (_target, key: string) => (...args: unknown[]) => (apiRef.current as any)?.[key]?.(...args),
  }), [])

  useEffect(() => {
    setState('loading')
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let dispose: (() => void) | null = null
    let deferTimer: number | null = null

    const initialize = () => {
      if (cancelled) return
      void import('./orb3d').then(({ orb3d }) => {
        if (cancelled) return
        try {
          const orb = orb3d(canvas, {
            drag: !!dragRef.current,
            theme: themeRef.current,
            onerror: () => { if (!cancelled) setState('fail') },
          })
          if (cancelled) { orb.dispose(); return }
          apiRef.current = orb as RobotApi
          if (!activeRef.current) orb.active(false)
          if (calmRef.current) orb.calm(true)
          dispose = () => {
            orb.dispose()
            if (apiRef.current === (orb as RobotApi)) apiRef.current = null
          }
          setState('ok')
          onReady?.()
        } catch {
          if (!cancelled) setState('fail')
        }
      }).catch(() => { if (!cancelled) setState('fail') })
    }

    // The voice controls remain interactive before the WebGL chunk is requested.
    if (defer) deferTimer = window.setTimeout(initialize, 220)
    else initialize()

    return () => {
      cancelled = true
      if (deferTimer !== null) window.clearTimeout(deferTimer)
      dispose?.()
    }
  }, [attempt, defer])

  useEffect(() => { apiRef.current?.theme(theme) }, [theme])
  useEffect(() => { apiRef.current?.calm(!!calm) }, [calm])
  useEffect(() => { apiRef.current?.active(active) }, [active])

  return (
    <>
      <canvas ref={canvasRef} aria-label="QuorlythBot animated voice orb" role="img" />
      {state !== 'ok' && (
        <div className="ast-fb" aria-live="polite">
          {state === 'loading'
            ? <span className="ast-ld"><i /><i /><i /></span>
            : <button className="chip" onClick={() => setAttempt(value => value + 1)}>Load the orb</button>}
        </div>
      )}
    </>
  )
})
