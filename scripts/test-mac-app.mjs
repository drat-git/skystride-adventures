// Real packaged Apple Silicon app -> managed Supabase Auth/SQL and desktop AI.
// Uses one disposable account; cleanup is separate so failures remain diagnosable.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const { _electron } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const build = JSON.parse(await readFile('output/mac/build.json', 'utf8'));
const out = resolve('output/mac/acceptance'), profile = resolve('output/mac/qa-profile');
await mkdir(out, { recursive: true }); await mkdir(profile, { recursive: true, mode: 0o700 });
const credentialPath = resolve('output/mac/test-account.json');
const account = { email: `desktop-${randomUUID()}@example.com`, password: randomBytes(24).toString('base64url') + 'aA1!', displayName: 'Mac App Verification' };
await writeFile(credentialPath, JSON.stringify(account), { mode: 0o600 });
const checks = [], errors = [], aiResponses = [];
let application, page, passed = false;
const record = text => { checks.push(text); console.log('PASS', text); };
const waitText = (selector, text) => page.locator(selector).filter({ hasText: text }).waitFor();
const ready = () => page.waitForFunction(() => parseFloat(document.querySelector('#hud-elapsed')?.textContent) > 0);
async function launch() {
  const env = { ...process.env, SKYSTRIDE_USER_DATA_DIR: profile }; delete env.ELECTRON_RUN_AS_NODE;
  application = await _electron.launch({ executablePath: join(build.appPath, 'Contents/MacOS/SkyStride Adventures'), env, timeout: 45000 });
  page = await application.firstWindow(); page.setDefaultTimeout(45000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().includes('/functions/v1/ai-assist-desktop')) aiResponses.push(r.status()); });
  await page.locator('#enter-menu, #official').first().waitFor();
  await page.keyboard.press('Enter'); await page.locator('#official').waitFor();
}
async function place(tool, x, y) {
  await page.locator('#tile-tool').selectOption(tool);
  await page.locator('#cursor-x').fill(String(x + 1)); await page.locator('#cursor-y').fill(String(y + 1));
  await page.locator('#go-to-cell').click(); await page.locator('#editor-viewport').focus(); await page.keyboard.press('Enter');
}
try {
  await launch();
  assert.deepEqual(await page.evaluate(() => ({ origin: location.origin, secure: isSecureContext, node: typeof window.require })), { origin: 'app://skystride', secure: true, node: 'undefined' });
  const permissions = await application.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(); return { sandbox: p.sandbox, isolation: p.contextIsolation, node: p.nodeIntegration, security: p.webSecurity };
  });
  assert.deepEqual(permissions, { sandbox: true, isolation: true, node: false, security: true });
  assert.equal(await page.evaluate(async () => (await fetch('app://skystride/%2e%2e%2fmain.cjs')).status), 404);
  await page.locator('#official').click(); await page.locator('#official-6').waitFor(); assert.equal(await page.locator('.official-card').count(), 6);
  await page.locator('#official-1').click(); await ready();
  await page.locator('#fullscreen').click(); await page.waitForFunction(() => document.fullscreenElement?.id === 'play-stage');
  await page.locator('#fullscreen-pause').click(); await page.locator('#replay').click(); await ready();
  assert.equal(await page.evaluate(() => document.fullscreenElement?.id), 'play-stage');
  assert.equal(await page.locator('canvas').count(), 1);
  await page.locator('#fullscreen-pause').click(); await page.locator('#overlay-menu').click();
  await page.waitForFunction(() => !document.fullscreenElement);
  record('Bundled assets, secure sandbox, six courses and gameplay-only fullscreen/restart/menu work in the Mac app');

  await page.locator('#profile').click();
  await page.getByLabel('Display name', { exact: true }).fill(account.displayName);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.locator('#authform button[type=submit]').click(); await waitText('#message', 'Profile loaded.');
  const uid = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
    return key && JSON.parse(localStorage.getItem(key)).user.id;
  });
  assert.ok(uid); account.id = uid; await writeFile(credentialPath, JSON.stringify(account), { mode: 0o600 });
  await page.locator('#brand').click(); await page.locator('#editor').click(); await waitText('#draft-message', 'Choose a private draft');
  await page.locator('#draft-title').fill('Mac app acceptance course'); await place('finish', 12, 22); await place('checkpoint', 4, 22); await place('item', 5, 22);
  await page.locator('#editor-ai').click(); await waitText('#editor-ai-status', 'AI feedback for this draft');
  assert.equal(await page.locator('#editor-ai-result li').count(), 3);
  await page.screenshot({ path: out + '/editor-ai.png', fullPage: true });
  await page.locator('#save-draft').click(); await waitText('#draft-message', 'Draft saved.');
  const draftId = await page.locator('#draft-list').inputValue(); account.courseId = draftId;
  await writeFile(credentialPath, JSON.stringify(account), { mode: 0o600 });
  record('Real account registration, Supabase draft saving and genuine OpenAI editor feedback work');

  await application.close(); application = undefined; await launch();
  await page.locator('#account').waitFor(); await page.locator('#editor').click(); await waitText('#draft-message', 'Choose a private draft');
  await page.locator('#draft-list').selectOption(draftId); await waitText('#draft-message', 'Course loaded from the database.');
  assert.equal(await page.locator('#draft-title').inputValue(), 'Mac app acceptance course');
  await page.locator('#test-draft').click(); await page.locator('#draft-preview canvas').waitFor(); await page.locator('#draft-preview').focus();
  await page.keyboard.down('ArrowRight');
  try { await waitText('#preview-state', 'Finish reached'); } finally { await page.keyboard.up('ArrowRight'); }
  await waitText('#draft-message', 'Saved playtest passed for revision');
  await page.locator('#publish-draft').click(); await waitText('#draft-message', 'Course published.');
  assert.equal(await page.locator('#draft-title').isDisabled(), true);
  record('Account session and saved draft survive app quit/relaunch; saved playtest and immutable publishing work');

  await page.locator('#brand').click(); await page.locator('#levels').click(); await waitText('#message', 'published course');
  const card = page.locator('article.course').filter({ has: page.getByRole('heading', { name: 'Mac app acceptance course', exact: true }) });
  await card.getByRole('button', { name: 'Play level', exact: true }).click(); await ready(); await page.locator('#game').focus();
  await page.keyboard.down('ArrowRight');
  try { await page.locator('#overlay-title').filter({ hasText: 'Course complete!' }).waitFor(); } finally { await page.keyboard.up('ArrowRight'); }
  await waitText('#message', 'Result saved!'); await page.locator('#details').click(); await waitText('#message', 'Course details loaded.');
  await page.locator('#rating-score').selectOption('5'); await page.locator('#save-rating').click(); await waitText('#message', 'Rating saved.');
  await page.locator('#favorite-toggle').click(); await waitText('#message', 'Favorite saved.');
  await page.locator('#leaderboard').click(); await page.getByRole('cell', { name: account.displayName, exact: true }).waitFor();
  await page.locator('#leaderboard-mode').selectOption('score'); await page.getByRole('cell', { name: account.displayName, exact: true }).waitFor();
  await page.locator('#brand').click(); await page.locator('#awards').click(); await waitText('#message', 'achievements earned.');
  assert.ok(await page.locator('.achievement-earned').count() >= 2);
  await page.screenshot({ path: out + '/achievements.png' });
  record('Community completion, cloud result, ratings/favorites, both leaderboard modes and achievements work');

  await page.locator('#brand').click(); await page.locator('#official').click(); await page.locator('#official-1').click(); await ready();
  await page.locator('#fullscreen').click(); await page.waitForFunction(() => document.fullscreenElement?.id === 'play-stage');
  await page.locator('#fullscreen-pause').click(); const elapsed = await page.locator('#hud-elapsed').innerText();
  await page.locator('#request-hint').click(); await waitText('#hint-status', 'Select Resume');
  assert.ok((await page.locator('#hint-text').innerText()).length > 30);
  assert.equal(await page.locator('#hud-elapsed').innerText(), elapsed);
  await page.screenshot({ path: out + '/fullscreen-ai-hint.png' });
  await page.locator('#overlay-menu').click(); await page.locator('#signout').click(); await page.locator('#signin').waitFor();
  assert.deepEqual(aiResponses, [200, 200]);
  record('Genuine AI gameplay hint works in desktop fullscreen while paused; logout works');

  await application.context().setOffline(true); await page.reload(); await page.locator('#enter-menu').click();
  await page.locator('#official').click(); await page.locator('#official-3').click(); await ready();
  await page.screenshot({ path: out + '/offline-guest-gameplay.png' });
  record('Packaged game starts without internet and supports bundled guest gameplay');
  assert.deepEqual(errors, []); passed = true;
} catch (e) { await page?.screenshot({ path: out + '/failure.png', fullPage: true }).catch(() => {}); throw e; }
finally { await writeFile(out + '/results.json', JSON.stringify({ passed, checks, errors, aiResponses }, null, 2)); await application?.close(); }
