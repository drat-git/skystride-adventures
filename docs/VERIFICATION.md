# Sprint 4 non-AI verification — November 8–9, 2026

Current acceptance evidence is in ignored `output/sprint4/`; it includes the unchanged audit source, starting-tree archive, local/browser results, cloud migration snapshots, and hosted checks. The report and presentation were not regenerated or edited.

## Scope and data preservation

Implemented focus-safe gameplay/previews, unsaved-draft guards, revision-safe saves, collectibles, device-local reduced motion, saved-version playtests and immutable publication, creator courses/copies, course details, ratings/favorites, deterministic discovery, and disabled AI placeholders with typed future contexts. Real AI integrations remain deferred.

The hosted project was rechecked before applying the missing Sprint 3 migration, the additive Sprint 4 migration, and a follow-up revision-conflict correction. The initial schema and seed were **not** rerun. Exact pre/post snapshots verified preservation of all six original profiles, the published First Flight course, one attempt, one rating, and one favorite (the level only gained revision 1).

Local migration timestamps map to these hosted migration records:

| Migration | Local version | Hosted version |
|---|---|---|
| Sprint 3 progress/drafts | 20261019144913 | 20261109042915 |
| Sprint 4 publishing/community | 20261109042116 | 20261109042922 |
| Non-retrying revision conflicts | 20261109043347 | 20261109043443 |

## Automated and live API checks

All **73 automated checks** pass, retaining the original 37 and adding focused domain, database and catalog checks. TypeScript checking and the production build also pass. Fresh-install and populated-upgrade tests exercise actual SQL in PGlite; auth claims are test fixtures there. Real Auth/PostgREST is tested separately by `scripts/test-sprint4-live.mjs` using dedicated accounts. All 11 live API checks passed, including stable creation retries, stale edits, ownership/privacy, private playtest completion, denied untested publication, approval invalidation, separation from normal attempts/eligibility, and logout/login persistence.

Two defects found during verification received regressions: Phaser 3.90 core visibility handlers required explicit teardown; application revision conflicts must use `PT409` rather than PostgreSQL serialization error `40001`, which the hosted PostgREST version endlessly retries. The latter fix is a separate migration, preserving migration history.

## Browser and deployment acceptance

All **10 isolated browser acceptance groups** pass with no runtime exceptions. They cover dirty-navigation cancellation, ambiguous save retry, stale-tab recovery, metadata typing, simulated visibility/resume, exact listener cleanup, sign-out failure feedback, account switching, saved-test retry/publication, community updates, storage failures, and real-keyboard checkpoint/death/item/restart behavior. Fixture Auth and simulated visibility are explicitly distinguished in `output/sprint4/local-evidence/results.json`.

The local frontend connected to **real Supabase** also passed all **10 browser journey checkpoints**, with 12 sanitized screenshots and zero runtime/HTTP errors. The journey creates a checkpoint/item course, saves/reloads, completes its saved playtest, publishes, uses a second account to discover/play/rate/favorite, verifies two-account aggregates and removal, and checks reload/relogin persistence, rankings and achievements. First Flight was completed with actual keyboard input guided by screenshot pixels, without engine state access or fabricated results: 5.09 seconds, zero deaths. Evidence: `output/sprint4/hosted-evidence/local/results.json`.

GitHub Pages rollout and the repeat public-site journey are recorded after release.

## Registration confirmation

A fresh registration through the public game returned HTTP 200 and the confirmation-email message. The user received and opened the confirmation link and reported that the game opened successfully. A separate read-only backend check confirmed `email_confirmed_at` on November 9 at 04:38:20 UTC and exactly one corresponding profile. This is recorded separately from the existing-account login checks in `output/sprint4/registration-evidence.json`.

## Remaining scope and limits

AI Hint and AI Editor Feedback are visibly unavailable and make no provider requests. Real AI implementation, report editing, presentation and teamwork remain deferred. Completion is client-reported within the class-project trust model, not production anti-cheat. The Phaser bundle still triggers Vite's non-blocking size warning. Hosted security advisors report only the pre-existing leaked-password-protection setting; no paid upgrade was made.

---

The following is preserved historical Sprint 2/3 evidence. Its pending/deployment statements describe the earlier milestones, not the current Sprint 4 release.

# Sprint 3 local verification — October 19, 2026

Scope: UC04 persisted completion, UC05 create/save private drafts, UC09 achievements, UC10 leaderboard. The first two are the major new GUI flows. The new migration is local and unapplied to the hosted project; no push, deployment, board update or cloud write was performed.

- 37 tests passed: original 29 plus eight Sprint 3 SQL scenarios. New scenarios cover draft save/update/reload, cross-account/anonymous restrictions, publishing and self-award denial, malformed geometry, server-owned attempt timestamps, result ownership/bounds, atomic achievements and idempotent completion, best-time ties/privacy and the top-50 limit.
- TypeScript and production build passed. The existing large Phaser bundle warning remains; it does not prevent building.
- Seven browser scenarios passed against isolated PGlite SQL with a test-only Auth/API transport: grid edit/save, refresh/reload, draft preview/cleanup, keyboard finish with pause/resume and failed-save retry, leaderboard, achievements, and logout/no duplicate rows/no browser exceptions. A short additional test course makes keyboard completion deterministic.
- Captured screenshots/results: `output/sprint3/local-evidence/`. The fixture uses the actual migrations and RLS roles. It does not verify hosted PostgREST, managed Auth or a cloud deployment.

Known limits: client-reported times are not cheat-proof; geometry validation does not prove reachability. Checkpoint runtime support is present; exhaustive keyboard testing of First Flight is still a manual demo task. New user email confirmation remains unverified. Original report diagrams are preserved, including their historical design labels. Updated GitHub Sprint 3 board evidence, actual team evaluations and the in-class demo remain pending.

The historical record below concerns the unchanged Sprint 2 cloud deployment and must not be read as Sprint 3 deployment evidence.

---

# Verification record — Sprint 2 historical evidence

October 4, 2026. Local type check/production build passed. Vitest: **29 passed** (16 domain/attempt/input checks; 13 actual PostgreSQL migration/seed checks). GitHub Actions also passed all tests/build/deployment on Node 24. Run history: https://github.com/drat-git/skystride-adventures/actions.

## Local PostgreSQL

PGlite runs the actual migration and seed with test-only `auth.users` and `auth.uid` fixtures. Tests verify signup/profile trigger; own-account persistence; cross-account read/update denial; anonymous write denial; recorded-play eligibility; 1–5 scores; unique ratings/favorites; foreign keys; prohibited completion forgery and client level mutation. Domain tests reject malformed geometry, unsafe spawn/checkpoints and bad account inputs, and check pause/death/one-time finish semantics. These fixtures do not prove managed Auth API behavior.

## Live Supabase

Project `djoiiitpyntcgnuqemiu`: installed migration/seed, five tables with RLS and twelve policies. `First Flight` is published. Evidence: `docs/evidence/supabase-schema.jpg`.

`supabase/verify-behavior.sql` executed successfully in cloud PostgreSQL. Two temporary identity fixtures and authenticated/anonymous database role claims verified profile creation/persistence, published course read, eligible rating/favorite writes, forbidden unplayed favorite, invalid score, duplicate favorite, cross-account privacy/ownership and anonymous write denial. All fixtures rolled back. Evidence: `docs/evidence/supabase-behavior.jpg`. This checks real backend SQL but does not substitute for password login/session/logout through managed auth.

## Managed Auth API and browser accounts

All **13 live integration checks passed** using two user-supplied dedicated accounts on October 4, 2026. Timestamped, credential-free output: `docs/evidence/integration.json`. Checks cover both logins, public reads, profile writes/restoration, cross-account read/update/write denial, eligible ratings/favorites, invalid scores, duplicate favorites, anonymous denial, missing levels and logout. Browser account A saved a display name, refreshed with its session intact, reloaded the saved name, signed out and switched to account B, whose original profile was distinct. `docs/evidence/profile.jpg` excludes the private account email. Existing provider credentials can be shorter than new registration’s 8-character minimum.

## Hosted browser

https://drat-git.github.io/skystride-adventures/ loads successfully. Browse courses returns one actual published course; Play course launches its validated layout. Main menu, sign-in, registration, course list and game screens captured with actual navigation. Site URL and exact hosted/local authentication redirects were saved. Invalid login returns the real provider error without claiming a session. Supabase's default email confirmation remains enabled. GitHub repository and public board are real; task statuses reflect observed work. Team assignees remain deferred. The final deployment (commit 854a24e) passed tests/build/deploy, and its existing-account login, saved profile, refresh restoration and logout were verified in a fresh hosted browser tab.

## Pending before submission

- Human new-user registration/email-confirmation check. Existing accounts were created separately; their login/profile/session flows passed. Dedicated demo access must be shared privately.
- Full keyboard course completion/death/retry. Pause/Resume and exit were verified; the canvas count was zero after leaving.
- Actual team planning/evaluation/coordinator/assignees. The 47-page review report was rendered and inspected; contents/page numbers were verified.
- Each member's named PDF upload and coordinator printed copy.

The report is a review copy while these gaps remain. AI/editor/client feature interfaces are future semester work and not claimed deployed. Current completion results are transient; structural geometry validation does not establish reachability.

## Advisory follow-up

The connector became available after dashboard setup. Its checks found Supabase's default direct EXECUTE grants on the signup trigger and four missing foreign-key indexes. Migration 002 revokes PUBLIC/anon/authenticated execution and indexes levels.creator_id and the interaction level_id foreign keys. A new local test simulates the provider's default grants and verifies revocation while profile creation still works. Advisory checks were rerun after the live migration. Remediation references: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable.

The remaining security advisory is leaked-password protection, which Supabase documents as a Pro-plan feature: https://supabase.com/docs/guides/auth/password-security. No plan upgrade was purchased. Four new foreign-key indexes report unused-index informational notices on this tiny dataset; they remain appropriate for future parent-key operations.
