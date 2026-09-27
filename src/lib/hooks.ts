import { useEffect, useState } from 'react'

/** Types one phrase at a time, deleting and moving on, like the original hero. */
export function useTypewriter(phrases: string[], speed = 70, hold = 2400) {
  const [text, setText] = useState('')
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setText(phrases[0]); return }
    let k = 0, i = 0, dir = 1, t: number
    const tick = () => {
      const p = phrases[k % phrases.length]
      if (dir > 0) {
        i++; setText(p.slice(0, i))
        if (i >= p.length) { dir = -1; t = window.setTimeout(tick, hold); return }
        t = window.setTimeout(tick, speed * (0.6 + Math.random() * 0.9))
      } else {
        i -= 2
        if (i <= 0) { i = 0; dir = 1; k++; setText(''); t = window.setTimeout(tick, 350); return }
        setText(p.slice(0, i)); t = window.setTimeout(tick, speed * 0.45)
      }
    }
    tick()
    return () => clearTimeout(t)
  }, [])
  return text
}

/** Types a title in once when a page opens. */
export function useTyped(text: string, speed = 30) {
  const [out, setOut] = useState(text)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setOut(text); return }
    let i = 0, t: number
    setOut('')
    const tick = () => { i++; setOut(text.slice(0, i)); if (i < text.length) t = window.setTimeout(tick, speed * (0.6 + Math.random() * 0.9)) }
    t = window.setTimeout(tick, 120)
    return () => clearTimeout(t)
  }, [text])
  return out
}

/** Fades elements with the .rv class in as they scroll into view. */
export function useReveal(dep: unknown = null) {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return
    const els = Array.from(document.querySelectorAll('.rv'))
    els.forEach(e => e.classList.add('pre'))
    const io = new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.remove('pre'); io.unobserve(x.target) } }), { threshold: 0.15 })
    els.forEach(e => io.observe(e))
    return () => io.disconnect()
  }, [dep])
}

/** Counts a number up from zero. */
export function useCount(n: number, ms = 1200) {
  const [v, setV] = useState(n)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(n); return }
    const t0 = performance.now(); let raf = 0
    const f = (t: number) => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 4); setV(Math.round(n * e)); if (p < 1) raf = requestAnimationFrame(f) }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [n])
  return v
}
