import { afterAll, beforeAll, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLocalBackend, LOCAL_PUBLIC_KEY } from '../scripts/local-backend.mjs';
import courses from '../src/content/official-courses.json' with { type:'json' };
const client=url=>createClient(url,LOCAL_PUBLIC_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
const unwrap=response=>{if(response.error)throw response.error;return response.data;};
let server,a,b,anon,uidA,uidB,runId,tokenA;const faults={},draftId=randomUUID(),password='local-test-Password9';
beforeAll(async()=>{server=await createLocalBackend({port:0,faults});a=client(server.url);b=client(server.url);anon=client(server.url);},30000);
afterAll(async()=>{await Promise.allSettled([a?.auth.signOut(),b?.auth.signOut()]);await server?.close();});
it('registers two local-only users and validates passwords through real client requests',async()=>{
 const first=unwrap(await a.auth.signUp({email:'local-a@example.test',password,options:{data:{display_name:'Local A'}}}));uidA=first.user.id;tokenA=first.session.access_token;
 const second=unwrap(await b.auth.signUp({email:'local-b@example.test',password,options:{data:{display_name:'Local B'}}}));uidB=second.user.id;
 expect(first.session).toBeTruthy();expect(uidA).not.toBe(uidB);
 expect((await anon.auth.signInWithPassword({email:'local-a@example.test',password:'wrong-password'})).error).toBeTruthy();
 expect(unwrap(await a.auth.getUser()).user.id).toBe(uidA);
 expect(unwrap(await a.from('profiles').select('display_name').eq('id',uidA).single()).display_name).toBe('Local A');
});
it.each([
 ['uppercase','lowercase9!'],['lowercase','UPPERCASE9!'],['number','MixedCase!'],['symbol','MixedCase9'],
 ['space is not a symbol','MixedCase9 '],['Unicode is not an ASCII symbol','MixedCase9é'],
 ['minimum length','Aa1!aaa'],['maximum length','Aa1!'+'a'.repeat(125)]
])('rejects invalid signup passwords (%s) through the local Auth API',async(_requirement,weakPassword)=>{
 const email='password-policy-'+randomUUID()+'@example.test';
 const response=await client(server.url).auth.signUp({email,password:weakPassword,options:{data:{display_name:'Policy Test'}}});
 expect(response.error?.status).toBe(400);expect(response.error?.message).toContain('uppercase letter, one lowercase letter, one number, and one symbol');expect(response.data.user).toBeNull();expect(response.data.session).toBeNull();
 expect((await server.admin('select count(*)::int count from auth.users'))[0].count).toBe(2);
});
it.each([[8,'Aa1!aaaa'],[128,'Aa1!'+'a'.repeat(124)]])('accepts compliant signup passwords at the %i-character boundary',async(_length,validPassword)=>{
 const user=client(server.url),email='password-boundary-'+randomUUID()+'@example.test';
 const registered=unwrap(await user.auth.signUp({email,password:validPassword,options:{data:{display_name:'Policy Boundary'}}}));
 expect(registered.session).toBeTruthy();expect(registered.user.email_confirmed_at).toBeTruthy();
 unwrap(await user.auth.signOut());
 expect(unwrap(await user.auth.signInWithPassword({email,password:validPassword})).user.id).toBe(registered.user.id);
 unwrap(await user.auth.signOut());
});
it('uses the actual SQL/RLS for private profiles, drafts and write denial',async()=>{
 expect(unwrap(await a.from('profiles').select('id').eq('id',uidB))).toEqual([]);
 unwrap(await a.from('profiles').update({display_name:'Local Renamed'}).eq('id',uidA));
 expect(unwrap(await a.from('profiles').select('display_name').eq('id',uidA).single()).display_name).toBe('Local Renamed');
 expect((await b.from('levels').update({official_order:1}).eq('id',courses[0].id)).error).toBeTruthy();
 expect(unwrap(await anon.from('levels').select('id,official_order').eq('published',true))).toHaveLength(6);
});
const fields=()=>({p_id:draftId,p_expected_revision:null,p_title:'Local V2 test',p_description:'Fixture-owned test course',p_difficulty:'easy',p_layout:courses[0].layout});
it('recovers a lost save response without creating duplicates and rejects stale or foreign changes',async()=>{
 faults.draftResponse=true;expect((await a.rpc('save_draft',fields())).error).toBeTruthy();
 const saved=unwrap(await a.rpc('save_draft',fields()));expect(saved.revision).toBe(1);
 expect(unwrap(await a.rpc('owned_levels')).filter(x=>x.id===draftId)).toHaveLength(1);
 expect(unwrap(await b.from('levels').select('id').eq('id',draftId))).toEqual([]);
 expect((await b.rpc('save_draft',fields())).error).toBeTruthy();
 unwrap(await a.rpc('save_draft',{...fields(),p_expected_revision:1,p_title:'Updated local test'}));
 const stale=await a.rpc('save_draft',{...fields(),p_expected_revision:1,p_title:'Stale'});expect(stale.status).toBe(409);expect(stale.error.code).toBe('PT409');
});
it('enforces saved-version testing and publication through the same client RPCs',async()=>{
 expect((await a.rpc('publish_level',{p_level_id:draftId,p_expected_revision:2})).error).toBeTruthy();
 const test=unwrap(await a.rpc('start_draft_playtest',{p_level_id:draftId,p_expected_revision:2}));
 expect((await b.rpc('complete_draft_playtest',{p_test_id:test.id,p_elapsed_ms:100,p_deaths:0})).error).toBeTruthy();
 unwrap(await a.rpc('complete_draft_playtest',{p_test_id:test.id,p_elapsed_ms:100,p_deaths:0}));
 expect(unwrap(await a.rpc('publish_level',{p_level_id:draftId,p_expected_revision:2})).published).toBe(true);
 expect(unwrap(await b.from('levels').select('id').eq('id',draftId).single()).id).toBe(draftId);
 expect(unwrap(await a.rpc('own_progress'))).toEqual([]);
});
it('supports attempts, retries, progress, ratings, favorites and private interactions',async()=>{
 runId=unwrap(await b.from('play_attempts').insert({user_id:uidB,level_id:draftId}).select('id').single()).id;
 faults.completion=true;expect((await b.rpc('complete_attempt',{p_attempt_id:runId,p_elapsed_ms:100,p_deaths:1})).error).toBeTruthy();
 unwrap(await b.rpc('complete_attempt',{p_attempt_id:runId,p_elapsed_ms:100,p_deaths:1}));
 unwrap(await b.from('ratings').upsert({user_id:uidB,level_id:draftId,score:4},{onConflict:'user_id,level_id'}));
 faults.favoriteResponse=true;expect((await b.from('favorites').upsert({user_id:uidB,level_id:draftId},{onConflict:'user_id,level_id',ignoreDuplicates:true})).error).toBeTruthy();
 unwrap(await b.from('favorites').upsert({user_id:uidB,level_id:draftId},{onConflict:'user_id,level_id',ignoreDuplicates:true}));
 expect(unwrap(await b.rpc('own_progress'))).toEqual([{level_id:draftId,best_ms:100}]);
 expect(unwrap(await a.from('ratings').select('*').eq('level_id',draftId))).toEqual([]);
 expect(unwrap(await a.rpc('level_statistics')).find(x=>x.level_id===draftId)).toMatchObject({rating_count:1,favorite_count:1});
 unwrap(await b.from('ratings').delete().eq('user_id',uidB).eq('level_id',draftId));
 expect(unwrap(await b.from('ratings').select('score').eq('level_id',draftId).maybeSingle())).toBeNull();
});
it('refreshes and revokes opaque sessions and keeps sign-out failures visible/retryable',async()=>{
 const old=unwrap(await a.auth.getSession()).session;
 const renewed=unwrap(await a.auth.refreshSession());expect(renewed.session.access_token).not.toBe(old.access_token);
 const expired=await fetch(server.url+'/auth/v1/user',{headers:{apikey:LOCAL_PUBLIC_KEY,authorization:'Bearer '+old.access_token}});expect(expired.status).toBe(401);
 faults.logout=true;expect((await a.auth.signOut()).error).toBeTruthy();unwrap(await a.auth.signOut());
 expect((await a.auth.getSession()).data.session).toBeNull();unwrap(await a.auth.signInWithPassword({email:'local-a@example.test',password}));
 expect(unwrap(await a.rpc('owned_levels')).find(x=>x.id===draftId).published).toBe(true);
});
it('rejects external origins, forged tokens, arbitrary columns and admin HTTP routes',async()=>{
 expect((await fetch(server.url+'/rest/v1/levels',{headers:{apikey:LOCAL_PUBLIC_KEY,origin:'https://untrusted.example'}})).status).toBe(403);
 expect((await fetch(server.url+'/rest/v1/levels',{headers:{apikey:LOCAL_PUBLIC_KEY,origin:'http://127.0.0.1:5186'}})).status).toBe(200);
 expect((await fetch(server.url+'/rest/v1/levels',{headers:{apikey:LOCAL_PUBLIC_KEY,authorization:'Bearer '+tokenA+'forged'}})).status).toBe(401);
 expect((await fetch(server.url+'/admin',{headers:{apikey:LOCAL_PUBLIC_KEY}})).status).toBe(404);
 expect((await anon.from('levels').select('id;drop table levels')).error).toBeTruthy();
 expect(unwrap(await anon.from('levels').select('id'))).toHaveLength(7);
});
it('allows real SDK browser preflights for read/write profile headers',async()=>{
 const headers=['apikey','authorization','content-type','accept-profile','content-profile','prefer','x-client-info','x-supabase-api-version','range','range-unit'];
 for(const method of ['GET','POST','PATCH','DELETE']){
  const response=await fetch(server.url+'/rest/v1/profiles',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:5186','Access-Control-Request-Method':method,'Access-Control-Request-Headers':headers.join(',')}});
  expect(response.status).toBe(200);expect(response.headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:5186');
  const allowed=response.headers.get('access-control-allow-headers').split(',');for(const header of headers)expect(allowed).toContain(header);
  expect(response.headers.get('access-control-allow-methods').split(',')).toContain(method);
 }
 const external=await fetch(server.url+'/rest/v1/profiles',{method:'OPTIONS',headers:{Origin:'https://untrusted.example','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'accept-profile'}});
 expect(external.status).toBe(403);expect(external.headers.get('access-control-allow-origin')).toBeNull();
});
it('persists SQL, hashed local credentials and sessions across server restarts',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'skystride-local-'));let first,second;
 try{
  first=await createLocalBackend({dataDir:directory,port:0});const user=client(first.url);
  const registered=unwrap(await user.auth.signUp({email:'persist@example.test',password,options:{data:{display_name:'Persistent'}}}));
  const auth=JSON.parse(await readFile(join(directory,'local-auth.json'),'utf8'));
  expect(JSON.stringify(auth)).not.toContain(password);expect(auth.accounts[0].hash).toHaveLength(128);expect(auth.accounts[0].salt).toHaveLength(32);
  expect((await stat(join(directory,'local-auth.json'))).mode&0o777).toBe(0o600);
  await first.close();first=undefined;second=await createLocalBackend({dataDir:directory,port:0});
  const response=await fetch(second.url+'/auth/v1/user',{headers:{apikey:LOCAL_PUBLIC_KEY,authorization:'Bearer '+registered.session.access_token}});expect(response.status).toBe(200);
  const restored=client(second.url);expect(unwrap(await restored.auth.signInWithPassword({email:'persist@example.test',password})).user.id).toBe(registered.user.id);
  expect(unwrap(await restored.from('profiles').select('display_name').eq('id',registered.user.id).single()).display_name).toBe('Persistent');
  expect((await second.admin('select count(*)::int count from local_dev.migrations'))[0].count).toBe(9);
  await restored.auth.signOut();
 }finally{await first?.close();await second?.close();await rm(directory,{recursive:true,force:true});}
},30000);
