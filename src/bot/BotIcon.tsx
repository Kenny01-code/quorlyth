import { ICONS } from '../lib/icons'

/**
 * QuorlythBot's original icon renderer, restored locally to the bot UI.
 * Keep using the original 24px outline set here without changing app-wide icons.
 */
export function BotIcon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      className="ic"
      style={{ ['--s' as any]: size + 'px' }}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.spark }}
    />
  )
}
