import { Logo } from '../lib/Logo'

type LoaderVariant = 'screen' | 'route'

/** Compact logo-only loader. The screen variant positions this small mark over the
 * current page; it never paints a full-screen backdrop or delays route readiness. */
export function QuorlythLoader({
  variant = 'route',
  label = 'Loading',
}: {
  variant?: LoaderVariant
  label?: string
}) {
  const size = variant === 'screen' ? 54 : 44

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
    </div>
  )
}
