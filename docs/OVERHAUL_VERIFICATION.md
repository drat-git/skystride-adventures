# V2 desktop verification — 9 November 2026

Branch: `codex/skystride-game-overhaul`. Starting commit: `be87f686d6418706399e32dacb10dd2f72a2ee8c`. The active specification is retained unchanged at `output/overhaul/sources/overhaul-plan.rtf`. The earlier audit plan is paused. Pre-existing report changes remain untouched and outside the overhaul commit.

All verification below used isolated local databases and desktop Chrome. No hosted schema, data or deployment was changed. PostgreSQL constraints, functions, triggers and RLS are real; local Auth/REST are fixtures. This does not establish managed Supabase Auth, confirmation email or hosted PostgREST acceptance for V2.

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

The short rendering sample is not a hardware-wide performance guarantee. Phaser produces a large bundled JavaScript chunk; Vite reports that warning while completing successfully. Mobile work is deferred. V1 compatibility remains until a separately verified hosted cutover and recoverable retirement migration. Real AI, report and presentation work remain outside this phase. The [cutover plan](OVERHAUL.md#later-cutover-and-v1-retirement) includes managed Auth/PostgREST and real confirmation-email verification before production acceptance.
