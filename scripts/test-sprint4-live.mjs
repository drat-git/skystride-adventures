// Real Auth -> PostgREST -> hosted SQL/RLS. Uses dedicated test accounts only.
// Creates a private diagnostic draft; never changes an existing course or interaction.
import {createClient} from '@supabase/supabase-js';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const make=()=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const a=make(),b=make(),anon=make(),checks=[];
const output='output/sprint4/live-evidence';await mkdir(output,{recursive:true});
const ok=async(name,fn)=>{await fn();checks.push(name);console.log('PASS',name);};
const unwrap=r=>{if(r.error)throw r.error;return r.data;};
const denied=r=>assert.ok(r.error,'Expected request denial');
const draftId=randomUUID();let passed=false;
try{
 for(const [client,suffix] of [[a,'A'],[b,'B']])await ok(`Real account ${suffix} login`,async()=>unwrap(await client.auth.signInWithPassword({email:process.env[`TEST_EMAIL_${suffix}`],password:process.env[`TEST_PASSWORD_${suffix}`]})));
 const aid=unwrap(await a.auth.getUser()).user.id,bid=unwrap(await b.auth.getUser()).user.id;
 await ok('Anonymous catalog and aggregate RPC',async()=>{assert.ok(unwrap(await anon.from('levels').select('id').eq('published',true)).length);assert.ok(Array.isArray(unwrap(await anon.rpc('level_statistics'))));});
 await ok('Private profile isolation',async()=>{assert.equal(unwrap(await a.from('profiles').select('id').eq('id',bid)).length,0);assert.equal(unwrap(await b.from('profiles').select('id').eq('id',aid)).length,0);});
 const layout={version:1,cols:24,rows:14,start:{x:1,y:11},finish:{x:7,y:11},platforms:[{x:0,y:12,width:24}],hazards:[],checkpoints:[{x:3,y:11}],items:[{x:4,y:11}]};
 const fields={p_id:draftId,p_expected_revision:null,p_title:'Sprint 4 private verification',p_description:'Dedicated account diagnostic draft; not a published course.',p_difficulty:'easy',p_layout:layout};
 await ok('Stable-ID creation and ambiguous-response retry',async()=>{const first=unwrap(await a.rpc('save_draft',fields)),retry=unwrap(await a.rpc('save_draft',fields));assert.equal(first.id,draftId);assert.equal(retry.revision,1);assert.deepEqual(first,retry);});
 await ok('Draft private across accounts and anonymous sessions',async()=>{assert.equal(unwrap(await b.from('levels').select('id').eq('id',draftId)).length,0);assert.equal(unwrap(await anon.from('levels').select('id').eq('id',draftId)).length,0);denied(await b.rpc('save_draft',fields));denied(await anon.rpc('owned_levels'));});
 await ok('Untested/foreign publication and direct revision writes denied',async()=>{denied(await a.rpc('publish_level',{p_level_id:draftId,p_expected_revision:1}));denied(await b.rpc('publish_level',{p_level_id:draftId,p_expected_revision:1}));denied(await a.from('levels').update({revision:99}).eq('id',draftId));denied(await a.from('levels').update({published:true}).eq('id',draftId));});
 const test=unwrap(await a.rpc('start_draft_playtest',{p_level_id:draftId,p_expected_revision:1}));
 await ok('Saved playtest completion is owned and retry safe',async()=>{denied(await b.rpc('complete_draft_playtest',{p_test_id:test.id,p_elapsed_ms:100,p_deaths:0}));unwrap(await a.rpc('complete_draft_playtest',{p_test_id:test.id,p_elapsed_ms:100,p_deaths:0}));unwrap(await a.rpc('complete_draft_playtest',{p_test_id:test.id,p_elapsed_ms:100,p_deaths:0}));assert.equal(unwrap(await a.rpc('owned_levels')).find(x=>x.id===draftId).can_publish,true);});
 await ok('Saved edits invalidate approval and reject stale tabs',async()=>{const changed=unwrap(await a.rpc('save_draft',{...fields,p_expected_revision:1,p_title:'Sprint 4 private verification revised'}));assert.equal(changed.revision,2);assert.equal(changed.can_publish,false);denied(await a.rpc('save_draft',{...fields,p_expected_revision:1,p_title:'Stale edit'}));denied(await a.rpc('publish_level',{p_level_id:draftId,p_expected_revision:1}));denied(await a.rpc('complete_draft_playtest',{p_test_id:test.id,p_elapsed_ms:100,p_deaths:0}));});
 await ok('Playtest does not create normal play or rating eligibility',async()=>{assert.equal(unwrap(await a.from('play_attempts').select('id').eq('level_id',draftId)).length,0);denied(await a.from('ratings').insert({user_id:aid,level_id:draftId,score:5}));denied(await a.from('favorites').insert({user_id:aid,level_id:draftId}));});
 await ok('Own draft persists through logout/login',async()=>{unwrap(await a.auth.signOut());unwrap(await a.auth.signInWithPassword({email:process.env.TEST_EMAIL_A,password:process.env.TEST_PASSWORD_A}));assert.equal(unwrap(await a.rpc('owned_levels')).find(x=>x.id===draftId).revision,2);});
 passed=true;
}finally{
 await writeFile(output+'/api-results.json',JSON.stringify({verifiedAt:new Date().toISOString(),environment:'Real Supabase Auth/PostgREST',passed,privateDiagnosticDraft:draftId,checks},null,2));
 await Promise.allSettled([a.auth.signOut(),b.auth.signOut()]);
}
