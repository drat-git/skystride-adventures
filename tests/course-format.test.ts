import { afterAll, beforeAll, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { validateLayout, practiceLevel, parseLevel } from '../src/level';
import { validateLayoutV2, type LayoutV2 } from '../src/course-format';
import officialCourses from '../src/content/official-courses.json';

const db = new PGlite(), A='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const V2='33333333-3333-4333-8333-000000000001', COPY='33333333-3333-4333-8333-000000000002';
const migrations=['001_core.sql','002_trigger_privileges_and_indexes.sql','20261019144913_sprint3_progress_and_drafts.sql','20261109042116_sprint4_publishing_and_community.sql','20261109043347_sprint4_non_retrying_revision_conflicts.sql','20261109055844_overhaul_v2_course_format.sql'];
const read=(name:string)=>readFileSync(new URL('../supabase/migrations/'+name,import.meta.url),'utf8');
const auth=`create role anon;create role authenticated;create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`;
const sample=():LayoutV2=>({version:2,cols:80,rows:25,theme:'overworld',timeLimit:300,start:{x:1,y:22},finish:{x:75,y:22},finishHeight:8,
 terrain:[{x:0,y:23,width:80}],platforms:[{x:4,y:18,width:3}],blocks:[{x:10,y:18,kind:'glow',content:'adaptive'}],items:[{x:12,y:17}],
 powerups:[{x:18,y:22,kind:'star'}],hazards:[{x:35,y:22,width:2,kind:'spike'}],checkpoints:[{x:5,y:22}],
 enemies:[{x:40,y:22,kind:'walker',behavior:'patrol',direction:-1,speed:40,range:4}],
 movingPlatforms:[{x:50,y:18,width:3,axis:'x',distance:5,durationMs:3000}],obstacles:[{x:60,y:20,width:2,height:3,kind:'column'}],
 decorations:[{x:64,y:22,kind:'bush'}]});
async function role(name:string,user=''){await db.exec(`reset role;set role ${name}`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);}
async function valid(value:unknown){return (await db.query<{valid:boolean}>('select private.valid_level_layout($1::jsonb) valid',[JSON.stringify(value)])).rows[0].valid;}
async function save(id=V2,revision:number|null=null,title='Version two',layout=sample()){
 return (await db.query<{result:Record<string,unknown>}>('select save_draft($1,$2,$3,$4,$5,$6) result',[id,revision,title,'All components','medium',layout])).rows[0].result;
}
let legacySnapshot:unknown;
beforeAll(async()=>{
 await db.exec(auth);for(const name of migrations.slice(0,-1))await db.exec(read(name));
 await db.query('insert into auth.users values($1,$2),($3,$4)',[A,{display_name:'Format A'},B,{display_name:'Format B'}]);
 await db.exec(readFileSync(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
 await role('authenticated',A);
 const run=(await db.query<{id:string}>('insert into play_attempts(user_id,level_id) values($1,$2) returning id',[A,practiceLevel.id])).rows[0].id;
 await db.query('select complete_attempt($1,100,0)',[run]);
 await db.query('insert into ratings(user_id,level_id,score) values($1,$2,5)',[A,practiceLevel.id]);
 await db.query('insert into favorites(user_id,level_id) values($1,$2)',[A,practiceLevel.id]);
 await db.exec('reset role');
 legacySnapshot=(await db.query(`select jsonb_build_object('profiles',(select jsonb_agg(p order by id) from profiles p),'levels',(select jsonb_agg(l order by id) from levels l),'attempts',(select jsonb_agg(a order by id) from play_attempts a),'ratings',(select jsonb_agg(r) from ratings r),'favorites',(select jsonb_agg(f) from favorites f),'awards',(select jsonb_agg(a order by achievement_code) from player_achievements a)) state`)).rows[0];
 await db.exec(read(migrations.at(-1)!));
},30000);
afterAll(()=>db.close());
it('preserves existing records and v1 validation through the additive upgrade',async()=>{
 const after=(await db.query(`select jsonb_build_object('profiles',(select jsonb_agg(p order by id) from profiles p),'levels',(select jsonb_agg(to_jsonb(l)-'official_order' order by id) from levels l),'attempts',(select jsonb_agg(a order by id) from play_attempts a),'ratings',(select jsonb_agg(r) from ratings r),'favorites',(select jsonb_agg(f) from favorites f),'awards',(select jsonb_agg(a order by achievement_code) from player_achievements a)) state`)).rows[0];
 expect(after).toEqual(legacySnapshot);expect(await valid(practiceLevel.layout)).toBe(true);expect(()=>validateLayout(practiceLevel.layout)).not.toThrow();
 expect(await valid({...practiceLevel.layout,items:[{x:1,y:12}]})).toBe(false);
});
it('installs the entire additive chain on a fresh database',async()=>{
 const fresh=new PGlite();try{await fresh.exec(auth);for(const name of migrations)await fresh.exec(read(name));
 await fresh.exec(readFileSync(new URL('../supabase/seed.sql',import.meta.url),'utf8'));
 expect((await fresh.query('select official_order,revision from levels')).rows).toEqual([{official_order:null,revision:1}]);
 }finally{await fresh.close();}
},30000);
const variants:[string,(v:LayoutV2)=>void][]=[
 ['base',()=>{}],['cave',v=>{v.theme='cave';}],['sky',v=>{v.theme='sky';}],
 ['width bounds',v=>{v.cols=512;}],['fractional source speed',v=>{v.enemies[0].speed=40.5;}],
 ...(['solid','breakable'] as const).map(kind=>[kind,(v:LayoutV2)=>{v.blocks[0]={x:10,y:18,kind,content:'none'};}] as [string,(v:LayoutV2)=>void]),
 ...(['coin','adaptive','growth','fire','star','life'] as const).map(content=>['glow '+content,(v:LayoutV2)=>{v.blocks[0].content=content;}] as [string,(v:LayoutV2)=>void]),
 ['hidden life',v=>{v.blocks[0]={x:10,y:18,kind:'hidden',content:'life'};}],
 ...(['growth','fire','star','life'] as const).map(kind=>['powerup '+kind,(v:LayoutV2)=>{v.powerups[0].kind=kind;}] as [string,(v:LayoutV2)=>void]),
 ['turtle',v=>{v.enemies[0].kind='turtle';}],
 ...(['hop','horizontal','vertical'] as const).map(behavior=>['winged '+behavior,(v:LayoutV2)=>{v.enemies[0].kind='winged';v.enemies[0].behavior=behavior;}] as [string,(v:LayoutV2)=>void]),
 ['vertical platform',v=>{v.movingPlatforms[0].axis='y';}],['lava',v=>{v.hazards[0].kind='lava';}],
 ...(['column','rock','ruin'] as const).map(kind=>['obstacle '+kind,(v:LayoutV2)=>{v.obstacles[0].kind=kind;}] as [string,(v:LayoutV2)=>void]),
 ...(['sign','bush','pine','sprout','cloud','crystal','ruin','door','terrain'] as const).map(kind=>['decoration '+kind,(v:LayoutV2)=>{v.decorations[0].kind=kind;}] as [string,(v:LayoutV2)=>void]),
 ['block support',v=>{v.start={x:10,y:17};}],['obstacle support',v=>{v.start={x:60,y:19};}],['platform support',v=>{v.start={x:4,y:17};}],
];
it.each(variants)('accepts matching client and SQL v2 component: %s',async(_name,mutate)=>{
 const v=sample();mutate(v);expect(()=>validateLayoutV2(v)).not.toThrow();expect(()=>validateLayout(v)).not.toThrow();expect(await valid(v)).toBe(true);
});
const invalid:[string,(v:any)=>void][]=[
 ['unknown version',v=>{v.version=3;}],['missing array',v=>{delete v.enemies;}],['unknown key',v=>{v.script='do things';}],
 ['pipe',v=>{v.obstacles[0].kind='pipe';}],['teleport',v=>{v.obstacles[0].destination={x:1,y:1};}],['asset URL',v=>{v.decorations[0].url='https://example.test';}],
 ['theme',v=>{v.theme='outside';}],['null theme',v=>{v.theme=null;}],['null enum',v=>{v.blocks[0].kind=null;}],['null direction',v=>{v.enemies[0].direction=null;}],
 ['cols too short',v=>{v.cols=23;}],['cols too wide',v=>{v.cols=513;}],['fractional cols',v=>{v.cols=80.5;}],['row count',v=>{v.rows=24;}],
 ['timer small',v=>{v.timeLimit=29;}],['timer large',v=>{v.timeLimit=901;}],['timer fractional',v=>{v.timeLimit=30.5;}],['bad flag',v=>{v.finishHeight=21;}],
 ['flag outside world',v=>{v.finish={x:4,y:17};v.finishHeight=20;}],['same finish',v=>{v.finish=v.start;}],['unsafe start',v=>{v.start={x:35,y:22};}],
 ['unsupported checkpoint',v=>{v.checkpoints=[{x:10,y:2}];}],['hidden spawn support',v=>{v.blocks[0]={x:10,y:18,kind:'hidden',content:'life'};v.start={x:10,y:17};}],
 ['item in terrain',v=>{v.items=[{x:1,y:23}];}],['item in obstacle',v=>{v.items=[{x:60,y:21}];}],['item in block',v=>{v.items=[{x:10,y:18}];}],
 ['powerup in hazard',v=>{v.powerups=[{x:36,y:22,kind:'fire'}];}],['duplicate item',v=>{v.items.push(v.items[0]);}],['duplicate typed entity',v=>{v.blocks.push({...v.blocks[0],kind:'solid',content:'none'});}],
 ['fractional point',v=>{v.items[0].x=1.5;}],['point beyond bottom',v=>{v.items[0].y=25;}],['negative point',v=>{v.items[0].x=-1;}],
 ['empty glow',v=>{v.blocks[0].content='none';}],['nonempty solid',v=>{v.blocks[0].kind='solid';}],['hidden growth',v=>{v.blocks[0].kind='hidden';}],
 ['ground flying behavior',v=>{v.enemies[0].behavior='horizontal';}],['winged patrol',v=>{v.enemies[0].kind='winged';}],['enemy speed',v=>{v.enemies[0].speed=121;}],
 ['enemy range',v=>{v.enemies[0].range=0;}],['enemy fractional range',v=>{v.enemies[0].range=1.5;}],['enemy direction',v=>{v.enemies[0].direction=0;}],
 ['bad platform axis',v=>{v.movingPlatforms[0].axis='z';}],['platform x endpoint',v=>{v.movingPlatforms[0].x=75;}],
 ['platform y endpoint',v=>{v.movingPlatforms[0].axis='y';v.movingPlatforms[0].y=23;}],['platform period',v=>{v.movingPlatforms[0].durationMs=999;}],
 ['obstacle below world',v=>{v.obstacles[0].height=6;}],['terrain width',v=>{v.terrain[0].width=81;}],['excess enemies',v=>{v.enemies=Array.from({length:257},(_,i)=>({...v.enemies[0],x:i%80,y:Math.floor(i/80)}));}],
 ['excess total entities',v=>{v.cols=512;for(const [key,count] of Object.entries({terrain:512,platforms:512,blocks:1024,items:1024,decorations:1024,checkpoints:1}))v[key]=Array.from({length:count},(_,i)=>({...v[key][0],x:i%512,y:Math.floor(i/512)}));}],
];
it.each(invalid)('rejects matching client and SQL invalid v2: %s',async(_name,mutate)=>{
 const v=sample();mutate(v);expect(()=>validateLayout(v)).toThrow();expect(await valid(v)).toBe(false);
});
it('round-trips every component through save, exact playtest, publication and copying',async()=>{
 await role('authenticated',A);const first=await save();expect(first).toMatchObject({id:V2,revision:1,published:false,official_order:null,layout:sample()});
 expect(await save()).toEqual(first);
 await expect(db.query('select publish_level($1,1)',[V2])).rejects.toThrow(/Finish a playtest/);
 const test=(await db.query<{result:{id:string;level:{layout:LayoutV2}}}>('select start_draft_playtest($1,1) result',[V2])).rows[0].result;
 expect(test.level.layout).toEqual(sample());await db.query('select complete_draft_playtest($1,100,1)',[test.id]);
 const published=(await db.query<{result:Record<string,unknown>}>('select publish_level($1,1) result',[V2])).rows[0].result;
 expect(published.published).toBe(true);await expect(save(V2,1,'Change published')).rejects.toThrow(/immutable/);
 expect(await save(COPY,null,'V2 copy')).toMatchObject({revision:1,published:false,can_publish:false,official_order:null});
});
it('keeps official order server-owned and validates official record parsing',async()=>{
 await role('authenticated',A);await expect(db.query('update levels set official_order=1 where id=$1',[COPY])).rejects.toThrow();
 await db.exec('reset role');await db.query('update levels set official_order=1 where id=$1',[V2]);
 await expect(db.query('update levels set official_order=1 where id=$1',[COPY])).rejects.toThrow();
 await expect(db.query('update levels set official_order=7 where id=$1',[COPY])).rejects.toThrow();
 expect(parseLevel({...practiceLevel,layout:sample(),official_order:1}).officialOrder).toBe(1);
 expect(()=>parseLevel({...practiceLevel,official_order:7})).toThrow();
});
it('keeps v2 private data and progress isolated, with normal publication interaction eligibility',async()=>{
 await role('authenticated',B);
 expect((await db.query('select id from levels where id=$1',[COPY])).rows).toEqual([]);
 await expect(save(COPY,null,'Foreign')).rejects.toThrow(/not found/);
 expect((await db.query('select * from own_progress()')).rows).toEqual([]);
 const run=(await db.query<{id:string}>('insert into play_attempts(user_id,level_id) values($1,$2) returning id',[B,V2])).rows[0].id;
 expect((await db.query('select * from own_progress()')).rows).toEqual([]);
 await db.query('select complete_attempt($1,200,0)',[run]);
 await db.query('insert into ratings(user_id,level_id,score) values($1,$2,4)',[B,V2]);await db.query('insert into favorites(user_id,level_id) values($1,$2)',[B,V2]);
 expect((await db.query('select * from own_progress()')).rows).toEqual([{level_id:V2,best_ms:200}]);
 await role('authenticated',A);expect((await db.query('select * from own_progress()')).rows).toEqual([{level_id:practiceLevel.id,best_ms:100}]);
 await role('anon');await expect(db.query('select * from own_progress()')).rejects.toThrow();
 expect((await db.query('select * from level_statistics() where level_id=$1',[V2])).rows[0]).toMatchObject({rating_count:1,favorite_count:1});
});
it('seeds six immutable official courses matching the client manifest without replacing v1',async()=>{
 await db.exec('reset role');await db.query('update levels set official_order=null where id=$1',[V2]);
 const seed=read('20261109060418_overhaul_official_courses.sql');await db.exec(seed);
 const rows=(await db.query('select id,title,description,difficulty,layout,official_order from levels where official_order is not null order by official_order')).rows;
 expect(rows).toEqual(officialCourses.map(({officialOrder,...course})=>({...course,official_order:officialOrder})));
 const existing=(await db.query('select layout from levels where id=$1',[practiceLevel.id])).rows[0];expect(existing).toEqual({layout:practiceLevel.layout});
 await db.exec(seed);expect((await db.query('select count(*)::int count from levels where official_order is not null')).rows[0]).toEqual({count:6});
 await role('authenticated',B);expect((await db.query('select id from levels where official_order is not null')).rows).toHaveLength(6);
 await expect(db.query("update levels set official_order=6 where id=$1",[COPY])).rejects.toThrow();
});
it('aggregates full progress history beyond the Data API row cap without exposing another account',async()=>{
 await db.exec('reset role');
 await db.query(`insert into play_attempts(user_id,level_id,started_at,completed_at,elapsed_ms,deaths)
 select $1::uuid,$2::uuid,now()-interval '1 minute',now(),case when i=1001 then 1 else 900 end,0 from generate_series(1,1001) i`,[B,practiceLevel.id]);
 await role('authenticated',B);expect((await db.query('select * from own_progress() where level_id=$1',[practiceLevel.id])).rows).toEqual([{level_id:practiceLevel.id,best_ms:1}]);
 await role('authenticated',A);expect((await db.query('select * from own_progress()')).rows).toEqual([{level_id:practiceLevel.id,best_ms:100}]);
});
