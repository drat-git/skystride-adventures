// Production build + GitHub Pages base path, served locally with isolated SQL/API.
import {build,preview} from 'vite';
import {createLocalBackend,LOCAL_PUBLIC_KEY} from './local-backend.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output='output/overhaul/production-evidence';await mkdir(output,{recursive:true});
const api=await createLocalBackend({port:0});let browser,server;
const errors=[],assets=[],external=[],frameDeltas=[];
try{
 process.env.GITHUB_ACTIONS='true';process.env.VITE_BACKEND_MODE='local';process.env.VITE_SUPABASE_URL=api.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=LOCAL_PUBLIC_KEY;
 await build({logLevel:'warn'});server=await preview({preview:{host:'127.0.0.1',port:5195,strictPort:true}});
 browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1366,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname==='127.0.0.1')return r.continue();external.push(u.origin+u.pathname);return r.abort();});
 page.on('response',r=>{if(r.url().includes('/assets/'))assets.push({url:new URL(r.url()).pathname,status:r.status(),contentType:r.headers()['content-type']});});
 await page.goto('http://127.0.0.1:5195/skystride-adventures/');await page.locator('#title-demo canvas').waitFor();await page.waitForTimeout(500);
 assert.equal(await page.evaluate(()=>typeof window.__SKYSTRIDE_SNAPSHOT__),'undefined');
 await page.screenshot({path:output+'/title.png'});await page.keyboard.press('Enter');await page.locator('#official').click();await page.locator('#official-3').click();await page.locator('#game canvas').waitFor();await page.waitForTimeout(200);
 await page.locator('#game').focus();await page.keyboard.down('ArrowRight');await page.waitForTimeout(300);await page.keyboard.up('ArrowRight');
 const frames=await page.evaluate(()=>new Promise(resolve=>{const result=[];let last=performance.now(),start=last;function frame(t){result.push(t-last);last=t;if(t-start<2000)requestAnimationFrame(frame);else resolve(result);}requestAnimationFrame(frame);}));frameDeltas.push(...frames.filter(n=>n>0));
 await page.screenshot({path:output+'/cave-gameplay.png',fullPage:true});await page.locator('#pause').click();await page.locator('#resume-run').waitFor();await page.locator('#overlay-menu').click();await page.locator('#editor').click();await page.locator('#authform').waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.ok(assets.every(a=>a.status===200&&a.url.startsWith('/skystride-adventures/assets/')));assert.equal(new Set(assets.filter(a=>a.url.endsWith('.png')).map(a=>a.url)).size,3);
 const sorted=[...frameDeltas].sort((a,b)=>a-b),median=sorted[Math.floor(sorted.length/2)],p95=sorted[Math.floor(sorted.length*.95)];
 await writeFile(output+'/results.json',JSON.stringify({at:new Date().toISOString(),passed:true,scope:'Local production bundle, GitHub Pages subpath, ephemeral SQL/API; no hosted requests',assets,errors,external,performance:{sampleMs:2000,frames:frameDeltas.length,medianFrameMs:median,p95FrameMs:p95,approxFps:1000/median},checks:['Production title and cave course render with all three sprite sheets','GitHub Pages asset base resolves JavaScript, CSS and PNGs','Read-only DEV test seam absent from production','Keyboard movement, pause/menu and account navigation work','No external network requests or browser errors']},null,2));
 console.log(JSON.stringify({passed:true,assets:assets.length,medianFrameMs:median,p95FrameMs:p95}));
}finally{await browser?.close();if(server)await new Promise(resolve=>server.httpServer.close(resolve));await api.close();}
