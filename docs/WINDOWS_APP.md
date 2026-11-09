# Windows backup build

The portable x64 Windows build is separate from the Apple Silicon Mac app and the GitHub Pages website. It bundles the same desktop frontend and connects to the existing hosted services through the existing desktop endpoint. No backend or website deployment is needed.

Share `output/windows/SkyStride-Adventures-windows-x64.zip`. On Windows, extract the **entire ZIP**, open the extracted **SkyStride Adventures** folder and run **SkyStride Adventures.exe**. Keep the EXE, DLLs, resources and other included files together. There is no installer, and Node/npm are not needed. Close the window or use **File → Quit** to exit.

Use an existing SkyStride account for online features. The app has its own saved login session and device settings. Internet is required for authentication, cloud persistence, community features and AI; guest play of the six bundled official courses is available offline.

This is an **unsigned, untested Windows backup**, as requested. It was cross-packaged on macOS without running tests or launching the Windows executable. Windows may show an unknown-publisher warning.

## Rebuild on macOS

With the supported Node version, installed project dependencies and the existing production public Supabase configuration in `.env.local`:

```sh
npm run build:windows
```

This command compiles the desktop renderer and packages the pinned Windows x64 Electron runtime. It does not invoke type checking or test scripts. The runtime download is checked against Electron's published SHA-256 checksum. Only compiled game assets, the desktop entrypoint and public configuration are staged; private environment files and server credentials are excluded.

Artifacts, the SHA-256 sidecar, build metadata and running instructions are under ignored `output/windows/`. Existing Mac artifacts and the web build output are not replaced. This build script uses macOS `curl`, `unzip` and `zip` to cross-package a portable Windows folder.
