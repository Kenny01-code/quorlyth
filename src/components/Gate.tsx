import { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../data/AppProvider'
import { Empty } from './ui'

export function Gate({ children, owner, platformOwnerOnly }: { children: ReactNode; owner?: boolean; platformOwnerOnly?: boolean }) {
  const { me, owner: isOwner, demo } = useApp()
  const nav = useNavigate()
  const loc = useLocation()
  if (!me && !demo) return <Empty icon="private" title="Sign in or try the demo" text="Explore the sample creator space without an account, or sign in to continue."><div className="acts" style={{ justifyContent: 'center', marginTop: 12 }}><button className="btn p" onClick={() => nav('/signin?next=' + encodeURIComponent(loc.pathname + loc.search))}>Sign in</button><button className="btn" onClick={() => { sessionStorage.setItem('quorlyth:demo', '1'); window.location.assign('/dashboard') }}>Try demo</button></div></Empty>
  if (platformOwnerOnly && (!isOwner || demo)) return <Empty icon="private" title="Platform owner only" text="This area is reserved for the verified platform owner." />
  if (owner && !isOwner && !demo) return <Empty icon="private" title="Owner only" text="This area is for the owner of this space." />
  return <>{children}</>
}
