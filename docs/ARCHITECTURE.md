# Architecture and source map

SkyStride uses a shared Phaser/TypeScript game with three delivery options: a Vite build on GitHub Pages, an Electron Apple Silicon Mac app, and a portable Electron Windows x64 backup. All hosted clients use the same accounts and application database. The Windows build is untested.

## Source map

| Location | Responsibility |
| --- | --- |
| `src/main.ts`, `src/styles.css` | Title/menu/navigation, account/community/progress screens, DOM HUD and overlays |
| `src/game.ts` | Gameplay mounting, focus, visibility, completion callbacks, cleanup |
| `src/runtime/` | Phaser scenes, player/enemies, collisions, blocks/power-ups, audio, run state |
| `src/editor.ts`, `src/editor-tools.ts` | Course Maker, component tools, draft lifecycle and saved-version testing |
| `src/course-format.ts`, `src/level.ts` | Bounded V2 layout contract and validation |
| `src/content/` | Six official course definitions and ordering |
| `src/backend.ts`, `src/auth.ts` | Supabase queries/RPCs, account input validation and session integration |
| `src/attempt.ts`, `src/settings.ts`, `src/catalog.ts` | Attempt rules, device settings, deterministic discovery ordering |
| `src/ai.ts`, `src/ai-contract.ts`, `src/ai-service.ts` | Client cancellation/context, typed contracts, shared server validation/provider logic |
| `supabase/migrations/` | Ordered transactional schema, validation, RLS, RPC and content upgrades |
| `supabase/functions/` | Origin-restricted web and desktop AI endpoints |
| `desktop/main.cjs` | Secure local asset protocol and Electron window/session lifecycle |
| `vite.config.ts`, `vite.desktop.config.ts` | Independent web and desktop asset builds |
| `scripts/package-mac.mjs`, `scripts/package-windows.mjs` | Allowlisted desktop staging, runtime checksums and distributable archives |
| `scripts/dev-local.mjs`, `scripts/local-backend.mjs` | Isolated development launcher and PostgreSQL/Auth/REST fixtures |
| `tests/`, `scripts/test-*.mjs` | Unit/SQL tests and opt-in local/hosted/browser/desktop journeys |

## Game and editor lifecycle

Phaser owns gameplay simulation/rendering; DOM controls provide navigation, account forms, HUDs, and overlays. The mounted game exposes scoped cleanup and state callbacks. Gameplay input clears on focus changes and pauses while forms are edited or the tab is hidden. Pause freezes active run timing. Fullscreen targets the gameplay container, which survives restart/replay/next-course transitions; menu navigation exits fullscreen.

Course layouts are declarative V2 JSON, with three themes and allowlisted components. No executable course scripts, external asset URLs, pipes, or entry/teleport hooks are accepted. Client and SQL validators enforce geometry and resource limits; neither establishes reachability.

Drafts have stable client-generated UUIDs and server-managed revisions. Saves use expected revisions and tolerate identical ambiguous retries. Saved-version testing records the owner, course and exact revision. Publication rechecks those facts atomically. Published courses remain immutable; copies receive new IDs and independent approval. Unsaved local previews do not create approval, rankings, or completion awards.

## Hosted data and AI

Supabase Auth manages credentials and sessions. Eight public application tables hold profiles, courses, attempts, ratings, favorites, achievement definitions/awards, and draft playtests. RLS and checked RPCs enforce account ownership, interaction eligibility, immutable publication and bounded completion results. Private `ai_usage` counters enforce authenticated provider limits. No provider secret is shipped to a client.

The web client calls `ai-assist`, allowing the existing GitHub Pages origin. Desktop builds call `ai-assist-desktop`, allowing `app://skystride`. Both reuse the same server contracts, managed-user validation, quota and OpenAI integration. Hints leave the run paused; editor feedback concerns the current unsaved draft. Advice never changes saved content or bypasses testing.

The server trusts clients to report gameplay outcomes within bounded values and duration checks. This class-project model is not authoritative multiplayer simulation or production anti-cheat. [Database contracts](DATABASE.md) and [AI behavior](AI.md) document the detailed limits.

## Desktop isolation and delivery

Electron loads bundled files through a restricted standard/secure `app://skystride` protocol. The renderer has no Node integration or privileged bridge. Context isolation, sandboxing, web security and CSP are enabled; arbitrary navigation, webviews and permissions are denied. Public Supabase configuration is bundled intentionally; server credentials remain hosted.

Desktop compilation writes `dist-desktop/`, leaving the web's `dist/` independent. A desktop-only transform changes the AI function name without altering shared game source. Mac and Windows archives are separate release assets. Each app/browser keeps its own session and local settings, while database-backed records are shared. Official guest courses/assets are bundled for offline desktop play; cloud features require internet and offline results are not queued.

The local development API runs real migrations and RLS in PGlite with fixture Auth/REST. It uses separate credentials/storage and does not contact production or a paid model. Never publish that fixture server as a backend.
