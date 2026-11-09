// Native desktop fullscreen, actual clicks/keys and the real Phaser renderer.
// Isolated Vite; no accounts, database, or hosted requests.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = 'output/fullscreen';
await mkdir(output, { recursive: true });
const server = await createServer({ configFile: false, envFile: false, logLevel: 'error',
  define: { 'import.meta.env.VITE_SUPABASE_URL': '""', 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': '""' },
  server: { host: '127.0.0.1', port: 0, hmr: false } });
await server.listen();
let browser, page, passed = false;
const checks = [], errors = [];
const record = name => { checks.push(name); console.log('PASS', name); };
const fullscreen = () => page.waitForFunction(() => document.fullscreenElement?.id === 'play-stage');
const windowed = () => page.waitForFunction(() => !document.fullscreenElement);
const ready = () => page.waitForFunction(() => window.__SKYSTRIDE_SNAPSHOT__?.()?.ready);
async function geometry() {
  return page.evaluate(() => {
    const box = document.querySelector('#game canvas').getBoundingClientRect();
    const stage = document.querySelector('#play-stage').getBoundingClientRect();
    return { width: innerWidth, height: innerHeight, canvas: { x: box.x, y: box.y, width: box.width, height: box.height },
      stage: { x: stage.x, y: stage.y, width: stage.width, height: stage.height },
      allGame: [[5,5],[innerWidth-5,5],[5,innerHeight-5],[innerWidth-5,innerHeight-5],[innerWidth/2,innerHeight/2]]
        .every(([x,y]) => document.querySelector('#play-stage').contains(document.elementFromPoint(x,y))) };
  });
}
try {
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
  await page.locator('#enter-menu').click(); await page.locator('#official').click();
  await page.locator('#official-1').click(); await ready();
  assert.equal(await page.locator('#fullscreen-pause').isVisible(), false);
  await page.locator('#fullscreen').click(); await fullscreen();
  await page.waitForFunction(() => document.activeElement?.id === 'game');
  const full = await geometry();
  assert.equal(full.stage.x, 0); assert.equal(full.stage.y, 0);
  assert.equal(full.stage.width, full.width); assert.equal(full.stage.height, full.height); assert.equal(full.allGame, true);
  assert.ok(full.canvas.width > full.width * .85 && full.canvas.height > full.height * .85);
  assert.ok(Math.abs(full.canvas.width / full.canvas.height - 16/9) < .01);
  assert.equal(await page.locator('#run-hud').isVisible(), true);
  assert.equal(await page.locator('#exit-fullscreen').isVisible(), true);
  const x = await page.evaluate(() => window.__SKYSTRIDE_SNAPSHOT__().player.x);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(180); await page.keyboard.up('ArrowRight');
  assert.ok(await page.evaluate(() => window.__SKYSTRIDE_SNAPSHOT__().player.x) > x + 10);
  await page.screenshot({ path: output + '/gameplay-fullscreen.png' });
  record('Fullscreen contains only the game, HUD and game controls; canvas fits and keyboard movement works');

  await page.locator('#fullscreen-pause').click(); await page.locator('#resume-run').waitFor();
  assert.equal(await page.evaluate(() => document.fullscreenElement?.id), 'play-stage');
  await page.screenshot({ path: output + '/paused-fullscreen.png' });
  await page.locator('#resume-run').click(); await page.locator('#run-overlay').waitFor({ state: 'hidden' });
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__SKYSTRIDE_SNAPSHOT__().state.status === 'dead', undefined, { timeout: 12000 });
  await page.keyboard.up('ArrowRight'); await page.locator('#respawn').waitFor();
  await page.screenshot({ path: output + '/death-fullscreen.png' });
  assert.equal(await page.evaluate(() => document.fullscreenElement?.id), 'play-stage');
  await page.locator('#respawn').click(); await page.locator('#run-overlay').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => document.fullscreenElement?.id), 'play-stage');
  await page.locator('#fullscreen-pause').click(); await page.locator('#exit-fullscreen').click(); await windowed();
  await page.locator('#resume-run').click();
  assert.equal(await page.locator('#fullscreen').innerText(), 'Fullscreen');
  assert.equal(await page.locator('#fullscreen-pause').isVisible(), false);
  assert.ok((await page.locator('.play-frame').boundingBox()).width < 1440);
  record('Pause, death/retry and explicit exit work; leaving fullscreen restores the page layout');

  await page.locator('#pause').click(); await page.locator('#fullscreen').click(); await fullscreen();
  assert.equal(await page.locator('#resume-run').isVisible(), true);
  await page.waitForFunction(() => document.activeElement?.id === 'resume-run');
  await page.locator('#overlay-levels').click(); await page.locator('#official-1').waitFor(); await windowed();
  await page.locator('#official-1').click(); await ready(); await page.locator('#fullscreen').click(); await fullscreen();
  assert.equal(await page.locator('canvas').count(), 1);
  await page.locator('#exit-fullscreen').click(); await windowed();
  await page.waitForFunction(() => document.activeElement?.id === 'game');
  record('Entering while paused retains the overlay; navigation exits cleanly and repeated runs keep one canvas');
  assert.deepEqual(errors, []); passed = true;
} catch (error) {
  await page?.screenshot({ path: output + '/failure.png' }).catch(() => {});
  throw error;
} finally {
  await writeFile(output + '/results.json', JSON.stringify({ passed, checks, errors }, null, 2));
  await browser?.close(); await server.close();
}
