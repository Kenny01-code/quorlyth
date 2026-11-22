import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BotIcon as Icon } from './BotIcon'
import { Chat } from '../lib/types'
import { Project } from './useBotData'
import { cn } from '../lib/util'

export interface MenuActions {
  pin(): void; rename(): void; move(pj: string): void; unread(): void; archive(): void
  duplicate(): void; exportChat(): void; clear(): void; remove(): void
}

/** Right click menu for a chat. Every action closes it except colour, project and the delete confirmation. */
export function ChatMenu({ chat, x, y, leftBound, rightBound, anchor, offsetX, offsetY, projects, act, onClose }: { chat: Chat | null; x: number; y: number; leftBound?: number; rightBound?: number; anchor?: HTMLElement; offsetX?: number; offsetY?: number; projects: Project[]; act: MenuActions; onClose: () => void }) {
  const [proj, setProj] = useState(false)
  const [del, setDel] = useState(false)
  const [clearConfirm, setClearConfirm] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // Keep the menu close to the specific chat row and within the bot panel.
  const botFrame = anchor?.closest<HTMLElement>('#bot') ?? anchor?.closest<HTMLElement>('.astp.bot') ?? null
  const [position, setPosition] = useState({ left: 8, top: 8, width: 272 })
  const [panelMaxHeight, setPanelMaxHeight] = useState(Math.max(80, window.innerHeight - 16))

  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
  }, [chat?.id])

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    const place = () => {
      if (!botFrame || !menu) return
      const botRect = botFrame.getBoundingClientRect()
      const gutter = 8
      const rightEdge = Math.min(botRect.right, window.innerWidth)
      const bottomEdge = Math.min(botRect.bottom, window.innerHeight)
      const width = Math.max(190, Math.min(276, botRect.width - gutter * 2, window.innerWidth - gutter * 2))
      const height = Math.max(96, Math.min(menu.scrollHeight, botRect.height - gutter * 2, window.innerHeight - gutter * 2))
      let leftViewport = x
      if (leftViewport + width > rightEdge - gutter) leftViewport = x - width
      leftViewport = Math.max(botRect.left + gutter, Math.min(leftViewport, rightEdge - width - gutter))
      let topViewport = y + 5
      if (topViewport + height > bottomEdge - gutter) topViewport = y - height - 5
      topViewport = Math.max(botRect.top + gutter, Math.min(topViewport, bottomEdge - height - gutter))
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
    const observed = [anchor, botFrame].filter((node): node is HTMLElement => node instanceof HTMLElement)
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    observed.forEach(node => resizeObserver?.observe(node))
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      resizeObserver?.disconnect()
    }
  }, [x, y, anchor, botFrame, chat?.id, proj, del, clearConfirm])
  const item = (icon: string, label: string, fn: () => void, cls = '') => (
    <button role="menuitem" className={cls} onClick={() => { fn(); onClose() }}><Icon name={icon} size={16} />{label}</button>
  )
  return createPortal((
    <>
      <div className="cmx-backdrop" style={{ position: botFrame ? 'absolute' : 'fixed', inset: 0, zIndex: 96 }} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div ref={menuRef} className="cmx glass qbot-chat-context-menu" role="menu" aria-label={chat ? `Actions for ${chat.title}` : 'Chat actions'} style={{ position: botFrame ? 'absolute' : 'fixed', inset: 'auto', left: position.left, top: position.top, width: position.width, minWidth: position.width, maxWidth: position.width, boxSizing: 'border-box', maxHeight: panelMaxHeight, overflowY: 'auto', overscrollBehavior: 'contain', margin: 0, transform: 'none', zIndex: 97 }} onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); onClose(); anchor?.focus(); return }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || [])
        if (!items.length) return
        e.preventDefault()
        const current = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (current + 1) % items.length : (current - 1 + items.length) % items.length
        items[next].focus()
      }}>
        {chat && <div className="cmh">{chat.title.slice(0, 40)}</div>}
        {chat && item('pin', chat.pin ? 'Unpin chat' : 'Pin chat', act.pin)}
        {chat && item('edit', 'Rename', act.rename)}
        {chat && <>
          <button role="menuitem" onClick={() => setProj(!proj)}><Icon name="folder" size={16} />Move to project<span className="cmx-r">{proj ? '\u2212' : '+'}</span></button>
          {proj && <div className="cmsub">
            <button role="menuitem" className={cn(!chat.pj && 'on')} onClick={() => { act.move(''); onClose() }}>No project</button>
            {projects.map(p => <button role="menuitem" key={p.id} className={cn(chat.pj === p.id && 'on')} onClick={() => { act.move(p.id); onClose() }}>{p.name}</button>)}
            {!projects.length && <button role="menuitem" disabled>Create a project first</button>}
          </div>}
          {item('status', chat.unread ? 'Mark as read' : 'Mark as unread', act.unread)}
          {item('book', chat.arch ? 'Unarchive' : 'Archive', act.archive)}
          {item('copy', 'Duplicate', act.duplicate)}
          {item('publish', 'Export chat', act.exportChat)}
          <button role="menuitem" onClick={() => { if (!clearConfirm) return setClearConfirm(true); act.clear(); onClose() }}><Icon name="redo" size={16} />{clearConfirm ? 'Confirm clear messages' : 'Clear messages'}</button>
          <button role="menuitem" className="danger" onClick={() => { if (!del) return setDel(true); act.remove(); onClose() }}><Icon name="trash" size={16} />{del ? 'Confirm delete' : 'Delete chat'}</button>
        </>}
      </div>
    </>
  ), botFrame ?? document.body)
}
