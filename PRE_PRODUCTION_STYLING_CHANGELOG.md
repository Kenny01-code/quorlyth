# Quorlyth pre-production styling changes

This is a source-only styling update to the uploaded local preview. It is not a production build and has not been deployed.

## Robot and QuorlythBot

- Set the robot shell, eye details, light bars, halo and glow to the requested orange `#F97316`.
- Kept the robot's mechanical joints charcoal and its metallic trim warm bone so the orange reads as orange rather than gold.
- Changed the robot's key and rim lighting to neutral white and reduced warm lighting that was shifting the shell toward gold.
- Kept the existing `terracotta` theme key for saved account preferences while renaming its visible label to **Quorlyth Orange**.
- Prevented deferred robot loading from capturing stale theme, calm or drag settings.
- Updated the launcher to a solid `#F97316` surface with a high-contrast dark icon and a lighter orange hover state.

## Review Queue

- Added a dedicated, wrapping community-filter row instead of relying on the Communities page's `.ctabs` styles.
- Rendered accessible community filters as white pills with dark text; the selected filter uses orange with dark text.
- Added pressed-state accessibility attributes, visible keyboard focus, and mobile wrapping for long community names.
- The displayed names remain data-driven from communities available to the signed-in account; no community records or access rules were changed.

## Branding, contrast and icons

- Removed the fixed silver gradient from the shared React logo so it can inherit a suitable colour from its background.
- Updated the public logo, favicon, social-preview SVG and browser theme colour to match the charcoal/orange identity.
- Darkened normal input placeholders to `#70685D` (approximately 4.57:1 against the warm-bone surface `#F0EAD9`).
- Darkened links on light cards to `#9B4632` (approximately 5.27:1 against `#F0EAD9`).
- Removed broad SVG colour overrides that were overriding provider and semantic icon colours. Social provider icons keep their own LinkedIn, Facebook, Instagram, WhatsApp, YouTube and other brand colours.
- Updated the Google mark to use its own brand class rather than the generic interface icon tint.
- Aligned older orange accents in the workflow, architecture, automation, promotion and standalone-workspace styling with the current orange token.

## Copy

- Updated the voice-studio description to explain the actual speech fallback order without claiming that no alternative voice is used.
- Updated the robot finish label and colour swatch to Quorlyth Orange.

## Verification performed

- CSS parsing: 40 stylesheets checked, 0 parser errors.
- Public SVG XML: 4 files parsed successfully.
- `src/bot/robot3d.ts`: JavaScript syntax check passed.
- `node --test server/quorlythbot-voice-policy.test.mjs`: 13 tests passed.

## Not performed (by request)

- No Vite/TypeScript production build was run.
- No browser preview was generated.
- No Vercel preview, deployment, promotion or rollback was run.
- No Git commit or push was made.

A full app build and visual browser review remain the next verification steps after the updated source has been reviewed and approved.
