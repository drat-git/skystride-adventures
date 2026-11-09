import {openRuntimeFixture} from './runtime-browser.mjs';
import {writeFile} from 'node:fs/promises';
import {driveSkyCourse} from './sky-keyboard-driver.mjs';
const {page,url,close}=await openRuntimeFixture();
await page.goto(url);await page.waitForFunction(()=>window.current?.scene.getSnapshot().ready);
const evidence=[];
try {for(const number of (process.env.SKY_COURSE?[+process.env.SKY_COURSE]:[5])){
await page.evaluate(i=>{window.results=[];window.mountOfficial(i);},number-1);await page.waitForFunction(()=>window.current?.scene.getSnapshot().ready);await page.locator('#game').focus();
console.log('START sky',number);let result;for(let attempt=0;attempt<12;attempt++){try{result=await driveSkyCourse(page,{courseNumber:number,onStep:async s=>{console.log('STEP',number,s.x,s.snapshot.player.x.toFixed(1),s.snapshot.player.y.toFixed(1),s.snapshot.player.power);evidence.push({course:number,attempt,...s});}});break;}catch(error){console.log('ROUTE RETRY',attempt,error.message);if(attempt===11)throw error;const state=await page.evaluate(()=>window.current.scene.getSnapshot());if(state.state.status==='dead'&&state.checkpoint){await page.waitForTimeout(1900);await page.locator('#resume-run').click();}else{await page.evaluate(i=>window.mountOfficial(i),number-1);}await page.waitForFunction(()=>window.current.scene.getSnapshot().ready&&window.current.scene.getSnapshot().state.status==='playing');await page.locator('#game').focus();}}await page.waitForFunction(()=>window.results.length===1);await page.screenshot({path:`output/overhaul/runtime-evidence/course-${number}-complete.png`});evidence.push({course:number,complete:true,snapshot:result});console.log('COMPLETE',number,JSON.stringify(result.attempt));}
} catch(e){console.error(e);console.error('SNAPSHOT',JSON.stringify(await page.evaluate(()=>window.current.scene.getSnapshot())));await page.screenshot({path:'output/overhaul/runtime-evidence/sky-route-failure.png'});process.exitCode=1;}
finally{await writeFile('output/overhaul/runtime-evidence/sky-route.json',JSON.stringify(evidence,null,2));await close();}
