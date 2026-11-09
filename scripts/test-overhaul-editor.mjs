// Isolated editor DOM/controller checks. In-memory backend only; never contacts Supabase.
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const port = Number(process.env.EDITOR_TEST_PORT || 5191), output = 'output/overhaul/editor-local';
await mkdir(output, { recursive: true });
let browser, server, passed = false;
const checks = [], errors = [], resources = {};
const check = message => { checks.push(message); console.log('PASS', message); };
const fixture = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}#app{max-width:1450px;margin:auto;padding:24px}</style></head><body><div id="app"></div><script type="module">
import '/src/styles.css';
import { mountEditor } from '/src/editor.ts';
import { validateLayout } from '/src/level.ts';
import { newEditorLayout } from '/src/editor-tools.ts';
const records = new Map(), calls = [], playtests = new Map();
let lost = true;
const published = {id:'44444444-4444-4444-8444-444444444444',title:'Published V2 course',description:'Immutable editor fixture',difficulty:'easy',layout:newEditorLayout(),revision:1,published:true,canPublish:false};records.set(published.id,published);
const api = {
  async ownedLevels(){return [...records.values()].map(v=>structuredClone(v));},
  async getOwnedLevel(_user,id){const row=records.get(id);if(!row)throw Error('Not found');return structuredClone(row);},
  async startDraftPlaytest(id,revision){const row=records.get(id);if(row.revision!==revision||row.published)throw Error('Stale test');const test=crypto.randomUUID();playtests.set(test,{id,revision});return{id:test,level:structuredClone(row)};},
  async completeDraftPlaytest(test){const check=playtests.get(test),row=records.get(check.id);if(row.revision!==check.revision)throw Error('Stale completion');row.canPublish=true;},
  async publishLevel(id,revision){const row=records.get(id);if(row.revision!==revision||!row.canPublish)throw Error('Test first');row.published=true;return structuredClone(row);},
  async saveDraft(_user,draft,id,expected){
    validateLayout(draft.layout);calls.push({id,expected,draft:structuredClone(draft)});
    const old=records.get(id);
    if(old&&expected!==old.revision)throw Error('Draft revision changed. Reload or copy your edits.');
    const row={...structuredClone(draft),id,revision:old?old.revision+1:1,published:false,canPublish:false};records.set(id,row);
    if(lost){lost=false;records.delete(id);throw Error('Isolated save failure');}
    return structuredClone(row);
  }
};
const controller=mountEditor(document.querySelector('#app'),api,'editor-fixture');
window.editorTest={records,calls,controller,externalEdit(id){const row=records.get(id);row.revision++;row.description='Changed elsewhere';}};
</script></body></html>`;
try {
  server = await createServer({ plugins: [{ name: 'editor-fixture', configureServer(s) { s.middlewares.use((req, res, next) => { if (req.url === '/editor-fixture') { res.setHeader('Content-Type', 'text/html'); res.end(fixture); } else next(); }); } }], server: { host: '127.0.0.1', port, strictPort: true } });
  await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => {
    const nativeAdd = EventTarget.prototype.addEventListener, nativeRemove = EventTarget.prototype.removeEventListener;
    const listeners = new Map();
    // Scope lifecycle/input handlers. Playwright lazily injects its own global
    // pointer hooks during canvas interaction; those are not app resources.
    const watched = new Set(['focus', 'blur', 'focusin', 'visibilitychange', 'webkitvisibilitychange', 'resize', 'orientationchange', 'keydown', 'keyup', 'beforeunload']);
    const keyFor = (target, type) => !watched.has(type) ? undefined : target === window ? `window:${type}` : target === document ? `document:${type}` : undefined;
    EventTarget.prototype.addEventListener = function (type, callback, options) {
      const key = keyFor(this, type), capture = typeof options === 'boolean' ? options : !!options?.capture;
      if (key && callback) {
        const entries = listeners.get(key) || []; listeners.set(key, entries);
        if (!entries.some(entry => entry.callback === callback && entry.capture === capture)) entries.push({ callback, capture });
      }
      return nativeAdd.call(this, type, callback, options);
    };
    EventTarget.prototype.removeEventListener = function (type, callback, options) {
      const key = keyFor(this, type), capture = typeof options === 'boolean' ? options : !!options?.capture;
      if (key) listeners.set(key, (listeners.get(key) || []).filter(entry => entry.callback !== callback || entry.capture !== capture));
      return nativeRemove.call(this, type, callback, options);
    };
    const NativeResizeObserver = window.ResizeObserver, observers = new Map();
    window.ResizeObserver = class extends NativeResizeObserver {
      constructor(callback) { super(callback); observers.set(this, new Set()); }
      observe(target, options) { observers.get(this).add(target); return super.observe(target, options); }
      unobserve(target) { observers.get(this).delete(target); return super.unobserve(target); }
      disconnect() { observers.get(this).clear(); return super.disconnect(); }
    };
    window.editorResources = () => ({
      listeners: Object.fromEntries([...listeners].filter(([, entries]) => entries.length).map(([key, entries]) => [key, entries.length]).sort()),
      observedTargets: [...observers.values()].reduce((count, targets) => count + targets.size, 0),
    });
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${port}/editor-fixture`);
  const message = text => page.locator('#draft-message').filter({ hasText: text }).waitFor();
  await message('Choose a private draft');
  const mountedResources = await page.evaluate(() => window.editorResources());
  resources.mounted = mountedResources;
  assert.equal(mountedResources.observedTargets, 1);
  const go = async (x, y) => {
    await page.locator('#cursor-x').fill(String(x + 1)); await page.locator('#cursor-y').fill(String(y + 1));
    await page.locator('#go-to-cell').click();
  };
  const paint = async (tool, x, y) => { await page.locator('#tile-tool').selectOption(tool); await go(x, y); await page.locator('#editor-viewport').press('Enter'); };
  const set = async (id, value) => { await page.locator(id).fill(String(value)); };
  assert.equal(await page.locator('#tile-tool option').count(), 18);
  assert.ok(await page.locator('.editor-cell').count() < 1000);
  await page.locator('#course-cols').fill('512'); await page.locator('#course-cols').press('Tab');
  await page.locator('#editor-viewport').focus(); await page.locator('#editor-viewport').press('End');
  assert.equal(await page.locator('#cursor-x').inputValue(), '512');
  assert.ok(await page.locator('.editor-cell').count() < 1000);
  assert.ok(await page.locator('#editor-viewport').evaluate(el => el.scrollLeft) > 0);
  await page.waitForFunction(() => {
    const grid = document.querySelector('#editor-viewport'), active = document.getElementById(grid.getAttribute('aria-activedescendant'));
    return active?.getAttribute('aria-colindex') === '512';
  });
  assert.equal(await page.locator('#editor-canvas > [role=row] > [role=gridcell]').count(), await page.locator('.editor-cell').count());
  assert.equal(await page.locator('#editor-canvas').getAttribute('role'), 'rowgroup');
  assert.equal(await page.locator('.editor-cell:not([tabindex="-1"])').count(), 0);
  assert.equal(await page.locator('#editor-viewport').getAttribute('aria-colcount'), '512');
  await page.locator('#editor-viewport').press('PageUp');
  assert.ok(Number(await page.locator('#cursor-x').inputValue()) < 512);
  await page.locator('#course-cols').fill('64'); await page.locator('#course-cols').press('Tab');
  await page.locator('#course-theme').selectOption('sky');
  await page.locator('#draft-title').fill('Editor component verification');
  check('All component tools reachable; 512-column viewport stays virtualized with valid grid/row/cell ownership and keyboard active descendant');

  await page.locator('#tile-tool').selectOption('glow');
  assert.equal(await page.locator('#prop-content').isEnabled(), true);
  await page.locator('#prop-content').selectOption('fire'); await go(9, 18); await page.locator('#editor-viewport').press('Enter');
  await page.locator('#tile-tool').selectOption('select'); await page.locator('#editor-viewport').press('Enter');
  assert.equal(await page.locator('#prop-content').inputValue(), 'fire');
  await page.locator('#prop-content').selectOption('star'); await page.locator('#apply-component').click();
  await page.locator('#tile-tool').selectOption('powerup'); await page.locator('#prop-powerup').selectOption('life'); await go(11, 20); await page.locator('#editor-viewport').press('Enter');
  await page.locator('#tile-tool').selectOption('enemy'); await page.locator('#prop-enemy').selectOption('winged');
  await page.locator('#prop-behavior').selectOption('horizontal'); await set('#prop-speed', 60); await set('#prop-range', 8); await go(14, 17); await page.locator('#editor-viewport').press('Enter');
  await page.locator('#tile-tool').selectOption('moving-platform'); await set('#prop-width', 3); await page.locator('#prop-axis').selectOption('y'); await set('#prop-distance', 4); await set('#prop-durationMs', 5000); await go(20, 15); await page.locator('#editor-viewport').press('Enter');
  await page.locator('#tile-tool').selectOption('obstacle'); await set('#prop-width', 2); await set('#prop-height', 3); await page.locator('#prop-obstacle').selectOption('ruin'); await go(28, 19); await page.locator('#editor-viewport').press('Enter');
  await page.locator('#tile-tool').selectOption('decoration');
  for (const [i, kind] of ['sign', 'bush', 'pine', 'sprout', 'cloud', 'crystal', 'ruin', 'door', 'terrain'].entries()) {
    await page.locator('#prop-decoration').selectOption(kind); await go(35 + i, 20); await page.locator('#editor-viewport').press('Enter');
  }
  await paint('checkpoint', 4, 22); await paint('item', 5, 22); await paint('finish', 12, 22);
  await page.locator('#validate-draft').click(); await message('Course geometry is valid');
  assert.equal(await page.evaluate(() => window.editorTest.controller.isDirty()), true);
  check('V2 properties, winged behavior, moving path, obstacle and all decoration variants work through actual editor controls');

  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#new-draft').click(); assert.equal(await page.locator('#draft-title').inputValue(), 'Editor component verification');
  await page.locator('#save-draft').click(); await message('Isolated save failure');
  const firstId = await page.evaluate(() => window.editorTest.calls[0].id);
  assert.equal(await page.evaluate(() => window.editorTest.controller.isDirty()), true);
  await page.locator('#save-draft').click(); await message('Draft saved.');
  const savedId = await page.locator('#draft-list').inputValue(); assert.equal(savedId, firstId);
  const saved = await page.evaluate(id => window.editorTest.records.get(id), savedId);
  assert.equal(saved.layout.version, 2); assert.equal(saved.layout.theme, 'sky'); assert.equal(saved.layout.blocks[0].content, 'star');
  assert.equal(saved.layout.enemies[0].behavior, 'horizontal'); assert.equal(saved.layout.movingPlatforms[0].durationMs, 5000); assert.equal(saved.layout.decorations.length, 9);
  await page.locator('#reload-draft').click(); await message('Course loaded from the database.');
  await page.locator('#tile-tool').selectOption('select'); await go(9, 18); await page.locator('#editor-viewport').press('Enter');
  assert.equal(await page.locator('#prop-content').inputValue(), 'star');
  check('Dirty navigation cancellation, failed-save retention, stable UUID retry and saved component reload pass');

  await page.evaluate(id => window.editorTest.externalEdit(id), savedId);
  await page.locator('#draft-description').fill('Local conflict edits');
  await page.locator('#save-draft').click(); await message('Draft revision changed');
  assert.equal(await page.locator('#draft-description').inputValue(), 'Local conflict edits');
  page.once('dialog', dialog => dialog.accept()); await page.locator('#copy-draft').click();
  await page.locator('#save-draft').click(); await message('Draft saved.');
  assert.notEqual(await page.locator('#draft-list').inputValue(), savedId);
  assert.equal(await page.locator('#draft-description').inputValue(), 'Local conflict edits');
  check('Revision conflicts preserve local properties and Copy to new draft recovers them separately');

  for (let iteration = 0; iteration < 3; iteration++) {
    await page.locator('#preview-draft').click(); await page.locator('#draft-preview canvas').waitFor();
    await page.locator('#pause-preview').filter({ hasText: 'Pause preview' }).click();
    await page.locator('#pause-preview').filter({ hasText: 'Resume preview' }).click();
    await page.locator('#stop-preview').click(); await page.locator('#draft-preview canvas').waitFor({ state: 'detached' });
    try { await page.waitForFunction(expected => JSON.stringify(window.editorResources()) === JSON.stringify(expected), mountedResources, { timeout: 5000 }); }
    catch { assert.deepEqual(await page.evaluate(() => window.editorResources()), mountedResources, `Preview ${iteration + 1} leaked resources`); }
    assert.equal(await page.locator('canvas').count(), 0);
  }
  resources.afterRepeatedPreviews = await page.evaluate(() => window.editorResources());
  check('Three preview/pause/resume/stop cycles restore document/window focus, visibility, keyboard, resize and unload listener counts plus ResizeObserver counts; no canvases retained');

  const copyTitle = await page.locator('#draft-title').inputValue();
  await page.locator('#preview-draft').click(); await page.locator('#draft-preview canvas').waitFor();
  await page.locator('#draft-title').fill('wasd foo bar');
  assert.equal(await page.locator('#draft-title').inputValue(), 'wasd foo bar');
  await page.locator('#pause-preview').filter({ hasText: 'Resume preview' }).waitFor();
  assert.equal(await page.locator('#draft-preview canvas').count(), 1);
  await page.locator('#draft-title').fill(copyTitle); await page.locator('#stop-preview').click(); await page.locator('#draft-preview canvas').waitFor({ state: 'detached' });
  await page.locator('#test-draft').click(); await page.locator('#draft-preview canvas').waitFor();
  await page.waitForTimeout(250); await page.locator('#draft-preview').focus(); await page.keyboard.down('ArrowRight');
  try { await message('Saved playtest passed'); } finally { await page.keyboard.up('ArrowRight'); }
  assert.equal(await page.locator('#publish-draft').isEnabled(), true);
  await page.locator('#publish-draft').click(); await message('Course published.');
  assert.equal(await page.locator('#draft-title').isDisabled(), true);
  assert.equal(await page.locator('#copy-draft').isEnabled(), true);
  check('Real V2 preview preserves typed metadata; actual keyboard completion confirms saved playtest and publication becomes immutable');

  const sourceBefore = await page.evaluate(() => structuredClone(window.editorTest.records.get('44444444-4444-4444-8444-444444444444')));
  await page.locator('#draft-list').selectOption('44444444-4444-4444-8444-444444444444'); await message('Course loaded from the database.');
  assert.equal(await page.locator('#save-draft').isDisabled(), true); assert.equal(await page.locator('#draft-title').isDisabled(), true);
  assert.equal(await page.locator('#editor-viewport').getAttribute('aria-readonly'), 'true');
  await page.locator('#copy-draft').click();
  assert.equal(await page.locator('#draft-title').isEnabled(), true);
  assert.equal(await page.locator('#editor-viewport').getAttribute('aria-readonly'), 'false');
  await page.locator('#validate-draft').click(); await message('Course geometry is valid');
  await page.locator('#save-draft').click(); await message('Draft saved.');
  const copied = await page.evaluate(id => window.editorTest.records.get(id), await page.locator('#draft-list').inputValue());
  assert.equal(copied.layout.version, 2);
  assert.notEqual(copied.id, sourceBefore.id);
  assert.equal(copied.published, false);
  assert.equal(copied.canPublish, false);
  assert.deepEqual(await page.evaluate(() => window.editorTest.records.get('44444444-4444-4444-8444-444444444444')), sourceBefore);
  await page.screenshot({ path: `${output}/desktop-editor.png`, fullPage: true });
  check('Published V2 courses stay read-only in controls and ARIA; copied drafts have new identities and no approval while preserving the original');
  await page.evaluate(() => { window.editorTest.controller.destroy(); document.querySelector('#app').replaceChildren(); });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.waitForTimeout(100);
  const destroyedResources = await page.evaluate(() => window.editorResources());
  resources.destroyed = destroyedResources;
  assert.equal(destroyedResources.observedTargets, 0);
  assert.deepEqual(destroyedResources.listeners, mountedResources.listeners);
  assert.equal(await page.locator('canvas,.editor-cell').count(), 0);
  check('Editor teardown disconnects the large-grid ResizeObserver, releases global listeners and tolerates a subsequent desktop resize');
  assert.deepEqual(errors, []); passed = true;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ verifiedAt: new Date().toISOString(), passed, scope: 'Isolated desktop editor DOM with in-memory persistence, no Supabase contact', checks, errors, resources }, null, 2));
  await browser?.close(); await server?.close();
}
