import { build, loadEnv } from 'vite';
import { packager } from '@electron/packager';
import { mkdir, readFile, writeFile, cp, rm, stat, rename } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';

// Cross-package on this project's Mac; no Windows execution or tests are needed.
if (process.platform !== 'darwin') throw Error('Run this Windows cross-build on macOS.');
const env = loadEnv('production', process.cwd(), 'VITE_');
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
if (key.startsWith('sb_secret_')) throw Error('A private Supabase key must never be packaged.');
if (key.startsWith('eyJ')) {
  const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role;
  if (role !== 'anon') throw Error('Use only the Supabase publishable/anon key.');
}
const meta = JSON.parse(await readFile('package.json', 'utf8'));
await build({ configFile: 'vite.desktop.config.ts', mode: 'production' });
const base = resolve('output/windows'), stage = join(base, 'staging');
const cache = join(base, 'electron-cache');
const artifact = `electron-v${meta.devDependencies.electron}-win32-x64.zip`;
await mkdir(cache, { recursive: true });
const runtimeZip = join(cache, artifact);
try { await stat(runtimeZip); } catch {
  console.log('Downloading the official Windows x64 Electron runtime…');
  execFileSync('/usr/bin/curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--connect-timeout', '20', '--output', runtimeZip,
    `https://github.com/electron/electron/releases/download/v${meta.devDependencies.electron}/${artifact}`], { stdio: 'inherit' });
}
const checksums = JSON.parse(await readFile('node_modules/electron/checksums.json', 'utf8'));
if (createHash('sha256').update(await readFile(runtimeZip)).digest('hex') !== checksums[artifact]) {
  await rm(runtimeZip, { force: true }); throw Error('Electron runtime checksum mismatch. Build stopped.');
}
await rm(stage, { recursive: true, force: true }); await mkdir(stage, { recursive: true });
// Explicit allowlist: never bundle .env files, server secrets or test accounts.
await cp('dist-desktop', join(stage, 'game'), { recursive: true });
await cp('desktop/main.cjs', join(stage, 'main.cjs'));
await writeFile(join(stage, 'config.json'), JSON.stringify({ supabaseUrl: env.VITE_SUPABASE_URL.replace(/\/$/, '') }));
await writeFile(join(stage, 'package.json'), JSON.stringify({
  name: 'skystride-adventures-desktop', productName: 'SkyStride Adventures', version: meta.version,
  main: 'main.cjs', description: 'SkyStride Adventures for Windows x64', author: 'Darsh Rathi',
}, null, 2));
const paths = await packager({
  dir: stage, out: join(base, 'package'), name: 'SkyStride Adventures',
  platform: 'win32', arch: 'x64', electronVersion: meta.devDependencies.electron,
  electronZipDir: cache, asar: true, overwrite: true, prune: false,
  win32metadata: { CompanyName: 'Darsh Rathi', FileDescription: 'SkyStride Adventures', ProductName: 'SkyStride Adventures' },
});
const appPath = join(base, 'SkyStride Adventures');
await rm(appPath, { recursive: true, force: true });
await rename(paths[0], appPath);
for (const [source, name] of [['LICENSE', 'LICENSE-electron.txt'], ['LICENSES.chromium.html', 'LICENSES.chromium.html']]) {
  const license = execFileSync('/usr/bin/unzip', ['-p', runtimeZip, source], { maxBuffer: 50 * 1024 * 1024 });
  await writeFile(join(appPath, name), license);
}
const instructions = `SkyStride Adventures — Windows x64 backup

1. Extract the entire ZIP to a local folder on a 64-bit Windows PC.
2. Open the extracted SkyStride Adventures folder.
3. Double-click SkyStride Adventures.exe. Keep every file and subfolder together.

No Node, npm, browser or development server is required. This is a portable app;
there is no installer. Close the window or use File > Quit to exit.

Use your existing SkyStride account. Internet is required for accounts, cloud
data, community features and AI. Guest play of the six bundled official courses
is available offline. The Windows app keeps its own session and device settings.

This backup was cross-built on a Mac and has NOT been run or tested on Windows.
The executable is not code-signed; Windows may display an unknown-publisher warning.
The Mac app and GitHub Pages website are separate and remain available.
`;
await writeFile(join(appPath, 'Read Me.txt'), instructions);
await writeFile(join(base, 'Read Me.txt'), instructions);
const zip = join(base, 'SkyStride-Adventures-windows-x64.zip');
await rm(zip, { force: true });
execFileSync('/usr/bin/zip', ['-q', '-r', zip, basename(appPath)], { cwd: base, stdio: 'inherit' });
const hash = createHash('sha256').update(await readFile(zip)).digest('hex');
await writeFile(zip + '.sha256', hash + '  ' + basename(zip) + '\n');
await writeFile(join(base, 'build.json'), JSON.stringify({
  appPath, executable: join(appPath, 'SkyStride Adventures.exe'), zip, bytes: (await stat(zip)).size,
  sha256: hash, platform: 'win32', arch: 'x64', electron: meta.devDependencies.electron,
  version: meta.version, createdAt: new Date().toISOString(), signing: 'unsigned', testsRun: false,
}, null, 2));
console.log('Windows folder:', appPath); console.log('Backup ZIP:', zip);
