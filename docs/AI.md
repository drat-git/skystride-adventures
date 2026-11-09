# AI gameplay hints and Course Maker feedback

Both features use OpenAI `gpt-5.4-mini` through Supabase Edge Functions: `ai-assist` for the website and `ai-assist-desktop` for the Mac/Windows apps. Both endpoints reuse the same shared handler, contracts, managed-user validation and database quota. Responses API calls use strict JSON schema, no reasoning effort, bounded output, and `store:false`. The app has no provider SDK or credential in its frontend bundle.

## Player and creator behavior

- Pause a run, then select **AI Hint**. The hint uses current position, power, checkpoint, elapsed/remaining time, collected coins and nearby live enemies/platforms/power-ups. Used blocks, collected coins and broken blocks are excluded or marked spent. Pause remains active until Resume; hints cancel on resume/restart/navigation/account change.
- In **Course Maker**, select **AI Editor Feedback**. The current unsaved draft is reviewed, producing an assessment and exactly three location-specific suggestions. Editing aborts pending feedback and clears old advice. The creator applies changes manually; saved-revision playtesting remains mandatory for publication.
- Both require sign-in. Loading, provider failures, timeout, malformed responses and quota limits have visible retry messages. Only text nodes render model content. No AI action saves, changes or publishes a course. Model advice can be mistaken and is not a reachability proof.

## Server setup

1. Apply the additive `20261109090945_ai_usage_limits.sql` migration after the existing migrations. Never rerun the installed initial schema.
2. In Supabase **Edge Functions → Secrets**, set `OPENAI_API_KEY`. Do not put it in `.env.local`, any `VITE_` variable, the repository or chat.
3. Deploy `supabase/functions/ai-assist/index.ts` and `supabase/functions/ai-assist-desktop/index.ts` with their shared dependencies `src/ai-service.ts`, `src/ai-contract.ts`, `src/course-format.ts`. JWT verification remains enabled; the handler additionally calls managed Auth `getUser` to reject missing, expired or deleted-account sessions. The existing hosted deployment already has both functions; documentation updates do not require redeployment.
4. Optional server secrets: `OPENAI_MODEL` (default `gpt-5.4-mini`, must support this Responses/structured-output contract); `AI_PROJECT_DAILY_LIMIT` (default200, capped at10000). Supabase supplies its URL and service-role secret automatically. Redeploy after changing model/limit values if necessary.
5. `ai-assist` allows only the existing browser origin `https://drat-git.github.io`; `ai-assist-desktop` allows only `app://skystride`. Keep these endpoint-specific restrictions instead of adding desktop access to the web endpoint or using a wildcard. CLI requests still require an actual user token.

Desktop compilation uses a plugin in `vite.desktop.config.ts` to bind the frontend invocation to `ai-assist-desktop`. Shared `src/ai.ts` and the web build keep their original function name. Both origins share per-account and project limits; installing another app does not create a separate allowance. No schema change was needed for desktop AI.

The endpoint validates JSON/body size, V2 geometry, mode and gameplay state before consuming quota or calling OpenAI. It recomputes compact context server-side, treats all course text as untrusted data, and sends no account/email/token/profile fields to the model. Layouts are supplied by the caller, including unsaved drafts; the endpoint cannot fetch anyone else's private course. No prompts/replies are stored in our database. `store:false` disables Responses application-state retention; it is not a claim about provider-wide abuse-monitoring retention.

Limits: 5 requests/minute and 50/UTC day per account, plus the shared daily cap. Provider attempts count even if they later fail or are cancelled. Global-row locking prevents races past the caps. Responses time out after22seconds; the client stops waiting after30seconds. No automatic model retries. The daily cap bounds request count, not an exact dollar budget; use OpenAI project spending controls as desired.

Local development remains isolated: its fixture API returns an unavailable explanation rather than contacting a paid provider or using the production secret.

## Verification

- `npm test`: contract, provider and handler tests use explicit mocks; SQL tests use real PostgreSQL semantics via PGlite, including role denials, per-account and global quotas, expiry, account cascade and populated-upgrade preservation.
- `node scripts/test-ai-browser.mjs`: isolated local Auth/SQL with explicitly mocked model responses. Exercises guest explanation, unsaved draft review, invalidation, error retry, fullscreen paused state/timers, resume cancellation and restart cleanup.
- `node --env-file=.env.local scripts/test-ai-hosted-api.mjs`: opt-in real Auth/Edge Function/OpenAI test. Creates/reuses a dedicated disposable account recorded only in ignored `output/ai/test-account.json`, mode0600. Records nonsecret responses in `output/ai/hosted-api.json`. Remove this exact temporary account and its credential file after verification; do not delete other accounts.
- `scripts/test-ai-hosted-browser.mjs`: public frontend end-to-end checks, using that dedicated account. No route interception or model fixtures.
- `scripts/test-mac-app.mjs`: opt-in real packaged Mac app journey, including genuine editor feedback and fullscreen paused hints through `ai-assist-desktop`. Existing release evidence records successful calls. No Windows runtime verification was performed.

Dated results and screenshots are retained in ignored `output/ai/`; the technical release summary is appended to `OVERHAUL_VERIFICATION.md`. The report and presentation remain separate work.
