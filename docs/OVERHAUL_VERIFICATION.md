# V2 desktop verification — 9 November 2026

Branch: `codex/skystride-game-overhaul`. Starting commit: `be87f686d6418706399e32dacb10dd2f72a2ee8c`. The active specification is retained unchanged at `output/overhaul/sources/overhaul-plan.rtf`. The earlier audit plan is paused. Pre-existing report changes remain untouched and outside the overhaul commit.

The pre-release results below used isolated local databases and desktop Chrome. PostgreSQL constraints, functions, triggers and RLS were real; local Auth/REST were fixtures. Hosted release verification is recorded separately at the end of this file. The local results alone do not establish managed Supabase Auth, confirmation email or hosted PostgREST acceptance for V2.

## Results

| Check | Result | Local evidence under `output/overhaul/` |
| --- | --- | --- |
| Domain, migration, security and persistence suite | 218 tests passed across 13 files | `final-tests.log` |
| TypeScript and production build | Passed; existing large Phaser bundle warning remains | `final-build.log`; `production-evidence/results.json` |
| Complete local UI journey | 13 groups passed; no browser errors | `acceptance/results.json` |
| Editor desktop verification | 8 groups passed; no errors; listener/observer/canvas cleanup confirmed | `editor-local/results.json` |
| Phaser runtime verification | 15 groups passed; no browser errors | `runtime-evidence/results.json` |
| Official courses | All six completed through real keyboard input, unchanged layouts | `official-ground-evidence/results.json`, `runtime-evidence/sky-route.json`, `official-sky6-evidence/results.json` |
| GitHub Pages asset base | JS, CSS and all three sprite sheets returned 200 under `/skystride-adventures/`; no external requests/errors; DEV seam absent | `production-evidence/results.json` |
| Desktop rendering sample | 121 frames over about 2 seconds; median 16.7ms, p95 16.8ms, approximately 60fps | `production-evidence/results.json` |

The local UI journey includes title activation without input leakage, reduced-motion persistence/reset, all six course entry points, pause/resume/Escape, every component's save/reload, cancelled dirty navigation, ambiguous save retry, metadata typing during preview, tested publication and immutable copy, failed sign-out feedback, two-account play/results/rating/favorite/ranking/achievement state, interaction removal, actual official completion and Next, logout/login progress, final-course Replay without Next, and private editor cleanup after an actual account change. The final-course screenshot includes a successfully persisted result.

Runtime checks exercise source acceleration/drag and variable jump, fixed small/large hitboxes, focus capture and held-key cleanup, death/checkpoint retry with retained coins, glowing and hidden blocks, growth/fire/star/life behavior, breakable blocks, projectiles, stomp/shell chains, three flying-enemy modes, vertical collision reversal, moving platforms carrying stationary players, flag completion exactly once, and repeated scene cleanup. The editor's 23 pure helper tests are included in the 218-test total, not additional tests.

## Course completion evidence

These are successful observed runs, not target times. Drivers read detached snapshots and send keyboard input; they do not move players, alter physics, disable collisions or rewrite the official layouts.

| Course | Active elapsed | Deaths | Coins |
| --- | ---: | ---: | ---: |
| Meadow Run | 11.058s | 0 | 20 / 33 |
| Over the Hills | 9.350s | 0 | 6 / 20 |
| Crystal Descent | 7.135s | 0 | 6 / 24 |
| Cavern Climb | 6.841s | 0 | 0 / 5 |
| Cloudstep Crossing | 17.546s | 0 | 8 / 16 |
| Above the Blue | 21.116s | 0 | 5 / 23 |

Main-app acceptance independently completed Meadow Run and Above the Blue, persisted both results, checked Next/final-level navigation and restored the resulting progress after login. Other runtime/editor fixtures intentionally use small synthetic courses to isolate mechanics. Earlier failed route traces remain debugging evidence; the final results listed above are authoritative.

## Source comparison and intentional differences

Astro Hop source commit `65dc9b74711f5bd70e325b88d5bc5f85c38a8b12` supplies the sprite sheets, movement/animation rules and base encounters. Measured SMALL body is 16 × 20px, full-jump rise about 111px; source acceleration 1600, drag 1300, run cap 240, jump −480, release cut −160, world gravity 1000, extra falling gravity 900 and camera lerp 0.12 are retained. The inspected running reference and baseline screenshots are in `baseline-evidence/`. Source MIT and art CC0 notices ship with the game.

Pipes and entry behavior are removed; themed solid obstacles replace them. Power-up blocks glow without question-mark rendering. Courses 1–4 split the two Astro Hop worlds at documented boundaries with independent starts/finishes/checkpoints. Courses 5–6 adapt the researched DS World 7-6 route and encounters into the sky pack, rather than reproduce Nintendo pixels; no Nintendo artwork ships. See [course provenance](OVERHAUL.md#reference-fidelity-and-course-provenance).

SkyStride retains attempt-local coins and cumulative active time through checkpoint retries. Countdown and power state reset on retry; a course can be retried after zero lives, restoring three lives. These deliberate course-oriented choices preserve SkyStride's completion and checkpoint workflow. Published courses remain immutable and approvals are tied to exact saved revisions.

## Screenshots and remaining scope

Representative captures: `local-preview-title.png`, `local-preview-courses.png`, `acceptance/02-workshop.png`, `acceptance/03-community-complete.png`, `acceptance/04-leaderboard.png`, `acceptance/06-progress.png`, `acceptance/07-adventure-complete.png`, `production-evidence/cave-gameplay.png`, and the six course completion images in their evidence directories.

The short rendering sample is not a hardware-wide performance guarantee. Phaser produces a large bundled JavaScript chunk; Vite reports that warning while completing successfully. Mobile work is deferred. V1 compatibility remains until a separate recoverable retirement migration. Real AI, report and presentation work remain outside this phase. The [cutover plan](OVERHAUL.md#later-cutover-and-v1-retirement) describes retained compatibility and future cleanup.

## Hosted release — 9 November 2026

The user authorized migrating the current Supabase project and pushing the game to `main`. Implementation commit `6deb86b3e7afa46b64cd9dc4d3eba78c2ad4b490` was fast-forwarded to `main`; [GitHub Pages run 42577437161](https://github.com/drat-git/skystride-adventures/actions/runs/42577437161) passed all 218 tests, TypeScript/build and deployment. The public game is [SkyStride Adventures](https://drat-git.github.io/skystride-adventures/).

Only the three missing V2 migrations were applied to healthy project `djoiiitpyntcgnuqemiu`. Hosted migration versions are assigned by the connected migration service; the local SQL files remain unchanged.

| Local migration | Hosted version | Name |
| --- | --- | --- |
| `20261109055844` | `20261109070702` | `overhaul_v2_course_format` |
| `20261109060418` | `20261109070709` | `overhaul_official_courses` |
| `20261109062810` | `20261109070712` | `overhaul_render_budget` |

Before and immediately after migration, row counts and canonical row checksums matched for all existing records: 7 profiles, 5 V1 levels, 12 attempts, 3 ratings, 3 favorites, 3 achievement definitions, 7 earned awards and 5 draft playtests. The only added level field was nullable `official_order`; it was excluded from the old-row checksum. Six new official records match the checked-in layouts exactly through anonymous PostgREST. All eight public tables retain RLS; anonymous private-progress access and direct official-order writes remain denied. Existing security advisors reported only the pre-existing leaked-password-protection warning, with no new database advisory.

Real hosted browser acceptance passed **6 comprehensive groups**, with **zero browser errors and zero HTTP failures**, using the existing dedicated confirmed test accounts:

- Public title, six official records, actual keyboard movement/jump/pause and level-list navigation; production DEV snapshot seam absent.
- Managed account login, V2 draft/theme/component save and reload, intact metadata typing during preview, and no publication approval from unsaved preview.
- Actual keyboard completion of the saved revision, backend approval, immutable publication and a separate unapproved private copy.
- Second-account privacy, discovery, actual keyboard completion with checkpoint/coin, saved results, rating/favorite, leaderboard and completion achievement.
- Independent results and correct shared aggregates from two accounts: average 4.0, two ratings, two favorites.
- Reload, My Favorites, rating order, replacement/removal, unfavorite, logout/login persistence and private progress RPC.

The run created only dedicated verification records: published course `ee6e7e44-720c-4465-aa6c-72e9ada84441` and private copy `a0c8b6f9-8283-4cd7-b568-cc5c355ed13d`, plus their test attempts/interactions. No original user records were edited or deleted.

Evidence under `output/overhaul/`: `hosted-migration-evidence.json`, `hosted-api-preflight.json`, `hosted-pages-build.log`, and `hosted-evidence/20261109T071001Z/results.json` with eight screenshots. The reusable opt-in check is `scripts/test-overhaul-hosted.mjs`. Official hosted gameplay was a movement/jump/pause check; full completion of all six remains the prior local keyboard evidence. Existing confirmed-account login was verified; no new registration or confirmation email was requested in this release. The user's earlier confirmation-email success remains separately recorded in the Sprint 4 evidence.

## V1 retirement and title correction — 9 November 2026

The user subsequently requested removal of V1 courses, layouts and frontend support while keeping accounts and V2 data. Local migration `20261109072050_retire_v1_courses.sql` was applied to hosted Supabase as `20261109072725`. It removed 5 V1 courses and their 13 attempts, 5 saved playtests, 3 ratings and 3 favorites. A refreshed ignored recovery archive was saved before deletion. Canonical pre/post row checksums matched for all auth users, identities, sessions, profiles, earned awards, existing V2 levels and V2-owned records. The hosted database now has zero V1 levels, no V1 validator and no active function referencing the old course UUID. The timed challenge is Meadow Run under 30 seconds; its stable award identity preserves earlier earned awards.

The app now accepts V2 only. Removed code includes the legacy scene, V1 geometry/constants/practice layout, editor conversion/paint paths, Classic practice routes and obsolete seed/integration/browser scripts. Historical SQL migrations and isolated migration-test fixtures remain to verify reproducible upgrades. The local persistent database was copied before applying the same cleanup.

The Title screen button previously installed an activation listener on the persistent root while its own click was still bubbling; that same click immediately reopened the menu. Activation now belongs to the newly created title subtree. The demo retains actual running, jumping and looping, but contains no coins, upper tagline or bottom caption.

Verification: **223 tests across 14 files**, TypeScript, **13 full local browser groups**, **8 editor groups**, **6 focused title groups**, and production asset/base-path checks pass. Title checks cover pointer and keyboard returns, repeated transitions with one canvas, running/jumping/looping, zero coins/footer and reduced-motion behavior. Retirement tests cover preservation, cascade scope, V1 rejection, timed-rule identity/threshold, fresh setup and transactional rollback when the V2 replacement is missing.

Evidence: `output/overhaul/v1-retirement/` (archive, preservation checksums and logs), `output/overhaul/title-retirement-evidence/` (title screenshots/trace/results), and the refreshed local browser/editor/production result directories. Hosted smoke results for this rollout are saved under the retirement evidence directory when deployment completes.
