import { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../data/AppProvider'
import { Empty } from './ui'

export function Gate({ children, owner }: { children: ReactNode; owner?: boolean }) {
  const { me, owner: isOwner } = useApp()
  const nav = useNavigate()
  const loc = useLocation()
  if (!me) return <Empty icon="private" title="Sign in to continue" text="Sign in to see your space."><button className="btn p" style={{ marginTop: 12 }} onClick={() => nav('/signin?next=' + encodeURIComponent(loc.pathname + loc.search))}>Sign in</button></Empty>
  if (owner && !isOwner) return <Empty icon="private" title="Owner only" text="This area is for the owner of this space." />
  return <>{children}</>
}
