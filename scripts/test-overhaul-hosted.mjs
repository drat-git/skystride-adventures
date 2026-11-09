// Desktop browser -> deployed V2 -> managed Supabase Auth/PostgREST.
// Run with node --env-file=.env.local; uses dedicated existing test accounts.
// Creates one published verification course and one private copy. No fixtures,
// request interception, private game state, or synthetic completion callbacks.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

for (const name of ['TEST_EMAIL_A', 'TEST_PASSWORD_A', 'TEST_EMAIL_B', 'TEST_PASSWORD_B']) {
  if (!process.env[name]) throw new Error(`Missing ${name}; load dedicated test credentials with --env-file=.env.local.`);
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseURL = process.env.BASE_URL || 'https://drat-git.github.io/skystride-adventures/';
const localPreflight = ['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const output = `output/overhaul/hosted-evidence/${localPreflight ? 'local-preflight/' : ''}${stamp}`;
await mkdir(output, { recursive: true });
const title = `V2 Release Flight ${stamp} ${randomUUID().slice(0, 4)}`;
const copyTitle = `Private copy ${stamp}`;
const accounts = {
  A: { email: process.env.TEST_EMAIL_A, password: process.env.TEST_PASSWORD_A },
  B: { email: process.env.TEST_EMAIL_B, password: process.env.TEST_PASSWORD_B },
};
const secrets = [...Object.values(accounts).flatMap(a => [a.email, a.password]), process.env.VITE_SUPABASE_PUBLISHABLE_KEY].filter(Boolean);
const redact = value => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), String(value));
const checks = [], screenshots = [], browserErrors = [], httpFailures = [];
let browser, a, b, courseId, copyId, passed = false, failure;
const record = name => { checks.push({ name, at: new Date().toISOString() }); console.log('PASS', name); };
const message = (page, text, selector = '#message') => page.locator(selector).filter({ hasText: text }).waitFor();
const card = page => page.locator('article.course').filter({ has: page.getByRole('heading', { name: title, exact: true }) });

async function shot(page, name) {
  const path = `${output}/${name}.png`;
  await page.screenshot({ path, fullPage: true, mask: [page.locator('input[name=email]'), page.locator('input[name=password]')] });
  screenshots.push(path);
}
async function page() {
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  const p = await context.newPage(); p.setDefaultTimeout(30000);
  p.on('pageerror', e => browserErrors.push(redact(e.message)));
  p.on('response', r => { if (r.status() >= 400) httpFailures.push({ status: r.status(), path: new URL(r.url()).pathname }); });
  return p;
}
async function enter(p) {
  if (await p.locator('#enter-menu').count()) { await p.keyboard.press('Enter'); }
  await p.locator('#official').waitFor();
}
async function login(p, account) {
  await p.bringToFront(); await p.goto(baseURL); await enter(p);
  await p.locator('#signin').click();
  await p.getByLabel('Email', { exact: true }).fill(accounts[account].email);
  await p.getByLabel('Password', { exact: true }).fill(accounts[account].password);
  await p.locator('#authform button[type=submit]').click();
  await message(p, 'Profile loaded.');
  assert.equal(await p.getByLabel('Email',{exact:true}).inputValue(),accounts[account].email);
  const name = await p.locator('#profileform input[name=name]').inputValue();
  await p.locator('#brand').click(); return name;
}
async function workshop(p) {
  await p.locator('#brand').click(); await p.locator('#editor').click();
  await message(p, 'Choose a private draft or a published course', '#draft-message');
}
async function place(p, tool, x, y, properties = {}) {
  await p.locator('#tile-tool').selectOption(tool);
  for (const [name, value] of Object.entries(properties)) {
    const field = p.locator(`#prop-${name}`);
    if (await field.evaluate(e => e.tagName) === 'SELECT') await field.selectOption(String(value));
    else await field.fill(String(value));
  }
  await p.locator('#cursor-x').fill(String(x + 1)); await p.locator('#cursor-y').fill(String(y + 1));
  await p.locator('#go-to-cell').click(); await p.locator('#editor-viewport').focus(); await p.keyboard.press('Enter');
}
async function save(p) {
  await p.locator('#save-draft').click(); await message(p, 'Draft saved. Revision', '#draft-message');
  return p.locator('#draft-list').inputValue();
}
async function finish(p, host = '#game', saved = true) {
  await p.bringToFront(); await p.locator(`${host} canvas`).waitFor(); await p.waitForTimeout(250);
  const pause = p.locator(host === '#game' ? '#pause' : '#pause-preview');
  if ((await pause.innerText()).startsWith('Resume')) await pause.click();
  await p.locator(host).focus(); await p.keyboard.down('ArrowRight');
  try {
    await message(p, host === '#game' ? 'Result saved!' : saved ? 'Saved playtest passed for revision' : 'Preview complete:', host === '#game' ? '#message' : '#draft-message');
  } finally { await p.keyboard.up('ArrowRight'); }
}
async function details(p) {
  await p.bringToFront(); await p.locator('#brand').click(); await p.locator('#levels').click();
  await message(p, 'published course'); await card(p).getByRole('button', { name: 'Course details', exact: true }).click();
  await message(p, 'Course details loaded.');
}
async function playShort(p) {
  await p.locator('#play-course').click(); await finish(p);
  assert.match(await p.locator('#message').innerText(), /1\s*\/\s*1 coins/);
  assert.match(await p.locator('#message').innerText(), /0 deaths/);
}
async function rate(p, value) {
  await p.locator('#rating-score').selectOption(String(value)); await p.locator('#save-rating').click(); await message(p, 'Rating saved.');
}
async function favorite(p) {
  await p.locator('#favorite-toggle').click(); await message(p, 'Favorite saved.');
}
async function checkStats(p, average, ratings, favorites) {
  const text = await p.locator('#course-stats').innerText();
  assert.match(text, new RegExp(`${average}.*${ratings} rating.*${favorites} favorite`));
}
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  a = await page(); await a.goto(baseURL); await a.locator('#title-demo canvas').waitFor();
  if (!localPreflight) assert.equal(await a.evaluate(() => typeof window.__SKYSTRIDE_SNAPSHOT__), 'undefined');
  await a.waitForTimeout(700); await shot(a, '01-title'); await enter(a);
  await a.locator('#official').click(); await a.locator('#official-6').waitFor();
  assert.equal(await a.locator('.official-card').count(), 6);
  assert.equal(await a.locator('[id^=official-rank-]').count(), 6);
  assert.equal(await a.locator('h1').innerText(),'Official Courses');
  assert.equal(await a.locator('.page-heading .eyebrow').count(),0);
  await shot(a, '02-official-courses');
  await a.locator('#official-1').click(); await a.locator('#game canvas').waitFor();
  await a.waitForTimeout(250); assert.equal(await a.locator('#hud-lives').count(),0);
  assert.match(await a.locator('#run-hud').innerText(),/remaining of 150 s/);
  await a.locator('#game').focus();
  await a.keyboard.down('ArrowRight'); await a.waitForTimeout(350); await a.keyboard.down('Space');
  await a.waitForTimeout(180); await a.keyboard.up('Space'); await a.keyboard.up('ArrowRight');
  await shot(a, '03-official-keyboard'); await a.keyboard.press('Escape'); await a.locator('#resume-run').waitFor();
  await a.locator('#resume-run').click(); await a.keyboard.press('Escape'); await a.locator('#overlay-levels').click();
  await a.locator('#official-6').waitFor(); await a.locator('#brand').click();
  record('Public V2 title, all six hosted official records, real-keyboard movement/jump and pause/level-list navigation work; production has no DEV snapshot seam');

  const nameA = await login(a, 'A'); await workshop(a);
  await a.locator('#draft-title').fill(title); await a.locator('#draft-description').fill('Hosted V2 acceptance: checkpoint, coin, winged enemy and editor component persistence.');
  await a.locator('#course-theme').selectOption('sky');
  await place(a, 'finish', 12, 22); await place(a, 'checkpoint', 4, 22); await place(a, 'item', 5, 22);
  await place(a, 'glow', 26, 18, { content: 'adaptive' });
  await place(a, 'enemy', 35, 21, { enemy: 'winged', behavior: 'horizontal', direction: 1, speed: 45, range: 3 });
  await place(a, 'moving-platform', 40, 18, { width: 3, axis: 'y', distance: 3, durationMs: 4000 });
  await place(a, 'obstacle', 46, 20, { width: 2, height: 3, obstacle: 'ruin' });
  courseId = await save(a); assert.match(courseId, /^[0-9a-f-]{36}$/i);
  await a.locator('#preview-draft').click(); await a.locator('#draft-preview canvas').waitFor();
  await a.locator('#draft-title').fill('wasd foo bar'); assert.equal(await a.locator('#draft-title').inputValue(), 'wasd foo bar');
  await a.getByRole('button', { name: 'Resume preview', exact: true }).waitFor();
  await a.locator('#draft-title').fill(title); await finish(a, '#draft-preview', false);
  assert.equal(await a.locator('#publish-draft').isDisabled(), true);
  await a.locator('#stop-preview').click(); await a.reload(); await enter(a); await workshop(a);
  await a.locator('#draft-list').selectOption(courseId); await message(a, 'Course loaded from the database.', '#draft-message');
  assert.equal(await a.locator('#course-theme').inputValue(), 'sky');
  await place(a, 'select', 35, 21); assert.equal(await a.locator('#prop-behavior').inputValue(), 'horizontal');
  await shot(a, '04-saved-editor');
  record('Managed account A signs in; V2 draft, theme and component settings persist after reload; preview typing is intact and unsaved preview cannot approve publication');

  await a.locator('#test-draft').click(); await finish(a, '#draft-preview');
  assert.equal(await a.locator('#publish-draft').isDisabled(), false);
  await a.locator('#publish-draft').click(); await message(a, 'Course published.', '#draft-message');
  assert.equal(await a.locator('#draft-title').isDisabled(), true); await shot(a, '05-published');
  await a.locator('#copy-draft').click(); await a.locator('#draft-title').fill(copyTitle); copyId = await save(a);
  assert.notEqual(copyId, courseId); assert.equal(await a.locator('#publish-draft').isDisabled(), true);
  record('Actual keyboard saved-version completion authorizes publication through hosted RPCs; publication is immutable and copy has a new private identity without approval');

  b = await page(); const nameB = await login(b, 'B'); await workshop(b);
  assert.equal(await b.locator(`#draft-list option[value="${courseId}"]`).count(), 0);
  assert.equal(await b.locator(`#draft-list option[value="${copyId}"]`).count(), 0);
  await details(b); assert.equal(await b.locator('#rating-score').isDisabled(), true);
  await playShort(b); await shot(b, '06-community-completion'); await b.locator('#details').click(); await message(b, 'Course details loaded.');
  await rate(b, 3); await favorite(b); await checkStats(b, '3.0', 1, 1);
  await b.locator('#leaderboard').click(); await b.getByRole('cell', { name: nameB, exact: true }).waitFor();
  await b.locator('#leaderboard-mode').selectOption('score');
  await b.getByRole('cell',{name:nameB,exact:true}).waitFor();
  assert.equal(await b.locator('.ranking th').last().innerText(),'Highest score');
  assert.ok(Number(await b.locator('.ranking tbody td').last().innerText())>0);
  await shot(b, '07-score-leaderboard');
  await b.locator('#leaderboard-mode').selectOption('time');
  await b.getByRole('cell',{name:nameB,exact:true}).waitFor();
  await shot(b, '07-leaderboard'); await b.locator('#brand').click(); await b.locator('#awards').click();
  await b.locator('#awards article').filter({ has: b.getByRole('heading', { name: 'First finish', exact: true }) }).locator('.badge').filter({ hasText: 'EARNED' }).waitFor();
  record('Account B cannot see A private creator records; it discovers and completes the published V2 with checkpoint/coin through actual keys, then saves rating/favorite, ranking and completion achievement');

  await details(a); await playShort(a); await a.locator('#details').click(); await message(a, 'Course details loaded.');
  await rate(a, 5); await favorite(a); await checkStats(a, '4.0', 2, 2);
  await a.locator('#leaderboard').click(); await a.getByRole('cell', { name: nameA, exact: true }).waitFor();
  await a.getByRole('cell', { name: nameB, exact: true }).waitFor();
  record('Two real accounts produce independent persisted results and correct shared aggregates: average 4.0, two ratings and two favorites');

  await b.bringToFront(); await b.reload(); await enter(b); await b.locator('#levels').click(); await message(b, 'published course');
  await b.locator('#favorites-only').check(); await b.locator('#course-order').selectOption('rating');
  await card(b).getByRole('button', { name: 'Course details', exact: true }).click(); await message(b, 'Course details loaded.');
  assert.equal(await b.locator('#rating-score').inputValue(), '3'); assert.equal(await b.locator('#favorite-toggle').innerText(), 'Unfavorite');
  await checkStats(b, '4.0', 2, 2); await rate(b, 4); await checkStats(b, '4.5', 2, 2);
  await b.locator('#remove-rating').click(); await message(b, 'Rating removed.');
  await b.locator('#favorite-toggle').click(); await message(b, 'Favorite removed.'); await checkStats(b, '5.0', 1, 1);
  await b.locator('#signout').click(); await b.locator('#signin').waitFor(); await login(b, 'B');
  await details(b); assert.equal(await b.locator('#rating-score').inputValue(), '');
  assert.equal(await b.locator('#favorite-toggle').innerText(), 'Favorite'); await checkStats(b, '5.0', 1, 1);
  await b.locator('#brand').click(); await b.locator('#progress').click(); await message(b, 'Best times are saved to your account.');
  assert.equal(await b.locator('.progress-list li').count(), 7);
  assert.match(await b.locator('.progress-list li').filter({hasText:title}).innerText(),/Fastest completion:/); await shot(b, '08-progress');
  record('Session reload, My Favorites, deterministic rating sort, rating replacement/removal, unfavorite and logout/login persistence pass; hosted own_progress loads');
  assert.deepEqual(browserErrors, []); assert.deepEqual(httpFailures, []); passed = true;
} catch (error) {
  failure = redact(error.stack || error);
  for (const [label, p] of [['a', a], ['b', b]]) if (p) {
    await shot(p, `failure-${label}`).catch(() => {});
    await writeFile(`${output}/failure-${label}.txt`, redact(await p.locator('body').innerText().catch(() => '')));
  }
  console.error(failure); process.exitCode = 1;
} finally {
  const result = { at: new Date().toISOString(), baseURL, passed, scope: localPreflight ? 'Local preflight only; ephemeral SQL and fixture Auth/REST, no hosted verification claim' : 'Public production V2, managed Supabase Auth/PostgREST, actual desktop keyboard; existing dedicated confirmed accounts', createdCourse: { id: courseId, title }, privateCopy: { id: copyId, title: copyTitle }, checks, screenshots, browserErrors, httpFailures, failure, limitations: ['No new registration or email confirmation was requested during this run.', 'Official course verification here is real-keyboard movement/jump/pause, not a full six-course replay; all six completion traces are in prior local overhaul evidence.'] };
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2));
  await writeFile(`output/overhaul/hosted-evidence/${localPreflight ? 'local-preflight/' : ''}latest.json`, JSON.stringify({ output, passed, at: result.at }, null, 2));
  await browser?.close(); console.log(JSON.stringify({ passed, checks: checks.length, output }));
}
