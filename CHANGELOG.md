# Changelog

## 0.2.0 — 9 November 2026

### Game and online features

- Replaced the original frontend and active V1 courses with the V2 platformer: six meadow/cave/sky courses, Astro Hop-derived movement and animation, enemies, shells, power-ups, blocks, moving platforms and themed scenery.
- Added an animated looping title and consistent pause, death, replay, next-course and menu navigation.
- Expanded Course Maker to the V2 components while retaining reliable draft retries, revision conflicts, saved-version playtests and immutable publishing.
- Retained account/cloud progress, community ratings/favorites, discovery, achievements and rankings. Added score rankings and three challenges per official course, with 21 achievement definitions in total.
- Added gameplay-only fullscreen that persists through restart and next-course transitions. Locked achievement icons are faded red and earned icons are green.
- Removed lives; retries are unlimited. Added equal timer emphasis, saved fastest-completion displays and an original sky music loop.
- Disabled signup email confirmation. New passwords require uppercase/lowercase letters, a number, a symbol, and 8–128 characters.
- Implemented real authenticated AI hints and unsaved-draft feedback through server-side OpenAI calls with quotas and cancellation.

### Desktop distribution

- Added a verified Electron app for **Apple Silicon Macs**, with bundled official courses and shared online accounts/data. It is ad-hoc signed and not Apple-notarized.
- Added an **unsigned Windows x64 portable backup**. It was cross-packaged on macOS; no Windows tests or runtime verification were performed.
- Added the desktop-only AI endpoint without changing the website's endpoint or URL.
- Published app ZIPs, checksums and installation notes through [GitHub Releases](https://github.com/drat-git/skystride-adventures/releases/tag/v0.2.0), separate from the source tree and Pages deployment.

### Verification and limits

The latest recorded Mac milestone passed 297 automated checks across 18 files, TypeScript/build, and six real packaged-app acceptance groups. V2 verification separately completed all six official courses with keyboard input and checked hosted persistence and real AI. These records do not establish Windows runtime compatibility. See [verification history](docs/OVERHAUL_VERIFICATION.md).

Earlier sprint records are retained as historical evidence. Report/presentation updates remain separate from this release.
