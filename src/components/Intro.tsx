import { useEffect, useState } from 'react'
import { Logo } from '../lib/Logo'

/** Opening animation: the mark draws itself, then QUORLYTH appears letter by letter. Click to skip. */
export function Intro({ replay, onDone }: { replay: number; onDone: () => void }) {
  const [out, setOut] = useState(false)
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { onDone(); return }
    setOut(false)
    const t1 = setTimeout(() => setOut(true), 6400), t2 = setTimeout(onDone, 7700)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [replay])
  const skip = () => { setOut(true); setTimeout(onDone, 900) }
  return (
    <div id="intro" className={out ? 'out' : ''} onClick={skip} key={replay}>
      <div className="ib">
        <Logo size={150} />
        <div className="wm" aria-label="Quorlyth">{'QUORLYTH'.split('').map((c, i) => <span key={i} style={{ ['--i' as any]: i }}>{c}</span>)}</div>
        <i className="ln" />
        <p className="sub">An operating system for fanbases</p>
      </div>
    </div>
  )
}
