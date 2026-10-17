import { Logo } from '../lib/Logo'

type LoaderVariant = 'screen' | 'route'

/**
 * Brand-matched, CSS-only loading treatment.
 * It uses Quorlyth's existing SVG mark, so the loader needs no image request,
 * canvas, animation package, or additional network round-trip.
 */
export function QuorlythLoader({
  variant = 'route',
  label = 'Preparing your workspace',
}: {
  variant?: LoaderVariant
  label?: string
}) {
  const size = variant === 'screen' ? 62 : 48

  return (
    <div
      className={`q-loader q-loader--${variant}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className="q-loader__scene" aria-hidden="true">
        <span className="q-loader__halo" />
        <span className="q-loader__orbit q-loader__orbit--outer"><i /></span>
        <span className="q-loader__orbit q-loader__orbit--inner"><i /></span>
        <span className="q-loader__orbit q-loader__orbit--micro"><i /></span>
        <span className="q-loader__mark"><Logo size={size} /></span>
      </span>
      <span className="q-loader__wordmark" aria-hidden="true">QUORLYTH</span>
      <span className="q-loader__label">{label}</span>
      <span className="q-loader__signal" aria-hidden="true"><i /></span>
    </div>
  )
}
