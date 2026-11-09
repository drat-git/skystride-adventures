import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import courses from '../src/content/official-courses.json';

const db = new PGlite();
const directory = new URL('../supabase/migrations/', import.meta.url);
const names = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
const retirement = names.find(name => name.endsWith('_retire_v1_courses.sql'))!;
const sql = (name: string) => readFileSync(new URL(name, directory), 'utf8');
const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OLD = '11111111-1111-4111-8111-111111111111', OLD_DRAFT = '44444444-4444-4444-8444-000000000001';
const DRAFT = '44444444-4444-4444-8444-000000000002', COMMUNITY = '44444444-4444-4444-8444-000000000003';
const layout = { version: 1, cols: 24, rows: 14, start: { x: 1, y: 11 }, finish: { x: 22, y: 11 }, platforms: [{ x: 0, y: 12, width: 24 }], hazards: [], checkpoints: [], items: [] };
const setup = `create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users,fixture text);
 create table auth.identities(id uuid primary key,user_id uuid references auth.users,fixture text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`;
async function role(name: string, user = '') { await db.exec(`reset role;set role ${name}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); }
async function attempt(user: string, level: string) { return (await db.query<{ id: string }>('insert into play_attempts(user_id,level_id) values($1,$2) returning id', [user, level])).rows[0].id; }
async function savedTest(level: string) {
 const test = (await db.query<{ result: { id: string } }>('select start_draft_playtest($1,1) result', [level])).rows[0].result.id;
 await db.query('select complete_draft_playtest($1,100,0)', [test]);
}
async function preserved() {
 await db.exec('reset role');
 return (await db.query(`select jsonb_build_object(
 'users',(select jsonb_agg(t order by id) from auth.users t),
 'sessions',(select jsonb_agg(t order by id) from auth.sessions t),
 'identities',(select jsonb_agg(t order by id) from auth.identities t),
 'profiles',(select jsonb_agg(t order by id) from profiles t),
 'levels',(select jsonb_agg(t order by id) from levels t where layout->'version'='2'::jsonb),
 'attempts',(select jsonb_agg(t order by id) from play_attempts t where level_id not in ('${OLD}','${OLD_DRAFT}')),
 'ratings',(select jsonb_agg(t order by user_id,level_id) from ratings t where level_id not in ('${OLD}','${OLD_DRAFT}')),
 'favorites',(select jsonb_agg(t order by user_id,level_id) from favorites t where level_id not in ('${OLD}','${OLD_DRAFT}')),
 'tests',(select jsonb_agg(t order by id) from draft_playtests t where level_id not in ('${OLD}','${OLD_DRAFT}')),
 'awards',(select jsonb_agg(t order by player_id,achievement_code) from player_achievements t)) snapshot`)).rows[0];
}
let before: unknown;
beforeAll(async () => {
 await db.exec(setup);
 for (const name of names.filter(name => name < retirement)) await db.exec(sql(name));
 await db.query('insert into auth.users(id,raw_user_meta_data,email) values($1,$2,$3),($4,$5,$6),($7,$8,$9)', [A, { display_name: 'Retained A' }, 'a@example.test', B, { display_name: 'Retained B' }, 'b@example.test', C, { display_name: 'Retained C' }, 'c@example.test']);
 await db.query('insert into auth.sessions values($1,$1,$2);', [A, 'session sentinel']);
 await db.query('insert into auth.identities values($1,$1,$2);', [A, 'identity sentinel']);
 await db.query('insert into levels(id,creator_id,title,difficulty,layout,published) values($1,null,$2,$3,$4,true),($5,$6,$7,$3,$4,false)', [OLD, 'Archived published', 'easy', layout, OLD_DRAFT, A, 'Archived private']);
 await db.query('insert into levels(id,creator_id,title,difficulty,layout,published) values($1,$2,$3,$4,$5,false),($6,$7,$8,$4,$5,true)', [DRAFT, A, 'Retained private V2', 'easy', courses[0].layout, COMMUNITY, B, 'Retained community V2']);
 await role('authenticated', A);
 for (const level of [OLD, COMMUNITY]) {
  const run = await attempt(A, level); await db.query('select complete_attempt($1,100,2)', [run]);
  await db.query('insert into ratings(user_id,level_id,score) values($1,$2,4)', [A, level]);
  await db.query('insert into favorites(user_id,level_id) values($1,$2)', [A, level]);
 }
 await savedTest(OLD_DRAFT); await savedTest(DRAFT);
 await role('authenticated', B); await attempt(B, OLD); await attempt(B, courses[1].id);
 before = await preserved(); await db.exec(sql(retirement));
}, 30000);
afterAll(() => db.close());

it('removes precisely the V1 courses and dependent rows, retaining accounts, V2 data and earned awards byte-for-byte', async () => {
 expect(await preserved()).toEqual(before);
 expect((await db.query("select count(*)::int n from levels where layout->'version'='1'::jsonb")).rows[0]).toEqual({ n: 0 });
 for (const table of ['play_attempts', 'ratings', 'favorites', 'draft_playtests']) {
  expect((await db.query(`select count(*)::int n from ${table} where level_id in ($1,$2)`, [OLD, OLD_DRAFT])).rows[0]).toEqual({ n: 0 });
 }
 expect((await db.query('select count(*)::int n from levels')).rows[0]).toEqual({ n: 8 });
});
it('removes the V1 validator and rejects old layouts through SQL validation and authenticated saving', async () => {
 expect((await db.query("select to_regprocedure('private.valid_level_layout_v1(jsonb)') old")).rows[0]).toEqual({ old: null });
 expect((await db.query("select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.prokind='f' and pg_get_functiondef(p.oid) like '%11111111-1111-4111-8111-111111111111%'")).rows).toEqual([]);
 expect((await db.query('select private.valid_level_layout($1) valid', [layout])).rows[0]).toEqual({ valid: false });
 await role('authenticated', A);
 await expect(db.query('select save_draft($1,null,$2,$3,$4,$5)', [OLD_DRAFT, 'Old browser retry', '', 'easy', layout])).rejects.toThrow(/layout/i);
 await expect(db.query('update levels set official_order=1 where id=$1', [DRAFT])).rejects.toThrow();
 await role('anon'); expect((await db.query<{version: string}>('select layout->>\'version\' version from levels')).rows.every(row => row.version === '2')).toBe(true);
 await expect(db.query('select * from own_progress()')).rejects.toThrow();
});
it('retargets the visible timed challenge while retaining its code and enforcing the catalog threshold and exact V2 identity', async () => {
 await db.exec('reset role');
 expect((await db.query("select code,name,threshold_ms from achievements where rule='timed_course'")).rows).toEqual([{ code: 'first_flight_under_30s', name: 'Meadow Run under 30 seconds', threshold_ms: 30000 }]);
 await db.query("update achievements set threshold_ms=100 where code='first_flight_under_30s'");
 await role('authenticated', C);
 const other = await attempt(C, courses[1].id); await db.query('select complete_attempt($1,50,0)', [other]);
 const exact = await attempt(C, courses[0].id); await db.query('select complete_attempt($1,100,0)', [exact]);
 expect((await db.query("select achievement_code from player_achievements where achievement_code='first_flight_under_30s'")).rows).toEqual([]);
 const fast = await attempt(C, courses[0].id); await db.query('select complete_attempt($1,99,0)', [fast]);
 expect((await db.query("select achievement_code from player_achievements where achievement_code='first_flight_under_30s'")).rows).toEqual([{ achievement_code: 'first_flight_under_30s' }]);
 await db.query('select complete_attempt($1,99,0)', [fast]);
 await expect(db.query('select complete_attempt($1,98,0)', [fast])).rejects.toThrow(/cannot be changed/);
 await role('authenticated', B); await expect(db.query('select complete_attempt($1,99,0)', [fast])).rejects.toThrow(/not found/);
});
it('installs a fresh V2-only database and repeated seed runs do not recreate removed courses or modify records', async () => {
 const fresh = new PGlite(); try {
  await fresh.exec(setup); for (const name of names) await fresh.exec(sql(name));
  const beforeSeed = (await fresh.query('select * from levels order by id')).rows;
  const seed = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
  await fresh.exec(seed); await fresh.exec(seed);
  expect((await fresh.query('select * from levels order by id')).rows).toEqual(beforeSeed);
  expect(beforeSeed).toHaveLength(6);
  expect((await fresh.query("select to_regprocedure('private.valid_level_layout_v1(jsonb)') old")).rows[0]).toEqual({ old: null });
 } finally { await fresh.close(); }
}, 30000);
it('rolls back without deleting old records if the published V2 replacement is missing', async () => {
 const isolated = new PGlite(); try {
  await isolated.exec(setup); for (const name of names.filter(name => name < retirement)) await isolated.exec(sql(name));
  await isolated.query('delete from levels where id=$1', [courses[0].id]);
  await isolated.query('insert into levels(id,title,difficulty,layout,published) values($1,$2,$3,$4,true)', [OLD, 'Must remain', 'easy', layout]);
  await expect(isolated.exec(sql(retirement))).rejects.toThrow(/Meadow Run V2/); await isolated.exec('rollback');
  expect((await isolated.query('select id from levels where id=$1', [OLD])).rows).toEqual([{ id: OLD }]);
  expect((await isolated.query('select private.valid_level_layout($1) valid', [layout])).rows[0]).toEqual({ valid: true });
 } finally { await isolated.close(); }
}, 30000);
