# Verification record

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
