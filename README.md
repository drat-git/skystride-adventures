# SkyStride Adventures

SkyStride Adventures is a browser platformer built with Phaser, TypeScript, Vite and Supabase, hosted through GitHub Pages. This Sprint 4 implementation completes the planned non-AI game flows: course creation, saved-version playtests and publishing, collectibles, settings, community discovery, ratings and favorites, alongside accounts, saved completions, achievements and leaderboards.

The two real AI features remain deferred. **AI Hint** and **AI Editor Feedback** are disabled controls with unavailable messages and typed future context interfaces. They do not call a model provider or block playing, saving, testing or publishing. Report editing and presentation work are outside this implementation phase.

For observed test and deployment results, see [verification notes](docs/VERIFICATION.md). Feature implementation alone is not evidence that a particular hosted build or email-confirmation flow has passed acceptance.

## Run and build

Use Node 24, as in the GitHub Actions workflow, and npm. No IDE is required.

```sh
npm ci
cp .env.example .env.local
# Fill in the Supabase project URL and public publishable/anon key.
npm run dev
```

The app runs at `http://127.0.0.1:5173` unless Vite selects another available port. Restart Vite after changing environment configuration.

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

`build` includes TypeScript checking and writes the deployable frontend to `dist`. Without Supabase configuration, the app allows clearly labeled local practice and device settings; it does not simulate accounts, successful database reads or saved progress.

## Implemented game flows

- **Accounts and progress:** register/sign in, edit a display name, retain provider sessions, sign out, record published-course attempts and completions, earn three achievements, and view each course's top-50 best-time leaderboard.
- **Creator courses:** create a grid layout with platforms, hazards, start/finish, checkpoints and items; save private drafts; reload private and published courses; copy published courses into new private drafts. Published geometry and metadata remain immutable.
- **Reliable editing:** track unsaved changes, warn before discarding edits or leaving, preserve edits after failed saves, use stable draft UUIDs for retry, and detect concurrent revision conflicts. Reload or copy local edits into a separate draft after a conflict.
- **Tested publication:** preview current edits locally, or test the exact saved revision through an authenticated playtest. Publication becomes available after confirmed successful completion of the saved version. Saved changes require a new test; the backend rejects stale, foreign-owned or untested publication.
- **Collectibles:** place optional items, see collected/total in the HUD and completion summary, retain collected items through deaths, and reset them on restart. Counts are local to the attempt and do not affect completion eligibility.
- **Community:** view course details and shared rating/favorite totals, set/update/remove a 1–5 rating, favorite/unfavorite independently, sort by title/rating/favorites, and filter My Favorites. A recorded play attempt unlocks personal interactions; finishing is optional. Individual interaction rows remain private.
- **Settings and input:** guests and signed-in players can save or restore the device-local reduced-motion setting. It affects decorative transitions and preview scrolling, leaving physics and timers unchanged. Gameplay and previews have explicit pause/resume, and form typing does not control the player.

## Controls, previews and timing

Arrow keys or A/D move; Space, Up or W jump. Coral hazards return the player to the active checkpoint or start. The timer starts with the scene, continues through deaths, pauses with physics, and stops on completion. Hiding the tab pauses the run; use Resume after returning. Entering editor form fields pauses preview gameplay and clears held keys. Starting or resuming play focuses the game surface.

Restart begins a new attempt and restores collectible items. Leaving a game or replacing a preview destroys the Phaser scene and its listeners. A failed result save stays visibly unsaved and offers Retry.

**Preview draft** runs current unsaved work locally and grants no publication approval. **Test saved version** starts a backend playtest tied to the saved revision. Reach the finish and wait for confirmation before publishing. Local edits disable publication, and saving a changed layout or metadata invalidates approval through its new revision. Playtests do not create normal play attempts, rankings, completion awards or rating/favorite eligibility.

Normal published-course completions can save timing/deaths for signed-in players. Guests and local practice save no progress. The server checks identity, ownership, revisions and result bounds, but completion and active time remain client-reported under the class-project trust model. This is not production anti-cheat; structural validation also does not prove course reachability.

## Supabase setup and upgrades

The exact eight-table schema, RPC interfaces, permissions and migration behavior are documented in [DATABASE.md](docs/DATABASE.md).

For a **new project only**, apply these migrations once in order, then run `supabase/seed.sql`:

1. `supabase/migrations/001_core.sql`
2. `supabase/migrations/002_trigger_privileges_and_indexes.sql`
3. `supabase/migrations/20261019144913_sprint3_progress_and_drafts.sql`
4. `supabase/migrations/20261109042116_sprint4_publishing_and_community.sql`
5. `supabase/migrations/20261109043347_sprint4_non_retrying_revision_conflicts.sql`

For the **existing Sprint 2 project**, first inspect the actual hosted schema and migration history. Once the installed core migrations are confirmed, apply only the missing Sprint 3 migration and then both Sprint 4 migrations. Do not rerun initial creation scripts, reset the database, or reseed existing records. An existing Sprint 3 project needs only the missing Sprint 4 migrations. The migrations preserve profiles, existing courses, attempts, ratings, favorites and awards. The final correction makes stale-revision responses HTTP 409 without triggering automatic database transaction retries; see the database notes for its operational background.

Keep email/password authentication enabled and configure the local and hosted authentication return URLs in Supabase Auth. An email-confirmation link must return to an allowed frontend URL. Existing-account login verification is separate from new registration/email-confirmation verification; an unconfirmed account must not be treated as signed in.

Copy the Project URL and public publishable key (or legacy anon key) into `.env.local`. Never put a service-role key, database password or other secret into a `VITE_` variable. A signup trigger creates each application profile; Supabase Auth manages credentials. All public application tables have row-level security. Owner-checked RPCs manage draft saves, playtests, publication and completion; public statistics expose aggregate totals without exposing individual interactions.

Before deploying a dependent frontend, verify the hosted migrations, real Auth/PostgREST permissions and persistence. Do not infer backend readiness from a successful frontend build.

## Verification commands

`npm test` runs the original 37 checks plus Sprint 4 domain/database regression coverage. The SQL tests execute actual migrations in isolated PostgreSQL/PGlite fixtures, including both fresh installation and a populated upgrade. They cover ownership/privacy, revision conflicts, retry safety, playtest publication, immutable courses, collectible geometry, aggregates and achievement rules. Their test Auth fixtures do not verify managed Supabase Auth, email delivery or network behavior.

`npm run test:browser` is the isolated browser-test entry point. It requires Playwright and Chromium. An optional local install is:

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
npm run test:browser
```

An existing Playwright module can be selected with `PLAYWRIGHT_MODULE`, and an installed Chromium executable with `CHROME_PATH`. The local harness uses a temporary Vite server, PGlite and a test-only API/Auth transport. It blocks external requests, exercises the game UI and actual local SQL, and writes local evidence under `output/sprint4/local-evidence/`. This cannot substitute for hosted PostgREST or managed Auth acceptance.

For live API checks, place dedicated test-account credentials in the ignored `.env.local` file using `TEST_EMAIL_A`, `TEST_PASSWORD_A`, `TEST_EMAIL_B` and `TEST_PASSWORD_B`:

```sh
node --env-file=.env.local scripts/test-sprint4-live.mjs
```

This script contacts the configured Supabase project, creates a private diagnostic draft and playtest records, and writes credential-free results to `output/sprint4/live-evidence/`. It checks real login, ownership/privacy, retry/revision behavior and persistence. It does not complete the hosted browser publication/community journey or verify email confirmation. Run it with dedicated test accounts and retain its records as test evidence. `npm run test:integration` is the older account/interaction integration suite and also writes to the configured project.

`npm run test:hosted` runs the real browser acceptance journey against the public URL with the same dedicated account environment. It creates and publishes a new short course, records actual keyboard completions, verifies two-account interactions and persistence, and walks through First Flight. It requires the same Playwright/Chromium setup. `BASE_URL=local npm run test:hosted` instead starts local Vite on port 5185 while still using the real backend; `BASE_URL` may also be an explicit deployed URL. This is a write-producing acceptance check, not an isolated fixture. Its sanitized screenshots/results are stored in `output/sprint4/hosted-evidence/`.

See [VERIFICATION.md](docs/VERIFICATION.md) for dated results, evidence locations and remaining limitations. Do not treat historical Sprint 2/Sprint 3 evidence as verification of the current Sprint 4 deployment.

## Deployment

Public URL: [SkyStride Adventures](https://drat-git.github.io/skystride-adventures/). Source: [GitHub repository](https://github.com/drat-git/skystride-adventures).

The existing `.github/workflows/pages.yml` workflow runs locked installation, tests, type checking and a production build before deploying to GitHub Pages. It runs on pushes to `main` or manual dispatch. Repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` supply public frontend configuration. `vite.config.ts` selects `/skystride-adventures/` as the GitHub Actions deployment base. Supabase provides the hosted authentication and database.

Apply and verify compatible backend migrations before deploying the dependent frontend. After deployment, verify the public URL with dedicated accounts, including save/reload, saved-version test/publish, second-account discovery/play, ratings/favorites, achievements/rankings and session persistence. Record a real keyboard walkthrough of First Flight and email-confirmation verification separately. If frontend rollout fails, restore the previous frontend while retaining compatible additive schema changes.

For another static host, build with its correct base path, serve `dist`, supply public configuration at build time and configure the exact authentication return URL. The hosted frontend requires an available Supabase project.

## Sources and deferred work

The unchanged audit source is retained locally at `output/sprint4/sources/audit-results_analysis.rtf`, with source context in `output/sprint4/SOURCES.md` and implementation/evidence tracking in `output/sprint4/CHECKLIST.md`. The ignored `output` folder also retains the starting working-tree archive and dated verification evidence. These local source artifacts are not committed to the public repository.

The remaining planned game phase is the real gameplay-hint and editor-feedback AI implementation. Provider selection, credentials and integration are deferred. Report updates and presentation work are separately deferred. Existing report generators, diagrams and historical report artifacts are not regenerated as part of this game milestone.
