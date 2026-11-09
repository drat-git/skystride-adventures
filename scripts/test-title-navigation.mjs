// Desktop title/menu regression. Isolated Vite, no database or hosted requests.
// Read-only DEV snapshots observe the actual demonstration; inputs use browser keys/clicks.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = 'output/overhaul/title-retirement-evidence';
await mkdir(output, { recursive: true });
const errors = [], external = [], checks = [];
const server = await createServer({
  configFile: false, envFile: false, logLevel: 'error',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""' },
  server: { host: '127.0.0.1', port: 0, hmr: false },
});
await server.listen();
const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
let browser, page, passed = false;
const record = name => { checks.push(name); console.log('PASS', name); };
async function titleReady() {
  await page.locator('#title-demo canvas').waitFor();
  await page.waitForFunction(() => window.__SKYSTRIDE_SNAPSHOT__?.()?.ready);
  assert.equal(await page.locator('#official').count(), 0);
  assert.equal(await page.locator('.title-foot').count(), 0);
  assert.equal(await page.getByText('SIX WORLDS ABOVE THE ORDINARY', { exact: true }).count(), 0);
  assert.equal((await page.evaluate(() => window.__SKYSTRIDE_SNAPSHOT__())).attempt.totalItems, 0);
}
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    external.push(url.origin + url.pathname); return route.abort();
  });
  await page.goto(origin); await titleReady();
  await page.keyboard.down('Enter'); await page.waitForTimeout(100);
  assert.equal(await page.locator('#official').count(), 0);
  await page.keyboard.up('Enter'); await page.locator('#show-title').waitFor();
  assert.equal(await page.locator('#practice').count(), 0);
  assert.equal(await page.locator('#official-courses').count(), 0);
  record('Initial any-key activation consumes its input and exposes the V2 menu without Classic practice');

  await page.locator('#show-title').click(); await titleReady(); await page.waitForTimeout(200);
  assert.equal(await page.locator('#show-title').count(), 0);
  const samples = [];
  for (let i = 0; i < 100; i++) {
    await page.waitForTimeout(80);
    const sample = await page.evaluate(() => window.__SKYSTRIDE_SNAPSHOT__());
    if (sample?.ready) samples.push({ x: sample.player.x, y: sample.player.y, elapsedMs: sample.attempt.elapsedMs, items: sample.attempt.totalItems });
  }
  assert.ok(Math.max(...samples.map(s => s.x)) - Math.min(...samples.map(s => s.x)) > 300, 'Demo must run across the course');
  assert.ok(Math.max(...samples.map(s => s.y)) - Math.min(...samples.map(s => s.y)) > 40, 'Demo must jump');
  assert.ok(samples.some((sample, i) => i && sample.x < samples[i - 1].x - 200), 'Demo must loop back to its start');
  assert.ok(samples.every(s => s.items === 0), 'Demo must contain no coins');
  await page.screenshot({ path: output + '/looping-title.png', fullPage: true });
  await writeFile(output + '/demo-trace.json', JSON.stringify(samples, null, 2));
  record('Menu Title screen click remains on the actual running/jumping/looping demo; no coins or bottom copy');

  for (let i = 0; i < 4; i++) {
    await page.locator('#enter-menu').click(); await page.locator('#show-title').click();
    await titleReady(); await page.waitForTimeout(150);
    assert.equal(await page.locator('canvas').count(), 1);
    assert.equal(await page.locator('#official').count(), 0);
  }
  record('Repeated pointer transitions retain one canvas and never reuse the menu click to leave the title');

  for (const key of ['Enter', 'Space']) {
    await page.locator('#enter-menu').click(); await page.locator('#show-title').focus();
    await page.keyboard.press(key); await titleReady(); await page.waitForTimeout(100);
    assert.equal(await page.locator('#official').count(), 0);
    await page.keyboard.down('KeyA'); assert.equal(await page.locator('#official').count(), 0);
    await page.keyboard.up('KeyA'); await page.locator('#show-title').waitFor();
    await page.locator('#show-title').click(); await titleReady();
  }
  record('Keyboard activation of Title screen stays on title; a subsequent key opens only the menu');

  await page.locator('#enter-menu').click(); await page.locator('#settings').click();
  await page.getByLabel('Reduce decorative motion').check();
  await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await page.locator('#brand').click(); await page.locator('#show-title').click(); await titleReady();
  const first = await page.evaluate(() => window.__SKYSTRIDE_SNAPSHOT__().player.x);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(() => window.__SKYSTRIDE_SNAPSHOT__().player.x), first);
  assert.equal(await page.locator('#enter-menu').evaluate(e => getComputedStyle(e).animationName), 'none');
  await page.locator('#enter-menu').click(); await page.locator('#settings').click(); await page.locator('#reset-settings').click();
  await page.locator('#brand').click(); await page.locator('#show-title').click(); await titleReady();
  const resetStart = await page.evaluate(() => window.__SKYSTRIDE_SNAPSHOT__().player.x);
  await page.waitForTimeout(400);
  assert.ok(await page.evaluate(() => window.__SKYSTRIDE_SNAPSHOT__().player.x) > resetStart + 20);
  record('Reduced motion still stops the decorative demo and prompt; restoring defaults resumes animation');

  await page.locator('#enter-menu').click(); await page.locator('#levels').click();
  assert.equal(await page.locator('#practice').count(), 0);
  await page.locator('#adventure').click(); await page.locator('#official-6').waitFor();
  assert.equal(await page.locator('.official-card').count(), 6);
  record('Community fallback opens the six V2 official courses with no legacy practice route');
  assert.deepEqual(errors, []); assert.deepEqual(external, []); passed = true;
} catch (error) {
  if (page) await page.screenshot({ path: output + '/failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await writeFile(output + '/results.json', JSON.stringify({ at: new Date().toISOString(), passed, checks, errors, external }, null, 2));
  await browser?.close(); await server.close();
}
