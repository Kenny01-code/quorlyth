import { useId } from 'react'

export function Logo({ size = 56, breathe = false }: { size?: number; breathe?: boolean }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" stroke={`url(#lg${id})`} strokeWidth={1.6} strokeLinecap="round" aria-label="Quorlyth" className={breathe ? 'lm' : undefined}>
      <defs>
        <linearGradient id={`lg${id}`} gradientUnits="userSpaceOnUse" x1="6" y1="4" x2="44" y2="44">
          <stop stopColor="#fff" />
          <stop offset="1" stopColor="#7a7a7a" />
        </linearGradient>
      </defs>
      <path className="lp" pathLength={1} d="M28.3 35.6A15 15 0 1 1 35.6 28.3" />
      <circle className="lp l2" pathLength={1} cx="22" cy="22" r="6" />
      <path className="lp l3" pathLength={1} d="M27.5 27.5L42 42" />
      <circle cx="22" cy="22" r="10" strokeOpacity=".25" strokeDasharray="1 3" />
    </svg>
  )
}
