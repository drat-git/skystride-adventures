import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import courses from '../src/content/official-courses.json';

const db = new PGlite();
const directory = new URL('../supabase/migrations/', import.meta.url);
const names = readdirSync(directory).filter(n => n.endsWith('.sql') && n <= '20261109083220_course_run_records_and_challenges.sql').sort();
const read = (name: string) => readFileSync(new URL(name, directory), 'utf8');
const A = randomUUID(), B = randomUUID(), C = randomUUID(), DRAFT = randomUUID(), COMMUNITY = randomUUID();
const setup = `create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`;
async function role(name: string, user = '') { await db.exec(`reset role;set role ${name}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]); }
async function attempt(user = A, level = courses[0].id, aged = true) {
 await db.exec('reset role');
 const id = (await db.query<{id:string}>(`insert into play_attempts(user_id,level_id,started_at) values($1,$2,clock_timestamp()-($3::int * interval '1 second')) returning id`, [user,level,aged?120:0])).rows[0].id;
 await role('authenticated',user); return id;
}
function coinCount(index: number) { return courses[index].layout.items.length + courses[index].layout.blocks.filter(b => b.content==='coin').length; }
const complete = (id: string, elapsed: number|null=100, score: number|null=500, collected: number|null=0, total: number|null=coinCount(0), small: boolean|null=false) => db.query('select complete_run($1,$2,0,$3,$4,$5,$6)', [id,elapsed,score,collected,total,small]);
async function preservation() {
 await db.exec('reset role');
 return (await db.query(`select jsonb_build_object(
 'users',(select jsonb_agg(t order by id) from auth.users t),
 'profiles',(select jsonb_agg(t order by id) from profiles t),
 'attempts',(select jsonb_agg(to_jsonb(t)-array['score','collected','total_items','small_only'] order by id) from play_attempts t),
 'ratings',(select jsonb_agg(t order by user_id,level_id) from ratings t),
 'favorites',(select jsonb_agg(t order by user_id,level_id) from favorites t),
 'tests',(select jsonb_agg(t order by id) from draft_playtests t),
 'awards',(select jsonb_agg(t order by player_id,achievement_code) from player_achievements t),
 'levels',(select jsonb_agg(to_jsonb(t)-array['layout','revision','updated_at'] order by id) from levels t)) snapshot`)).rows[0];
}
let before: unknown, oldAttempt: string, oldTest: string;
beforeAll(async()=>{
 await db.exec(setup);for(const name of names.slice(0,-1))await db.exec(read(name));
 await db.query('insert into auth.users values($1,$2,$3),($4,$5,$6),($7,$8,$9)', [A,{display_name:'Records A'},'a@example.test',B,{display_name:'Records B'},'b@example.test',C,{display_name:'Records C'},'c@example.test']);
 const oldLayout=(await db.query<{layout:any}>('select layout from levels where id=$1',[courses[0].id])).rows[0].layout;
 // Exercise conversion of a standalone life both with and without an existing coin.
 oldLayout.powerups.push({x:1,y:22,kind:'life'},{x:2,y:22,kind:'life'});oldLayout.items.push({x:1,y:22});
 await db.query('insert into levels(id,creator_id,title,difficulty,layout,published) values($1,$2,$3,$4,$5,false),($6,$2,$7,$4,$5,true)', [DRAFT,A,'Saved draft','easy',oldLayout,COMMUNITY,'Community']);
 await role('authenticated',A);
 oldAttempt=(await db.query<{id:string}>('insert into play_attempts(user_id,level_id) values($1,$2) returning id',[A,courses[0].id])).rows[0].id;
 await db.query('select complete_attempt($1,100,0)',[oldAttempt]);
 await db.query('insert into ratings(user_id,level_id,score) values($1,$2,4)',[A,courses[0].id]);
 await db.query('insert into favorites(user_id,level_id) values($1,$2)',[A,courses[0].id]);
 oldTest=(await db.query<{result:{id:string}}>('select start_draft_playtest($1,1) result',[DRAFT])).rows[0].result.id;
 await db.query('select complete_draft_playtest($1,100,0)',[oldTest]);
 before=await preservation();await db.exec(read(names.at(-1)!));
},30000);
afterAll(()=>db.close());

it('upgrades populated data without changing accounts, history, interactions, awards or course identities',async()=>{
 expect(await preservation()).toEqual(before);
 expect((await db.query('select score,collected,total_items,small_only from play_attempts where id=$1',[oldAttempt])).rows[0]).toEqual({score:null,collected:null,total_items:null,small_only:null});
 const rows=(await db.query('select id,title,description,difficulty,layout,official_order from levels where official_order is not null order by official_order')).rows;
 expect(rows).toEqual(courses.map(({officialOrder,...c})=>({...c,official_order:officialOrder})));
 expect((await db.query("select distinct layout->>'timeLimit' time,revision from levels")).rows).toEqual([{time:'150',revision:2}]);
 const layout=(await db.query<{layout:any}>('select layout from levels where id=$1',[DRAFT])).rows[0].layout;
 expect(JSON.stringify(layout)).not.toContain('life');expect(layout.items.filter((p:any)=>p.x===1&&p.y===22)).toHaveLength(1);expect(layout.items).toContainEqual({x:2,y:22});
 expect((await db.query('select count(*)::int n from achievements')).rows[0]).toEqual({n:21});
 expect((await db.query("select count(*)::int n from player_achievements where achievement_code like 'official_%'")).rows[0]).toEqual({n:0});
});
it('invalidates old draft approval and restores published immutability',async()=>{
 await role('authenticated',A);await expect(db.query('select publish_level($1,1)',[DRAFT])).rejects.toThrow();
 await expect(db.query('select publish_level($1,2)',[DRAFT])).rejects.toThrow(/playtest/);
 await expect(db.query("update levels set title='overwrite' where id=$1",[COMMUNITY])).rejects.toThrow();
 const layout=(await db.query<{layout:unknown}>('select layout from levels where id=$1',[COMMUNITY])).rows[0].layout;
 await expect(db.query("select save_draft($1,2,'overwrite','','easy',$2)",[COMMUNITY,layout])).rejects.toThrow(/immutable/);
 await expect(db.query('select complete_draft_playtest($1,100,0)',[oldTest])).rejects.toThrow();
});
it.each([0,1,2,3,4,5])('awards the three independent official challenges for course %i and retries safely',async index=>{
 const id=await attempt(B,courses[index].id);const total=coinCount(index);
 await complete(id,14999,12345,total,total,true);await complete(id,14999,12345,total,total,true);
 expect((await db.query('select achievement_code from player_achievements where player_id=$1 and achievement_code like $2 order by achievement_code',[B,`official_${index+1}_%`])).rows).toEqual(['all_coins','small_only','under_15s'].map(code=>({achievement_code:`official_${index+1}_${code}`})));
 await expect(complete(id,14999,12346,total,total,true)).rejects.toThrow(/cannot be changed/);
});
it('keeps challenge boundaries independent and excludes community runs',async()=>{
 const id=await attempt(C);await complete(id,15000,100,coinCount(0)-1,coinCount(0),false);
 expect((await db.query("select achievement_code from player_achievements where achievement_code like 'official_%'")).rows).toEqual([]);
 const community=await attempt(C,COMMUNITY);const total=(await db.query<{n:number}>("select jsonb_array_length(layout->'items')+(select count(*)::int from jsonb_array_elements(layout->'blocks') b where b->>'content'='coin') n from levels where id=$1",[COMMUNITY])).rows[0].n;
 await complete(community,100,200,total,total,true);
 expect((await db.query("select achievement_code from player_achievements where achievement_code like 'official_%'")).rows).toEqual([]);
 const small=await attempt(C);await complete(small,15000,300,0,coinCount(0),true);
 expect((await db.query("select achievement_code from player_achievements where achievement_code like 'official_%'")).rows).toEqual([{achievement_code:'official_1_small_only'}]);
});
it('rejects foreign, anonymous, direct and malformed result writes',async()=>{
 const id=await attempt(A);await role('authenticated',B);await expect(complete(id)).rejects.toThrow(/not found/);
 await role('anon');await expect(complete(id)).rejects.toThrow();await expect(db.query("select * from course_leaderboard($1,'time')",[courses[0].id])).rejects.toThrow();
 await role('authenticated',A);
 const invalid: [number|null,number|null,number|null,number|null,boolean|null][] = [[null,500,0,coinCount(0),false],[100,null,0,coinCount(0),false],[100,-1,0,coinCount(0),false],[100,1000000001,0,coinCount(0),false],[100,500,null,coinCount(0),false],[100,500,-1,coinCount(0),false],[100,500,coinCount(0)+1,coinCount(0),false],[100,500,0,null,false],[100,500,0,coinCount(0),null]];
 for(const values of invalid)await expect(complete(id,...values)).rejects.toThrow(/Invalid/);
 await expect(complete(id,100,500,0,coinCount(0)+1,false)).rejects.toThrow(/coin count/);
 await expect(db.query('update play_attempts set score=999 where id=$1',[id])).rejects.toThrow();
 await expect(db.query('insert into play_attempts(user_id,level_id,score) values($1,$2,999)',[A,courses[0].id])).rejects.toThrow();
 await expect(db.query("insert into player_achievements(player_id,achievement_code) values($1,'official_2_all_coins')",[A])).rejects.toThrow();
 const fresh=await attempt(A,courses[0].id,false);await expect(complete(fresh,60000)).rejects.toThrow(/wall-clock/);
});
it('chooses an actual best completed run for each mode, retains legacy time records, shares ties and keeps personal records private',async()=>{
 await complete(await attempt(A),500,1000);await complete(await attempt(A),800,9000);
 await complete(await attempt(C),500,9000);
 await role('authenticated',A);
 const time=(await db.query("select * from course_leaderboard($1,'time')",[courses[0].id])).rows;
 expect(time[0]).toMatchObject({rank:1,display_name:'Records A',elapsed_ms:100,score:null});
 const score=(await db.query("select * from course_leaderboard($1,'score')",[courses[0].id])).rows;
 expect(score).toEqual([{rank:1,display_name:'Records B',elapsed_ms:14999,score:12345},{rank:2,display_name:'Records C',elapsed_ms:500,score:9000},{rank:2,display_name:'Records A',elapsed_ms:800,score:9000}]);
 expect((await db.query('select * from own_progress() where level_id=$1',[courses[0].id])).rows).toEqual([{level_id:courses[0].id,best_ms:100}]);
 expect((await db.query('select id from play_attempts where user_id=$1',[B])).rows).toEqual([]);
 await expect(db.query("select * from course_leaderboard($1,'unknown')",[courses[0].id])).rejects.toThrow(/Choose/);
});
it('limits both leaderboard modes to 50 deterministically ranked players',async()=>{
 await db.exec('reset role');
 for(let i=0;i<55;i++){
  const user=randomUUID();await db.query('insert into auth.users values($1,$2,$3)',[user,{display_name:`Rank ${i}`},`${i}@example.test`]);
  await db.query('insert into play_attempts(user_id,level_id,started_at,completed_at,elapsed_ms,deaths,score,collected,total_items,small_only) values($1,$2,now()-interval \'1 minute\',now(),$3,0,$4,0,$5,false)',[user,courses[5].id,i+1,1000-i,coinCount(5)]);
 }
 await role('authenticated',A);for(const mode of ['time','score']){
  const first=(await db.query('select * from course_leaderboard($1,$2)',[courses[5].id,mode])).rows;
  expect(first).toHaveLength(50);expect((await db.query('select * from course_leaderboard($1,$2)',[courses[5].id,mode])).rows).toEqual(first);
 }
});
