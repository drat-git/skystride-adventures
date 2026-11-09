# Local overhaul development

Run `npm run dev` from the project root. It starts the game on `http://127.0.0.1:5186` and its isolated development API on `http://127.0.0.1:5187`. `LOCAL_GAME_PORT` and `LOCAL_BACKEND_PORT` can select other available ports.

The launcher supplies the local API URL, public fixture key and `VITE_BACKEND_MODE=local` before starting Vite. It does not edit `.env.local` or contact the hosted Supabase project. Development builds also reject inherited hosted URLs unless `VITE_ALLOW_HOSTED_DEV=true` is explicitly supplied; the local launcher always disables that opt-in. The released web and desktop clients use their separate production builds and the hosted project.

The local service runs the real migrations and row-level-security policies in PostgreSQL/PGlite. Authentication and the HTTP REST/RPC translation are development fixtures, not managed Supabase Auth or PostgREST. Local registration immediately creates a confirmed fixture session and profile; no confirmation emails are sent. Use dedicated local credentials. The UI identifies this environment as local development.

Use Node 24 and `npm ci` before starting. The local fixture enforces the same new-password rule as signup: 8–128 characters, uppercase/lowercase letters, a number and an ASCII punctuation symbol. Local AI returns an unavailable explanation; it never calls a paid provider. [Desktop packaging](RELEASES.md#rebuild-and-publish) is separate from this local API and needs the production public Supabase URL/key.

`output/overhaul/local-db/` contains the persistent database, a migration checksum ledger and `local-auth.json`. Passwords use per-account random salts and scrypt hashes. Random session and refresh tokens are persisted in the same ignored auth file with mode `0600`; the parent directory has mode `0700`. Local authentication uses a separate browser-storage key from hosted Supabase sessions. Keep the ignored local data out of version control.

Startup applies missing migrations and installs the six V2 official courses and applies the V1 retirement migration. Accounts, V2 records and earned awards are retained; old V1 course rows and their course-owned dependents are removed. If an already-applied local migration or official seed changes during development, startup reports the mismatch rather than rewriting immutable courses. Stop the local server, preserve the local data directory if its fixture work is needed, then start with a fresh local directory. This does not affect production. The hosted retirement was separately applied and verified; local startup never contacts hosted Supabase.

The HTTP listener binds only to `127.0.0.1`, validates the Host header, and allows browser origins only from loopback HTTP development servers. It exposes allowlisted application tables/RPCs with real SQL privileges and RLS. There is no HTTP administration endpoint. This service must not be deployed as a public backend.

Automated tests can import:

```js
import { createLocalBackend, LOCAL_PUBLIC_KEY } from './scripts/local-backend.mjs';
const backend = await createLocalBackend({ port: 0 }); // ephemeral database
// backend.url; backend.admin(sql, parameters) for trusted test setup only
await backend.close();
```

Pass `dataDir` explicitly for persistence. Optional in-process `faults` flags (`draftResponse`, `completion`, `playtest`, `favoriteResponse`, `logout`) inject one failure and reset themselves. There is no network route for changing these flags. The draft/favorite response failures occur after committing the SQL operation so retries exercise ambiguous-response behavior.

`npx vitest run tests/local-backend.test.mjs` checks real `supabase-js` HTTP flows, account isolation, private drafts, saved playtests/publication, community state, progress, session refresh/logout, denied origins/forged tokens, and database/auth persistence across restart. A sandbox may require permission to bind a loopback port. These tests do not verify managed Auth, email delivery, hosted PostgREST, or a production deployment.
