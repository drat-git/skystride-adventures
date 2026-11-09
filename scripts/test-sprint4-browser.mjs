// Isolated browser -> real supabase-js -> fixture HTTP transport -> real PGlite SQL/RLS.
// Auth is a fixture. This suite does not prove hosted PostgREST, email delivery or login.
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'vite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const db = new PGlite(); let browser, server, queue = Promise.resolve();
const port = Number(process.env.SPRINT4_BROWSER_PORT || 5185), origin = `http://127.0.0.1:${port}`;
const output = 'output/sprint4/local-evidence'; await mkdir(output, { recursive: true });
const checks = [], calls = [], errors = [];
const check = name => { checks.push(name); console.log('PASS', name); };
const fail = { logout: false, draftResponse: false, completion: false, playtest: false, favoriteResponse: false };
const accounts = [A, B].map((id, i) => {
  const user = { id, email: `browser-${i ? 'b' : 'a'}@example.test`, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: { display_name: `Browser Player ${i ? 'B' : 'A'}` }, created_at: new Date().toISOString() };
  const token = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.local';
  return { user, token };
});
const rpc = {
  save_draft: ['p_id', 'p_expected_revision', 'p_title', 'p_description', 'p_difficulty', 'p_layout'],
  owned_levels: [], start_draft_playtest: ['p_level_id', 'p_expected_revision'],
  complete_draft_playtest: ['p_test_id', 'p_elapsed_ms', 'p_deaths'],
  publish_level: ['p_level_id', 'p_expected_revision'], complete_attempt: ['p_attempt_id', 'p_elapsed_ms', 'p_deaths'],
  level_leaderboard: ['p_level_id'], level_statistics: [],
};
async function admin(sql, values = []) { await queue; await db.exec('reset role'); return (await db.query(sql, values)).rows; }
async function context() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await context.addInitScript(() => {
    const watched = [{ target: document, types: new Set(['focusin', 'visibilitychange']) }, { target: window, types: new Set(['blur']) }];
    const counts = {};
    for (const [i, { target, types }] of watched.entries()) {
      const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
      target.addEventListener = (type, fn, options) => { if (types.has(type)) (counts[`${i}:${type}`] ??= new Set()).add(fn); return add(type, fn, options); };
      target.removeEventListener = (type, fn, options) => { counts[`${i}:${type}`]?.delete(fn); return remove(type, fn, options); };
    }
    window.__listenerCounts = () => Object.fromEntries(Object.entries(counts).map(([key, set]) => [key, set.size]));
  });
  await context.route('**/*', route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname !== 'local-test.supabase.co') return route.abort();
    queue = queue.then(async () => {
      const method = request.method(), data = request.postData() ? request.postDataJSON() : {};
      const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
      const account = accounts.find(a => request.headers().authorization === `Bearer ${a.token}`);
      if (url.pathname === '/auth/v1/token') {
        const user = accounts.find(a => a.user.email === data.email) ?? accounts.find(a => data.refresh_token === `refresh-${a.user.id}`);
        if (!user) return reply({ message: 'Invalid fixture credentials' }, 400);
        return reply({ access_token: user.token, refresh_token: `refresh-${user.user.id}`, token_type: 'bearer', expires_in: 3600, user: user.user });
      }
      if (url.pathname === '/auth/v1/logout') {
        if (fail.logout) { fail.logout = false; return reply({ message: 'Simulated sign-out failure' }, 400); }
        return reply({});
      }
      if (url.pathname === '/auth/v1/user') return reply(account?.user ?? {});
      await db.exec('reset role;set role ' + (account ? 'authenticated' : 'anon'));
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [account?.user.id ?? '']);
      const resource = url.pathname.split('/').at(-1); calls.push({ method, resource, user: account?.user.id ?? 'guest' });
      try {
        if (url.pathname.includes('/rpc/')) {
          if (!(resource in rpc)) throw Error('Unknown fixture RPC ' + resource);
          if (resource === 'complete_attempt' && fail.completion) { fail.completion = false; return reply({ message: 'Simulated result save failure' }, 503); }
          if (resource === 'complete_draft_playtest' && fail.playtest) { fail.playtest = false; return reply({ message: 'Simulated playtest save failure' }, 503); }
          const params = rpc[resource].map(key => data[key]), args = params.map((_, i) => '$' + (i + 1)).join(',');
          const tableResult = ['level_statistics', 'level_leaderboard'].includes(resource);
          const rows = (await db.query(tableResult ? `select * from ${resource}(${args})` : `select ${resource}(${args}) as value`, params)).rows;
          if (resource === 'save_draft' && fail.draftResponse) { fail.draftResponse = false; return reply({ message: 'Simulated lost save response' }, 503); }
          return reply(tableResult ? rows : resource === 'owned_levels' ? rows.map(row => row.value) : rows[0]?.value ?? null);
        }
        if (!['profiles', 'levels', 'play_attempts', 'achievements', 'player_achievements', 'ratings', 'favorites'].includes(resource)) throw Error('Unknown fixture table');
        const allowed = new Set(['id', 'display_name', 'created_at', 'title', 'description', 'difficulty', 'layout', 'creator_id', 'published', 'updated_at', 'user_id', 'level_id', 'code', 'name', 'rule', 'threshold_ms', 'achievement_code', 'earned_at', 'player_id', 'score']);
        const params = [], bind = v => { params.push(v); return '$' + params.length; }, ident = s => { if (!allowed.has(s)) throw Error('Unknown test column ' + s); return '"' + s + '"'; };
        const fields = (url.searchParams.get('select') || '*').split(',').map(s => s === '*' ? '*' : ident(s)).join(',');
        const conditions = [];
        for (const [key, value] of url.searchParams) if (value.startsWith('eq.')) conditions.push(ident(key) + '=' + bind(value.slice(3)));
        const where = conditions.length ? ' where ' + conditions.join(' and ') : '';
        let sql;
        if (method === 'GET') sql = `select ${fields} from ${resource}${where}`;
        else if (method === 'POST') {
          const values = Array.isArray(data) ? data[0] : data;
          sql = `insert into ${resource} (${Object.keys(values).map(ident).join(',')}) values (${Object.values(values).map(bind).join(',')})`;
          if (url.searchParams.has('on_conflict')) {
            sql += ` on conflict (${url.searchParams.get('on_conflict').split(',').map(ident).join(',')}) `;
            sql += request.headers().prefer?.includes('resolution=ignore-duplicates') ? 'do nothing' : 'do update set ' + Object.keys(values).map(key => `${ident(key)}=excluded.${ident(key)}`).join(',');
          }
          sql += ` returning ${fields}`;
        } else if (method === 'PATCH') sql = `update ${resource} set ${Object.entries(data).map(([k, v]) => ident(k) + '=' + bind(v)).join(',')}${where} returning ${fields}`;
        else if (method === 'DELETE') sql = `delete from ${resource}${where} returning ${fields}`;
        else throw Error('Unsupported fixture method');
        if (method === 'GET' && url.searchParams.has('order')) sql += ' order by ' + url.searchParams.get('order').split(',').map(s => { const [key, dir] = s.split('.'); return ident(key) + (dir === 'desc' ? ' desc' : ' asc'); }).join(',');
        if (method === 'GET' && url.searchParams.has('limit')) sql += ' limit ' + bind(Number(url.searchParams.get('limit')));
        const rows = (await db.query(sql, params)).rows;
        if (resource === 'favorites' && method === 'POST' && fail.favoriteResponse) { fail.favoriteResponse = false; return reply({ message: 'Simulated lost favorite response' }, 503); }
        if (request.headers().accept?.includes('vnd.pgrst.object')) {
          if (rows.length !== 1) return reply({ message: 'Expected one row', code: 'PGRST116', details: `The result contains ${rows.length} rows` }, 406);
          return reply(rows[0]);
        }
        return reply(rows);
      } catch (error) { return reply({ message: error.message, code: error.code }, 400); }
    }).catch(async error => { errors.push('transport: ' + error.message); await route.abort(); });
    return queue;
  });
  return context;
}
const waitText = (page, text) => page.getByText(text, { exact: false }).waitFor();
async function login(page, account) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(account.user.email);
  await page.getByLabel('Password', { exact: true }).fill('local-test-password');
  await page.locator('#authform button[type=submit]').click(); await waitText(page, 'Profile loaded.');
  await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
}
async function editor(page) {
  await page.getByRole('button', { name: 'Create a level', exact: true }).click();
  await waitText(page, 'Choose a private draft or a published course');
}
const course = (page, title) => page.locator('article.course').filter({ has: page.getByRole('heading', { name: title, exact: true }) });
async function browse(page) { await page.locator('#brand').click(); await page.getByRole('button', { name: 'Browse courses', exact: true }).click(); await waitText(page, 'published course'); }
async function finishShort(page, host = '#game') {
  await page.locator(host + ' canvas').waitFor(); await page.locator(host).focus();
  await page.keyboard.down('ArrowRight');
  try {
    await page.waitForFunction(selector => selector === '#game-fixture' ? window.__gameFixture.results.length > 0 : document.querySelector(selector === '#draft-preview' ? '#pause-preview' : '#pause')?.disabled, host, { timeout: 15000 });
  } finally { await page.keyboard.up('ArrowRight'); }
}
async function save(page) { await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await waitText(page, 'Draft saved. Revision'); }
async function cancelNext(page, action) {
  let seen = false; page.once('dialog', dialog => { seen = true; assert.equal(dialog.type(), 'confirm'); void dialog.dismiss(); });
  await action(); assert.equal(seen, true, 'expected a discard confirmation');
}
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
  create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  for (const file of ['001_core.sql', '002_trigger_privileges_and_indexes.sql', '20261019144913_sprint3_progress_and_drafts.sql', '20261109042116_sprint4_publishing_and_community.sql', '20261109043347_sprint4_non_retrying_revision_conflicts.sql']) await db.exec(await readFile('supabase/migrations/' + file, 'utf8'));
  await db.query('insert into auth.users values($1,$2),($3,$4)', [A, accounts[0].user.user_metadata, B, accounts[1].user.user_metadata]);
  await db.exec(await readFile('supabase/seed.sql', 'utf8'));
  process.env.VITE_SUPABASE_URL = 'https://local-test.supabase.co'; process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'local-fixture-public-key';
  server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true } }); await server.listen();
  browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
  const contextA = await context(), page = await contextA.newPage(); page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Reduce decorative motion').check(); await waitText(page, 'Unsaved preference.'); await page.getByRole('button', { name: 'Save settings', exact: true }).click();
  await waitText(page, 'Settings saved on this device.'); await page.reload();
  assert.equal(await page.locator('html').getAttribute('data-reduced-motion'), 'true');
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); assert.equal(await page.getByLabel('Reduce decorative motion').isChecked(), true);
  await page.getByRole('button', { name: 'Restore defaults', exact: true }).click(); assert.equal(await page.locator('html').getAttribute('data-reduced-motion'), 'false');
  await page.evaluate(() => { window.__storageSet = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (key === 'skystride.reducedMotion') throw Error('Simulated storage failure'); return window.__storageSet.call(this, key, value); }; });
  await page.getByLabel('Reduce decorative motion').check(); await waitText(page, 'Unsaved preference.'); await page.getByRole('button', { name: 'Save settings', exact: true }).click(); await waitText(page, 'Applied for this page, but not saved');
  await page.evaluate(() => { Storage.prototype.setItem = window.__storageSet; });
  await page.getByRole('button', { name: 'Restore defaults', exact: true }).click();
  check('Guest settings persist across reload, restore defaults, and report storage failure');
  await page.getByRole('button', { name: 'Back to menu', exact: true }).click();
  await page.getByRole('button', { name: 'Local practice', exact: true }).click(); await page.locator('#game canvas').waitFor();
  assert.equal(await page.getByRole('button', { name: 'AI Hint', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await page.locator('#brand').click(); assert.equal((await admin('select count(*)::int n from play_attempts'))[0].n, 0);
  check('Guest practice is unsaved and AI Hint is honestly unavailable');
  await login(page, accounts[0]); await editor(page);
  await page.getByLabel('Title', { exact: true }).fill('Browser Sprint 4 course');
  await page.getByLabel('Tile tool').selectOption('finish'); await page.getByRole('button', { name: 'Column 6, row 12: empty', exact: true }).click();
  await page.getByLabel('Tile tool').selectOption('checkpoint'); await page.getByRole('button', { name: 'Column 4, row 12: empty', exact: true }).click();
  await page.getByLabel('Tile tool').selectOption('item'); await page.getByRole('button', { name: 'Column 5, row 12: empty', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Publish course', exact: true }).isDisabled(), true);
  await cancelNext(page, () => page.getByRole('button', { name: 'New draft', exact: true }).click());
  await cancelNext(page, () => page.getByRole('button', { name: 'Back to menu', exact: true }).click());
  await cancelNext(page, () => page.getByRole('button', { name: 'Sign out', exact: true }).click());
  assert.equal(await page.getByLabel('Title', { exact: true }).inputValue(), 'Browser Sprint 4 course');
  assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), true);
  fail.draftResponse = true; await page.getByRole('button', { name: 'Save draft', exact: true }).click(); await waitText(page, 'Simulated lost save response');
  assert.equal(await page.getByLabel('Title', { exact: true }).isEnabled(), true);
  await save(page); const publishedId = (await admin('select id from levels where creator_id=$1', [A]))[0].id;
  assert.equal((await admin('select count(*)::int n from levels where creator_id=$1', [A]))[0].n, 1);
  assert.equal(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented; }), false);
  check('Dirty navigation/sign-out cancellation preserves edits; lost save response retries without duplication');
  const baseline = await page.evaluate(() => window.__listenerCounts());
  await page.getByRole('button', { name: 'Preview draft', exact: true }).click(); await page.locator('#draft-preview canvas').waitFor();
  await page.getByLabel('Title', { exact: true }).fill('wasd foo bar');
  assert.equal(await page.getByLabel('Title', { exact: true }).inputValue(), 'wasd foo bar');
  await page.getByRole('button', { name: 'Resume preview', exact: true }).waitFor();
  assert.equal(await page.locator('#draft-preview canvas').count(), 1);
  await page.getByLabel('Title', { exact: true }).fill('Browser Sprint 4 course');
  await page.getByRole('button', { name: 'Resume preview', exact: true }).click();
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: 'Resume preview', exact: true }).waitFor();
  await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: 'Resume preview', exact: true }).click(); await page.getByRole('button', { name: 'Pause preview', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click(); await page.locator('#draft-preview canvas').waitFor({ state: 'detached' });
  for (let i = 0; i < 3; i++) { await page.getByRole('button', { name: 'Preview draft', exact: true }).click(); await page.locator('#draft-preview canvas').waitFor(); await page.getByRole('button', { name: 'Stop preview', exact: true }).click(); await page.locator('#draft-preview canvas').waitFor({ state: 'detached' }); }
  const after = await page.evaluate(() => window.__listenerCounts());
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(after)])) assert.equal(after[key] ?? 0, baseline[key] ?? 0, 'listener cleanup: ' + key);
  fail.logout = true; await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await waitText(page, 'Sign out failed:');
  if (await page.getByRole('button', { name: 'Sign in', exact: true }).count()) await login(page, accounts[0]);
  check('Preview typing survives; pause, visibility resume, repeated cleanup, and sign-out error survives session cleanup');
  await page.reload(); await editor(page); await page.getByLabel('Your courses').selectOption(publishedId); await waitText(page, 'Course loaded from the database.');
  await page.getByRole('button', { name: 'Column 4, row 12: checkpoint', exact: true }).waitFor(); await page.getByRole('button', { name: 'Column 5, row 12: item', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'AI Editor Feedback', exact: true }).isDisabled(), true);
  fail.playtest = true; await page.getByRole('button', { name: 'Test saved version', exact: true }).click(); await finishShort(page, '#draft-preview');
  await waitText(page, 'Playtest approval not confirmed'); await page.getByRole('button', { name: 'Retry saving playtest', exact: true }).click(); await waitText(page, 'Saved playtest passed for revision 1');
  assert.equal((await admin('select count(*)::int n from play_attempts'))[0].n, 0);
  assert.equal((await admin("select count(*)::int n from player_achievements where achievement_code <> 'first_created_level'"))[0].n, 0);
  await page.getByLabel('Description', { exact: true }).fill('Saved revision two'); assert.equal(await page.getByRole('button', { name: 'Publish course', exact: true }).isDisabled(), true);
  await save(page); assert.equal(await page.getByRole('button', { name: 'Publish course', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Test saved version', exact: true }).click(); await finishShort(page, '#draft-preview'); await waitText(page, 'Saved playtest passed for revision 2');
  await page.getByRole('button', { name: 'Publish course', exact: true }).click(); await waitText(page, 'Course published.');
  assert.equal(await page.getByLabel('Title', { exact: true }).isDisabled(), true); await page.screenshot({ path: output + '/published-course.png' });
  await page.getByRole('button', { name: 'Copy to new draft', exact: true }).click(); assert.equal(await page.getByRole('button', { name: 'Publish course', exact: true }).isDisabled(), true);
  await save(page); const copyId = (await admin('select id from levels where creator_id=$1 and not published', [A]))[0].id; assert.notEqual(copyId, publishedId);
  check('Saved revisions persist; playtest retry approves only current revision; publication is immutable and copies are private');
  const stale = await contextA.newPage(); stale.on('pageerror', error => errors.push(error.message)); await stale.goto(origin); await editor(stale); await stale.getByLabel('Your courses').selectOption(copyId); await waitText(stale, 'Course loaded from the database.');
  await page.getByLabel('Title', { exact: true }).fill('Copy updated in first tab'); await save(page);
  await stale.getByLabel('Title', { exact: true }).fill('Keep these stale local edits'); await stale.getByRole('button', { name: 'Save draft', exact: true }).click(); await waitText(stale, 'another tab');
  assert.equal(await stale.getByLabel('Title', { exact: true }).inputValue(), 'Keep these stale local edits');
  stale.once('dialog', dialog => void dialog.accept()); await stale.getByRole('button', { name: 'Copy to new draft', exact: true }).click(); await save(stale); await stale.close();
  check('Concurrent tab saves reject stale revision and preserve edits as a separate draft');
  const contextB = await context(), playerB = await contextB.newPage(); playerB.on('pageerror', error => errors.push(error.message)); await playerB.goto(origin);
  await login(playerB, accounts[1]); await editor(playerB); assert.equal(await playerB.locator('#draft-list option').count(), 1); await browse(playerB); await course(playerB, 'Browser Sprint 4 course').getByRole('button', { name: 'Course details', exact: true }).click(); await waitText(playerB, 'Course details loaded.');
  assert.equal(await playerB.getByRole('button', { name: 'Favorite', exact: true }).isDisabled(), true);
  fail.completion = true; await playerB.getByRole('button', { name: 'Play course', exact: true }).click(); await finishShort(playerB); await waitText(playerB, 'Result not saved:');
  await playerB.getByRole('button', { name: 'Retry saving result', exact: true }).click(); await waitText(playerB, 'Result saved!'); await waitText(playerB, '1 / 1 items');
  await playerB.getByRole('button', { name: 'Course details', exact: true }).click(); await waitText(playerB, 'Course details loaded.');
  await playerB.locator('#rating-score').selectOption('4'); await playerB.getByRole('button', { name: 'Save rating', exact: true }).click(); await waitText(playerB, 'Rating saved.');
  fail.favoriteResponse = true; await playerB.getByRole('button', { name: 'Favorite', exact: true }).click(); await waitText(playerB, 'Could not confirm the change:');
  await playerB.getByRole('button', { name: 'Favorite', exact: true }).click(); await waitText(playerB, 'Favorite saved.');
  await browse(page); await course(page, 'Browser Sprint 4 course').getByRole('button', { name: 'Play course', exact: true }).click(); await page.locator('#game canvas').waitFor();
  await page.getByRole('button', { name: 'Course details', exact: true }).click(); await waitText(page, 'Course details loaded.');
  await page.locator('#rating-score').selectOption('2'); await page.getByRole('button', { name: 'Save rating', exact: true }).click(); await waitText(page, 'Rating saved.');
  await page.getByRole('button', { name: 'Favorite', exact: true }).click(); await waitText(page, 'Favorite saved.');
  assert.match(await page.locator('#course-stats').innerText(), /3\.0.*2 rating.*2 favorite/);
  await page.getByRole('button', { name: 'Remove rating', exact: true }).click(); await waitText(page, 'Rating removed.'); await page.getByRole('button', { name: 'Unfavorite', exact: true }).click(); await waitText(page, 'Favorite removed.');
  assert.match(await page.locator('#course-stats').innerText(), /4\.0.*1 rating.*1 favorite/);
  await playerB.reload(); await browse(playerB); await playerB.getByLabel('My Favorites', { exact: true }).check(); assert.equal(await playerB.locator('article.course').count(), 1); await playerB.getByLabel('My Favorites', { exact: true }).uncheck(); for (const order of ['rating', 'favorites', 'title']) { await playerB.locator('#course-order').selectOption(order); assert.equal(await playerB.locator('article.course h2').first().innerText(), 'Browser Sprint 4 course'); } await playerB.getByLabel('My Favorites', { exact: true }).check();
  await course(playerB, 'Browser Sprint 4 course').getByRole('button', { name: 'Course details', exact: true }).click(); await waitText(playerB, 'Course details loaded.');
  assert.equal(await playerB.locator('#rating-score').inputValue(), '4'); assert.equal(await playerB.getByRole('button', { name: 'Unfavorite', exact: true }).count(), 1);
  await playerB.getByRole('button', { name: 'Leaderboard', exact: true }).click(); await playerB.getByRole('cell', { name: 'Browser Player B', exact: true }).waitFor();
  await playerB.screenshot({ path: output + '/leaderboard.png' }); await playerB.locator('#brand').click(); await playerB.getByRole('button', { name: 'Achievements', exact: true }).click(); await waitText(playerB, '1 of 3 achievements earned.');
  assert.equal((await admin('select count(*)::int n from play_attempts where completed_at is not null'))[0].n, 1);
  assert.equal((await admin('select count(*)::int n from favorites'))[0].n, 1);
  check('Second account discovers/passes course; result/favorite retries, eligible unfinished run, aggregates, removals, reload and rankings persist');
  await playerB.getByRole('button', { name: 'Sign out', exact: true }).click(); await playerB.getByRole('button', { name: 'Sign in', exact: true }).waitFor(); await login(playerB, accounts[1]); await browse(playerB); await course(playerB, 'Browser Sprint 4 course').getByRole('button', { name: 'Course details', exact: true }).click(); await waitText(playerB, 'Course details loaded.'); assert.equal(await playerB.locator('#rating-score').inputValue(), '4');
  check('Explicit logout/login restores account-specific community state');
  await page.locator('#brand').click(); await editor(page); await page.getByLabel('Your courses').selectOption(copyId); await waitText(page, 'Course loaded from the database.');
  await page.getByLabel('Title', { exact: true }).fill('Private unsaved work before session change');
  const signingOutTab = await contextA.newPage(); await signingOutTab.goto(origin); await signingOutTab.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor(); assert.equal(await page.getByLabel('Title', { exact: true }).count(), 0); await signingOutTab.close();
  check('Actual account loss in another tab clears dirty private editor state');
  // Supplemental component exercise uses real keyboard input and public hint-context snapshots.
  // The ordinary journeys above use only the app UI; this fixture isolates death/respawn state.
  await page.bringToFront();
  await page.evaluate(async () => {
    const { mountGame } = await import('/src/game.ts'), { practiceLevel } = await import('/src/level.ts');
    const host = document.createElement('div'); host.id = 'game-fixture'; host.style.cssText = 'position:fixed;inset:0 auto auto 0;width:768px;height:448px;background:white;z-index:9999'; document.body.append(host);
    const level = structuredClone(practiceLevel); level.layout.checkpoints = [{ x: 3, y: 11 }]; level.layout.items = [{ x: 4, y: 11 }]; level.layout.hazards = [{ x: 7, y: 11 }];
    window.__gameFixture = { mountGame, host, level, results: [] }; window.__gameFixture.run = mountGame(host, level, result => window.__gameFixture.results.push(result));
  });
  await page.locator('#game-fixture canvas').waitFor(); await page.waitForFunction(() => window.__gameFixture.run.scene.getContext().state.elapsedMs > 0); await page.locator('#game-fixture').focus();
  await page.keyboard.down('ArrowRight'); await page.waitForFunction(() => window.__gameFixture.run.scene.getContext().state.deaths >= 1); await page.keyboard.up('ArrowRight');
  const afterDeath = await page.evaluate(() => window.__gameFixture.run.scene.getContext().state);
  assert.ok(afterDeath.deaths >= 1); assert.equal(afterDeath.collected, 1); assert.deepEqual(afterDeath.checkpoint, { x: 3, y: 11 });
  await page.evaluate(() => window.__gameFixture.run.scene.setPaused(true));
  const paused = await page.evaluate(() => window.__gameFixture.run.scene.getContext().state); await page.waitForTimeout(250);
  assert.deepEqual(await page.evaluate(() => window.__gameFixture.run.scene.getContext().state), paused);
  await page.evaluate(() => window.__gameFixture.run.scene.setPaused(false)); await page.keyboard.down('ArrowRight'); await page.waitForFunction(previous => window.__gameFixture.run.scene.getContext().state.deaths > previous, afterDeath.deaths); await page.keyboard.up('ArrowRight');
  const repeatDeath = await page.evaluate(() => window.__gameFixture.run.scene.getContext().state);
  assert.ok(repeatDeath.deaths > afterDeath.deaths); assert.equal(repeatDeath.collected, 1); assert.ok(repeatDeath.elapsedMs > afterDeath.elapsedMs);
  await page.evaluate(() => window.__gameFixture.run.destroy()); await page.locator('#game-fixture canvas').waitFor({ state: 'detached' });
  await page.evaluate(() => { const fixture = window.__gameFixture; fixture.level.layout.finish = { x: 5, y: 11 }; fixture.run = fixture.mountGame(fixture.host, fixture.level, result => fixture.results.push(result)); });
  await page.locator('#game-fixture canvas').waitFor();
  assert.equal(await page.evaluate(() => window.__gameFixture.run.scene.getContext().state.collected), 0);
  await finishShort(page, '#game-fixture'); await page.waitForTimeout(250);
  const results = await page.evaluate(() => window.__gameFixture.results);
  assert.equal(results.length, 1); assert.equal(results[0].collected, 1); assert.equal(results[0].deaths, 0);
  await page.screenshot({ path: output + '/collectible-completion.png' });
  await page.evaluate(() => { window.__gameFixture.run.destroy(); window.__gameFixture.host.remove(); delete window.__gameFixture; });
  check('Real-keyboard Phaser fixture: checkpoints respawn, death preserves elapsed/items, pause freezes, restart resets, finish emits once');
  assert.deepEqual(errors, []);
  await writeFile(output + '/results.json', JSON.stringify({ verifiedAt: new Date().toISOString(), transport: 'local fixture HTTP with actual supabase-js and PGlite SQL/RLS; fixture authentication', visibilityTest: 'visibilitychange event with simulated document.hidden', checks, calls, browserErrors: errors }, null, 2));
} catch (error) {
  for (const [contextIndex, context] of (browser?.contexts() ?? []).entries()) {
    for (const [pageIndex, page] of context.pages().entries()) {
      await page.screenshot({ path: `${output}/failure-${contextIndex}-${pageIndex}.png` }).catch(() => {});
      await writeFile(`${output}/failure-${contextIndex}-${pageIndex}.txt`, await page.locator('body').innerText().catch(() => 'Page unavailable'));
    }
  }
  await writeFile(output + '/failure.json', JSON.stringify({ error: error.stack, checks, calls, browserErrors: errors }, null, 2));
  throw error;
} finally {
  await browser?.close(); await server?.close(); await db.close();
}
