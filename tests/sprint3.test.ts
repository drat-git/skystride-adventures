import { afterAll,beforeAll,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { historicalCourse, seedHistoricalV1 } from './fixtures/historical-v1';
const db=new PGlite();
const A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',L=historicalCourse.id;
let draft:string,attempt:string;
async function role(name:string,user=''){await db.exec(`reset role;set role ${name};`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);}
async function start(user=A){return (await db.query<{id:string}>('insert into play_attempts(user_id,level_id) values($1,$2) returning id',[user,L])).rows[0].id;}
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of ['001_core.sql','002_trigger_privileges_and_indexes.sql','20261019144913_sprint3_progress_and_drafts.sql'])await db.exec(readFileSync(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 await db.query('insert into auth.users values($1,$2),($3,$4)',[A,{display_name:'Player A'},B,{display_name:'Player B'}]);
 await seedHistoricalV1(db);
},30000);
afterAll(async()=>{await db.close();});
it('saves and reloads an own private draft and awards creation once',async()=>{
 await role('authenticated',A);
 draft=(await db.query<{id:string}>('insert into levels(creator_id,title,difficulty,layout) values($1,$2,$3,$4) returning id',[A,'Draft','easy',historicalCourse.layout])).rows[0].id;
 await db.query("update levels set title='Edited draft' where id=$1",[draft]);
 expect((await db.query('select title,published,layout from levels where id=$1',[draft])).rows[0]).toEqual({title:'Edited draft',published:false,layout:historicalCourse.layout});
 await db.query('insert into levels(creator_id,title,difficulty,layout) values($1,$2,$3,$4)',[A,'Another','easy',historicalCourse.layout]);
 expect((await db.query('select achievement_code from player_achievements')).rows).toEqual([{achievement_code:'first_created_level'}]);
});
it('denies other-account/guest draft reads and writes, publishing and award forgery',async()=>{
 await role('authenticated',B);expect((await db.query('select * from levels where id=$1',[draft])).rows).toHaveLength(0);
 expect((await db.query("update levels set title='Stolen' where id=$1 returning id",[draft])).rows).toHaveLength(0);
 await expect(db.query('insert into levels(creator_id,title,difficulty,layout) values($1,$2,$3,$4)',[A,'Stolen','easy',historicalCourse.layout])).rejects.toThrow();
 expect((await db.query('select * from player_achievements')).rows).toHaveLength(0);
 await expect(db.query("insert into player_achievements values($1,'first_completion',now())",[B])).rejects.toThrow();
 await role('authenticated',A);await expect(db.query('update levels set published=true where id=$1',[draft])).rejects.toThrow();
 await expect(db.query('update levels set creator_id=$1 where id=$2',[B,draft])).rejects.toThrow();
 await role('anon');expect((await db.query('select * from levels')).rows).toHaveLength(1);
 await expect(db.query('select * from achievements')).rejects.toThrow();
 await expect(db.query('insert into levels(creator_id,title,difficulty,layout) values($1,$2,$3,$4)',[A,'Guest','easy',historicalCourse.layout])).rejects.toThrow();
});
it('rejects malformed geometry at the database boundary',async()=>{
 await role('authenticated',A);
 for(const layout of [null,{}, {...historicalCourse.layout,start:null},{...historicalCourse.layout,finish:historicalCourse.layout.start},{...historicalCourse.layout,finish:{...historicalCourse.layout.start,extra:true}},{...historicalCourse.layout,start:{x:1,y:1}},{...historicalCourse.layout,platforms:[{x:0,y:12,width:25}]},{...historicalCourse.layout,hazards:[{x:1,y:11}]},{...historicalCourse.layout,checkpoints:[{x:2,y:11},{x:2,y:11}]}]){
  await expect(db.query('update levels set layout=$1 where id=$2',[layout,draft])).rejects.toThrow();
 }
});
it('starts only published own attempts with server-generated timing',async()=>{
 await role('authenticated',A);attempt=await start();
 await expect(start(B)).rejects.toThrow();
 await expect(db.query('insert into play_attempts(user_id,level_id) values($1,$2)',[A,draft])).rejects.toThrow();
 await expect(db.query("insert into play_attempts(user_id,level_id,started_at) values($1,$2,now()-interval '1 hour')",[A,L])).rejects.toThrow();
 await expect(db.query('update play_attempts set elapsed_ms=1 where id=$1',[attempt])).rejects.toThrow();
});
it('checks ownership, duration and deaths before accepting a result',async()=>{
 await role('authenticated',B);await expect(db.query('select complete_attempt($1,100,0)',[attempt])).rejects.toThrow(/Attempt not found/);
 await role('anon');await expect(db.query('select complete_attempt($1,100,0)',[attempt])).rejects.toThrow();
 await role('authenticated',A);
 for(const [time,deaths] of [[-1,0],[null,0],[1,-1],[1,null],[86400001,0],[1,100001],[3600000,0]])await expect(db.query('select complete_attempt($1,$2,$3)',[attempt,time,deaths])).rejects.toThrow();
});
it('atomically saves completion and awards; identical retry is idempotent',async()=>{
 await role('authenticated',A);await db.query('select complete_attempt($1,500,2)',[attempt]);await db.query('select complete_attempt($1,500,2)',[attempt]);
 expect((await db.query('select elapsed_ms,deaths,completed_at is not null as complete from play_attempts where id=$1',[attempt])).rows[0]).toEqual({elapsed_ms:500,deaths:2,complete:true});
 expect((await db.query('select achievement_code from player_achievements order by achievement_code')).rows).toEqual(['first_completion','first_created_level','first_flight_under_30s'].map(achievement_code=>({achievement_code})));
 await expect(db.query('select complete_attempt($1,400,2)',[attempt])).rejects.toThrow(/cannot be changed/);
});
it('returns one best time per player, ties, and only public ranking fields',async()=>{
 await role('authenticated',A);const slower=await start();await db.query('select complete_attempt($1,800,0)',[slower]);
 await start(); // incomplete run must not be ranked
 await role('authenticated',B);const tie=await start(B);await db.query('select complete_attempt($1,500,0)',[tie]);
 expect((await db.query('select * from level_leaderboard($1)',[L])).rows).toEqual([{rank:1,display_name:'Player A',elapsed_ms:500},{rank:1,display_name:'Player B',elapsed_ms:500}]);
 expect((await db.query('select * from play_attempts where user_id=$1',[A])).rows).toHaveLength(0);
 expect((await db.query('select * from level_leaderboard($1)',[draft])).rows).toHaveLength(0);
 await role('anon');await expect(db.query('select * from level_leaderboard($1)',[L])).rejects.toThrow();
});
it('limits leaderboard output to 50 players',async()=>{
 await db.exec('reset role');await db.exec(`insert into auth.users select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,jsonb_build_object('display_name','Test '||i) from generate_series(1,55) i;
 insert into play_attempts(user_id,level_id,started_at,completed_at,elapsed_ms) select id,'${L}',now()-interval '1 minute',now(),1000 from auth.users where id::text like '00000000%';`);
 await role('authenticated',A);expect((await db.query('select * from level_leaderboard($1)',[L])).rows).toHaveLength(50);
});
