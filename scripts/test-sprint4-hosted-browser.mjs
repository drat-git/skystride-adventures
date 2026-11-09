// Actual keyboard/browser -> real Supabase Auth/PostgREST. No fixtures or intercepted requests.
// Run with node --env-file=.env.local and PLAYWRIGHT_MODULE / CHROME_PATH when external runtimes are needed.
// BASE_URL=local starts Vite on 127.0.0.1:5185 using the real project configuration.
// Normal runs create one published course; FIRST_FLIGHT_ONLY=1 preserves prior evidence and resumes its final check.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';

for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'TEST_EMAIL_A', 'TEST_PASSWORD_A', 'TEST_EMAIL_B', 'TEST_PASSWORD_B']) {
  if (!process.env[name]) throw new Error(`Missing ${name}; load the dedicated test configuration with --env-file=.env.local.`);
}
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const local = process.env.BASE_URL === 'local';
const baseURL = local ? 'http://127.0.0.1:5185' : process.env.BASE_URL || 'https://drat-git.github.io/skystride-adventures/';
const output = `output/sprint4/hosted-evidence/${local ? 'local' : 'public'}`;
const firstFlightOnly = process.env.FIRST_FLIGHT_ONLY === '1';
await mkdir(output, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
let title = `Cloudline Crossing ${stamp} ${randomUUID().slice(0, 4)}`;
const checks = [], screenshots = [], pageErrors = [], httpFailures = [];
const accounts = { A: { email: process.env.TEST_EMAIL_A, password: process.env.TEST_PASSWORD_A }, B: { email: process.env.TEST_EMAIL_B, password: process.env.TEST_PASSWORD_B } };
const secrets = [...Object.values(accounts).flatMap(account => [account.email, account.password]), process.env.VITE_SUPABASE_PUBLISHABLE_KEY].filter(Boolean);
const sanitize = value => secrets.reduce((text, secret) => text.split(secret).join('[redacted]'), String(value));
let browser, server, pageA, pageB, courseId = process.env.RESUME_COURSE_ID, passed = false, failure, previous, previousArchive, firstFlightResult;
if (process.env.RESUME_COURSE_ID || firstFlightOnly) {
  try {
    const saved = await readFile(`${output}/results.json`, 'utf8');
    previousArchive = `${output}/previous-attempt-${stamp}.json`;
    await writeFile(previousArchive, saved);
    if (firstFlightOnly) {
      previous = JSON.parse(saved);
      assert.equal(previous.baseURL, baseURL, 'Continuation must use the same hosted URL as its original journey.');
      assert.ok(previous.createdCourse?.id && previous.checks?.length >= 7, 'Complete the course/community journey before FIRST_FLIGHT_ONLY.');
      courseId = previous.createdCourse.id; title = previous.createdCourse.title;
      checks.push(...previous.checks); screenshots.push(...previous.screenshots);
      pageErrors.push(...previous.pageErrors); httpFailures.push(...previous.httpFailures);
    }
  } catch (error) { if (firstFlightOnly || error.code !== 'ENOENT') throw error; }
}
const record = name => { checks.push({ name, verifiedAt: new Date().toISOString() }); console.log('PASS', name); };
const waitMessage = (page, text, selector = '#message') => page.locator(selector).filter({ hasText: text }).waitFor({ timeout: 30000 });
const course = (page, name = title) => page.locator('article.course').filter({ has: page.getByRole('heading', { name, exact: true }) });

async function shot(page, name) {
  const path = `${output}/${name}.png`;
  await page.screenshot({ path, fullPage: true, mask: [page.locator('.account > span'), page.locator('input[name="email"]'), page.locator('input[name="password"]')] });
  screenshots.push(path);
}
async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => pageErrors.push(sanitize(error.message)));
  page.on('response', response => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      // Only endpoint paths/statuses are retained; tokens, request bodies and query strings are never recorded.
      httpFailures.push({ status: response.status(), path: url.pathname });
    }
  });
  return page;
}
async function login(page, label) {
  await page.bringToFront();
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.locator('#signin').click();
  await page.getByLabel('Email', { exact: true }).fill(accounts[label].email);
  await page.getByLabel('Password', { exact: true }).fill(accounts[label].password);
  await page.locator('#authform button[type="submit"]').click();
  await waitMessage(page, 'Profile loaded.');
  const displayName = await page.locator('#profileform input[name="name"]').inputValue();
  await page.locator('#brand').click();
  return displayName;
}
async function browse(page) {
  await page.locator('#brand').click();
  await page.getByRole('button', { name: 'Browse courses', exact: true }).click();
  await waitMessage(page, 'published course');
}
async function details(page) {
  await browse(page);
  await course(page).getByRole('button', { name: 'Course details', exact: true }).click();
  await waitMessage(page, 'Course details loaded.');
}
async function openEditor(page) {
  await page.locator('#brand').click();
  await page.getByRole('button', { name: 'Create a level', exact: true }).click();
  await waitMessage(page, 'Choose a private draft or a published course', '#draft-message');
}
async function paint(page, tool, x, y) {
  await page.locator('#tile-tool').selectOption(tool);
  await page.locator(`.tile[aria-label^="Column ${x + 1}, row ${y + 1}:"]`).click();
}
async function finishShort(page, host = '#game') {
  await page.bringToFront();
  await page.locator(`${host} canvas`).waitFor();
  // Wait for Phaser's scene setup, then use genuine browser keyboard input only.
  await page.waitForTimeout(250);
  const pause = page.locator(host === '#game' ? '#pause' : '#pause-preview');
  if ((await pause.innerText()).startsWith('Resume')) await pause.click();
  await page.locator(host).focus();
  await page.keyboard.down('ArrowRight');
  try { await waitMessage(page, host === '#game' ? 'Result saved!' : 'Saved playtest passed', host === '#game' ? '#message' : '#draft-message'); }
  finally { await page.keyboard.up('ArrowRight'); }
}
async function playShort(page) {
  await page.getByRole('button', { name: 'Play course', exact: true }).click();
  await finishShort(page);
  await waitMessage(page, 'Result saved!');
  assert.match(await page.locator('#message').innerText(), /1 \/ 1 items/);
}
async function rate(page, score) {
  await page.locator('#rating-score').selectOption(String(score));
  await page.getByRole('button', { name: 'Save rating', exact: true }).click();
  await waitMessage(page, 'Rating saved.');
}
async function stats(page, expected) {
  await page.locator('#course-stats').filter({ hasText: expected }).waitFor();
  assert.equal(await page.locator('#course-stats').innerText(), expected);
}
async function refreshDetails(page) {
  await page.getByRole('button', { name: 'Refresh details', exact: true }).click();
  await waitMessage(page, 'Course details loaded.');
}
async function earned(page, name) {
  const award = page.locator('#awards article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await award.locator('.badge').filter({ hasText: 'EARNED' }).waitFor();
}
async function firstFlight(page) {
  await page.bringToFront();
  await browse(page);
  await course(page, 'First Flight').getByRole('button', { name: 'Play course', exact: true }).click();
  await page.locator('#game canvas').waitFor(); await page.waitForTimeout(250);
  if ((await page.locator('#pause').innerText()).startsWith('Resume')) await page.locator('#pause').click();
  await page.locator('#game').focus();
  // Observe the yellow player in screenshots. Never read or mutate Phaser state, physics, or completion callbacks.
  const position = async () => {
    const encoded = (await page.locator('#game canvas').screenshot()).toString('base64');
    return page.evaluate(async image => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${image}`)).blob());
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      let left = Infinity, right = -1, top = Infinity, bottom = -1;
      for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) {
        const i = (y * bitmap.width + x) * 4;
        if (pixels[i] >= 241 && pixels[i] <= 245 && pixels[i + 1] >= 193 && pixels[i + 1] <= 197 && pixels[i + 2] >= 90 && pixels[i + 2] <= 94) {
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
      if (right < 0) throw Error('The yellow player was not visible in the course screenshot.');
      return { x: (left + right + 1) / 2 * 768 / bitmap.width, y: (top + bottom + 1) / 2 * 448 / bitmap.height };
    }, encoded);
  };
  const pause = page.locator('#pause');
  let heldDirection;
  const togglePause = async label => {
    if (await pause.isDisabled() || (await pause.innerText()) !== label) return;
    try { await pause.click({ timeout: 1500 }); }
    catch (error) { if (await pause.isEnabled()) throw error; }
  };
  const freeze = async () => {
    if (heldDirection) { await page.keyboard.up(heldDirection); heldDirection = undefined; }
    await page.keyboard.up('Space');
    await togglePause('Pause');
  };
  const resume = async () => {
    await togglePause('Resume');
    await page.locator('#game').focus();
  };
  const burst = async (milliseconds, jump = false, direction = 'ArrowRight') => {
    await resume();
    heldDirection = direction; await page.keyboard.down(direction);
    if (jump) await page.keyboard.down('Space');
    try { await page.waitForTimeout(milliseconds); } finally { await freeze(); }
  };
  await freeze();
  const approach = async target => {
    for (let n = 0; n < 24; n++) {
      const point = await position();
      if (Math.abs(point.x - target) <= 3) return;
      assert.ok(point.x < target + 20, `Keyboard movement overshot approach ${target}; observed ${point.x.toFixed(1)}.`);
      const distance = Math.abs(target - point.x);
      await burst(Math.max(16, Math.min(200, (distance - 3) / 210 * 1000)), false, point.x < target ? 'ArrowRight' : 'ArrowLeft');
    }
    throw Error(`Keyboard movement did not reach approach position ${target}.`);
  };
  const jumpAcross = async (start, clear) => {
    await approach(start);
    // Use the visible pause control while observing. Pauses freeze observation delays and release every held key.
    for (let n = 0; n < 10; n++) {
      if ((await position()).y >= 368) break;
      await resume(); await page.waitForTimeout(150); await freeze();
    }
    assert.ok((await position()).y >= 368, 'Player did not settle on its supporting platform before jumping.');
    await burst(120, true);
    for (let n = 0; n < 24; n++) {
      const point = await position();
      if (point.x >= clear) return;
      assert.ok(point.x >= start - 10, 'First Flight player respawned; the keyboard jump did not clear its hazard.');
      await burst(80);
    }
    throw Error('First Flight keyboard jump did not reach the far side of its hazard.');
  };
  await jumpAcross(203, 280); await jumpAcross(415, 545); await jumpAcross(587, 680);
  await resume();
  await page.keyboard.down('ArrowRight');
  try { await waitMessage(page, 'Result saved!'); } finally { await page.keyboard.up('ArrowRight'); }
  await shot(page, 'first-flight-keyboard-completion');
  firstFlightResult = await page.locator('#message').innerText();
  record('First Flight completed through actual keyboard movement and three jumps, with Pause/Resume between screenshot observations; real result saved');
}

try {
  if (local) { server = await createServer({ server: { host: '127.0.0.1', port: 5185, strictPort: true } }); await server.listen(); }
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  pageA = await newPage();
  const nameA = await login(pageA, 'A');
  record(firstFlightOnly ? 'Account A signs in again to continue the final public First Flight check' : 'Account A signs in through real Supabase Auth and loads its profile');

  if (firstFlightOnly) {
    await firstFlight(pageA);
    await pageA.locator('#brand').click(); await pageA.getByRole('button', { name: 'Achievements', exact: true }).click();
    await waitMessage(pageA, 'achievements earned.');
    for (const name of ['First finish', 'Course creator', 'First Flight under 30 seconds']) await earned(pageA, name);
    await shot(pageA, 'a-all-achievements');
    record('Account A has all three achievements after real creation and keyboard completions');
    assert.deepEqual(pageErrors, [], 'Browser runtime errors occurred.');
    passed = true;
  } else {
  pageB = await newPage();

  await openEditor(pageA);
  if (courseId) {
    await pageA.locator('#draft-list').selectOption(courseId); await waitMessage(pageA, 'Course loaded from the database.', '#draft-message');
    title = await pageA.getByLabel('Title', { exact: true }).inputValue();
    record('Resumed the same dedicated acceptance draft from the previous interrupted browser journey');
  } else {
    await pageA.getByLabel('Title', { exact: true }).fill(title);
    await pageA.getByLabel('Description', { exact: true }).fill('A sunny first crossing: touch the blue checkpoint, collect a sky token, and coast to the golden flag.');
    await paint(pageA, 'checkpoint', 3, 11);
    await paint(pageA, 'item', 4, 11);
    await paint(pageA, 'finish', 7, 11);
    assert.equal(await pageA.getByRole('button', { name: 'Publish course', exact: true }).isDisabled(), true);
    await pageA.getByRole('button', { name: 'Save draft', exact: true }).click();
    await waitMessage(pageA, 'Draft saved. Revision', '#draft-message');
    courseId = await pageA.locator('#draft-list').inputValue();
  }
  assert.match(courseId, /^[0-9a-f-]{36}$/);
  await shot(pageA, 'a-saved-draft');
  await pageA.reload({ waitUntil: 'networkidle' });
  await pageA.locator('#signout').waitFor();
  await openEditor(pageA);
  await pageA.locator('#draft-list').selectOption(courseId);
  await waitMessage(pageA, 'Course loaded from the database.', '#draft-message');
  assert.equal(await pageA.getByLabel('Title', { exact: true }).inputValue(), title);
  await pageA.getByRole('button', { name: 'Column 4, row 12: checkpoint', exact: true }).waitFor();
  await pageA.getByRole('button', { name: 'Column 5, row 12: item', exact: true }).waitFor();
  record('Account A creates checkpoint/item course; saved metadata and geometry survive browser reload');

  await pageA.getByRole('button', { name: 'Test saved version', exact: true }).click();
  await finishShort(pageA, '#draft-preview');
  await waitMessage(pageA, 'Saved playtest passed', '#draft-message');
  assert.match(await pageA.locator('#draft-message').innerText(), /1\/1 items collected/);
  assert.equal(await pageA.getByRole('button', { name: 'Publish course', exact: true }).isEnabled(), true);
  await shot(pageA, 'a-saved-playtest-passed');
  await pageA.getByRole('button', { name: 'Publish course', exact: true }).click();
  await waitMessage(pageA, 'Course published.', '#draft-message');
  assert.equal(await pageA.getByLabel('Title', { exact: true }).isDisabled(), true);
  assert.equal(await pageA.getByRole('button', { name: 'Copy to new draft', exact: true }).isEnabled(), true);
  await shot(pageA, 'a-published-course');
  record('Actual saved-revision keyboard playtest confirms approval; publication succeeds and course becomes read-only');

  const nameB = await login(pageB, 'B');
  await details(pageB);
  assert.equal(await pageB.locator('#rating-score').isDisabled(), true);
  await playShort(pageB);
  await shot(pageB, 'b-account-completion');
  await pageB.getByRole('button', { name: 'Course details', exact: true }).click();
  await waitMessage(pageB, 'Course details loaded.');
  await rate(pageB, 5);
  await pageB.getByRole('button', { name: 'Favorite', exact: true }).click();
  await waitMessage(pageB, 'Favorite saved.');
  await stats(pageB, '5.0 / 5 · 1 rating · 1 favorite');
  await shot(pageB, 'b-rating-favorite');
  record('Account B discovers newly published course, completes with real keyboard, saves rating and favorite');

  await pageB.getByRole('button', { name: 'Leaderboard', exact: true }).click();
  await waitMessage(pageB, 'Saved results loaded.');
  await pageB.getByRole('cell', { name: nameB, exact: true }).waitFor();
  await shot(pageB, 'b-leaderboard');
  await pageB.locator('#brand').click();
  await pageB.getByRole('button', { name: 'Achievements', exact: true }).click();
  await waitMessage(pageB, 'achievements earned.'); await earned(pageB, 'First finish');
  await shot(pageB, 'b-achievements');
  record('Saved completion appears on leaderboard and earns First finish achievement');

  await details(pageA); await playShort(pageA);
  await pageA.getByRole('button', { name: 'Course details', exact: true }).click(); await waitMessage(pageA, 'Course details loaded.');
  await rate(pageA, 3);
  await pageA.getByRole('button', { name: 'Favorite', exact: true }).click(); await waitMessage(pageA, 'Favorite saved.');
  await stats(pageA, '4.0 / 5 · 2 ratings · 2 favorites');
  await details(pageB); await stats(pageB, '4.0 / 5 · 2 ratings · 2 favorites');
  assert.equal(await pageB.locator('#rating-score').inputValue(), '5');
  await pageB.getByRole('button', { name: 'Unfavorite', exact: true }).waitFor();
  await shot(pageB, 'two-account-aggregates');
  await rate(pageA, 4); await stats(pageA, '4.5 / 5 · 2 ratings · 2 favorites');
  await pageA.getByRole('button', { name: 'Remove rating', exact: true }).click(); await waitMessage(pageA, 'Rating removed.');
  await pageA.getByRole('button', { name: 'Unfavorite', exact: true }).click(); await waitMessage(pageA, 'Favorite removed.');
  await stats(pageA, '5.0 / 5 · 1 rating · 1 favorite');
  await refreshDetails(pageB); await stats(pageB, '5.0 / 5 · 1 rating · 1 favorite');
  assert.equal(await pageB.locator('#rating-score').inputValue(), '5');
  record('Two accounts see correct shared totals; rating replacement/removal and unfavorite preserve the other account choices');

  await pageB.reload({ waitUntil: 'networkidle' }); await pageB.locator('#signout').waitFor();
  await details(pageB); assert.equal(await pageB.locator('#rating-score').inputValue(), '5');
  await pageB.getByRole('button', { name: 'Unfavorite', exact: true }).waitFor();
  await pageB.locator('#signout').click(); await pageB.locator('#signin').waitFor();
  await login(pageB, 'B'); await browse(pageB);
  await pageB.getByLabel('My Favorites', { exact: true }).check();
  for (const order of ['rating', 'favorites', 'title']) {
    await pageB.locator('#course-order').selectOption(order);
    await course(pageB).waitFor();
  }
  await shot(pageB, 'b-persisted-favorites');
  await course(pageB).getByRole('button', { name: 'Course details', exact: true }).click(); await waitMessage(pageB, 'Course details loaded.');
  assert.equal(await pageB.locator('#rating-score').inputValue(), '5');
  await pageB.getByRole('button', { name: 'Unfavorite', exact: true }).waitFor();
  await stats(pageB, '5.0 / 5 · 1 rating · 1 favorite');
  record('Account B reloads and signs in again; personal rating/favorite persist and discovery filters/orders remain usable');

  await firstFlight(pageA);
  await pageA.locator('#brand').click(); await pageA.getByRole('button', { name: 'Achievements', exact: true }).click();
  await waitMessage(pageA, 'achievements earned.');
  for (const name of ['First finish', 'Course creator', 'First Flight under 30 seconds']) await earned(pageA, name);
  await shot(pageA, 'a-all-achievements');
  record('Account A has all three achievements after real creation and keyboard completions');
  await details(pageA); await pageA.getByRole('button', { name: 'Leaderboard', exact: true }).click(); await waitMessage(pageA, 'Saved results loaded.');
  await pageA.getByRole('cell', { name: nameA, exact: true }).first().waitFor();
  await pageA.getByRole('cell', { name: nameB, exact: true }).first().waitFor();
  assert.ok(await pageA.locator('#ranking tbody tr').count() >= 2);
  await shot(pageA, 'two-account-leaderboard');
  assert.deepEqual(pageErrors, [], 'Browser runtime errors occurred.');
  passed = true;
  }
} catch (error) {
  failure = sanitize(error?.stack || error);
  for (const [page, label] of [[pageA, 'a'], [pageB, 'b']]) {
    if (page && !page.isClosed()) await shot(page, `${label}-failure${firstFlightOnly ? `-${stamp}` : ''}`).catch(() => {});
  }
  console.error(failure);
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({
    verifiedAt: new Date().toISOString(), passed, baseURL, environment: 'Real browser, Supabase Auth and PostgREST; no fixture routing',
    registrationConfirmation: previous?.registrationConfirmation ?? 'Not tested by this script. Existing dedicated-account login is verified separately from email-confirmation evidence.',
    createdCourse: previous?.createdCourse ?? (courseId ? { id: courseId, title, resumed: !!process.env.RESUME_COURSE_ID } : null),
    checks, screenshots, pageErrors, httpFailures, ...(firstFlightResult ? { firstFlightResult } : {}),
    ...(firstFlightOnly ? { continuations: [...(previous.continuations ?? []), { verifiedAt: new Date().toISOString(), scope: 'First Flight and all three achievements only; original course/community checks preserved', previousEvidence: previousArchive, passed }] } : {}),
    ...(failure ? { failure } : {}),
  }, null, 2));
  await browser?.close(); await server?.close();
}
