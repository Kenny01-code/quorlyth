import { useNavigate } from 'react-router-dom'
import { Icon } from '../lib/Icon'
import { Notif } from '../lib/notifs'
import { when } from '../lib/util'
import { cn } from '../lib/util'

export function NotifPanel({ list, sound, onSound, onOpen, onMarkAll, onClose }: { list: Notif[]; sound: boolean; onSound: () => void; onOpen: (n: Notif) => void; onMarkAll: () => void; onClose: () => void }) {
  const nav = useNavigate()
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 69 }} onClick={onClose} />
      <div id="np" className="glass" role="dialog" aria-label="Notifications">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 10px 10px' }}>
          <h3>Notifications</h3>
          <div className="acts" style={{ margin: 0, gap: 6 }}>
            <button className={cn('chip', sound && 'on')} aria-label="Notification sound" onClick={onSound}>Sound {sound ? 'on' : 'off'}</button>
            {list.some(n => n.unread) && <button className="chip" onClick={onMarkAll}>Mark all read</button>}
          </div>
        </div>
        {list.length ? list.map(n => (
          <div key={n.key} className="nitem" role="button" tabIndex={0}
            onClick={() => { onOpen(n); onClose(); nav(n.kind === 'idea' ? '/idea/' + n.id : n.kind === 'settings' ? '/settings?tab=requests' : n.kind === 'access' ? '/access' : '/communities') }}>
            {n.unread ? <i className="dot" /> : <i className="nd2" />}<Icon name={n.icon} size={18} />
            <div style={{ minWidth: 0 }}><p style={{ fontSize: 14 }}>{n.text}</p><p className="dim">{when(n.at)}</p></div>
          </div>
        )) : <p className="mut" style={{ padding: '24px 12px', textAlign: 'center' }}>You are all caught up.</p>}
      </div>
    </>
  )
}
