import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Notif } from '../lib/notifs'
import { when } from '../lib/util'
import { cn } from '../lib/util'

export function NotifPanel({ list, sound, onSound, desktopPermission, onDesktop, onOpen, onMarkAll, onClose }: { list: Notif[]; sound: boolean; onSound: () => void; desktopPermission: NotificationPermission | 'unsupported'; onDesktop: () => void; onOpen: (n: Notif) => void; onMarkAll: () => void; onClose: () => void }) {
  const nav = useNavigate()
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 69 }} onClick={onClose} />
      <div id="np" className="glass" role="dialog" aria-label="Notifications">
        <div className="np-head">
          <h3>Notifications</h3>
          <div className="np-actions">
            <button className={cn('chip', sound && 'on')} aria-label="Notification sound" onClick={onSound}>Sound {sound ? 'on' : 'off'}</button>
            <button className={cn('chip', desktopPermission === 'granted' && 'on')} aria-label="Desktop notifications" onClick={onDesktop} disabled={desktopPermission === 'granted' || desktopPermission === 'denied' || desktopPermission === 'unsupported'}>
              {desktopPermission === 'granted' ? 'Desktop alerts on' : desktopPermission === 'denied' ? 'Desktop alerts blocked' : desktopPermission === 'unsupported' ? 'Desktop alerts unavailable' : 'Enable desktop alerts'}
            </button>
            {list.some(n => n.unread) && <button className="chip" onClick={onMarkAll}>Mark all read</button>}
          </div>
        </div>
        <div className="np-scroll">
        {list.length ? list.map(n => (
          <div key={n.key} className="nitem" role="button" tabIndex={0}
            onClick={() => {
              onOpen(n)
              onClose()
              const destination =
                n.kind === 'idea' ? '/idea/' + (n.target || n.id || '') :
                n.kind === 'comment' || n.kind === 'vote' ? '/idea/' + (n.target || n.id || '') :
                n.kind === 'settings' ? '/settings?tab=requests' :
                n.kind === 'access' ? '/access' :
                n.kind === 'join' ? '/communities/' + (n.target || n.id || '').split('__')[0] + '?tab=join-requests' :
                n.kind === 'collab-request' ? '/queue?idea=' + encodeURIComponent(n.target || '') :
                n.kind === 'collaboration' ? '/idea/' + (n.target || n.id || '') :
                n.kind === 'message' ? '/messages/' + (n.target || n.id || '') :
                n.kind === 'call' ? '/messages/' + (n.target || n.id || '') :
                n.kind === 'project' || n.kind === 'milestone' ? '/collaboration/' + (n.target || n.id || '') :
                n.kind === 'community' ? '/communities/' + (n.target || n.id || '') :
                n.kind === 'announcement' ? '/dashboard' :
                n.kind === 'promo' ? '/idea/' + (n.target || n.id || '') : '/communities'
              nav(destination)
            }}>
            {n.unread ? <i className="dot" /> : <i className="nd2" />}<Icon name={n.icon} size={18} />
            <div style={{ minWidth: 0 }}><p style={{ fontSize: 14 }}>{n.text}</p><p className="dim">{when(n.at)}</p></div>
          </div>
        )) : <p className="mut" style={{ padding: '24px 12px', textAlign: 'center' }}>You are all caught up.</p>}
        </div>
      </div>
    </>
  )
}
