# Quorlyth Contrast + QuorlythBot Orange Refinement

## Main contrast correction
- The shared `room-theme.css` was the root cause of much of the washed-out copy: warm-bone `.glass` cards were being paired with page-level translucent white labels and icon colors. The shared surface rules now make regular card copy ink (`#211A17`), supporting copy soft ink (`#51483D`), and card glyphs deep orange (`#C2410C`).
- Dark inset areas retain warm-bone text (`#F0EAD9`, `#E4DCC9`, `#D7CBB9`) and use bright orange (`#F97316`) glyphs. This includes automation previews/runtime panels, collaboration evidence/file panels, social publishing/provider details, architecture/workflow maps, backup privacy panels, standalone workspace task/evidence surfaces, and the dedicated Messages room.
- Explicit low-opacity white text colors in the active page styles were replaced with solid warm-bone tones on dark inset surfaces. Disabled control states and semantic success/error/warning colors were not globally forced to full opacity or recolored.
- Text links on warm-bone cards remain terracotta-dark; filled orange actions use ink text/icons for clarity.
- The top navigation section in `room-theme.css` was byte-compared against the uploaded source and is unchanged. The shared contrast selectors are scoped under `#root #main`, not the navigation shell.

## QuorlythBot single visual authority
- The saved theme key remains `terracotta` to preserve existing local preferences, but its display name is now **Quorlyth Orange**.
- The robot shell, eyes, halo, glows, orb accents and rim light use the exact favicon orange `#F97316`. Mechanical joints remain charcoal and trim stays warm bone.
- The legacy Bot skin blocks were removed from `app.css` and the duplicate Bot material block was removed from `room-theme.css`. `bot-room-theme.css` now owns Bot colors, surfaces, icon colors, launcher material, sidebar and context-menu visuals; `bot.css` continues to provide layout, responsiveness and motion.
- The launcher is solid orange with an ink glyph and an orange focus/halo treatment.
- The right-click / three-dot chat menu now uses a solid warm-bone surface, ink labels, deep-orange icons, larger 47px actions, clearer hover/focus states, and a responsive 320px desktop maximum. It sizes to its content and scrolls only when its available height is exceeded.

## Verification
- All 41 CSS stylesheets passed a parser/declaration syntax check.
- The site navigation block was verified unchanged.
- The available server test suite produced 134 passing tests. One test module could not load because `@electric-sql/pglite` was absent after dependency installation timed out; this is an environment/dependency issue, not a reported styling test failure.
- A full `npm run build` could not be completed in this environment because `npm ci` timed out before Vite and TypeScript binaries were installed. Please use the preview deployment's Vercel build as the final build check.
- No production deployment or production alias was changed.


### Preview build correction
- Fixed the TypeScript literal-comparison error in `src/bot/orb3d.ts` by parsing the active theme's hex `g2` value rather than comparing against a stale hard-coded palette string.
