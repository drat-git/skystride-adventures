import {afterAll,beforeAll,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readdirSync,readFileSync} from 'node:fs';
import {validateLayoutV2,type LayoutV2} from '../src/course-format';
import {newEditorLayout} from '../src/editor-tools';
const db=new PGlite();
beforeAll(async()=>{await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);for(const file of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort())await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));},30000);
afterAll(()=>db.close());
const valid=async(layout:LayoutV2)=>(await db.query<{valid:boolean}>('select private.valid_level_layout($1::jsonb) valid',[JSON.stringify(layout)])).rows[0].valid;
function filled(budget:number){const l=newEditorLayout();l.cols=512;l.terrain=[{x:0,y:23,width:512}];let remain=budget-512,x=0;while(remain>0){const width=Math.min(512-x,remain);l.platforms.push({x,y:0,width});remain-=width;x++;}return l;}
it('accepts the exact expanded-cell budget in both validators',async()=>{const l=filled(32768);expect(()=>validateLayoutV2(l)).not.toThrow();expect(await valid(l)).toBe(true);});
it('rejects an over-budget overlapping layout even when JSON/entity counts are small',async()=>{const l=filled(32769);expect(l.platforms.length).toBeLessThan(100);expect(()=>validateLayoutV2(l)).toThrow(/rendering budget/);expect(await valid(l)).toBe(false);});
it('counts obstacle area, and preserves all six official records',async()=>{const l=newEditorLayout();l.cols=512;l.obstacles=Array.from({length:100},(_,x)=>({x,y:0,width:512-x,height:20,kind:'ruin' as const}));expect(()=>validateLayoutV2(l)).toThrow(/rendering budget/);expect(await valid(l)).toBe(false);expect((await db.query<{n:number}>('select count(*)::int n from levels where official_order is not null')).rows[0].n).toBe(6);});
