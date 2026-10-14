import { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useApp } from '../data/AppProvider'
import { Empty } from './ui'

export function Gate({ children, owner, platformOwnerOnly, platformAdminOnly }: { children: ReactNode; owner?: boolean; platformOwnerOnly?: boolean; platformAdminOnly?: boolean }) {
  const app = useApp()
  const { me, owner: isOwner, demo, data } = app
  const isCommunityOwner = !!me && data.communities.some(c => app.ownsCommunity(c.id))
  const nav = useNavigate()
  const loc = useLocation()

  if (!me && !demo) return <Empty icon="private" title="Sign in or try the demo" text="Explore the sample creator space without an account, or sign in to continue."><div className="acts" style={{ justifyContent: 'center', marginTop: 12 }}><button className="btn p" onClick={() => nav('/signin?next=' + encodeURIComponent(loc.pathname + loc.search))}>Sign in</button><button className="btn" onClick={() => { sessionStorage.setItem('quorlyth:demo', '1'); window.location.assign('/dashboard') }}>Try demo</button></div></Empty>
  // The database is the sole platform-owner-only surface. Community owners may use the
  // workspace tools, while the platform owner retains their broader administrative role.
  if (platformOwnerOnly && (!isOwner || demo)) return <Empty icon="private" title="Platform owner only" text="This area is reserved for the verified platform owner." />
  if (platformAdminOnly && !app.platformAdmin) return <Empty icon="private" title="Platform administrator access required" text="Global workspace settings and access reviews are reserved for authorized platform administrators." />
  if (owner && !isOwner && !isCommunityOwner && !demo) return <Empty icon="private" title="Community owner access required" text="Create a community or open a community you own to access the workspace management tools." />
  return <>{children}</>
}
