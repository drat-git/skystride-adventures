// Only against a disposable course project and two dedicated test accounts.
// Supply credentials in .env.local; output contains no passwords/tokens.
import {createClient} from '@supabase/supabase-js';
import {writeFileSync} from 'node:fs';
const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(!url||!key)throw Error('Set public project URL/key in .env.local.');
const make=()=>createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const a=make(),b=make(),anon=make(),rows=[];
async function check(name,fn){try{await fn();rows.push({name,status:'PASS'});}catch(e){rows.push({name,status:'FAIL',detail:e.message});throw e;}}
const assert=(ok,msg)=>{if(!ok)throw Error(msg);};
const L='11111111-1111-4111-8111-111111111111';
let aid;
try{
 for(const [client,suffix] of [[a,'A'],[b,'B']]){
  const email=process.env[`TEST_EMAIL_${suffix}`],password=process.env[`TEST_PASSWORD_${suffix}`];
  if(!email||!password)throw Error(`Set dedicated TEST_EMAIL_${suffix}/TEST_PASSWORD_${suffix} locally.`);
  await check(`Login account ${suffix}`,async()=>{const r=await client.auth.signInWithPassword({email,password});assert(!r.error,r.error?.message);});
 }
 aid=(await a.auth.getUser()).data.user.id;const bid=(await b.auth.getUser()).data.user.id;
 await check('Anonymous published level read',async()=>{const r=await anon.from('levels').select('id').eq('id',L);assert(!r.error&&r.data.length===1,'Seed not readable');});
 await check('Profile round trip',async()=>{const original=await a.from('profiles').select('display_name').eq('id',aid).single();assert(!original.error,original.error?.message);
  const update=await a.from('profiles').update({display_name:'Integration Player'}).eq('id',aid).select('display_name').single();assert(!update.error&&update.data.display_name==='Integration Player','Profile write failed');
  const restore=await a.from('profiles').update({display_name:original.data.display_name}).eq('id',aid);assert(!restore.error,restore.error?.message);
 });
 await check('Cannot read another profile',async()=>{const r=await a.from('profiles').select('id').eq('id',bid);assert(!r.error&&r.data.length===0,'Cross-account data exposed');});
 await check('Cannot update another profile',async()=>{const r=await a.from('profiles').update({display_name:'Not Allowed'}).eq('id',bid).select('id');assert(!r.error&&r.data.length===0,'Cross-account update allowed');});
 const attempt=await a.from('play_attempts').insert({user_id:aid,level_id:L}).select('id').single();assert(!attempt.error,attempt.error?.message);
 await check('Valid own rating and favorite',async()=>{
  const rating=await a.from('ratings').upsert({user_id:aid,level_id:L,score:4});assert(!rating.error,rating.error?.message);
  const favorite=await a.from('favorites').select('level_id').eq('user_id',aid).eq('level_id',L);assert(!favorite.error,favorite.error?.message);
  if(!favorite.data.length){const insert=await a.from('favorites').insert({user_id:aid,level_id:L});assert(!insert.error,insert.error?.message);}
 });
 await check('Score constraint rejects six',async()=>{const r=await a.from('ratings').update({score:6}).eq('user_id',aid).eq('level_id',L);assert(r.error,'Invalid score accepted');});
 await check('Duplicate favorite rejected',async()=>{const r=await a.from('favorites').insert({user_id:aid,level_id:L});assert(r.error,'Duplicate accepted');});
 await check('Cross-account writes denied',async()=>{const r=await b.from('favorites').insert({user_id:aid,level_id:L});assert(r.error,'Forged ownership accepted');});
 await check('Anonymous writes denied',async()=>{const r=await anon.from('favorites').insert({user_id:aid,level_id:L});assert(r.error,'Anonymous insert allowed');});
 await check('Missing level rejected',async()=>{const r=await a.from('play_attempts').insert({user_id:aid,level_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'});assert(r.error,'Missing level accepted');});
 await check('Logout removes session',async()=>{const r=await a.auth.signOut();assert(!r.error,r.error?.message);assert(!(await a.auth.getSession()).data.session,'Session remains');});
}finally{
 const result={at:new Date().toISOString(),environment:'Live Supabase',checks:rows};writeFileSync('docs/evidence/integration.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await Promise.all([a.auth.signOut(),b.auth.signOut()]);
}
