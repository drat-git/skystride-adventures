import { afterAll,beforeAll,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { practiceLevel, type Layout } from '../src/level';
import { Backend } from '../src/backend';

const db=new PGlite();
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',C='cccccccc-cccc-4ccc-8ccc-cccccccccccc',L=practiceLevel.id;
const migrationNames=['001_core.sql','002_trigger_privileges_and_indexes.sql','20261019144913_sprint3_progress_and_drafts.sql','20261109042116_sprint4_publishing_and_community.sql','20261109043347_sprint4_non_retrying_revision_conflicts.sql'];
const sql=(name:string)=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const setup=`create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`;
const id=(n:number)=>`44444444-4444-4444-8444-${String(n).padStart(12,'0')}`;
type RecordLevel={id:string;title:string;description:string;layout:Layout;revision:number;published:boolean;can_publish:boolean};
async function role(name:string,user=''){await db.exec(`reset role;set role ${name};`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);}
async function save(levelId:string,revision:number|null=null,title='Draft',layout=practiceLevel.layout):Promise<RecordLevel>{
 return (await db.query<{result:RecordLevel}>('select save_draft($1,$2,$3,$4,$5,$6) result',[levelId,revision,title,'Description','easy',layout])).rows[0].result;
}
async function startTest(levelId:string,revision=1){return (await db.query<{result:{id:string;level:RecordLevel}}>('select start_draft_playtest($1,$2) result',[levelId,revision])).rows[0].result;}
async function completeTest(testId:string,time:number|null=100,deaths:number|null=0){return db.query('select complete_draft_playtest($1,$2,$3)',[testId,time,deaths]);}
async function publish(levelId:string,revision=1){return (await db.query<{result:RecordLevel}>('select publish_level($1,$2) result',[levelId,revision])).rows[0].result;}
async function attempt(user:string,levelId=L){return (await db.query<{id:string}>('insert into play_attempts(user_id,level_id) values($1,$2) returning id',[user,levelId])).rows[0].id;}
async function stats(levelId=L){return (await db.query<{level_id:string;average_rating:string|null;rating_count:number;favorite_count:number}>('select * from level_statistics() where level_id=$1',[levelId])).rows[0];}
let legacyAttempt:string,legacyDraft:string,legacySnapshot:unknown;
beforeAll(async()=>{
 await db.exec(setup);
 for(const name of migrationNames.slice(0,3))await db.exec(sql(name));
 await db.query('insert into auth.users values($1,$2),($3,$4),($5,$6)',[A,{display_name:'Player A'},B,{display_name:'Player B'},C,{display_name:'Player C'}]);
 await db.exec(readFileSync(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
 // A renamed seed proves the timed achievement is tied to stable identity.
 await db.query("update levels set title='Renamed First Flight' where id=$1",[L]);
 await role('authenticated',A);
 legacyDraft=(await db.query<{id:string}>('insert into levels(creator_id,title,difficulty,layout) values($1,$2,$3,$4) returning id',[A,'Legacy draft','easy',practiceLevel.layout])).rows[0].id;
 legacyAttempt=await attempt(A);
 await db.query('select complete_attempt($1,300,2)',[legacyAttempt]);
 await db.query('insert into ratings(user_id,level_id,score) values($1,$2,4)',[A,L]);
 await db.query('insert into favorites(user_id,level_id) values($1,$2)',[A,L]);
 await db.exec('reset role');
 legacySnapshot=(await db.query(`select jsonb_build_object('profiles',(select jsonb_agg(p order by id) from profiles p),'levels',(select jsonb_agg(l order by id) from levels l),'attempts',(select jsonb_agg(a order by id) from play_attempts a),'ratings',(select jsonb_agg(r order by user_id,level_id) from ratings r),'favorites',(select jsonb_agg(f order by user_id,level_id) from favorites f),'awards',(select jsonb_agg(a order by player_id,achievement_code) from player_achievements a)) snapshot`)).rows[0];
 for(const name of migrationNames.slice(3))await db.exec(sql(name));
},30000);
afterAll(async()=>{await db.close();});

it('upgrades populated records without changing existing profiles, levels, attempts, interactions or awards',async()=>{
 await db.exec('reset role');
 const current=(await db.query(`select jsonb_build_object('profiles',(select jsonb_agg(p order by id) from profiles p),'levels',(select jsonb_agg(to_jsonb(l)-'revision' order by id) from levels l),'attempts',(select jsonb_agg(a order by id) from play_attempts a),'ratings',(select jsonb_agg(r order by user_id,level_id) from ratings r),'favorites',(select jsonb_agg(f order by user_id,level_id) from favorites f),'awards',(select jsonb_agg(a order by player_id,achievement_code) from player_achievements a)) snapshot`)).rows[0];
 expect(current).toEqual(legacySnapshot);
 expect((await db.query('select distinct revision from levels')).rows).toEqual([{revision:1}]);
});
it('installs all migrations cleanly into a fresh database',async()=>{
 const fresh=new PGlite();try{await fresh.exec(setup);for(const name of migrationNames)await fresh.exec(sql(name));
 await fresh.exec(readFileSync(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
 expect((await fresh.query('select revision from levels')).rows).toEqual([{revision:1}]);
 expect((await fresh.query('select * from draft_playtests')).rows).toEqual([]);
 }finally{await fresh.close();}
},30000);
it('uses stable create IDs and optimistic revisions, including lost-response retry',async()=>{
 await role('authenticated',A);
 const first=await save(id(1));expect(first).toMatchObject({id:id(1),revision:1,published:false,can_publish:false});
 expect(await save(id(1))).toEqual(first);
 const changed=await save(id(1),1,'Changed');expect(changed.revision).toBe(2);
 expect(await save(id(1),1,'Changed')).toEqual(changed);
 expect((await save(id(1),2,'Changed')).revision).toBe(2);
 await expect(save(id(1),1,'Stale edits')).rejects.toThrow(/another tab/);
 await expect(save(id(1),null,'Ambiguous different create')).rejects.toThrow(/another tab/);
 expect((await db.query('select count(*)::int count from levels where id=$1',[id(1)])).rows[0]).toEqual({count:1});
});
it('rejects invalid metadata and null/invalid expected revisions without deleting local-safe records',async()=>{
 await role('authenticated',A);
 await expect(save(id(2),null,' ')).rejects.toThrow();
 await expect(save(id(2),0)).rejects.toThrow(/revision/);
 await expect(save(id(2),1)).rejects.toThrow(/not found/);
 for(const [title,description,difficulty] of [['x'.repeat(61),'','easy'],['Valid','x'.repeat(281),'easy'],['Valid','','unknown']]){
  await expect(db.query('select save_draft($1,null,$2,$3,$4,$5)',[id(2),title,description,difficulty,practiceLevel.layout])).rejects.toThrow();
 }
});
it('denies direct revision, publication, ownership and draft writes and forged playtest results',async()=>{
 await role('authenticated',A);
 for(const query of ["update levels set revision=99 where id=$1","update levels set published=true where id=$1","update levels set title='Bypassed' where id=$1","update levels set creator_id=null where id=$1"]){await expect(db.query(query,[id(1)])).rejects.toThrow();}
 await expect(db.query('insert into levels(creator_id,title,difficulty,layout) values($1,$2,$3,$4)',[A,'Bypass','easy',practiceLevel.layout])).rejects.toThrow();
 await expect(db.query('insert into draft_playtests(user_id,level_id,revision) values($1,$2,2)',[A,id(1)])).rejects.toThrow();
 const test=await startTest(id(1),2);
 await expect(db.query('update draft_playtests set completed_at=now(),elapsed_ms=1,deaths=0 where id=$1',[test.id])).rejects.toThrow();
 await expect(db.query("insert into player_achievements values($1,'first_flight_under_30s',now())",[A])).rejects.toThrow();
});
it('keeps private drafts and tests isolated across accounts and anonymous calls',async()=>{
 await role('authenticated',A);const test=await startTest(id(1),2);
 await role('authenticated',B);
 expect((await db.query('select * from levels where id=$1',[id(1)])).rows).toEqual([]);
 expect((await db.query('select * from draft_playtests where id=$1',[test.id])).rows).toEqual([]);
 expect((await db.query('select * from owned_levels()')).rows).toEqual([]);
 await expect(save(id(1),null)).rejects.toThrow(/not found/);
 await expect(startTest(id(1),2)).rejects.toThrow(/not found/);
 await expect(completeTest(test.id)).rejects.toThrow(/not found/);
 await expect(publish(id(1),2)).rejects.toThrow(/not found/);
 await role('anon');
 for(const query of ['select owned_levels()','select start_draft_playtest($1,2)','select publish_level($1,2)'])await expect(db.query(query,query.includes('$1')?[id(1)]:[])).rejects.toThrow();
 await expect(save(id(1))).rejects.toThrow();await expect(completeTest(test.id)).rejects.toThrow();
});
it('requires completion of the current saved revision before publishing',async()=>{
 await role('authenticated',A);await save(id(3));
 await expect(publish(id(3))).rejects.toThrow(/Finish a playtest/);
 const test=await startTest(id(3));expect(test.level).toMatchObject({id:id(3),revision:1,layout:practiceLevel.layout});
 await expect(publish(id(3))).rejects.toThrow(/Finish a playtest/);
 await completeTest(test.id);
 expect((await db.query<{r:RecordLevel}>('select owned_levels() r')).rows.find(x=>x.r.id===id(3))?.r.can_publish).toBe(true);
 const published=await publish(id(3));expect(published).toMatchObject({published:true,revision:1,can_publish:false});
 expect(await publish(id(3))).toEqual(published);
 await completeTest(test.id); // a lost completion response remains retryable after publication
});
it('keeps draft playtests separate from rankings, attempt eligibility and completion awards',async()=>{
 await role('authenticated',C);await save(id(4));const test=await startTest(id(4));await completeTest(test.id);await publish(id(4));
 expect((await db.query('select * from play_attempts')).rows).toEqual([]);
 expect((await db.query('select * from level_leaderboard($1)',[id(4)])).rows).toEqual([]);
 expect((await db.query('select achievement_code from player_achievements')).rows).toEqual([{achievement_code:'first_created_level'}]);
 await expect(db.query('insert into ratings(user_id,level_id,score) values($1,$2,5)',[C,id(4)])).rejects.toThrow();
 await expect(db.query('insert into favorites(user_id,level_id) values($1,$2)',[C,id(4)])).rejects.toThrow();
});
it('invalidates completed and in-flight tests when a saved revision changes',async()=>{
 await role('authenticated',A);await save(id(5));const completed=await startTest(id(5)),inFlight=await startTest(id(5));await completeTest(completed.id);
 const changed=await save(id(5),1,'New revision');expect(changed).toMatchObject({revision:2,can_publish:false});
 await expect(completeTest(inFlight.id)).rejects.toThrow(/changed/);
 await expect(completeTest(completed.id)).rejects.toThrow(/changed/);
 await expect(startTest(id(5),1)).rejects.toThrow(/revision changed/);
 await expect(publish(id(5),1)).rejects.toThrow(/changed/);
 await expect(publish(id(5),2)).rejects.toThrow(/Finish a playtest/);
 const current=await startTest(id(5),2);await completeTest(current.id);expect((await publish(id(5),2)).published).toBe(true);
});
it('validates playtest timing and deaths, and makes identical completion retries safe',async()=>{
 await role('authenticated',A);await save(id(6));const test=await startTest(id(6));
 for(const [time,deaths] of [[-1,0],[null,0],[1,-1],[1,null],[86400001,0],[1,100001],[3600000,0]])await expect(completeTest(test.id,time,deaths)).rejects.toThrow();
 await completeTest(test.id,100,2);await completeTest(test.id,100,2);
 await expect(completeTest(test.id,99,2)).rejects.toThrow(/cannot be changed/);
 expect((await db.query('select elapsed_ms,deaths,completed_at>=started_at as valid_time from draft_playtests where id=$1',[test.id])).rows[0]).toEqual({elapsed_ms:100,deaths:2,valid_time:true});
});
it('returns non-retryable HTTP conflict codes for every stale-revision RPC',async()=>{
 await role('authenticated',A);await save(id(10));const test=await startTest(id(10));
 await save(id(10),1,'Changed revision');
 await expect(save(id(10),1,'Stale edits')).rejects.toMatchObject({code:'PT409'});
 await expect(startTest(id(10),1)).rejects.toMatchObject({code:'PT409'});
 await expect(completeTest(test.id)).rejects.toMatchObject({code:'PT409'});
 await expect(publish(id(10),1)).rejects.toMatchObject({code:'PT409'});
 expect((await save(id(10),2,'Current edits')).revision).toBe(3);
});
it('keeps publication immutable and creates independent unapproved copies',async()=>{
 await role('authenticated',A);
 await expect(save(id(3),1,'Modified publication')).rejects.toThrow(/immutable/);
 await expect(startTest(id(3),1)).rejects.toThrow(/already published/);
 const copy=await save(id(7),null,'Copy of draft');expect(copy).toMatchObject({id:id(7),published:false,revision:1,can_publish:false});
 await expect(publish(id(7))).rejects.toThrow(/Finish a playtest/);
 await db.exec('reset role');await expect(db.query("update levels set title='Admin rewrite' where id=$1",[id(3)])).rejects.toThrow(/immutable/);
 await role('authenticated',B);expect((await db.query('select id from levels where id=$1',[id(3)])).rows).toEqual([{id:id(3)}]);
 expect(await attempt(B,id(3))).toMatch(/[a-f0-9-]{36}/);
});
it('matches item geometry rules: unique in-bounds points outside platforms/hazards, airborne allowed',async()=>{
 await role('authenticated',A);
 const ground=practiceLevel.layout.platforms[0];
 for(const items of [[{x:-1,y:0}],[{x:24,y:1}],[{x:1,y:13}],[{x:1,y:1},{x:1,y:1}],[{x:ground.x,y:ground.y}],practiceLevel.layout.hazards.slice(0,1)]){
  expect(items.length).toBeGreaterThan(0);
  await expect(save(id(8),null,'Invalid item',{...practiceLevel.layout,items})).rejects.toThrow();
 }
 expect((await save(id(8),null,'Airborne item',{...practiceLevel.layout,items:[{x:1,y:1}]})).layout.items).toEqual([{x:1,y:1}]);
 // JSON numbers with different formatting still describe the same tile.
 const equivalentNumbers=JSON.stringify({...practiceLevel.layout,items:[{x:1,y:1}]}).replace('"items":[{"x":1,"y":1}]','"items":[{"x":1,"y":1},{"x":1.0,"y":1.0}]');
 await expect(db.query('select save_draft($1,null,$2,$3,$4,$5::jsonb)',[id(9),'Duplicate numbers','','easy',equivalentNumbers])).rejects.toThrow();
});
it('exposes public aggregate totals without exposing other players individual records',async()=>{
 await role('authenticated',B);await attempt(B);
 await db.query('insert into ratings(user_id,level_id,score) values($1,$2,2)',[B,L]);
 await db.query('insert into favorites(user_id,level_id) values($1,$2)',[B,L]);
 expect((await db.query('select user_id from ratings')).rows).toEqual([{user_id:B}]);
 expect((await db.query('select user_id from favorites')).rows).toEqual([{user_id:B}]);
 const expected={level_id:L,average_rating:'3.0000000000000000',rating_count:2,favorite_count:2};
 expect(await stats()).toEqual(expected);
 await role('anon');expect(await stats()).toEqual(expected);
 expect(await stats(legacyDraft)).toBeUndefined();
 await expect(db.query('select * from ratings')).rejects.toThrow();await expect(db.query('select * from favorites')).rejects.toThrow();
});
it('supports rating updates/removals with timestamps only changing on score changes',async()=>{
 await role('authenticated',A);
 const initial=(await db.query('select updated_at from ratings where level_id=$1',[L])).rows[0];
 await db.query('insert into ratings(user_id,level_id,score) values($1,$2,4) on conflict(user_id,level_id) do update set score=excluded.score',[A,L]);
 expect((await db.query('select updated_at from ratings where level_id=$1',[L])).rows[0]).toEqual(initial);
 await db.query('insert into ratings(user_id,level_id,score) values($1,$2,5) on conflict(user_id,level_id) do update set score=excluded.score',[A,L]);
 expect((await db.query('select updated_at from ratings where level_id=$1',[L])).rows[0]).not.toEqual(initial);
 expect((await stats())?.average_rating).toBe('3.5000000000000000');
 await db.query('delete from ratings where user_id=$1 and level_id=$2',[A,L]);
 expect(await stats()).toMatchObject({average_rating:'2.0000000000000000',rating_count:1});
 await db.query('delete from ratings where user_id=$1 and level_id=$2',[A,L]);
});
it('rejects rating boundaries and non-integer client values, while favorites are retry safe',async()=>{
 await role('authenticated',A);
 for(const score of [0,6,-1,'1.5','hello',null])await expect(db.query('insert into ratings(user_id,level_id,score) values($1,$2,$3)',[A,L,score])).rejects.toThrow();
 for(const score of [1.5,NaN,Infinity,0,6,'5',undefined])await expect(Backend.prototype.setRating.call({} as Backend,A,L,score as number)).rejects.toThrow(/integer rating/);
 await db.query('insert into favorites(user_id,level_id) values($1,$2) on conflict(user_id,level_id) do nothing',[A,L]);
 await db.query('insert into favorites(user_id,level_id) values($1,$2) on conflict(user_id,level_id) do nothing',[A,L]);
 expect((await stats())?.favorite_count).toBe(2);
 await db.query('delete from favorites where user_id=$1 and level_id=$2',[A,L]);await db.query('delete from favorites where user_id=$1 and level_id=$2',[A,L]);
 expect((await stats())?.favorite_count).toBe(1);
});
it('denies rating/favorite forgery and unauthenticated/unplayed interactions',async()=>{
 await role('authenticated',A);
 await expect(db.query('insert into ratings(user_id,level_id,score) values($1,$2,5)',[B,id(3)])).rejects.toThrow();
 await expect(db.query('insert into favorites(user_id,level_id) values($1,$2)',[B,id(3)])).rejects.toThrow();
 expect((await db.query('delete from ratings where user_id=$1 returning user_id',[B])).rows).toEqual([]);
 expect((await db.query('delete from favorites where user_id=$1 returning user_id',[B])).rows).toEqual([]);
 await role('authenticated',C);
 await expect(db.query('insert into ratings(user_id,level_id,score) values($1,$2,5)',[C,L])).rejects.toThrow();
 await expect(db.query('insert into favorites(user_id,level_id) values($1,$2)',[C,L])).rejects.toThrow();
 await role('anon');await expect(db.query('insert into ratings(user_id,level_id,score) values($1,$2,5)',[C,L])).rejects.toThrow();
});
it('uses the stable First Flight ID and catalog threshold for the timed achievement',async()=>{
 await db.exec('reset role');await db.query("update achievements set threshold_ms=100 where code='first_flight_under_30s'");
 await role('authenticated',B);const exact=await attempt(B);await db.query('select complete_attempt($1,100,0)',[exact]);
 expect((await db.query("select * from player_achievements where achievement_code='first_flight_under_30s'")).rows).toEqual([]);
 const fast=await attempt(B);await db.query('select complete_attempt($1,99,0)',[fast]);
 expect((await db.query("select achievement_code from player_achievements where achievement_code='first_flight_under_30s'")).rows).toEqual([{achievement_code:'first_flight_under_30s'}]);
 await role('authenticated',C);const other=await attempt(C,id(3));await db.query('select complete_attempt($1,50,0)',[other]);
 expect((await db.query("select * from player_achievements where achievement_code='first_flight_under_30s'")).rows).toEqual([]);
});
