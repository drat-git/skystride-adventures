# SkyStride Adventures

A retro browser platformer built with Phaser3, TypeScript, Vite and Supabase. The V2 overhaul adds six scrolling courses, source-derived Astro Hop movement and sprites, enemies, power-ups, breakable/glowing blocks, and a complete title, pause, death and progression menu.

The V2 overhaul was developed on **`codex/skystride-game-overhaul`** and released to **`main`** on 9 November 2026. [Play the public game](https://drat-git.github.io/skystride-adventures/). Hosted Supabase now accepts V2 courses only. The six official courses, accounts and V2 records are retained; V1 courses and their dependent records have been retired. Development still uses a separate local database. Accounts, profiles, community courses, reliable draft saving, saved-version testing, publication, ratings, favorites, achievements, leaderboards, settings, and OpenAI gameplay hints/editor feedback remain integrated.

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
- Stomp walkers, remove wings from flying enemies, and kick shells through enemy groups. Damage reduces power before causing a death. Retries are unlimited; there is no lives counter.
- Current courses start with a 150-second limit. Elapsed time and time remaining have equal HUD emphasis; your saved **Fastest completion** appears beneath elapsed time and alongside completed courses in **My progress**.
- Reach checkpoints and the finish flag. Optional coins count once, survive checkpoint retries, and reset on a fresh run.
- Escape or **Pause** opens Resume, Restart, Level list and Main menu. Death offers a checkpoint/start retry. Completion offers Next level, Replay, Level list and Main menu; course6 ends the adventure.
- **Sound on/off** controls synthesized audio, including the original “Skyward Steps” track for sky courses. **Settings** controls decorative reduced motion without changing gameplay physics or timing.

**Course Maker** provides all three themes, large scrollable maps, terrain/platforms, solid/breakable/glowing/hidden blocks, every power-up, coins, hazards, checkpoints, ground/flying enemies, moving platforms, solid obstacles and decorations. Pipes and pipe-entry behavior are excluded. The grid supports keyboard navigation and component inspection.

Save a private draft, select **Test saved version**, complete that exact revision, and wait for backend approval before publishing. **Preview draft** tests unsaved work locally and gives no publication approval. Any edit requires saving and retesting. Published courses are immutable; **Copy to new draft** starts a separate private course. Failed saves retain edits, stable IDs make ambiguous retries safe, and revision conflicts offer reload or a separate copy.

**Community courses** retains details, shared rating/favorite totals, personal rating replacement/removal, independent favorite toggles, sorting and My Favorites. Starting a recorded account run unlocks interactions; finishing is optional. Individual interactions remain private. Rankings switch between the top50 fastest completions and highest completed-run scores, with shared ranks for ties. Each of the six official courses has separate all-coins, under-15-second, and SMALL-only achievements. SMALL-only requires avoiding growth, fire and star power for the entire attempt; checkpoint retries retain challenge state. Profiles show the signed-in player’s email.

V1 courses, the Classic practice menu, legacy renderer/editor conversion and old seed scripts have been removed. Only V2 courses can be loaded or saved. The timed achievement now rewards Meadow Run in under 30 seconds; previously earned awards remain intact under their stable database identity.

**AI Hint** is available to signed-in players from the pause overlay, including fullscreen. The run stays paused while a context-specific hint is generated and read. **AI Editor Feedback** reviews the current unsaved draft and gives an assessment plus three suggestions; edits invalidate the feedback. Neither feature approves publication or blocks ordinary play/editing. The hosted Edge Function keeps the OpenAI key private and limits requests to 5/minute and 50/day per account, with a 200/day project cap. See [AI setup and verification](docs/AI.md). Local development has no model key and shows an honest unavailable message.

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
npm run test:title
node scripts/test-ai-browser.mjs
```

The opt-in real hosted journey is `node --env-file=.env.local scripts/test-overhaul-hosted.mjs`, using dedicated `TEST_EMAIL_A` / `TEST_PASSWORD_A` and `TEST_EMAIL_B` / `TEST_PASSWORD_B` credentials. Recreate dedicated test accounts and these private environment variables before rerunning it: the previous accounts and credentials were removed in the account reset. It creates a clearly named published verification course and private copy, then exercises actual account interactions; it is not part of `npm test`.

Browser scripts need Playwright and Chromium. An existing module/executable can be supplied with `PLAYWRIGHT_MODULE` and `CHROME_PATH`; no browser dependency is bundled with the game. The main browser suite launches its own ephemeral local SQL/API fixture and Vite server. Runtime/editor scripts document their local fixture setup in their headers.

The tests retain the original domain/database checks and add V1/V2 geometry parity, populated upgrades, bounds and payload restrictions, publication/security, official seeds, progress, component editing, local HTTP persistence, source movement/hitboxes, and actual keyboard play. All six official courses have been completed with actual keyboard input. Browser evidence is stored in ignored `output/overhaul/` directories; see the [verification record](docs/OVERHAUL_VERIFICATION.md). Fixture authentication does not verify hosted Supabase Auth, email delivery or PostgREST.

`npm run build` type-checks and creates `dist/`. `GITHUB_ACTIONS=true npm run build` selects the GitHub Pages asset base `/skystride-adventures/`. The existing Pages workflow verifies and deploys pushes to `main`.

## Backend and cutover

The original eight tables and existing RPC contracts remain. V2 expands the bounded `levels.layout` JSON, adds server-owned official ordering, and aggregates account progress from completed attempts. The three initial V2 migrations added format support, official records and a rendering limit. A fourth, transactional retirement migration now removes V1 courses and their dependent records, drops V1 validation and retargets the timed achievement. Accounts, earned awards and V2 data were verified unchanged across retirement.

Before deploying to the current Supabase project, inspect hosted history and apply only missing migrations. Do not rerun core creation scripts or overwrite existing records. Verify managed Auth/PostgREST, permissions, save/reload, publication, two-account community behavior, and new registration with an immediate authenticated session on the hosted build. Email verification is disabled. Completion remains client-reported within this class project's trust model; publication tests are not production anti-cheat.

[The overhaul notes](docs/OVERHAUL.md) record the completed V1 retirement and subsequent account reset. Historical migration files and migration-test fixtures remain solely to reproduce and verify upgrades; the running application and current database have no V1 course support. The raw account recovery archives were deleted during the reset.

On 9 November 2026, the user requested a complete account reset and removal of email verification. All hosted accounts and their courses, progress, interactions, awards and sessions were deleted; local preview account data and stored account recovery copies were also removed. The six built-in V2 courses and three achievement definitions were preserved. A temporary real registration verified immediate sign-in, profile creation and subsequent login, then was deleted. New players must create a fresh account; no confirmation email is required.

New passwords require 8–128 characters with at least one uppercase letter, one lowercase letter, one digit and one ASCII punctuation symbol (for example `!`, `@` or `#`). The signup form and local Auth fixture validate this rule. Hosted Supabase Auth must keep **Minimum password length = 8** and **Password requirements = Lowercase, uppercase letters, digits and symbols**; direct hosted requests enforce these requirements too. Existing-account sign-in does not apply new-password validation.

## Sources and evidence

The active specification is retained unchanged at `output/overhaul/sources/overhaul-plan.rtf`, with its extraction, source index, baseline archive and evidence alongside it. Reread the full specification after context compaction. The older audit plan is paused and remains in `output/sprint4/sources/`.

Astro Hop by Nuno Amorim supplies the MIT-licensed reference code and first four course layouts. Kenney Pixel Platformer supplies CC0 art. Notices ship under `public/assets/astrohop/`; the in-game Credits screen links the sources. The two sky courses adapt the route and encounter structure of New Super Mario Bros. DS World7-6; no Nintendo artwork is shipped. Exact provenance, deliberate differences and test scope are in [OVERHAUL.md](docs/OVERHAUL.md).

Current acceptance focuses on desktop, per the user's scope decision. Report generation, presentation work, and teammate coordination remain separate work. Live AI setup and evidence are documented in [AI.md](docs/AI.md). Historical deployed Sprint4 evidence remains in [VERIFICATION.md](docs/VERIFICATION.md); V2 release evidence is recorded in [OVERHAUL_VERIFICATION.md](docs/OVERHAUL_VERIFICATION.md).
