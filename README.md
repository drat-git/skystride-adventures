# SkyStride Adventures

Group 9's compact browser platformer. Sprint 2 implements account registration/login/logout, session restoration, a persistent player profile, published level selection, and a small playable course. All 15 semester features remain in the design (see docs). No AI calls or purchases occur in Sprint 2.

## Run and build

Use Node 22.12+ (or a supported newer version) and npm. No IDE is required.

```sh
npm ci
cp .env.example .env.local
# Fill in your Supabase Project URL and PUBLIC publishable/anon key.
npm run dev
npm test
npm run build
npm run preview
```

Without configuration, the app displays honest setup states and allows explicitly labeled local practice. It does not simulate successful authentication or silently replace failed database reads. Local results are never represented as saved progress.

## Supabase setup

1. Create a Free project in your organization; privately save its generated database password.
2. Run `supabase/migrations/001_core.sql` once in the new project's SQL Editor, followed by `supabase/seed.sql`. Migration is transactional; do not repeatedly run it after success. Seed can be re-run.
3. Run `supabase/verify.sql` and inspect the five tables, keys, policies and seeded course.
4. Keep the email/password provider enabled. Configure Site URL and allowed redirect URLs for `http://127.0.0.1:5173` and the eventual hosted origin. Email confirmation is supported; confirmed test users can be created in Authentication → Users if email delivery is unavailable. Choose confirmation settings deliberately; never treat an unconfirmed account as signed in.
5. Get the Project URL and publishable key from Connect, or the legacy anon key from API Keys. Add them to `.env.local`; restart Vite. Never use a secret/service-role key or DB password in any `VITE_` variable.
6. Register a dedicated demo account through the app, confirm its email if enabled, sign in, change the display name, refresh, sign out and sign in again. Then load the seeded course.
7. Create two dedicated test accounts and fill `TEST_EMAIL_A`, `TEST_PASSWORD_A`, `TEST_EMAIL_B`, `TEST_PASSWORD_B` locally. Run `npm run test:integration`. That script reads public configuration and tests live data/ownership constraints; it writes timestamped results without secrets. It creates test interaction records and leaves a play attempt as evidence. Run only in a disposable class project with dedicated test users.

Passwords stay in managed auth. A signup trigger creates a profile keyed by auth user UUID. Exposed tables have RLS. Levels are read-only to client roles this sprint. Ratings/favorites need a recorded play attempt; their UI and gameplay integration are future work. User interaction rows are private; future aggregate sorts require a carefully bounded read function. Auth sessions use the provider's browser storage; logout and account changes remove active private UI state.

## Controls and timing

Arrow keys/A-D move; Space/Up/W jump. Coral hazards return the player to the start. Timer starts when the scene starts, continues through deaths, stops on completion, and pauses with the physics. Hiding the tab pauses; resume explicitly. Restart creates a new attempt; back destroys the Phaser game and listeners. There is no cloud save of completion time in Sprint 2. Structural layout validation does not establish route reachability.

## Deployment

Preferred free host: Cloudflare Pages. Build command `npm run build`; output `dist`; Node 22.12+. Configure the two public `VITE_SUPABASE_*` values in host environment, then rebuild. Add the exact provider-subdomain origin to Supabase Site URL/redirect allowlist; test signup confirmation, session restoration, asset loading and backend connectivity there. Never purchase a domain or paid plan for the demo. Free-plan pricing and pause behavior must be rechecked before deployment. A hosted frontend still requires a live Supabase project.

## Verification and delivery

`npm test` executes domain rules and the SQL migration in local PostgreSQL/PGlite. That uses test auth fixtures, so it does not verify managed Supabase authentication or networking. `docs/VERIFICATION.md` records the evidence and limitations. Editable diagram SVGs are in `docs/diagrams`. The report preserves the supplied template organization. Planning, real team evaluations, coordinator identity, individual uploads and printed submission require factual user/team input.
