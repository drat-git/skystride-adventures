// Public game -> real Supabase Auth -> real Edge Function -> OpenAI. No request interception.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const account=JSON.parse(await readFile('output/ai/test-account.json','utf8'));
const out='output/ai/hosted-browser';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const p=await browser.newPage({viewport:{width:1440,height:1000}}),checks=[],errors=[],aiResponses=[];
p.setDefaultTimeout(45000);p.on('pageerror',e=>errors.push(e.message));p.on('response',r=>{if(r.url().includes('/functions/v1/ai-assist'))aiResponses.push({status:r.status()});});
const waitText=(selector,text)=>p.locator(selector).filter({hasText:text}).waitFor();
const record=s=>{checks.push(s);console.log('PASS',s);};
let passed=false;
try{
 await p.goto('https://drat-git.github.io/skystride-adventures/?ai-verification='+Date.now());await p.locator('#enter-menu').click();await p.locator('#signin').click();await p.getByLabel('Email',{exact:true}).fill(account.email);await p.getByLabel('Password',{exact:true}).fill(account.password);await p.locator('#authform button[type=submit]').click();await waitText('#message','Profile loaded.');await p.locator('#brand').click();
 await p.locator('#editor').click();await waitText('#draft-message','Choose a private draft');await p.locator('#draft-title').fill('AI release verification draft');await p.locator('#editor-ai').click();await waitText('#editor-ai-status','AI feedback for this draft');assert.equal(await p.locator('#editor-ai-result li').count(),3);assert.equal(await p.locator('#publish-draft').isDisabled(),true);
 const editor={assessment:await p.locator('#editor-ai-result p').innerText(),suggestions:await p.locator('#editor-ai-result li').allTextContents()};await p.locator('#editor-ai').scrollIntoViewIfNeeded();await p.screenshot({path:out+'/editor-feedback.png'});record('Public Course Maker returns genuine feedback for an unsaved draft without publication approval');
 await p.locator('#draft-title').fill('AI release verification changed');await waitText('#editor-ai-status','Draft changed');assert.equal(await p.locator('#editor-ai-result li').count(),0);await p.locator('#save-draft').click();await waitText('#draft-message','Draft saved.');await p.locator('#brand').click();record('Editing clears outdated AI feedback and ordinary saving still succeeds');
 await p.locator('#official').click();await p.locator('#official-1').click();await p.locator('#game canvas').waitFor();await waitText('#message','Reach the flag');await p.locator('#fullscreen').click();await p.waitForFunction(()=>document.fullscreenElement?.id==='play-stage');await p.locator('#fullscreen-pause').click();
 const before={time:await p.locator('#hud-time').innerText(),elapsed:await p.locator('#hud-elapsed').innerText()};await p.locator('#request-hint').click();await waitText('#hint-status','Select Resume');const hint=await p.locator('#hint-text').innerText();assert.ok(hint.length>40);await p.waitForTimeout(800);assert.equal(await p.locator('#hud-time').innerText(),before.time);assert.equal(await p.locator('#hud-elapsed').innerText(),before.elapsed);assert.equal(await p.evaluate(()=>document.fullscreenElement?.id),'play-stage');await p.screenshot({path:out+'/fullscreen-hint.png'});record('Real gameplay hint is visible in fullscreen with both clocks held paused');
 await p.locator('#resume-run').click();await p.locator('#run-overlay').waitFor({state:'hidden'});await p.waitForTimeout(250);await p.locator('#fullscreen-pause').click();assert.equal(await p.locator('#hint-text').innerText(),'');assert.notEqual(await p.locator('#hud-elapsed').innerText(),before.elapsed);await p.locator('#overlay-menu').click();await p.locator('#signout').click();await p.locator('#signin').waitFor();record('Explicit Resume advances gameplay and clears old advice; logout works');
 assert.deepEqual(aiResponses.map(r=>r.status),[200,200]);assert.deepEqual(errors,[]);await writeFile(out+'/responses.json',JSON.stringify({editor,hint},null,2));passed=true;
}catch(e){await p.screenshot({path:out+'/failure.png'});throw e;}
finally{await writeFile(out+'/results.json',JSON.stringify({passed,checks,errors,aiResponses},null,2));await browser.close();}
