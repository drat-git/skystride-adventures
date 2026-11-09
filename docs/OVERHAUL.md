# SkyStride V2 development

The active specification is the unchanged `output/overhaul/sources/overhaul-plan.rtf` (original `/Users/Darsh/Downloads/overhaul-plan.rtf`). Its readable extraction and source index live beside it. Reread that specification after context compaction. The earlier audit-results plan is paused. Report generation, presentation work, and real AI integration are outside this overhaul.

Development branch: `codex/skystride-game-overhaul`, based on `be87f686d6418706399e32dacb10dd2f72a2ee8c`. The user subsequently authorized production migration and promotion to `main`; implementation commit `6deb86b` was deployed on 9 November 2026. The pre-existing dirty report work was archived in `output/overhaul/baseline-working-tree.zip` and `baseline.patch`; it is not part of this change.

## Baseline review

The deployed game and Astro Hop were both opened and captured before app changes. Screenshots and measured source movement are in `output/overhaul/baseline-evidence/`.

The old game had a functional account/community/editor workflow, but its static 24×14 maps, instantaneous horizontal movement, basic shapes, and website-style navigation did not meet the new game brief. Gameplay lacked enemies, power-ups, scrolling worlds, block interactions, and a complete pause/death/progression menu. The editor could not represent those components. Existing focus, dirty-draft, revision, saved-playtest, publication, and privacy protections are retained.

Feature inventory and new entry points:

| Existing capability | V2 entry point |
| --- | --- |
| Registration, email confirmation, session restoration, sign out | Header Sign in / My account; main-menu Create account |
| Display-name editing | My account / Player profile |
| Published courses and guest runs | Play adventure / Community courses |
| Attempt completion and saved best times | Course completion; My progress |
| Top-50 best-time rankings, ties | Level list / Course details → Leaderboard |
| Achievements | Main-menu Achievements / My progress |
| Ratings, removal, favorites, sorting/filtering | Community courses → Course details |
| Private draft creation and reliable save/retry | Course workshop |
| Saved-revision testing, publication, immutable published courses | Workshop controls |
| Copy published course to a private draft | Workshop Copy to new draft |
| Unsaved-change prompts, revision conflicts, account isolation | Workshop lifecycle |
| Checkpoints, optional collectibles, pause, restart | Shared course runtime |
| Reduced decorative motion | Settings |
| Disabled AI hint and feedback placeholders | Play controls / Workshop |
| Original First Flight practice and saved V1 course compatibility | Classic practice / Community courses; read-only legacy editor with copy-to-V2 |

## Reference fidelity and course provenance

Astro Hop source: <https://github.com/nunoamorim99/AstroHop>, commit `65dc9b74711f5bd70e325b88d5bc5f85c38a8b12`. Playable reference: <https://nunoamorim99.github.io/AstroHop/>. MIT code and Kenney CC0 art notices ship with the assets. The primary visual reference is the actual packed sprite sheets, not a screenshot approximation.

The reference measurement starts SMALL at x63/y402 with a 16×20 body. Its full jump peaks about111px above the resting sprite center. Source constants are acceleration1600, drag1300, run cap240, jump−480, release cut−160, world gravity1000, extra falling gravity900, and camera lerp0.12. Browser sampling has frame-time tolerance; source rules define the intended behavior.

| Course | Source and intentional boundary adjustments |
| --- | --- |
| 1 Meadow Run | Astro Hop1, columns0–137; independent finish135; checkpoint70 |
| 2 Over the Hills | Astro Hop1, columns138–279; safe independent start at original139; source finish retained; checkpoint at original198 |
| 3 Crystal Descent | Astro Hop2, columns0–97; independent finish95; checkpoint50 |
| 4 Cavern Climb | Astro Hop2, columns98–199; independent start at original101; source enemy at100 moved to105 to clear spawn; source finish retained; checkpoint153 |
| 5 Cloudstep Crossing | Adaptation of DS World7-6 before its checkpoint: ascending caps, layered decks, shell-chain encounter, isolated towers, drifting platform and flying trio |
| 6 Above the Blue | Adaptation after the checkpoint: stacked blocks, cliff alcoves, narrow bridges with flying patrols, block encounter, stepped cliff and final runway |

Pipe visuals and entry logic are excluded. Solid themed columns/rocks/ruins replace the source pipe obstacles. Colored glowing blocks keep the source contents and hit behavior. The sky stages adapt route topology and encounter order to the Astro Hop movement and 18px scale; they are not pixel-identical Nintendo maps. Optional pipe/vine side exits become ordinary reachable routes, without teleports.

DS reference map, inspected directly: <https://www.mariouniverse.com/wp-content/img/maps/ds/nsmb/7-6.png>. Research copy and enlarged inspection crops remain ignored, never shipped. This is the Nintendo DS2006 stage, not the Wii Para-Beetle course. Supporting mechanics references: the [original DS manual](https://www.nintendo.com/eu/media/downloads/games_8/emanuals/nintendo_ds_21/Manual_NintendoDS_NewSuperMarioBros_EN.pdf) and [reverse-engineered flying-enemy settings](https://nsmbhd.net/spritedb/?cat=-3).

## Data and isolation

The user selected an isolated local database for development, then authorized the hosted release after local verification. The three tested V2 migrations and six official courses are now installed in the existing Supabase project. Pre/post checksums confirm that the eight tables' existing records were unchanged by migration. No data retirement was performed. The existing `.env.local` is preserved; local development overrides its URL/key in process and uses a distinct auth-storage key. Hosted access from a development build requires an explicit opt-in that the local launcher does not set.

The existing eight tables remain. V2 expands the declarative `levels.layout` JSON, replaces the fixed-V1 validation constraints with a V1/V2 dispatcher, and adds server-owned `official_order`. Existing save, playtest, publication, community, and completion contracts remain. Progress is aggregated from existing completed attempts; no duplicate progress table is introduced.

Local testing runs the real Postgres schema, functions, triggers, constraints, and row-level policies in PGlite. The local HTTP/Auth adapter is a development fixture, not the hosted Supabase Auth/PostgREST service. It sends no emails and uses separate local credentials. Hosted email confirmation and API behavior must be rechecked during cutover.

## Later cutover and V1 retirement

The first V2 cutover applied the three tested additive migrations (including six official courses) to the current Supabase project, then deployed the matching frontend through GitHub Pages. Hosted authentication, RPC behavior, persistence, asset base paths, and two-account publication/community evidence are tracked in [the release record](OVERHAUL_VERIFICATION.md). Retiring V1 remains a separate operation.

The user permits V1 levels, layouts, and frontend removal once V2 is ready. Before that cleanup, produce a recoverable database export and an exact affected-row inventory for V1 courses and their attempts, playtests, ratings and favorites. Preserve accounts/profiles and already-earned achievements. Retarget the old timed First Flight achievement to an explicitly chosen V2 challenge with a verified threshold before removing its course; keep earned awards intact. Stage the removal in a separate reviewed migration, then remove the legacy runtime/types/tests and the Classic practice entry. Never repurpose an old course UUID for a different layout or mix its historical times with new rankings.

Rollback before retirement must account for the old frontend's V1-only parser: preserve the additive schema and either use a compatibility frontend that filters unsupported layouts or prepare a reversible change to new-course visibility before restoring the old frontend. Restoring the old bundle alone would break its mixed-version community listing. Rollback after retirement also requires the archived records. Do not combine data deletion with the first V2 rollout.

## Verification

Desktop verification is complete: all six unchanged official courses were completed with actual keyboard input, the complete local account/editor/community journey passed, and the production bundle loaded at the GitHub Pages base path. Exact counts, evidence paths, source comparisons and limitations are recorded in [OVERHAUL_VERIFICATION.md](OVERHAUL_VERIFICATION.md) and `output/overhaul/EVIDENCE.md`. The unchanged source specification remains the acceptance checklist. Mobile verification is deferred per the user's direction. Real AI features remain unavailable and do not gate playing, editing, or publishing.
