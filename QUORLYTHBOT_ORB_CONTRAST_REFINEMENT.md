# QuorlythBot Orb & Contrast Refinement

## Visual direction
- Establishes one Quorlyth palette for the bot surfaces: terracotta `#D97755`, orange accent `#F97316`, deep terracotta `#B85B40`, warm bone `#F0EAD9`, and ink `#211A17`.
- Retains the existing animated 3D robot in chat, retuned from bright orange to the site's terracotta material with bone/terracotta lighting and a clear orange signal accent.
- Adds a dedicated Three.js voice orb for Voice and Live Talk views. Its shader creates layered fluid currents, restrained energy filaments, an outer clearcoat, fine orbital traces, and terracotta/orange glow.
- Reuses the existing RobotApi so talk, listen, think, cheer, spin, theme, active and calm controls continue to drive the visual without changing chat or voice behavior.
- Respects `prefers-reduced-motion`, stops rendering while inactive/hidden, observes stage resizing, caps device pixel ratio, and disposes its renderer/materials/listeners.

## Contrast refinement
- Replaces pure-white low-contrast copy in QuorlythBot with warm-bone text on dark surfaces and ink text on light inset cards/sidebar surfaces.
- Updates bot glyph icons to inherit semantic surface contrast instead of forcing a single white/green/blue tint.
- Updates status, focus, selected and action states to terracotta/orange, while keeping external/provider marks out of generic icon recoloring.
- Keeps all changes scoped to QuorlythBot and its stage. Global site navigation and top navigation styles are not modified.

## Files
- `src/bot/Orb.tsx` (new voice orb component)
- `src/bot/orb3d.ts` (new Three.js orb renderer)
- `src/bot/robot3d.ts` (existing humanoid robot lighting refinement)
- `src/bot/robot-themes.ts` (canonical Quorlyth terracotta palette)
- `src/bot/QuorlythBot.tsx` (switches to orb only in Voice/Live Talk, robot remains in chat)
- `src/styles/bot.css`
- `src/styles/bot-room-theme.css`

## Validation
- TypeScript/TSX syntax transpilation passed for all six updated/new TS/TSX files.
- CSS parsing passed for both bot stylesheets with zero parse errors.
- QuorlythBot voice-policy test suite passed (13/13).
- A full local Vite build was not run because npm dependency downloads could not reach registry.npmjs.org in this environment. Vercel's remote build should be used to perform the full project typecheck and production bundle build for the preview.

This is an incremental patch for the existing Quorlyth project. It does not include credentials, environment files, Vercel project metadata, dependencies, or build output.
