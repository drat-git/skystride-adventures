# Desktop downloads and releases

**[SkyStride Adventures 0.2.0](https://github.com/drat-git/skystride-adventures/releases/tag/v0.2.0)** provides the desktop apps. The [GitHub Pages game](https://drat-git.github.io/skystride-adventures/) remains available at its existing URL.

| Download | Target | Recorded status |
| --- | --- | --- |
| [SkyStride-Adventures-mac-arm64.zip](https://github.com/drat-git/skystride-adventures/releases/download/v0.2.0/SkyStride-Adventures-mac-arm64.zip) | Apple Silicon Mac, arm64 | Verified packaged app; ad-hoc signed, not Apple-notarized |
| [SkyStride-Adventures-windows-x64.zip](https://github.com/drat-git/skystride-adventures/releases/download/v0.2.0/SkyStride-Adventures-windows-x64.zip) | Windows PC, x64 | Portable, unsigned backup; not run or tested on Windows |
| [SHA256SUMS.txt](https://github.com/drat-git/skystride-adventures/releases/download/v0.2.0/SHA256SUMS.txt) | Both archives | SHA-256 download-integrity values |
| [release-manifest.json](https://github.com/drat-git/skystride-adventures/releases/download/v0.2.0/release-manifest.json) | Release metadata | Architecture, runtime, size, source revisions, verification status |

Choose the named app ZIP for your platform. GitHub's automatic **Source code** downloads contain the repository, not a ready-to-run app. Intel Mac, Windows ARM, Linux, and mobile builds are not provided.

## Install and run

### Apple Silicon Mac

1. Download and extract the Mac ZIP.
2. Copy **SkyStride Adventures.app** to Applications or another local folder.
3. Open it. Use **Command-Q** to quit.

The app is locally ad-hoc signed; it has no Apple Developer ID signature or notarization. If macOS blocks it, follow [Apple's guidance for opening apps from an unidentified developer](https://support.apple.com/102445). Transfer the ZIP rather than an expanded app bundle through cloud-sync folders, which may attach Finder metadata. [Full Mac guide](MAC_APP.md).

### Windows x64

1. Download the Windows ZIP.
2. Use **Extract All** to extract the entire archive to a local folder.
3. Open the extracted **SkyStride Adventures** folder and double-click **SkyStride Adventures.exe**.

Keep the EXE, DLLs, `resources`, and every other included file together. Running only the EXE or running from inside the ZIP is not supported. There is no installer. Close the window or use **File → Quit** to exit.

This backup was cross-packaged on macOS and is **untested on Windows**, as requested. It has no code signature; Windows may show an unknown-publisher warning. [Full Windows guide](WINDOWS_APP.md).

## Accounts, internet, and updates

All versions connect to the same production Supabase project. Use the same account for shared courses, progress, ratings/favorites, achievements and leaderboards. Each app/browser maintains its own login session and device settings. No account data or credentials are included in these downloads.

The six official courses and their graphics/audio are bundled. Desktop guest play works offline; authentication, cloud persistence, community features and AI require internet. Offline results are not queued for later synchronization.

Installed apps use the bundled frontend version. There is no automatic updater. Download a newer release to update; changing the website does not replace an installed app.

## Check a download

Compare the result with `SHA256SUMS.txt` or the individual `.zip.sha256` asset.

On macOS:

```sh
shasum -a 256 SkyStride-Adventures-mac-arm64.zip
```

On Windows PowerShell:

```powershell
Get-FileHash .\SkyStride-Adventures-windows-x64.zip -Algorithm SHA256
```

| Archive | SHA-256 |
| --- | --- |
| Mac arm64 | `18bf3cdcbf3050e537f8130280ea074862f7f01797cf69882c049efe163ee49d` |
| Windows x64 | `57cf90fae9cf0ce4984c0263aa7a40d385edd13b30a5f1761b4e9b15b3fd9414` |

## Rebuild and publish

Use macOS and the supported Node version. Install dependencies with `npm ci`, supply only the production public Supabase URL/key in private `.env.local`, then run:

```sh
npm run build:mac
npm run build:windows
```

Mac packaging type-checks first and creates the arm64 app/ZIP under `output/mac/`. Windows packaging compiles and cross-packages x64 under `output/windows/` without tests or type checking. Both use Electron **45.2.3** and verify the official runtime ZIP against its published checksum. Packaging does not launch the Windows executable. The Mac acceptance suite is separate and opt-in.

For future releases, commit the source changes, choose a new unused version/tag, and record each artifact's actual source revision and verification status. Stage a **draft GitHub release**, attach the app ZIPs, matching checksums, installation notes and a sanitized manifest, then publish once every asset is present. Do not attach private `output/` directories, `.env` files, QA profiles, credentials or raw database snapshots. Large binaries belong in release assets, not Git commits.

Desktop releases do not require a Pages deployment. The repository's existing workflow deploys pushes to `main`; a deliberate docs/distribution-only push can use GitHub's documented `[skip ci]` commit instruction to preserve the currently deployed site. Ordinary game changes still require the existing verification/deployment process. [GitHub workflow-skip documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs).
