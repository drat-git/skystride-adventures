# Verification record

October 4, 2026. Local production build and type check passed. Vitest: 27 tests passed (15 domain/attempt/input checks; 12 PostgreSQL checks).

Database tests run the actual migration in PGlite (PostgreSQL compiled to WebAssembly) with test-only auth.users and auth.uid fixtures. They execute real constraints, triggers, SQL and row policies. They do not prove managed Supabase authentication, networking, or cloud deployment.

Verified locally: published-only level read; auth-to-profile trigger; profile ownership; anonymous write denial; play eligibility; 1–5 scores; unique ratings/favorites; foreign keys; prohibited completion forgery and level mutation. Domain tests reject malformed layout data, unsafe start/checkpoint coordinates, bad account inputs; test timer pause/death/completion semantics.

Pending: real sign-up/confirmation, invalid and valid login, profile across refresh, logout/account switch, real two-user cloud RLS checks, hosted assets/backend/redirects; real repository/board; final screenshots and report QA. Local UI screenshots must identify setup states accurately.
