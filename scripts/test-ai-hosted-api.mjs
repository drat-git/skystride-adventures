// Real managed Auth -> Edge Function -> OpenAI. Only disposable test account credentials stay in ignored output.
import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if(!url?.includes('djoiiitpyntcgnuqemiu')||!key)throw Error('Expected configured SkyStride hosted project.');
const out='output/ai';await mkdir(out,{recursive:true});
const api=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
let account;try{account=JSON.parse(await readFile(out+'/test-account.json','utf8'));}catch{
 const email=`ai-verification-${randomUUID()}@example.test`,password=`Ai-${randomUUID()}!4`;
 const {data,error}=await api.auth.signUp({email,password,options:{data:{display_name:'AI Release Test'}}});if(error)throw Error(error.message);assert.ok(data.session,'Immediate signup required');account={id:data.user.id,email,password};await writeFile(out+'/test-account.json',JSON.stringify(account),{mode:0o600});
}
const {data:login,error}=await api.auth.signInWithPassword(account);if(error)throw Error(error.message);
const token=login.session.access_token;
const courses=JSON.parse(await readFile('src/content/official-courses.json','utf8'));
const context=(mode,c,index=0)=>({mode,course:{title:c.title,difficulty:c.difficulty,layout:c.layout},...(mode==='hint'?{state:{position:{x:index?27:15,y:22},checkpoint:null,elapsedMs:6000,deaths:1,collected:0,totalItems:c.layout.items.length+c.layout.blocks.filter(b=>b.content==='coin').length,paused:true,finished:false,power:'SMALL',star:false,timeLeft:144,enemies:[{x:index?31:18,y:index?18:22,kind:index?'winged':'walker',direction:-1,behavior:index?'horizontal':'patrol'}],movingPlatforms:index?[{x:30,y:22,width:3,kind:'platform',behavior:'y'}]:[],powerups:[],consumed:[],broken:[]}}:{})});
const checks=[],responses=[];
const call=async(body,authorization=token,origin)=>{const r=await fetch(url+'/functions/v1/ai-assist',{method:'POST',headers:{apikey:key,Authorization:`Bearer ${authorization}`,'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
try{
 const anonymous=await call(context('editor',courses[0]),key);assert.equal(anonymous.status,401);checks.push('Anonymous requests denied');
 const malformed=await call({mode:'chat'});assert.equal(malformed.status,400,JSON.stringify(malformed));checks.push('Malformed request denied before model call');
 const foreign=await call(context('editor',courses[0]),token,'https://unapproved.example');assert.equal(foreign.status,403);checks.push('Foreign browser origin denied');
 for(const input of [context('hint',courses[0]),context('hint',courses[4],1),context('editor',courses[4])]){
  const started=Date.now();const r=await call(input);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.mode,input.mode);assert.equal(r.body.status,'ok');if(input.mode==='editor')assert.equal(r.body.suggestions.length,3);else assert.ok(r.body.hint.length>40);
  responses.push({course:input.course.title,mode:input.mode,durationMs:Date.now()-started,...r.body});checks.push(`Real OpenAI ${input.mode}: ${input.course.title}`);
 }
 await writeFile(out+'/hosted-api.json',JSON.stringify({passed:true,checks,responses,temporaryUserId:account.id},null,2));console.log(JSON.stringify({passed:true,checks,responses},null,2));
} catch(e){await writeFile(out+'/hosted-api.json',JSON.stringify({passed:false,checks,error:e.message,temporaryUserId:account.id},null,2));throw e;}
finally{await api.auth.signOut({scope:'local'});}
