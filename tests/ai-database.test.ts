import { beforeAll,afterAll,it,expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync,readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const db=new PGlite(),A=randomUUID(),B=randomUUID();
const directory=new URL('../supabase/migrations/',import.meta.url);
const files=readdirSync(directory).filter(n=>n.endsWith('.sql')).sort();
const sql=(n:string)=>readFileSync(new URL(n,directory),'utf8');
let before:unknown;
async function snapshot(){return (await db.query(`select jsonb_build_object('users',(select jsonb_agg(t order by id) from auth.users t),'profiles',(select jsonb_agg(t order by id) from profiles t),'levels',(select jsonb_agg(t order by id) from levels t)) data`)).rows[0];}
async function role(name:string){await db.exec('reset role;set role '+name);}
const take=(id=A,limit=200)=>db.query<{result:{allowed:boolean;retry_after:number}}>('select take_ai_quota($1,$2) result',[id,limit]);
beforeAll(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb,email text);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of files.slice(0,-1))await db.exec(sql(f));
 await db.query('insert into auth.users values($1,$2,$3),($4,$5,$6)',[A,{display_name:'AI Test A'},'a@example.test',B,{display_name:'AI Test B'},'b@example.test']);
 before=await snapshot();await db.exec(sql(files.at(-1)!));
},30000);
afterAll(()=>db.close());
it('upgrades populated databases without changing accounts or existing courses',async()=>expect(await snapshot()).toEqual(before));
it('denies anonymous/authenticated quota calls and direct counter access',async()=>{
 for(const r of ['anon','authenticated']){await role(r);await expect(take()).rejects.toThrow(/permission/);await expect(db.query('select * from private.ai_usage')).rejects.toThrow(/permission/);await expect(db.query('select private.take_ai_quota_impl($1,200)',[A])).rejects.toThrow(/permission/);}
});
it('allows only five requests per minute per account and increments counters once',async()=>{
 await role('service_role');const results=await Promise.all(Array.from({length:7},()=>take()));
 expect(results.filter(r=>r.rows[0].result.allowed)).toHaveLength(5);expect(results[6].rows[0].result.retry_after).toBeGreaterThan(0);
 expect((await take(B)).rows[0].result.allowed).toBe(true);
 await role('postgres');expect((await db.query('select requests from private.ai_usage where user_id=$1 order by bucket_key',[A])).rows).toEqual([{requests:5},{requests:5}]);
});
it('enforces daily per-account and project caps independently',async()=>{
 await db.query("update private.ai_usage set requests=50 where bucket_key=$1",['day:'+A]);
 await db.query("update private.ai_usage set requests=0 where bucket_key like 'minute:%'");
 await role('service_role');expect((await take(A)).rows[0].result.allowed).toBe(false);expect((await take(B)).rows[0].result.allowed).toBe(true);
 expect((await take(B,7)).rows[0].result.allowed).toBe(false);
 await expect(take(randomUUID())).rejects.toThrow(/Invalid/);await expect(take(B,10001)).rejects.toThrow(/Invalid/);
});
it('expires old counters and removes user counters when their account is deleted',async()=>{
 await role('postgres');await db.query("insert into private.ai_usage values('old',now()-interval '3 days',$1,1)",[B]);
 await role('service_role');await take(B);
 await role('postgres');expect((await db.query("select * from private.ai_usage where bucket_key='old'")).rows).toHaveLength(0);
 await db.query('delete from auth.users where id=$1',[B]);expect((await db.query('select * from private.ai_usage where user_id=$1',[B])).rows).toHaveLength(0);
 expect((await db.query("select requests from private.ai_usage where bucket_key='global-day'")).rows[0]).toEqual({requests:8});
});
