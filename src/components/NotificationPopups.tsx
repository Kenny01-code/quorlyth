import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Notif } from '../lib/notifs'
import '../styles/notification-popups.css'

function destination(n: Notif) {
  const target = n.target || n.id || ''
  if (n.kind === 'promo') return '/promote'
  if (n.kind === 'idea' || n.kind === 'comment' || n.kind === 'vote' || n.kind === 'collaboration') return '/idea/' + target
  if (n.kind === 'settings') return '/settings?tab=requests'
  if (n.kind === 'access') return '/access'
  if (n.kind === 'join') return '/communities/' + target.split('__')[0] + '?tab=join-requests'
  if (n.kind === 'ai-organizer') return '/communities/' + target.split('__')[0] + '?tab=ai-organizer-requests'
  if (n.kind === 'collab-request') return '/queue?idea=' + encodeURIComponent(target)
  if (n.kind === 'message' || n.kind === 'call') return '/messages/' + target
  if (n.kind === 'workspace' || n.kind === 'task') return '/workspaces/' + target
  if (n.kind === 'project' || n.kind === 'milestone') return '/collaboration/' + target
  if (n.kind === 'community') return '/communities/' + target
  if (n.kind === 'announcement') return '/dashboard'
  return '/communities'
}

export function NotificationPopups({ items, onDismiss, onOpen }: {
  items: Notif[]
  onDismiss: (key: string) => void
  onOpen: (notification: Notif) => void
}) {
  const nav = useNavigate()
  useEffect(() => {
    const timers = items.map(item => window.setTimeout(() => onDismiss(item.key), 9000))
    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [items, onDismiss])
  if (!items.length) return null
  return (
    <div className="notification-popups" aria-live="polite" aria-relevant="additions">
      {items.slice(-3).map(item => (
        <article className="notification-popup" key={item.key}>
          <span className="notification-popup-icon"><Icon name={item.icon} size={17} /></span>
          <button type="button" className="notification-popup-copy" onClick={() => { onOpen(item); nav(destination(item)); onDismiss(item.key) }}>
            <strong>{item.kind === 'message' ? 'New message' : 'Quorlyth update'}</strong>
            <span>{item.text}</span>
            <small>Open notification</small>
          </button>
          <button type="button" className="notification-popup-close" aria-label="Dismiss notification" onClick={() => onDismiss(item.key)}>×</button>
        </article>
      ))}
    </div>
  )
}
