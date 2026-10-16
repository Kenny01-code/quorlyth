import { QuorlythGlyph, QuorlythGlyphName } from '../components/QuorlythGlyph'

/**
 * Legacy feature names remain supported, but every rendered symbol now comes
 * from Quorlyth's own glyph family instead of an external/generic icon set.
 */
const GLYPH_FOR_ICON: Record<string, QuorlythGlyphName> = {
  'message': 'message',
  'share': 'share',
  'lock': 'lock',
  'arrow-up': 'arrow-up',
  'arrow-up-right': 'arrow-up-right',
  'arrow-left': 'back',
  'arrow': 'arrow',
  'check': 'check',
  'x': 'close',
  'minimize': 'minimize',
  'users': 'team',
  'community': 'community',
  'idea': 'idea',
  'collab': 'workspace',
  'surface': 'surface',
  'spark': 'brand',
  'rank': 'progress',
  'select': 'complete',
  'promote': 'open',
  'audience': 'team',
  'member': 'person',
  'contribute': 'add',
  'approve': 'complete',
  'hold': 'hold',
  'more': 'menu',
  'decline': 'close',
  'queue': 'review',
  'insight': 'progress',
  'home': 'brand',
  'discuss': 'message',
  'support': 'add',
  'private': 'lock',
  'status': 'due',
  'publish': 'send',
  'invite': 'invite',
  'search': 'search',
  'settings': 'settings',
  'mail': 'mail',
  'eye': 'eye',
  'alert': 'alert',
  'bell': 'bell',
  'save': 'save',
  'edit': 'edit',
  'camera': 'camera',
  'tag': 'tag',
  'rotate': 'rotate',
  'keys': 'keys',
  'db': 'database',
  'link': 'link',
  'pin': 'pin',
  'eye2': 'eye',
  'phone': 'phone',
  'phone-off': 'phone-off',
  'video': 'video',
  'mic-off': 'mic-off',
  'camera-off': 'camera-off',
  'mic': 'mic',
  'voice': 'voice',
  'send': 'send',
  'wave': 'wave',
  'expand': 'expand',
  'shrink': 'shrink',
  'menu': 'menu',
  'plus': 'add',
  'folder': 'folder',
  'book': 'book',
  'star': 'star',
  'trash': 'trash',
  'panel': 'panel',
  'copy': 'copy',
  'redo': 'redo',
  'sliders': 'sliders',
  'stage': 'stage',
  'live': 'live',
  'stop': 'stop',
  'palette': 'palette',
}

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const glyph = GLYPH_FOR_ICON[name] || 'brand'
  return <QuorlythGlyph name={glyph} size={size} className="ic" />
}

export function GoogleG({ size = 18 }: { size?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" style={{ ['--s' as any]: size + 'px', fill: 'currentColor', stroke: 'none' }} aria-hidden="true">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  )
}
