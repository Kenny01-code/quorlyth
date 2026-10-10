import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '../lib/Icon'
import { Chat } from '../lib/types'
import { THEMES } from './config'
import { Project } from './useBotData'
import { cn } from '../lib/util'

export interface MenuActions {
  pin(): void; rename(): void; color(k: string): void; move(pj: string): void; unread(): void; archive(): void
  duplicate(): void; exportChat(): void; clear(): void; remove(): void
}

/** Right click menu for a chat. Every action closes it except colour, project and the delete confirmation. */
export function ChatMenu({ chat, x, y, leftBound, rightBound, anchor, offsetX, offsetY, projects, act, onClose }: { chat: Chat | null; x: number; y: number; leftBound?: number; rightBound?: number; anchor?: HTMLElement; offsetX?: number; offsetY?: number; projects: Project[]; act: MenuActions; onClose: () => void }) {
  const [proj, setProj] = useState(false)
  const [del, setDel] = useState(false)
  const col = chat?.color || ''
  const viewportLeft = 8
  const viewportRight = window.innerWidth - 8
  const areaLeft = Number.isFinite(leftBound) ? Math.max(viewportLeft, leftBound! + 8) : viewportLeft
  const areaRight = Number.isFinite(rightBound) ? Math.min(viewportRight, rightBound! - 8) : viewportRight
  const width = Math.max(0, Math.min(360, areaRight - areaLeft))
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: Math.max(areaLeft, Math.min(areaRight - Math.min(width, 260), x - Math.min(width, 260))), top: Math.max(8, Math.min(window.innerHeight - 80, y)), width: Math.min(width, 260) })
  const [panelMaxHeight, setPanelMaxHeight] = useState(Math.max(80, window.innerHeight - 16))

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const place = () => {
      // The menu is portalled to body, so derive its geometry from the live
      // chat row/sidebar and the bot frame instead of stale viewport coordinates.
      const anchorRect = anchor?.isConnected ? anchor.getBoundingClientRect() : null
      const sidebar = anchor?.closest<HTMLElement>('.bs') ?? null
      const sidebarRect = sidebar?.getBoundingClientRect()
      // Resolve the panel from the clicked chat's own DOM tree. A document-wide
      // query can accidentally choose a different/hidden bot panel when more
      // than one launcher or preview is mounted.
      const botFrame = anchor?.closest<HTMLElement>('.astp.bot')
        ?? document.querySelector<HTMLElement>('#ast .astp.bot, body > .qbot-drawer-portal.bot')
      const frameRect = botFrame?.getBoundingClientRect()
      const frameLeft = Math.max(8, (frameRect?.left ?? 0) + 8)
      const frameRight = Math.min(window.innerWidth - 8, (frameRect?.right ?? window.innerWidth) - 8)
      const liveLeft = Math.max(frameLeft, sidebarRect ? sidebarRect.left + 8 : frameLeft)
      const liveRight = Math.min(frameRight, sidebarRect ? sidebarRect.right - 8 : frameRight)
      const liveWidth = Math.max(0, Math.min(260, liveRight - liveLeft))
      const liveX = anchorRect ? anchorRect.left + (offsetX ?? anchorRect.width) : x
      const liveY = anchorRect ? anchorRect.top + (offsetY ?? 0) : y
      const topBound = Math.max(8, (frameRect?.top ?? 0) + 8)
      const bottomBound = Math.min(window.innerHeight - 8, (frameRect?.bottom ?? window.innerHeight) - 8)
      const maxHeight = Math.max(80, bottomBound - topBound)
      const rect = menu.getBoundingClientRect()
      const measuredHeight = Math.min(rect.height, maxHeight)
      // Clamp both edges to the actual bot panel, then place the menu against
      // the clicked row's right edge so it cannot drift outside the sidebar.
      const safeWidth = Math.min(liveWidth, Math.max(0, frameRight - frameLeft))
      const left = Math.max(frameLeft, Math.min(frameRight - safeWidth, liveX - safeWidth))
      const top = Math.max(topBound, Math.min(bottomBound - measuredHeight, liveY))
      setPanelMaxHeight(current => current === maxHeight ? current : maxHeight)
      setPosition(current => current.left === left && current.top === top && current.width === safeWidth ? current : { left, top, width: safeWidth })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    // Reposition when the panel/sidebar changes size, not just on window resize.
    const observed = [anchor, anchor?.closest('.bs'), anchor?.closest('.astp.bot')]
      .filter((node): node is Element => !!node)
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    observed.forEach(node => resizeObserver?.observe(node))
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      resizeObserver?.disconnect()
    }
  }, [x, y, leftBound, rightBound, areaLeft, areaRight, anchor, offsetX, offsetY, chat?.id, proj, del])
  const item = (icon: string, label: string, fn: () => void, cls = '') => (
    <button role="menuitem" className={cls} onClick={() => { fn(); onClose() }}><Icon name={icon} size={16} />{label}</button>
  )
  return createPortal((
    <>
      <div className="cmx-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 96 }} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div ref={menuRef} className="cmx glass" role="menu" style={{ position: 'fixed', inset: 'auto', left: position.left, top: position.top, width: position.width, minWidth: position.width, maxWidth: position.width, boxSizing: 'border-box', maxHeight: panelMaxHeight, margin: 0, transform: 'none' }} onKeyDown={e => e.key === 'Escape' && onClose()}>
        {chat && <div className="cmh">{chat.title.slice(0, 40)}</div>}
        {chat && item('pin', chat.pin ? 'Unpin chat' : 'Pin chat', act.pin)}
        {chat && item('edit', 'Rename', act.rename)}
        <div className="cmc"><span className="dim">Colour</span>
          <div>{['', ...Object.keys(THEMES)].map(k => {
            const T = (THEMES as any)[k]
            return <button key={k} className={cn('cmw', col === k && 'on')} aria-label={T ? T.n : 'Default'} title={T ? T.n : 'Default'}
              style={{ background: T ? `radial-gradient(circle at 30% 30%,${T.g1},${T.g2})` : 'linear-gradient(135deg,#fff,#555)' }} onClick={() => act.color(k)} />
          })}</div>
        </div>
        {chat && <>
          <button role="menuitem" onClick={() => setProj(!proj)}><Icon name="folder" size={16} />Move to project<span className="cmx-r">{proj ? '\u2212' : '+'}</span></button>
          {proj && <div className="cmsub">
            <button className={cn(!chat.pj && 'on')} onClick={() => { act.move(''); onClose() }}>No project</button>
            {projects.map(p => <button key={p.id} className={cn(chat.pj === p.id && 'on')} onClick={() => { act.move(p.id); onClose() }}>{p.name}</button>)}
            {!projects.length && <button disabled>Create a project first</button>}
          </div>}
          {item('status', chat.unread ? 'Mark as read' : 'Mark as unread', act.unread)}
          {item('book', chat.arch ? 'Unarchive' : 'Archive', act.archive)}
          {item('copy', 'Duplicate', act.duplicate)}
          {item('publish', 'Export chat', act.exportChat)}
          {item('redo', 'Clear messages', act.clear)}
          <button role="menuitem" className="danger" onClick={() => { if (!del) return setDel(true); act.remove(); onClose() }}><Icon name="trash" size={16} />{del ? 'Confirm delete' : 'Delete chat'}</button>
        </>}
      </div>
    </>
  ), document.body)
}