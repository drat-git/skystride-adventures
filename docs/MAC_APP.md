# SkyStride Adventures for Apple Silicon Macs

The Mac app bundles the game, Phaser renderer, graphics and audio. It opens its own window and connects to the existing production Supabase project for accounts, courses, progress and community features. AI calls use a separate `ai-assist-desktop` Edge Function. The website, GitHub Pages URL, web build configuration and original `ai-assist` function are unchanged.

## Run or submit the app

Build artifacts are in `output/mac/` (ignored by Git):

- `SkyStride Adventures.app`: the application for Apple Silicon Macs.
- `SkyStride-Adventures-mac-arm64.zip`: the submission/distribution archive containing the app.
- `SkyStride-Adventures-mac-arm64.zip.sha256`: archive checksum.

For submission, share the ZIP. Extract it and copy **SkyStride Adventures.app** to Applications or another local folder, then double-click it. Node, npm, a browser, and a development server are not needed to run it. Use **Command-Q** to quit.

This is an arm64 build, not an Intel Mac or Windows build. It is locally ad-hoc signed and is **not Apple-notarized**. Another Mac may require its owner to approve opening the app through macOS security settings. Official Apple guidance: <https://support.apple.com/102445>. Use the ZIP for transfer; cloud-sync folders can attach Finder metadata to an expanded app bundle.

## Online and offline behavior

Sign in with the same account used on the website. Database-backed data is shared. The desktop app keeps its own login session and settings in its macOS application-data folder; browser login state is not automatically copied.

Internet is needed for login, saved progress, course saving/testing/publication, community courses, ratings, favorites, leaderboards, achievements and AI. Guest play of the six bundled official courses works without internet. Offline runs are not queued for later cloud synchronization.

The installed app uses its bundled frontend version. Changes to the website do not silently replace that installed version; run the Mac build again to distribute a new app.

## Rebuild

On macOS with the project's supported Node version:

```sh
npm ci
npm run build:mac
```

The build needs only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from the private `.env.local`. Use the existing production project. Never place an OpenAI key or Supabase service-role key in the client build. The current public URL/key are bundled intentionally; RLS and authenticated RPCs still enforce permissions.

`vite.desktop.config.ts` builds to `dist-desktop/`. Its desktop-only transform points AI requests to `ai-assist-desktop` without changing the shared frontend source or the web endpoint. `scripts/package-mac.mjs` stages only compiled assets, a small Electron entrypoint and public configuration. It verifies the pinned Electron runtime against its published checksum, signs in a temporary non-cloud folder, and creates the app and ZIP. Electron/Chromium and game-art license notices are included.

The original `npm run dev`, web build and GitHub Pages workflow keep their existing behavior. No Pages deployment is required for a Mac build.

## Desktop endpoint and security

Deploy `supabase/functions/ai-assist-desktop/index.ts` with its relative shared TypeScript dependencies and JWT verification enabled. It allows only `app://skystride`, verifies the real user, and shares the existing quota and OpenAI integration. The original website endpoint retains its own origin restriction. Secrets stay on Supabase.

Electron loads bundled resources through a restricted, standard, secure `app://skystride` protocol. Renderer Node integration is disabled; context isolation, sandboxing, web security and a restrictive content-security policy are enabled. Arbitrary navigation, webviews and permissions are denied. Existing credit links can open only the approved external HTTPS domains. No privileged renderer bridge is exposed.

## Verification

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test-mac-app.mjs
```

This opt-in test launches the actual packaged app, uses one disposable production account and calls real AI. Temporary credentials and a separate test profile are written under ignored `output/mac/`. Remove only that test account and its courses after the run, then remove the temporary credentials/profile. Do not use a real player's account for this test. Evidence is in `output/mac/acceptance/`.
