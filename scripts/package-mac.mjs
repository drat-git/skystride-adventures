import { build, loadEnv } from 'vite';
import { packager } from '@electron/packager';
import { mkdir, readFile, writeFile, cp, rm, stat, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';

if (process.platform !== 'darwin') throw Error('Build the Mac app on macOS.');
const env = loadEnv('production', process.cwd(), 'VITE_');
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
if (key.startsWith('sb_secret_')) throw Error('A private Supabase key must never be packaged.');
if (key.startsWith('eyJ')) { const role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; if (role !== 'anon') throw Error('Use only the Supabase publishable/anon key.'); }
const meta = JSON.parse(await readFile('package.json', 'utf8'));
await build({ configFile: 'vite.desktop.config.ts', mode: 'production' });
const base = resolve('output/mac'), stage = join(base, 'staging');
const cache = join(base, 'electron-cache'), artifact = `electron-v${meta.devDependencies.electron}-darwin-arm64.zip`;
await mkdir(cache, { recursive: true });
const runtimeZip = join(cache, artifact);
try { await stat(runtimeZip); } catch {
  console.log('Downloading the official Apple Silicon Electron runtime…');
  execFileSync('/usr/bin/curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--connect-timeout', '20', '--output', runtimeZip,
    `https://github.com/electron/electron/releases/download/v${meta.devDependencies.electron}/${artifact}`], { stdio: 'inherit' });
}
const checksums = JSON.parse(await readFile('node_modules/electron/checksums.json', 'utf8'));
if (createHash('sha256').update(await readFile(runtimeZip)).digest('hex') !== checksums[artifact]) {
  await rm(runtimeZip, { force: true }); throw Error('Electron runtime checksum mismatch. Build stopped.');
}
await rm(stage, { recursive: true, force: true }); await mkdir(stage, { recursive: true });
// Explicit allowlist: no .env files, source, test accounts, reports or secrets.
await cp('dist-desktop', join(stage, 'game'), { recursive: true });
await cp('desktop/main.cjs', join(stage, 'main.cjs'));
await writeFile(join(stage, 'config.json'), JSON.stringify({ supabaseUrl: env.VITE_SUPABASE_URL.replace(/\/$/, '') }));
await writeFile(join(stage, 'package.json'), JSON.stringify({ name: 'skystride-adventures-desktop', productName: 'SkyStride Adventures', version: meta.version, main: 'main.cjs', description: 'SkyStride Adventures for Apple Silicon Macs', author: 'Darsh Rathi' }, null, 2));
const scratch = await mkdtemp(join(tmpdir(), 'skystride-mac-build-'));
const paths = await packager({ dir: stage, out: scratch, name: 'SkyStride Adventures',
  platform: 'darwin', arch: 'arm64', electronVersion: meta.devDependencies.electron,
  electronZipDir: cache,
  appBundleId: 'com.skystride.adventures', appCategoryType: 'public.app-category.games',
  asar: true, overwrite: true, prune: false,
});
const appPath = join(paths[0], 'SkyStride Adventures.app');
for (const [source, name] of [['LICENSE', 'LICENSE-electron.txt'], ['LICENSES.chromium.html', 'LICENSES.chromium.html']]) {
  const license = execFileSync('/usr/bin/unzip', ['-p', runtimeZip, source], { maxBuffer: 50 * 1024 * 1024 });
  await writeFile(join(appPath, 'Contents/Resources', name), license);
}
// Finder/iCloud metadata on generated bundles invalidates strict code signatures.
// Remove only those resource metadata attributes, never quarantine/security flags.
const attributes = execFileSync('/usr/bin/xattr', ['-r', appPath], { encoding: 'utf8' });
for (const name of ['com.apple.FinderInfo', 'com.apple.ResourceFork']) {
  if (attributes.includes(name)) execFileSync('/usr/bin/xattr', ['-dr', name, appPath]);
}
execFileSync('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
const zip = join(base, 'SkyStride-Adventures-mac-arm64.zip');
await rm(zip, { force: true });
execFileSync('/usr/bin/ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zip]);
const installedCopy = join(base, 'SkyStride Adventures.app');
await rm(installedCopy, { recursive: true, force: true });
await cp(appPath, installedCopy, { recursive: true, verbatimSymlinks: true });
const hash = createHash('sha256').update(await readFile(zip)).digest('hex');
await writeFile(zip + '.sha256', hash + '  SkyStride-Adventures-mac-arm64.zip\n');
await writeFile(join(base, 'build.json'), JSON.stringify({ appPath: installedCopy, signedBuild: appPath, zip, bytes: (await stat(zip)).size, sha256: hash, arch: 'arm64', electron: meta.devDependencies.electron, signing: 'ad-hoc; not Apple-notarized' }, null, 2));
console.log('Mac app:', installedCopy); console.log('Submission ZIP:', zip);
