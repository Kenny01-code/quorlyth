# Quorlyth Community & Contrast Refinement

## Community collections
- Replaced the old `My Communities`, `Joined`, and `Discover` generic chips with a counted, responsive collection switcher.
- Added clear active, hover, pressed, and keyboard-focus states using the Quorlyth orange/charcoal/bone palette.
- Counts now reflect the communities available in each collection.

## Community search
- Added a premium, responsive search field with a dedicated orange search mark, high-contrast placeholder, live query state, and a clear button.
- Search filters the active collection immediately by community name, creator name, and community purpose.
- Added a useful no-results state and a one-click clear-search action.

## Sitewide contrast refinement
- Normalized Quorlyth's own glyph icons on dark and light surfaces to bone and charcoal respectively, with ink on orange actions.
- Standardized shared buttons and chips so labels and icons remain readable on both dark page surfaces and light cards.
- Refined creator and community-member badges for legibility on light cards.
- Preserved external brand marks such as Google branding.

## Files in this patch
- `src/screens/Communities.tsx`
- `src/main.tsx`
- `src/styles/community-experience.css`
- `QUORLYTH_COMMUNITY_REFINEMENT_CHANGELOG.md`

This is a source patch for the existing Quorlyth project. It does not include credentials, environment files, Vercel project metadata, dependencies, or build output.
