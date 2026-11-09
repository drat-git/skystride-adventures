import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { openRuntimeFixture } from './runtime-browser.mjs';
import { driveSkySix } from './sky-six-keyboard-driver.mjs';

const directory='output/overhaul/official-sky6-evidence';
await mkdir(directory,{recursive:true});
const fixture=await openRuntimeFixture({viewport:{width:1100,height:760}}),{page}=fixture;
const errors=[],steps=[],trace=[];
const manifest=await readFile(new URL('../src/content/official-courses.json',import.meta.url),'utf8');
const evidence={course:6,title:'Above the Blue',manifestSha256:createHash('sha256').update(manifest).digest('hex'),input:'Desktop keyboard only; detached snapshots read-only; unchanged official manifest',errors,steps,trace};
page.on('pageerror',e=>errors.push(e.message));
try {
  await page.goto(fixture.url);await page.waitForFunction(()=>window.current?.scene.getSnapshot().ready);
  await page.evaluate(()=>window.mountOfficial(5));
  await page.waitForFunction(()=>window.current?.scene.getSnapshot().ready);
  await page.locator('#game').focus();await page.waitForTimeout(150);
  await page.screenshot({path:`${directory}/start.png`});
  evidence.finish=await driveSkySix(page,{onStep:async s=>{steps.push(s);console.log('STEP',s.x,s.snapshot.player.x,s.snapshot.player.y);},onSample:s=>trace.push(s)});
  assert.equal(evidence.finish.state.status,'complete');
  await page.waitForFunction(()=>window.results.length===1,undefined,{timeout:5000});
  evidence.result=await page.evaluate(()=>window.results[0]);
  await page.screenshot({path:`${directory}/complete.png`});
  assert.deepEqual(errors,[]);
  console.log('PASS Above the Blue',JSON.stringify(evidence.result));
}catch(error){
  evidence.error=error.message;evidence.lastSnapshot=await page.evaluate(()=>window.current?.scene.getSnapshot()).catch(()=>null);
  await page.screenshot({path:`${directory}/failed.png`}).catch(()=>{});
  throw error;
}finally{await writeFile(`${directory}/results.json`,JSON.stringify(evidence,null,2));await fixture.close();}
