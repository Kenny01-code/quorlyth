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
  const menuRef = useRef<HTMLDivElement>(null)
  // Render inside QuorlythBot and keep the menu within the sidebar's useful lane.
  // Its top is the Skills/Projects seam; its bottom stops above the profile footer.
  const sidebarFrame = anchor?.closest<HTMLElement>('.bs') ?? null
  const botFrame = anchor?.closest<HTMLElement>('#bot') ?? anchor?.closest<HTMLElement>('.astp.bot') ?? null
  const [position, setPosition] = useState({ left: 8, top: 8, width: 260 })
  const [panelMaxHeight, setPanelMaxHeight] = useState(Math.max(80, window.innerHeight - 16))

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const place = () => {
      if (!sidebarFrame || !botFrame || !menu) return
      const sidebarRect = sidebarFrame.getBoundingClientRect()
      const botRect = botFrame.getBoundingClientRect()
      const nav = sidebarFrame.querySelector<HTMLElement>('.bs-n')
      const footer = sidebarFrame.querySelector<HTMLElement>('.bs-f')
      const navButtons = nav ? Array.from(nav.querySelectorAll<HTMLElement>('.bsb')) : []
      const skills = navButtons.find(button => button.textContent?.trim().includes('Skills'))
      const projects = navButtons.find(button => button.textContent?.trim().includes('Projects'))
      const seam = skills && projects
        ? (skills.getBoundingClientRect().bottom + projects.getBoundingClientRect().top) / 2
        : nav?.getBoundingClientRect().bottom ?? sidebarRect.top + 72
      const footerTop = footer?.getBoundingClientRect().top ?? sidebarRect.bottom - 12
      const topViewport = Math.max(sidebarRect.top + 8, Math.min(seam, footerTop - 80))
      const bottomViewport = Math.min(sidebarRect.bottom - 8, footerTop - 8)
      // Float from the sidebar's right edge into the bot's chat lane.
      // A small overlap keeps the panel visually attached to the sidebar while
      // placing most of its surface between the navigation and conversation.
      const leftViewport = Math.max(botRect.left + 8, sidebarRect.right - 18)
      const availableRight = Math.min(botRect.right, window.innerWidth) - leftViewport - 8
      const width = Math.max(120, Math.min(260, availableRight))
      const height = Math.max(80, bottomViewport - topViewport)
      // Position against the browser's actual CSS containing block. This avoids
      // the offset errors caused by assuming #bot is always the offset parent.
      const containingBlock = menu.offsetParent instanceof HTMLElement ? menu.offsetParent : botFrame
      const containingRect = containingBlock.getBoundingClientRect()
      const left = leftViewport - containingRect.left - containingBlock.clientLeft + containingBlock.scrollLeft
      const top = topViewport - containingRect.top - containingBlock.clientTop + containingBlock.scrollTop
      setPanelMaxHeight(current => current === height ? current : height)
      setPosition(current => current.left === left && current.top === top && current.width === width ? current : { left, top, width })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    const observed = [anchor, sidebarFrame, botFrame].filter((node): node is HTMLElement => node instanceof HTMLElement)
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    observed.forEach(node => resizeObserver?.observe(node))
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      resizeObserver?.disconnect()
    }
  }, [x, y, leftBound, rightBound, anchor, sidebarFrame, botFrame, offsetX, offsetY, chat?.id, proj, del])
  const item = (icon: string, label: string, fn: () => void, cls = '') => (
    <button role="menuitem" className={cls} onClick={() => { fn(); onClose() }}><Icon name={icon} size={16} />{label}</button>
  )
  return createPortal((
    <>
      <div className="cmx-backdrop" style={{ position: botFrame ? 'absolute' : 'fixed', inset: 0, zIndex: 96 }} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div ref={menuRef} className="cmx glass" role="menu" style={{ position: botFrame ? 'absolute' : 'fixed', inset: 'auto', left: position.left, top: position.top, width: position.width, minWidth: position.width, maxWidth: position.width, boxSizing: 'border-box', maxHeight: panelMaxHeight, height: panelMaxHeight, overflowY: 'auto', overscrollBehavior: 'contain', margin: 0, transform: 'none', zIndex: 97 }} onKeyDown={e => e.key === 'Escape' && onClose()}>
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
  ), botFrame ?? document.body)
}