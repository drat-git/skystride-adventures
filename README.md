# SkyStride Adventures

A retro browser platformer built with Phaser3, TypeScript, Vite and Supabase. The V2 overhaul adds six scrolling courses, source-derived Astro Hop movement and sprites, enemies, power-ups, breakable/glowing blocks, and a complete title, pause, death and progression menu.

The V2 overhaul was developed on **`codex/skystride-game-overhaul`** and released to **`main`** on 9 November 2026. [Play the public game](https://drat-git.github.io/skystride-adventures/). Hosted Supabase has the three additive V2 migrations and six official courses; existing records remain intact. Development still uses a separate local database. Accounts, profiles, community courses, reliable draft saving, saved-version testing, publication, ratings, favorites, achievements, leaderboards, settings, and disabled AI placeholders remain integrated.

## Run locally

Use Node24 and npm:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5186**. The local API listens on5187. No hosted credentials are needed. The launcher overrides inherited environment configuration without editing `.env.local`, and development builds reject hosted URLs by default.

Create a dedicated local account through the game. Local authentication is a clearly labeled test fixture: it sends no confirmation emails, uses separate credentials and sessions, and cannot sign in to the public game. The database executes the actual PostgreSQL migrations, functions, constraints and row-level policies through PGlite. Data persists in the ignored `output/overhaul/local-db/` directory.

See [local setup and isolation](docs/LOCAL_DEVELOPMENT.md) for ports, storage, migration checksums, fixture limitations, and resetting local test data safely. Do not deploy the local API server.

## Play and create

Press any key or click the animated title to enter the main menu. **Play adventure** opens six official courses: two meadow, two cave, and two sky. All courses are available; completed courses and best times appear in **My progress**. Guest completions last for the current visit; signed-in published-course results are saved to the active database.

- Move with Left/Right or A/D. Jump with Space, Up or W; hold for a higher jump.
- Hit glowing blocks from below for coins or power-ups. Growth increases the player; fire enables X/J projectiles; stars give temporary contact protection. Large players can break brick blocks.
- Stomp walkers, remove wings from flying enemies, and kick shells through enemy groups. Damage reduces power before costing a life.
- Reach checkpoints and the finish flag. Optional coins count once, survive checkpoint retries, and reset on a fresh run.
- Escape or **Pause** opens Resume, Restart, Level list and Main menu. Death offers a checkpoint/start retry. Completion offers Next level, Replay, Level list and Main menu; course6 ends the adventure.
- **Sound on/off** controls the source-derived synthesized audio. **Settings** controls decorative reduced motion without changing gameplay physics or timing.

**Course workshop** provides all three themes, large scrollable maps, terrain/platforms, solid/breakable/glowing/hidden blocks, every power-up, coins, hazards, checkpoints, ground/flying enemies, moving platforms, solid obstacles and decorations. Pipes and pipe-entry behavior are excluded. The grid supports keyboard navigation and component inspection.

Save a private draft, select **Test saved version**, complete that exact revision, and wait for backend approval before publishing. **Preview draft** tests unsaved work locally and gives no publication approval. Any edit requires saving and retesting. Published courses are immutable; **Copy to new draft** starts a separate private course. Failed saves retain edits, stable IDs make ambiguous retries safe, and revision conflicts offer reload or a separate copy.

**Community courses** retains details, shared rating/favorite totals, personal rating replacement/removal, independent favorite toggles, sorting and My Favorites. Starting a recorded account run unlocks interactions; finishing is optional. Individual interactions remain private. Rankings show the top50 best completed times with shared ranks for ties. Achievements and profiles are available from the menu.

Legacy V1 courses remain readable during validation, including Classic practice and the existing timed First Flight award. The editor makes them read-only and can copy their topology into a new V2 draft. Their eventual retirement is separate from the first V2 rollout.

**AI Hint** and **AI Editor Feedback** remain disabled with honest unavailable messages and typed future context interfaces. They make no provider requests and never gate game or editor actions.

## Verify and build

```sh
npm test
npm run typecheck
npm run build
npm run test:browser
npm run test:editor
npm run test:runtime
npm run test:courses:ground
npm run test:courses:sky
npm run test:courses:final
npm run test:production
```

The opt-in real hosted journey is `node --env-file=.env.local scripts/test-overhaul-hosted.mjs`, using dedicated `TEST_EMAIL_A` / `TEST_PASSWORD_A` and `TEST_EMAIL_B` / `TEST_PASSWORD_B` credentials. It creates a clearly named published verification course and private copy, then exercises actual account interactions; it is not part of `npm test`.

Browser scripts need Playwright and Chromium. An existing module/executable can be supplied with `PLAYWRIGHT_MODULE` and `CHROME_PATH`; no browser dependency is bundled with the game. The main browser suite launches its own ephemeral local SQL/API fixture and Vite server. Runtime/editor scripts document their local fixture setup in their headers.

The tests retain the original domain/database checks and add V1/V2 geometry parity, populated upgrades, bounds and payload restrictions, publication/security, official seeds, progress, component editing, local HTTP persistence, source movement/hitboxes, and actual keyboard play. All six official courses have been completed with actual keyboard input. Browser evidence is stored in ignored `output/overhaul/` directories; see the [verification record](docs/OVERHAUL_VERIFICATION.md). Fixture authentication does not verify hosted Supabase Auth, email delivery or PostgREST.

`npm run build` type-checks and creates `dist/`. `GITHUB_ACTIONS=true npm run build` selects the GitHub Pages asset base `/skystride-adventures/`. The existing Pages workflow verifies and deploys pushes to `main`.

## Backend and cutover

The original eight tables and existing RPC contracts remain. V2 expands the bounded `levels.layout` JSON, adds server-owned official ordering, and aggregates account progress from completed attempts. Three additive migrations implement V1/V2 validation, six new official course records, and an expanded-geometry rendering limit. They were verified locally and applied to the current hosted Supabase project for this release.

Before deploying to the current Supabase project, inspect hosted history and apply only missing migrations. Do not rerun core creation scripts or overwrite existing records. Verify managed Auth/PostgREST, permissions, save/reload, publication, two-account community behavior, and new registration/confirmation on the hosted build. Completion remains client-reported within this class project's trust model; publication tests are not production anti-cheat.

The user permits V1 retirement after V2 is verified. [The overhaul notes](docs/OVERHAUL.md) describe the separate archive, affected-record inventory, achievement transition, cleanup and rollback steps. Accounts and already-earned awards are preserved. Existing rankings must never be attached to a replacement course layout under the same UUID.

## Sources and evidence

The active specification is retained unchanged at `output/overhaul/sources/overhaul-plan.rtf`, with its extraction, source index, baseline archive and evidence alongside it. Reread the full specification after context compaction. The older audit plan is paused and remains in `output/sprint4/sources/`.

Astro Hop by Nuno Amorim supplies the MIT-licensed reference code and first four course layouts. Kenney Pixel Platformer supplies CC0 art. Notices ship under `public/assets/astrohop/`; the in-game Credits screen links the sources. The two sky courses adapt the route and encounter structure of New Super Mario Bros. DS World7-6; no Nintendo artwork is shipped. Exact provenance, deliberate differences and test scope are in [OVERHAUL.md](docs/OVERHAUL.md).

Current acceptance focuses on desktop, per the user's scope decision. Report generation, presentation work, teammate coordination, live AI features and V1 retirement remain separate work. Historical deployed Sprint4 evidence remains in [VERIFICATION.md](docs/VERIFICATION.md); V2 release evidence is recorded in [OVERHAUL_VERIFICATION.md](docs/OVERHAUL_VERIFICATION.md).
