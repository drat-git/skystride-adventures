# Database dictionary

SkyStride uses PostgreSQL on Supabase. The application schema has eight public tables: five core tables, two achievement tables added in Sprint 3, and `draft_playtests` added in Sprint 4. V2 retains these tables and adds course format support and account progress aggregation. The three V2 migrations below were verified locally and applied to hosted Supabase on 9 November 2026. See [the release record](OVERHAUL_VERIFICATION.md) for hosted migration IDs and preservation evidence.

In production, passwords, confirmation tokens and authentication sessions remain in managed Supabase Auth. Application tables do not store or read credential columns. The isolated [local Auth/REST fixture](LOCAL_DEVELOPMENT.md) uses separate local credentials and does not verify managed Auth or email delivery.

## Installation and upgrades

Migration files are ordered and transactional:

1. `supabase/migrations/001_core.sql`
2. `supabase/migrations/002_trigger_privileges_and_indexes.sql`
3. `supabase/migrations/20261019144913_sprint3_progress_and_drafts.sql`
4. `supabase/migrations/20261109042116_sprint4_publishing_and_community.sql`
5. `supabase/migrations/20261109043347_sprint4_non_retrying_revision_conflicts.sql`
6. `supabase/migrations/20261109055844_overhaul_v2_course_format.sql`
7. `supabase/migrations/20261109060418_overhaul_official_courses.sql`
8. `supabase/migrations/20261109062810_overhaul_render_budget.sql`

For a **fresh V2 project**, apply all eight once in that order, then run `supabase/seed.sql` to install legacy First Flight while compatibility is retained. Migration 7 installs the six new official courses. Configure the frontend with the project URL and publishable key, and configure the hosted URL in Supabase Auth's redirect allowlist. Never put a service-role key in the frontend.

For the **existing Sprint 4 project**, inspect installed history and objects, then apply only missing migrations 6–8 during the later V2 cutover. They preserve V1 layouts, existing records, RPC contracts and permissions. `official_order` is server-owned; application roles cannot select their own official placement. The official-course migration refuses conflicting existing records instead of overwriting published layouts. [Cutover and retirement notes](OVERHAUL.md#later-cutover-and-v1-retirement) describe hosted verification and the separate archive/removal phase.

For the **existing Sprint 2 project**, inspect the hosted schema and migration history first. Preserve its profiles, published seed course and interaction records. Once the two core migrations are confirmed installed, apply only the missing Sprint 3 migration followed by both Sprint 4 migrations. Do not rerun `001_core.sql`, reset the database, reseed existing courses, or replace existing data. If the privilege/index correction is missing, reconcile that specific migration before continuing. A migration version alone is not proof that its expected tables, policies and grants exist; verify both history and actual objects.

For a **Sprint 3 project**, apply only the missing Sprint 4 migrations. Sprint 4 adds revision `1` to existing levels and preserves existing application records. Its geometry constraint is revalidated transactionally: incompatible existing layouts cause the migration to fail and roll back, rather than silently rewriting data. Resolve an actual incompatibility before retrying.

The final correction changes business revision conflicts from SQLSTATE `40001` to `PT409` (HTTP 409), preserving all checks and grants. It avoids the managed PostgREST retry loop documented by [Supabase](https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b). If the first Sprint 4 migration was already applied, add this correction; do not rewrite migration history. Existing looping requests may need their specifically identified database backends terminated, as described in that troubleshooting guide.

Run local fresh-install and populated-upgrade tests before a hosted migration. Verify hosted Auth, PostgREST, permissions and persistence before deploying the frontend that depends on the new RPCs. Deployment evidence belongs in the verification notes; this dictionary describes the schema rather than asserting a particular environment's migration status.

## profiles

| Attribute | Type | Nullable | Keys / constraints / deletion | Purpose |
|---|---|---|---|---|
| id | UUID | No | PK; FK auth.users.id; CASCADE | Managed authentication identity |
| display_name | TEXT | No | CHECK ASCII letters/digits/space/_/-; 2–24 chars | Application name; direct access limited to own account |
| created_at | TIMESTAMPTZ | No | DEFAULT now() | Creation timestamp |

The auth signup trigger creates the profile. Leaderboards expose display names through a narrow aggregate; they do not expose profile rows or account UUIDs.

## levels

| Attribute | Type | Nullable | Keys / constraints / deletion | Purpose |
|---|---|---|---|---|
| id | UUID | No | PK; DEFAULT gen_random_uuid() | Stable course identity; save RPC accepts a client-generated UUID |
| creator_id | UUID | Yes | FK profiles.id; SET NULL | NULL for system seed or deleted creator |
| title | TEXT | No | CHECK trimmed length 1–60 | Course title |
| description | TEXT | No | DEFAULT empty; CHECK length <= 280 | Course summary |
| difficulty | TEXT | No | CHECK easy / medium / hard | Difficulty label |
| layout | JSONB | No | Validated V1 or V2 geometry and bounded declarative component data | Course components, theme, start and finish |
| official_order | SMALLINT | Yes | UNIQUE; CHECK 1–6; server-owned | Stable ordering of the six new official courses; NULL for other courses |
| published | BOOLEAN | No | DEFAULT false | Public visibility; publication RPC controls transition |
| revision | INTEGER | No | DEFAULT 1; CHECK > 0 | Server-managed version of saved metadata/layout |
| created_at | TIMESTAMPTZ | No | DEFAULT now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | No | DEFAULT now(); update trigger | Last saved change or publication timestamp |

The trigger increments `revision` only when title, description, difficulty or layout actually changes. A repeated identical save leaves the revision and saved record unchanged. Publication does not increment the revision. Application roles cannot directly insert or update levels, set revisions, change ownership, or set publication state.

Published metadata and layout are immutable. A creator may copy a published course into a new private draft with a new UUID and revision `1`; its playtest approval is independent. Existing attempts and rankings remain attached to the original course UUID. `can_publish` is computed for owner responses; it is not a stored column.

## play_attempts

| Attribute | Type | Nullable | Keys / constraints / deletion | Purpose |
|---|---|---|---|---|
| id | UUID | No | PK; DEFAULT gen_random_uuid() | Attempt identity |
| user_id | UUID | No | FK profiles.id; CASCADE | Player |
| level_id | UUID | No | FK levels.id; CASCADE | Published course played |
| started_at | TIMESTAMPTZ | No | DEFAULT now() | Server-recorded start |
| completed_at | TIMESTAMPTZ | Yes | If present >= started_at; paired with elapsed_ms | RPC-recorded completion |
| elapsed_ms | INTEGER | Yes | CHECK >= 0; paired with completion | Client-reported active elapsed time |
| deaths | INTEGER | No | DEFAULT 0; CHECK >= 0 | Persisted death count |

Clients may insert only `user_id` and `level_id`, for themselves and a published course. Only `complete_attempt` saves results. Its accepted bounds are 0–86,400,000 milliseconds and 0–100,000 deaths; elapsed time cannot exceed server wall-clock duration plus 1,500 milliseconds. Identical completion retries succeed and changed completed results fail. The existing table constraints are retained; the RPC enforces these stricter upper bounds on new client results.

## draft_playtests

| Attribute | Type | Nullable | Keys / constraints / deletion | Purpose |
|---|---|---|---|---|
| id | UUID | No | PK; DEFAULT gen_random_uuid() | Saved-version test identity |
| user_id | UUID | No | FK profiles.id; CASCADE | Owner performing the test |
| level_id | UUID | No | FK levels.id; CASCADE | Private course under test |
| revision | INTEGER | No | CHECK > 0 | Exact saved revision tested |
| started_at | TIMESTAMPTZ | No | DEFAULT clock_timestamp() | Server-recorded start |
| completed_at | TIMESTAMPTZ | Yes | >= started_at; paired with elapsed_ms and deaths | Server-recorded successful finish |
| elapsed_ms | INTEGER | Yes | CHECK 0–86,400,000 | Client-reported active elapsed time |
| deaths | INTEGER | Yes | CHECK 0–100,000 | Client-reported deaths |

All three result columns are NULL before completion and all are populated after completion. Authenticated users can read only their own tests and cannot directly insert, modify or delete them. Dedicated RPCs manage the lifecycle. Historical tests remain after edits, but only a completed test of the current revision can authorize publication. Tests create no normal play attempts, leaderboard entries, completion/timed awards, rating eligibility or favorite eligibility.

Indexes cover the owner and level foreign keys and completed `(level_id, revision)` lookups.

## ratings

| Attribute | Type | Nullable | Keys / constraints / deletion | Purpose |
|---|---|---|---|---|
| user_id | UUID | No | Composite PK; FK profiles.id; CASCADE | Player |
| level_id | UUID | No | Composite PK; FK levels.id; CASCADE | Rated published course |
| score | SMALLINT | No | CHECK 1–5 | One editable integer score per player/course |
| updated_at | TIMESTAMPTZ | No | DEFAULT now(); update trigger | Refreshed only when score actually changes |

The client rejects non-integer and out-of-range ratings before sending them. Upsert replaces the player's score; deletion removes it. Identical updates retain the previous timestamp.

## favorites

| Attribute | Type | Nullable | Keys / constraints / deletion | Purpose |
|---|---|---|---|---|
| user_id | UUID | No | Composite PK; FK profiles.id; CASCADE | Player |
| level_id | UUID | No | Composite PK; FK levels.id; CASCADE | Favorite published course |
| created_at | TIMESTAMPTZ | No | DEFAULT now() | Favorite timestamp |

Favorite uses insert-on-conflict-do-nothing; unfavorite deletes the player's pair. Repeating either action is safe. Ratings and favorites are independent.

## achievements

| Attribute | Type | Nullable | Keys / constraints / deletion | Purpose |
|---|---|---|---|---|
| code | TEXT | No | PK; fixed three codes | Achievement identity |
| name | TEXT | No | Human-readable name | Award label |
| rule | TEXT | No | CHECK first_completion / first_created_level / timed_course | Backend event rule |
| threshold_ms | INTEGER | Yes | Positive for timed rule; NULL otherwise | Catalog threshold, initially 30,000 ms for First Flight |

The three codes are `first_created_level`, `first_completion` and `first_flight_under_30s`. Draft creation awards the first once. Normal published-course completion awards the second. The timed award requires course UUID `11111111-1111-4111-8111-111111111111` and elapsed time strictly below the catalog threshold; it does not depend on the title. Playtest completion and publication do not award completion achievements.

## player_achievements

| Attribute | Type | Nullable | Keys / constraints / deletion | Purpose |
|---|---|---|---|---|
| player_id | UUID | No | Composite PK; FK profiles.id; CASCADE | Award owner |
| achievement_code | TEXT | No | Composite PK; FK achievements.code; RESTRICT | Award identity |
| earned_at | TIMESTAMPTZ | No | DEFAULT now() | Award timestamp |

Only backend trigger/RPC logic inserts awards; unique player/code pairs make repeated qualifying events safe. Players can read only their own awards.

## RPC contracts

All UUID identities and expected revisions below are checked on the server. The caller's account comes from `auth.uid()`, never a supplied owner ID.

| Public function | Input | Result and behavior | Access |
|---|---|---|---|
| `owned_levels` | None | Set of owner level JSON objects, private and published; includes `revision`, `published`, computed `can_publish`; ordered by updated time descending then UUID | Authenticated owner |
| `save_draft` | `p_id uuid`, `p_expected_revision integer`, `p_title text`, `p_description text`, `p_difficulty text`, `p_layout jsonb` | Saved owner level JSON; new drafts use NULL expected revision and a stable UUID; updates use expected revision | Authenticated owner |
| `start_draft_playtest` | `p_level_id uuid`, `p_expected_revision integer` | JSON `{id, level}` containing a new test ID and the exact saved level snapshot | Authenticated owner |
| `complete_draft_playtest` | `p_test_id uuid`, `p_elapsed_ms integer`, `p_deaths integer` | Test UUID after validating ownership, current revision, bounds and server duration | Authenticated owner |
| `publish_level` | `p_level_id uuid`, `p_expected_revision integer` | Owner level JSON after atomically checking current revision and a completed qualifying test | Authenticated owner |
| `complete_attempt` | `p_attempt_id uuid`, `p_elapsed_ms integer`, `p_deaths integer` | Attempt UUID; completion and qualifying awards are atomic | Authenticated attempt owner |
| `level_leaderboard` | `p_level_id uuid` | Rows of `rank bigint`, `display_name text`, `elapsed_ms integer`; one best result per player, ties share rank, UUID tie-break, top 50 | Authenticated; published courses only |
| `level_statistics` | None | Rows of `level_id uuid`, `average_rating numeric`, `rating_count bigint`, `favorite_count bigint`; unrated average NULL and empty counts zero | Anonymous and authenticated; published courses only |
| `own_progress` | None | Rows of `level_id uuid`, `best_ms integer`; minimum elapsed time from the caller's completed attempts; ordered by course UUID | Authenticated; invoker security, explicit owner filter and RLS |

`save_draft` locks the owner record. Retrying an identical create with its original UUID or an identical update after a lost response returns the current record without duplicates or extra revision increments. Different content with a stale expected revision fails with SQLSTATE `PT409` (HTTP 409); the frontend retains local edits for reload or save-as-copy. Matching current content is a harmless retry even if its expected revision is older. Stale start-test, complete-test and publish calls use the same conflict code. PostgREST supports this status mapping through its [custom error codes](https://docs.postgrest.org/en/stable/references/errors.html#raise-errors-with-http-status-codes).

Starting a playtest locks the saved level while creating the test and returning its snapshot. Completing and publishing lock the same level before testing revision eligibility. Any saved metadata/layout change invalidates approval. Completion of an old test fails after the revision changes. Identical completion requests and repeated publication requests succeed without changing their original result. A completed playtest cannot be rewritten. Local unsaved previews never create an approval record.

## Relationships and access

Each managed auth user has one application profile. A profile may own many courses; each course has at most one creator. Attempts, ratings, favorites and draft playtests each belong to one player and one course. Rating/favorite pairs and player/achievement pairs are unique.

Row-level security is enabled on every application table. Anonymous users read published levels and published aggregate statistics. Authenticated users directly read/update their own profile, read their own interaction/progress rows, read the achievement catalog, and read their own private courses in addition to public courses. Ratings/favorites require an existing normal play attempt on that published course; finishing is optional. Other accounts cannot read or modify individual ratings, favorites, attempts, tests or awards.

Direct writes to level ownership, revision, publication, attempt result fields, draft playtests and awards are not granted to application roles. New draft and publication mutations use owner-checked RPCs. Existing interaction policies enforce own-account access and recorded-play eligibility. Aggregate statistics deliberately cross row privacy to return shared course totals, with separate rating and favorite aggregation to avoid multiplying counts; no individual scores or account IDs are returned.

Privileged implementations live in `private`, use `SECURITY DEFINER` only where required and set an empty `search_path`. Public RPC wrappers use `SECURITY INVOKER`. Function grants are explicit, including revocation of default public access. Anonymous schema usage allows the aggregate wrapper to call its private implementation; it does not grant execution of other private functions. Application-facing functions do not accept SQL text or concatenate user-controlled SQL.

## Geometry, local state and trust model

Legacy V1 validation remains unchanged: a 24 × 14 grid, integer coordinates, 1–60 platform segments, at most 50 of each point type, distinct start/finish and unique positions within each hazard/checkpoint/item array. Start, finish and checkpoints must be outside platforms/hazards and directly supported by a platform. Items must be in bounds and outside platforms/hazards; airborne items are allowed. SQL caps V1 stored layout size at 128 KiB.

V2 uses 18px tiles, 25 rows and 24–512 columns with overworld, cave or sky themes. Client and SQL whitelist exact fields and component types; executable data, URLs, pipes and teleport hooks are excluded. Per-array bounds, a 4,096-component cap, a 256 KiB payload limit and a 32,768 expanded-tile budget constrain rendering work. Runs count by width, obstacles by width × height and other components individually. Starts, finishes and checkpoints must be safe and supported; items and loose power-ups must be outside solids and hazards. Moving-platform endpoints stay within the world. The validators check geometry and resource bounds, not reachability; saved-version playtesting remains required for publication.

Items stay in `layout.items`; there is no item table. Collected IDs/counts, active checkpoint, timer and current run state are local to an attempt. Item counts do not affect course completion, saved results, awards or publication. The reduced-motion preference is device-local browser storage and has no database table. AI controls are unavailable placeholders; there are no AI tables, provider keys or provider requests.

The server enforces identity, ownership, revisions, result bounds, maximum plausible duration and the existence of a completed saved-version test. It trusts the client to report reaching the finish, elapsed active time and deaths. Tested publication is an ownership/revision workflow under the class-project trust model; it is not production anti-cheat or a server simulation. A modified client could falsely report completion within accepted bounds.
