import type { ReactNode } from 'react'

export type QuorlythGlyphName =
  | 'brand' | 'workspace' | 'milestone' | 'timeline' | 'team' | 'idea'
  | 'review' | 'plan' | 'person' | 'add' | 'back' | 'send' | 'edit'
  | 'complete' | 'start' | 'blocked' | 'calendar' | 'priority' | 'due'
  | 'open' | 'document' | 'progress' | 'checkpoint' | 'community'
  | 'profile' | 'settings' | 'message' | 'share' | 'lock' | 'arrow-up' | 'arrow-up-right'
  | 'arrow' | 'check' | 'close' | 'minimize' | 'surface' | 'invite' | 'hold'
  | 'search' | 'mail' | 'eye' | 'alert' | 'bell' | 'save' | 'camera' | 'tag'
  | 'rotate' | 'keys' | 'database' | 'link' | 'pin' | 'phone' | 'phone-off'
  | 'video' | 'mic' | 'mic-off' | 'camera-off' | 'voice' | 'wave' | 'expand'
  | 'shrink' | 'menu' | 'folder' | 'book' | 'star' | 'trash' | 'panel'
  | 'copy' | 'redo' | 'sliders' | 'stage' | 'live' | 'stop' | 'palette' | 'pause'

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
  message: <><path d="M4 4.5h16v12H11l-5 4v-4H4z"/><path d="M8 8.5h8M8 12h5"/></>,
  share: <><circle cx="18" cy="5" r="2.2"/><circle cx="6" cy="12" r="2.2"/><circle cx="18" cy="19" r="2.2"/><path d="m8 10.9 8-4.7M8 13.1l8 4.7"/></>,
  lock: <><rect x="4.5" y="10" width="15" height="10" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v2.4"/></>,
  'arrow-up': <><path d="M12 20V4.5M5.5 11l6.5-6.5 6.5 6.5"/></>,
  'arrow-up-right': <><path d="M6 18 18 6M8 6h10v10"/></>,
  arrow: <><path d="M3.5 12h16.5M13.5 5.5 20 12l-6.5 6.5"/></>,
  check: <><path d="m4.5 12.5 4.2 4.1L19.5 5.8"/><path d="M3.5 20.5h17"/></>,
  close: <><path d="m5.5 5.5 13 13M18.5 5.5l-13 13"/><circle cx="12" cy="12" r="9"/></>,
  minimize: <><path d="M4 12h16"/><path d="M6 17h12"/></>,
  surface: <><path d="M3.5 17h17"/><path d="M6 17a6 6 0 0 1 12 0"/><path d="M12 3.5v3M5.5 7l2 2M18.5 7l-2 2"/></>,
  invite: <><circle cx="9" cy="8" r="3"/><path d="M3 19c.4-3 2.4-5 6-5M17.5 11v7M14 14.5h7"/></>,
  hold: <><path d="M8 5v14M16 5v14"/><path d="M4.5 3.5h15v17h-15z"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.8"/><path d="m15.5 15.5 5 5"/><path d="M8 10.5h5"/></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4.5 7 7.5 6 7.5-6"/></>,
  eye: <><path d="M2.5 12s3.2-6.1 9.5-6.1 9.5 6.1 9.5 6.1-3.2 6.1-9.5 6.1S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
  alert: <><path d="m12 3.5 9 16H3z"/><path d="M12 9v4M12 16v.1"/></>,
  bell: <><path d="M5.5 16v-5a6.5 6.5 0 0 1 13 0v5l1.5 2H4z"/><path d="M10 21h4"/></>,
  save: <><path d="M6 3.5h12l2 3v14H4v-17z"/><path d="M8 3.5v6h8v-6M8 20.5v-7h8v7"/></>,
  camera: <><path d="M4 8h3l1.5-2h7L17 8h3v12H4z"/><circle cx="12" cy="14" r="3.5"/></>,
  tag: <><path d="M3.5 12V4.5h8l9 8.5-8 7.5z"/><circle cx="8" cy="8.5" r="1.1"/></>,
  rotate: <><path d="M20 11a8 8 0 1 1-2.5-5.8"/><path d="M20 4v6h-6"/></>,
  keys: <><circle cx="8" cy="15.5" r="4"/><path d="m11 12.5 9-9M15 8.5l2.5 2.5M17 6.5l2 2"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="2.5"/><path d="M4 5v14c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V5M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5"/></>,
  link: <><path d="M9.5 14.5 14.5 9.5"/><path d="M7.5 16.5 5.8 18a3.5 3.5 0 0 1-5-5l4-4a3.5 3.5 0 0 1 5 0" transform="translate(1 0)"/><path d="m16.5 7.5 1.7-1.7a3.5 3.5 0 0 1 5 5l-4 4a3.5 3.5 0 0 1-5 0" transform="translate(-1 0)"/></>,
  pin: <><path d="m8 3 8 0-1.5 5 4 4H5.5l4-4L8 3Z"/><path d="M12 12v9"/></>,
  phone: <><path d="M7 3.5 4.5 5c-.9.5-.9 2.5.3 5 2 4.1 5.1 7.2 9.2 9.2 2.5 1.2 4.5 1.2 5 .3l1.5-2.5-5-3-2.1 2.1c-2.1-.9-3.7-2.5-4.6-4.6L11 9.4z"/></>,
  'phone-off': <><path d="M5 6c.8 4.2 4.8 8.2 9 9M8.5 3.5 5 5M14.5 18.5 18 17"/><path d="M4 4 20 20"/></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/><path d="M7 9.5h5"/></>,
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"/></>,
  'mic-off': <><rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7M4 4l16 16"/></>,
  'camera-off': <><path d="M4 8h3l1.5-2h7L17 8h3v12H4z"/><circle cx="12" cy="14" r="3.5"/><path d="M4 4 20 20"/></>,
  voice: <><path d="M4 10v4M8 6v12M12 3.5v17M16 6v12M20 10v4"/></>,
  wave: <><path d="M3 13h3l2-6 3.5 11 3.5-11 2 6h4"/></>,
  expand: <><path d="M9 4H4v5M15 4h5v5M4 15v5h5M20 15v5h-5"/><path d="M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5"/></>,
  shrink: <><path d="M9 4v5H4M15 4v5h5M4 15h5v5M20 15h-5v5"/></>,
  menu: <><path d="M4 6.5h16M4 12h16M4 17.5h16"/><circle cx="4" cy="6.5" r=".7" fill="currentColor"/><circle cx="4" cy="17.5" r=".7" fill="currentColor"/></>,
  folder: <><path d="M3.5 7h7l2 2h8v10.5h-17z"/><path d="M3.5 7V5h6l2 2"/></>,
  book: <><path d="M4 4.5h12a3.5 3.5 0 0 1 3.5 3.5v11H7a3 3 0 0 1-3-3z"/><path d="M4 15h15.5M8 8h7M8 11h5"/></>,
  star: <><path d="m12 3.2 2.4 5 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/></>,
  trash: <><path d="M4.5 7h15M9 7V4h6v3M6.5 7l1 13h9l1-13M10 10.5v6M14 10.5v6"/></>,
  panel: <><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9 4.5v15M12.5 8h4.5M12.5 11h4.5"/></>,
  copy: <><rect x="8" y="7" width="12" height="13" rx="2"/><path d="M16 7V4H5v13h3"/></>,
  redo: <><path d="M20 11a8 8 0 1 1-2.5-5.8"/><path d="M20 4v6h-6"/></>,
  sliders: <><path d="M4 6h7M15 6h5M4 12h3M11 12h9M4 18h9M17 18h3"/><circle cx="13" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="15" cy="18" r="2"/></>,
  stage: <><path d="M3.5 19.5h17M6 19.5V9l6-5 6 5v10.5"/><path d="M9 19.5v-6h6v6"/><circle cx="12" cy="9" r="1.2"/></>,
  live: <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></>,
  stop: <><rect x="5.5" y="5.5" width="13" height="13" rx="2"/><path d="M9 9h6v6H9z"/></>,
  palette: <><path d="M12 3.5a8.5 8.5 0 1 0 0 17h1a2.2 2.2 0 0 0 0-4.4h-.7a1.7 1.7 0 0 1 0-3.4H16a4.5 4.5 0 0 0 4.5-4.5c0-2.6-3.6-4.7-8.5-4.7Z"/><circle cx="7.5" cy="10" r=".8" fill="currentColor"/><circle cx="10" cy="6.7" r=".8" fill="currentColor"/><circle cx="14.4" cy="7.2" r=".8" fill="currentColor"/><circle cx="16.2" cy="10.5" r=".8" fill="currentColor"/></>,
  pause: <><path d="M8 5.5v13M16 5.5v13"/><path d="M4 3.5h16v17H4z"/></>,
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
      style={{ ['--s' as any]: size + 'px' }}
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  )
}
