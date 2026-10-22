import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export interface RobotApi {
  set(n: string): void; wave(ms?: number): void; welcome(): void; cheer(ms?: number): void
  think(on: boolean): void; listen(on: boolean): void; talk(on: boolean): void; bump(): void
  no(): void; theme(n: string): void; spin(): void; turn(on: boolean): void; calm(on: boolean): void; dispose(): void
}

/** The 3D QuorlythBot. Shows a retry button if the 3D scene cannot start. */
export const Robot = forwardRef<RobotApi | null, { theme?: string; calm?: boolean; drag?: boolean; defer?: boolean; onReady?: () => void }>(function Robot({ theme = 'onyx', calm, drag, defer = false, onReady }, ref) {
  const cv = useRef<HTMLCanvasElement>(null)
  const api = useRef<RobotApi | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'fail'>('loading')
  const [try_, setTry] = useState(0)

  useImperativeHandle(ref, () => new Proxy({} as RobotApi, { get: (_t, k: string) => (...args: any[]) => (api.current as any)?.[k]?.(...args) }), [])

  useEffect(() => {
    setState('loading')
    const el = cv.current
    if (!el) return
    let cancelled = false
    let dispose: (() => void) | null = null
    let loadTimer: number | null = null
    const loadRobot = () => {
      if (cancelled) return
      void import('./robot3d').then(({ robot3d }) => {
        if (cancelled) return
        try {
          const R = robot3d(el, { tight: 1, drag: !!drag, theme, onerror: () => { if (!cancelled) setState('fail') } })
          if (cancelled) { R.dispose(); return }
          api.current = R
          dispose = () => {
            R.dispose()
            if (api.current === R) api.current = null
          }
          if (calm) R.calm(true)
          setState('ok')
          onReady?.()
        } catch {
          if (!cancelled) setState('fail')
        }
      }).catch(() => {
        if (!cancelled) setState('fail')
      })
    }
    // The sign-in form and primary button render before the heavy WebGL chunk is requested.
    if (defer) loadTimer = window.setTimeout(loadRobot, 350)
    else loadRobot()
    return () => {
      cancelled = true
      if (loadTimer !== null) window.clearTimeout(loadTimer)
      dispose?.()
    }
  }, [try_, defer])

  useEffect(() => { api.current?.theme(theme) }, [theme])
  useEffect(() => { api.current?.calm(!!calm) }, [calm])

  return (
    <>
      <canvas ref={cv} />
      {state !== 'ok' && (
        <div className="ast-fb">
          {state === 'loading' ? <span className="ast-ld"><i /><i /><i /></span> : <button className="chip" onClick={() => setTry(t => t + 1)}>Load the robot</button>}
        </div>
      )}
    </>
  )
})
