import type { ReactNode } from 'react'

export type QuorlythGlyphName =
  | 'brand' | 'workspace' | 'milestone' | 'timeline' | 'team' | 'idea'
  | 'review' | 'plan' | 'person' | 'add' | 'back' | 'send' | 'edit'
  | 'complete' | 'start' | 'blocked' | 'calendar' | 'priority' | 'due'
  | 'open' | 'document' | 'progress' | 'checkpoint' | 'community'
  | 'profile' | 'settings'

const SHAPES: Record<QuorlythGlyphName, ReactNode> = {
  brand: <><path d="M18.4 4.9A8.7 8.7 0 1 0 19 17.8"/><path d="M15.5 15.5 21 21"/><path d="M18.4 4.9 21 3.5"/></>,
  workspace: <><path d="m12 3.3 8.2 4.2L12 11.7 3.8 7.5 12 3.3Z"/><path d="m3.8 12 8.2 4.3 8.2-4.3"/><path d="m3.8 16.5 8.2 4.2 8.2-4.2"/><path d="M12 11.8v4.5"/></>,
  milestone: <><path d="M3.5 12h4.2"/><path d="M16.3 12h4.2"/><path d="m12 4.1 5.3 7.9-5.3 7.9L6.7 12 12 4.1Z"/><circle cx="12" cy="12" r="1.2"/></>,
  timeline: <><path d="M3 7.5h18"/><path d="M3 16.5h18"/><circle cx="7" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/><path d="M7 9.5v5.1M16.5 5v9.5"/></>,
  team: <><circle cx="12" cy="12" r="2.1"/><circle cx="5" cy="6" r="1.7"/><circle cx="19" cy="6" r="1.7"/><circle cx="5" cy="18" r="1.7"/><circle cx="19" cy="18" r="1.7"/><path d="m10.4 10.6-4-3.2M13.6 10.6l4-3.2M10.4 13.4l-4 3.2M13.6 13.4l4 3.2"/></>,
  idea: <><path d="m3.5 9 7.2-5.5 6.1 4.2-7.2 5.5L3.5 9Z"/><path d="m8.8 13.2 6.7-5.1 5 3.2-6.7 5.1-5-3.2Z"/><path d="m13.8 16.4 4.4-3.4 2.3 1.7-4.4 3.4-2.3-1.7Z"/><circle cx="6.3" cy="8.5" r=".65" fill="currentColor" stroke="none"/></>,
  review: <><path d="M4 6.5h3l1.1 1.1L10 5.7"/><path d="M12.5 6.5H20"/><path d="M4 12h3l1.1 1.1L10 11.2"/><path d="M12.5 12H20"/><path d="M4 17.5h3l1.1 1.1 1.9-1.9"/><path d="M12.5 17.5H20"/></>,
  plan: <><path d="M5 3.5h9l5 5v12H5z"/><path d="M14 3.5v5h5"/><path d="M8 12.5h8M8 16h5"/><path d="M3 7.5v14h13"/></>,
  person: <><circle cx="12" cy="8" r="3"/><path d="M5.5 20c.3-3.5 2.7-5.5 6.5-5.5s6.2 2 6.5 5.5"/><path d="m17.5 5.5 1.1 1.1 2-2"/></>,
  add: <><path d="M12 3.2v17.6M3.2 12h17.6"/><circle cx="12" cy="12" r="8.8"/><path d="M17.6 17.6 21 21"/></>,
  back: <><path d="M19.5 12H5"/><path d="m10.5 6.5-5.5 5.5 5.5 5.5"/><path d="M20 5v14"/></>,
  send: <><path d="M3 11.5 21 3l-5.8 18-3.4-7.2L3 11.5Z"/><path d="m11.8 13.8 5.7-6"/></>,
  edit: <><path d="m5 16.8-.8 4 4-.8L20 7.2 16.8 4 5 16.8Z"/><path d="m14.8 6 3.2 3.2"/><path d="M4 4h5M4 4v5"/></>,
  complete: <><path d="M18.7 5.3a8.7 8.7 0 1 0 2 8.8"/><path d="m8.3 12.2 2.5 2.5 6.9-7"/><path d="M18.8 3.5h2.7v2.7"/></>,
  start: <><path d="m8 4.5 10 7.5-10 7.5V4.5Z"/><path d="M4 4.5v15"/></>,
  blocked: <><path d="M3 12h5M16 12h5"/><circle cx="12" cy="12" r="4"/><path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6"/><path d="M5 5v3M19 16v3"/></>,
  calendar: <><path d="M4 6.5h16v14H4z"/><path d="M8 3.5v6M16 3.5v6M4 10.5h16"/><path d="m8 15 2 2 4-4"/><circle cx="18" cy="17" r="1"/></>,
  priority: <><path d="m12 3.2 2.3 4.5 5 .7-3.6 3.5.9 5-4.6-2.4-4.6 2.4.9-5-3.6-3.5 5-.7L12 3.2Z"/><path d="M12 7.5v3.4M12 13.1v.1"/></>,
  due: <><circle cx="12" cy="12" r="8.7"/><path d="M12 6.5v5.9l3.7 2.2"/><path d="M18 3.6 20.5 5"/></>,
  open: <><path d="M13.5 4H20v6.5"/><path d="M20 4 11 13"/><path d="M18 13v6.5H4.5V6H11"/></>,
  document: <><path d="M5 3.5h9l5 5v12H5z"/><path d="M14 3.5v5h5M8 12h8M8 15.5h8M8 19h4"/></>,
  progress: <><path d="M3.5 17.5h4.3V13H12v-4h4.2V4.5h4.3"/><path d="M4 21h16"/><circle cx="7.8" cy="11" r="1.2"/><circle cx="16.2" cy="7" r="1.2"/></>,
  checkpoint: <><path d="M4 12h4M16 12h4"/><path d="m12 3.5 6.2 8.5-6.2 8.5L5.8 12 12 3.5Z"/><circle cx="12" cy="12" r="2.2"/></>,
  community: <><path d="m12 3.5 8.5 4.2v8.6L12 20.5l-8.5-4.2V7.7L12 3.5Z"/><path d="m3.5 7.7 8.5 4.4 8.5-4.4M12 12.1v8.4"/><circle cx="12" cy="12" r="1.5"/></>,
  profile: <><circle cx="8" cy="8" r="2.4"/><circle cx="17" cy="9" r="2"/><path d="M3.8 19.5c.2-3 1.7-4.8 4.2-4.8s4 1.8 4.2 4.8M14 15c3.2-.8 5.6.8 6.2 3.8"/></>,
  settings: <><path d="M4 7.5h7M15 7.5h5M4 16.5h3M11 16.5h9"/><circle cx="13" cy="7.5" r="2"/><circle cx="9" cy="16.5" r="2"/></>,
}

export function QuorlythGlyph({ name, size = 20, className }: {
  name: QuorlythGlyphName
  size?: number
  className?: string
}) {
  return (
    <svg
      className={className || 'quorlyth-glyph'}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.45"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  )
}
