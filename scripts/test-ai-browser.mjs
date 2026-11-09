// Isolated browser regression. Model responses are deliberate fixtures; live provider tests are separate.
import {createLocalBackend,LOCAL_PUBLIC_KEY} from './local-backend.mjs';
import {createServer} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir='output/ai/local-browser';await mkdir(dir,{recursive:true});
const api=await createLocalBackend({port:0});
process.env.VITE_BACKEND_MODE='local';process.env.VITE_SUPABASE_URL=api.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=LOCAL_PUBLIC_KEY;
const server=await createServer({server:{host:'127.0.0.1',port:0,hmr:false}});await server.listen();
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const p=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[],errors=[],requests=[];
p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(15000);
const record=s=>{checks.push(s);console.log('PASS',s);};
let responseMode='ok',pending,passed=false;
const feedback={status:'ok',mode:'editor',assessment:'A clear route with room for a checkpoint.',suggestions:['Add a checkpoint near column 20.','Test the landing at column 30.','Place a coin above the safe ledge.']};
const answer={status:'ok',mode:'hint',hint:'Wait for the nearby walker, then jump over it and land on the clear ground ahead. Hold Space for more height.'};
await p.route('**/functions/v1/ai-assist',async route=>{
 const input=route.request().postDataJSON();requests.push(input);
 if(responseMode==='delay'){pending=route;return;}
 const status=responseMode==='quota'?429:responseMode==='failure'?503:200;
 const body=responseMode==='quota'?{message:'AI request limit reached. Try again in about a minute.'}:responseMode==='failure'?{message:'The AI provider is temporarily unavailable. Please try again later.'}:responseMode==='bad'?{status:'ok',mode:input.mode}:input.mode==='editor'?feedback:answer;
 await route.fulfill({status,json:body});
});
const waitText=(selector,text)=>p.locator(selector).filter({hasText:text}).waitFor();
const ready=()=>p.waitForFunction(()=>window.__SKYSTRIDE_SNAPSHOT__?.()?.ready);
async function flush(){if(pending){const r=pending;pending=undefined;await r.fulfill({json:r.request().postDataJSON().mode==='hint'?answer:feedback}).catch(()=>{});}}
try{
 await p.goto(`http://127.0.0.1:${server.httpServer.address().port}`);await p.locator('#enter-menu').click();await p.locator('#official').click();await p.locator('#official-1').click();await ready();await p.locator('#pause').click();
 assert.equal(await p.locator('#request-hint').isDisabled(),true);await waitText('#hint-status','Sign in');assert.equal(requests.length,0);await p.locator('#overlay-menu').click();record('Guests see a sign-in explanation; no AI request');
 await p.locator('#profile').click();await p.getByLabel('Display name',{exact:true}).fill('AI Browser Test');await p.getByLabel('Email',{exact:true}).fill('ai-browser@example.test');await p.getByLabel('Password',{exact:true}).fill('Local-test-only-42');await p.locator('#authform button[type=submit]').click();await waitText('#message','Profile loaded.');await p.locator('#brand').click();await p.locator('#editor').click();await waitText('#draft-message','Choose a private draft');
 await p.locator('#draft-title').fill('Current unsaved route');await p.locator('#editor-ai').click();await waitText('#editor-ai-status','AI feedback for this draft');assert.equal(requests.at(-1).course.title,'Current unsaved route');assert.equal(await p.locator('#editor-ai-result li').count(),3);assert.equal(await p.locator('#publish-draft').isDisabled(),true);
 await p.screenshot({path:dir+'/editor-feedback.png',fullPage:true});record('Editor reviews unsaved work with three suggestions and never grants publication');
 await p.locator('#draft-title').fill('Changed again');await waitText('#editor-ai-status','Draft changed');assert.equal(await p.locator('#editor-ai-result li').count(),0);
 responseMode='delay';await p.locator('#editor-ai').click();await p.waitForFunction(()=>document.querySelector('#editor-ai').disabled);await p.waitForTimeout(150);const count=requests.length;await p.locator('#draft-title').fill('wasd foo bar');assert.equal(await p.locator('#draft-title').inputValue(),'wasd foo bar');await flush();await p.waitForTimeout(100);assert.equal(requests.length,count);assert.equal(await p.locator('#editor-ai-result li').count(),0);assert.equal(await p.locator('#editor-ai').isDisabled(),false);record('Edits abort pending feedback and suppress stale responses without blocking typing');
 for(const mode of ['failure','quota','bad']){responseMode=mode;await p.locator('#editor-ai').click();await waitText('#editor-ai-status',mode==='failure'?'provider':mode==='quota'?'limit':'incomplete');assert.equal(await p.locator('#save-draft').isDisabled(),false);}
 responseMode='ok';await p.locator('#editor-ai').click();await waitText('#editor-ai-status','AI feedback');await p.locator('#save-draft').click();await waitText('#draft-message','Draft saved.');record('Provider/quota/malformed failures allow retry and do not block saving');
 await p.locator('#brand').click();await p.locator('#official').click();await p.locator('#official-1').click();await ready();await p.locator('#fullscreen').click();await p.waitForFunction(()=>document.fullscreenElement?.id==='play-stage');await p.locator('#fullscreen-pause').click();
 const before=await p.evaluate(()=>window.__SKYSTRIDE_SNAPSHOT__());await p.locator('#request-hint').click();await waitText('#hint-status','Select Resume');await p.waitForTimeout(500);const after=await p.evaluate(()=>window.__SKYSTRIDE_SNAPSHOT__());assert.deepEqual(after.player,before.player);assert.equal(after.attempt.elapsedMs,before.attempt.elapsedMs);assert.equal(after.timeLeft,before.timeLeft);assert.equal(requests.at(-1).state.paused,true);assert.equal(requests.at(-1).state.power,before.player.power);assert.ok(requests.at(-1).state.enemies.every(e=>Math.abs(e.x-requests.at(-1).state.position.x)<=28));assert.equal(await p.locator('#hint-text').isVisible(),true);await p.screenshot({path:dir+'/hint-fullscreen.png'});record('Fullscreen hint uses current runtime observations while player and both clocks remain paused');
 await p.locator('#resume-run').click();await p.locator('#run-overlay').waitFor({state:'hidden'});await p.waitForTimeout(160);await p.locator('#fullscreen-pause').click();responseMode='delay';await p.locator('#request-hint').click();await p.waitForTimeout(150);await p.locator('#resume-run').click();await flush();await p.locator('#fullscreen-pause').click();assert.equal(await p.locator('#hint-text').innerText(),'');assert.equal(await p.locator('#request-hint').isDisabled(),false);record('Resume cancels pending hints; later pauses do not display stale advice');
 responseMode='delay';await p.locator('#request-hint').click();await p.waitForTimeout(150);await p.locator('#replay').click();await ready();await flush();assert.equal(await p.locator('#hint-text').innerText(),'');assert.equal(await p.locator('canvas').count(),1);assert.equal(await p.evaluate(()=>document.fullscreenElement?.id),'play-stage');record('Restart retains fullscreen and discards the previous run hint');
 await p.locator('#fullscreen-pause').click();await p.locator('#overlay-menu').click();await p.locator('#signout').click();await p.locator('#signin').waitFor();assert.deepEqual(errors,[]);passed=true;
}catch(e){await p.screenshot({path:dir+'/failure.png',fullPage:true});throw e;}
finally{await flush();await writeFile(dir+'/results.json',JSON.stringify({passed,checks,errors,requestCount:requests.length},null,2));await browser.close();await server.close();await api.close();}
