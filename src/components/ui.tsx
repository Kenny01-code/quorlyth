import { ReactNode } from 'react'
import { Icon } from '../lib/Icon'
import { useApp } from '../data/AppProvider'
import { cn } from '../lib/util'
import { useCount, useTyped } from '../lib/hooks'

export function Head({ kicker, title, right }: { kicker: string; title: ReactNode; right?: ReactNode }) {
  const typed = useTyped(typeof title === 'string' ? title : '')
  return (
    <div className="head">
      <div><p className="dim">{kicker}</p><h2 style={{ minHeight: '1.1em' }}>{typeof title === 'string' ? typed : title}</h2></div>
      {right ? <div>{right}</div> : null}
    </div>
  )
}

export function Empty({ icon, title, text, children }: { icon: string; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="glass cent">
      <Icon name={icon} />
      <h3>{title}</h3>
      <p className="mut" style={{ maxWidth: 380 }}>{text}</p>
      {children}
    </div>
  )
}

export function Chip({ on, onClick, children, ...r }: { on?: boolean; onClick?: () => void; children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn('chip', on && 'on')} onClick={onClick} {...r}>{children}</button>
}

export function Av({ id, size = 30 }: { id: string; size?: number }) {
  const { avatar } = useApp()
  return <img className="av" alt="" style={{ width: size, height: size, objectFit: 'cover' }} src={avatar(id) || undefined} />
}

export function Toast() {
  const { toastMsg } = useApp()
  return <div id="tst" className={cn('glass', toastMsg && 'on')} role="status">{toastMsg}</div>
}

export function Bar({ value }: { value: number }) {
  return <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}

export function Num({ n, size }: { n: number; size?: number }) {
  const v = useCount(n)
  return <p className="num" style={size ? { fontSize: size } : undefined}>{v}</p>
}
