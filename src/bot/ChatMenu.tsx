import { useState } from 'react'
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
export function ChatMenu({ chat, x, y, projects, act, onClose }: { chat: Chat | null; x: number; y: number; projects: Project[]; act: MenuActions; onClose: () => void }) {
  const [proj, setProj] = useState(false)
  const [del, setDel] = useState(false)
  const col = chat?.color || ''
  const width = Math.min(360, innerWidth - 16)
  const height = Math.min(innerHeight - 16, 650)
  const left = Math.max(8, Math.min(innerWidth - width - 8, x)), top = Math.max(8, Math.min(innerHeight - height - 8, y))
  const item = (icon: string, label: string, fn: () => void, cls = '') => (
    <button role="menuitem" className={cls} onClick={() => { fn(); onClose() }}><Icon name={icon} size={16} />{label}</button>
  )
  return (
    <>
      <div className="cmx-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 96 }} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div className="cmx glass" role="menu" style={{ left, top, width, minWidth: width, maxWidth: width, maxHeight: Math.min(height, innerHeight - top - 8) }} onKeyDown={e => e.key === 'Escape' && onClose()}>
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
  )
}
