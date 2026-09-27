import { Dispatch, SetStateAction, useCallback, useEffect, useRef, useState } from 'react'

type Saved<T> = { value: T; at: number }

function read<T>(key: string, fallback: T): T {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null') as Saved<T> | null
    if (!saved || Date.now() - saved.at > 30 * 24 * 60 * 60 * 1000) return fallback
    return saved.value
  } catch { return fallback }
}

export function useDraftState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>, (next?: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, initial))
  const skip = useRef<string | null>(null)

  useEffect(() => {
    setValue(read(key, initial))
  }, [key])

  useEffect(() => {
    const serialized = JSON.stringify(value)
    if (skip.current === serialized) { skip.current = null; return }
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(key, JSON.stringify({ value, at: Date.now() })) } catch {}
    }, 250)
    return () => {
      window.clearTimeout(timer)
      if (skip.current !== null) return
      try { localStorage.setItem(key, JSON.stringify({ value, at: Date.now() })) } catch {}
    }
  }, [key, value])

  const clear = useCallback((next?: T) => {
    try { localStorage.removeItem(key) } catch {}
    if (next !== undefined) {
      const serialized = JSON.stringify(next)
      skip.current = serialized
      setValue(current => {
        if (JSON.stringify(current) === serialized) { skip.current = null; return current }
        return next
      })
    } else skip.current = JSON.stringify(value)
  }, [key, value])

  return [value, setValue, clear]
}
