import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const manifestPath = new URL('../src/content/official-courses.json', import.meta.url);
const manifestText = await readFile(manifestPath, 'utf8');
const courses = JSON.parse(manifestText);

/** Drive the unchanged official course using browser keyboard events only.
 * The observation function returns a detached, read-only runtime snapshot.
 * No physics, player, enemy, course or attempt state is written by this helper.
 */
export async function driveGroundCourse(page, index, { snapshot = () => page.evaluate(() => window.current.scene.getSnapshot()), timeout = 60000, onSample, onDeath, jumpDistance = 58 } = {}) {
  const course = courses[index], layout = course.layout;
  assert.ok(index >= 0 && index < 4, 'Ground driver supports official courses 1–4');
  const rectangles = [
    ...layout.terrain.map(p => ({ x:p.x*18, y:p.y*18, width:p.width*18, height:18 })),
    ...layout.platforms.map(p => ({ x:p.x*18, y:p.y*18, width:p.width*18, height:18 })),
    ...layout.blocks.filter(p => p.kind !== 'hidden').map(p => ({ x:p.x*18, y:p.y*18, width:18, height:18 })),
    ...layout.obstacles.map(p => ({ x:p.x*18, y:p.y*18, width:p.width*18, height:p.height*18 })),
  ];
  const overlaps = (x,y,w,h) => rectangles.some(r => x < r.x+r.width && x+w > r.x && y < r.y+r.height && y+h > r.y);
  const trace = []; let jumpHeld = false, direction = 'right', previousX = 0, stuckSince = Date.now();
  const start = Date.now();
  await page.keyboard.down('ArrowRight');
  try {
    while (Date.now()-start < timeout) {
      const s = await snapshot();
      if (!s?.ready || !s.player) { await page.waitForTimeout(30); continue; }
      if (s.state.status === 'dead' && onDeath) {
        trace.push({ms:Date.now()-start,event:'death',snapshot:s});
        await page.keyboard.up('Space'); await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowLeft');
        await onDeath(s); jumpHeld=false; direction=null; previousX=0; stuckSince=Date.now();
        continue;
      }
      if (s.state.status !== 'playing') return { status:s.state.status, snapshot:s, trace, wallMs:Date.now()-start };
      const p=s.player,b=p.body;
      const goalX=layout.finish.x*18+9;
      const landingThreat = s.enemies.some(e => e.mode !== 'defeated' && e.x > p.x-7 && e.x-p.x < 95 && e.y-p.y < 95 && e.y-p.y > -30);
      const floorAt = x => overlaps(x-1,414,2,18);
      const fallSeconds=(-Math.max(0,p.velocity.y)+Math.sqrt(Math.max(0,p.velocity.y)**2+2*1900*Math.max(0,414-b.bottom)))/1900;
      const unsafeLanding = b.bottom < 404 && floorAt(p.x+24) && !floorAt(p.x+Math.max(0,p.velocity.x)*fallSeconds);
      const nextDirection = !p.grounded && p.velocity.y >= 0 && (unsafeLanding || landingThreat && floorAt(p.x)) ? null : p.x < goalX-22 ? 'right' : p.x > goalX+22 ? 'left' : null;
      if (nextDirection !== direction) {
        if(direction) await page.keyboard.up(direction==='right'?'ArrowRight':'ArrowLeft');
        if(nextDirection) await page.keyboard.down(nextDirection==='right'?'ArrowRight':'ArrowLeft');
        direction=nextDirection;
      }
      const obstacle = overlaps(b.x+b.width+3,b.bottom-75,jumpDistance,73);
      const gap = !overlaps(b.x+b.width+28,b.bottom+2,12,24);
      const enemy = s.enemies.some(e => e.mode !== 'defeated' && e.x > p.x-7 && e.x-p.x < 77 && Math.abs(e.y-p.y)<55);
      const jump = p.x > goalX-75 ? false : p.grounded ? obstacle || gap || enemy : p.velocity.y < 0 || enemy;
      // Landing requires a fresh press; holding jump across a stomp or low
      // ceiling must not accidentally suppress the next intentional jump.
      if(p.grounded && jump && jumpHeld) { await page.keyboard.up('Space'); jumpHeld=false; }
      if(jump !== jumpHeld) { await page.keyboard[jump?'down':'up']('Space'); jumpHeld=jump; }
      if(Math.abs(p.x-previousX)>3) { previousX=p.x; stuckSince=Date.now(); }
      if(Date.now()-stuckSince>3000) return {status:'stuck',snapshot:s,trace,wallMs:Date.now()-start};
      const sample={ms:Date.now()-start,x:p.x,y:p.y,vx:p.velocity.x,vy:p.velocity.y,grounded:p.grounded,jump,direction,obstacle,gap,enemy,unsafeLanding,checkpoint:s.checkpoint};
      trace.push(sample); if(onSample) await onSample(sample,s);
      await page.waitForTimeout(30);
    }
    return {status:'timeout',snapshot:await snapshot(),trace,wallMs:Date.now()-start};
  } finally { await page.keyboard.up('Space'); await page.keyboard.up('ArrowRight'); await page.keyboard.up('ArrowLeft'); }
}

async function run() {
  const { openRuntimeFixture } = await import('./runtime-browser.mjs');
  const fixture=await openRuntimeFixture({viewport:{width:1000,height:700}});
  const {page}=fixture, errors=[], evidence=[];
  const directory='output/overhaul/official-ground-evidence';
  await mkdir(directory,{recursive:true});
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(fixture.url);
    await page.waitForFunction(()=>window.current?.scene.getSnapshot().ready);
    for(const index of (process.env.COURSES??'0,1,2,3').split(',').map(Number)) {
      await page.evaluate(i=>window.mountOfficial(i),index);
      await page.waitForFunction(()=>window.current?.scene.getSnapshot().ready);
      await page.locator('#game').focus(); await page.waitForTimeout(100);
      await page.screenshot({path:`${directory}/course-${index+1}-start.png`});
      const result=await driveGroundCourse(page,index,{jumpDistance:Number(process.env.JUMP_DISTANCE??58)});
      if(result.status==='complete') await page.waitForTimeout(1500);
      await page.screenshot({path:`${directory}/course-${index+1}-${result.status}.png`});
      evidence.push({index:index+1,title:courses[index].title,...result});
      console.log(JSON.stringify({course:index+1,title:courses[index].title,status:result.status,x:result.snapshot.player?.x,y:result.snapshot.player?.y,attempt:result.snapshot.attempt,wallMs:result.wallMs}));
    }
    assert.deepEqual(errors,[],'Browser errors');
    assert.ok(evidence.every(r=>r.status==='complete'),'Every selected official course must complete with actual keyboard input');
  } finally {
    await writeFile(`${directory}/results.json`,JSON.stringify({manifestSha256:createHash('sha256').update(manifestText).digest('hex'),input:'Playwright keyboard only; runtime snapshots read-only; official manifest unchanged',evidence,errors},null,2));
    await fixture.close();
  }
}
if(process.argv[1]===fileURLToPath(import.meta.url)) await run();
