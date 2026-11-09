/** Desktop keyboard walkthrough. Observes copied snapshots; never mutates simulation. */
export async function driveSkySix(page,{getSnapshot,onStep=()=>{},onSample=()=>{},timeoutMs=150000}={}) {
  const observe=getSnapshot??(()=>page.evaluate(()=>window.current?.scene.getSnapshot()??window.__SKYSTRIDE_SNAPSHOT__?.()));
  const start=Date.now(),held=new Set();
  async function key(name,down){if(held.has(name)===down)return;down?await page.keyboard.down(name):await page.keyboard.up(name);down?held.add(name):held.delete(name);}
  async function release(){for(const name of [...held])await key(name,false);}
  async function sample(){if(Date.now()-start>timeoutMs)throw Error('Keyboard route timeout');const s=await observe();await onSample({ms:Date.now()-start,snapshot:s});if(s.state.status==='dead')throw Error(`Died at x=${s.player.x} y=${s.player.y}: ${s.state.reason}`);return s;}
  const shellBelow=s=>s.enemies.some(e=>e.mode==='shell'&&!e.moving&&Math.abs(e.x-s.player.x)<25&&e.y-s.player.y>0&&e.y-s.player.y<65);
  async function settle(){await key('ArrowRight',false);await key('ArrowLeft',false);await key('Space',false);for(let i=0;i<140;i++){const s=await sample();if(s.state.status==='complete')return s;if(s.player.grounded&&Math.abs(s.player.velocity.x)<1)return s;await key('ArrowRight',shellBelow(s));await page.waitForTimeout(20);}throw Error('Did not land');}
  async function move(x,jump=false,holdMs=Infinity){
    let s=await sample();if(s.state.status==='complete')return;
    let airborne=false,jumpStarted=0;
    if(jump){await settle();await key('Space',true);jumpStarted=Date.now();}
    for(let i=0;i<250;i++){
      s=await sample();if(s.state.status==='complete'){await release();return;}
      const distance=x-s.player.x, vx=s.player.velocity.x, braking=vx*vx/(2*1300)+3;
      if(Math.abs(distance)<8&&Math.abs(vx)<20){if(!jump||s.player.grounded||shellBelow(s))break;}
      await key('ArrowRight',distance>0&&distance>braking);
      await key('ArrowLeft',distance<0&&-distance>braking);
      if(s.player.velocity.y<0)airborne=true;
      if(airborne&&s.player.velocity.y>=0||jumpStarted&&Date.now()-jumpStarted>holdMs)await key('Space',false);
      await page.waitForTimeout(16);
    }
    await settle();s=await sample();await onStep({x, jump, snapshot:s});
  }
  async function waitFor(predicate,label){for(let i=0;i<300;i++){const s=await sample();if(predicate(s))return;await page.waitForTimeout(20);}throw Error(`No safe opening: ${label}`);}
  try {
    for(const [x,jump,holdMs]of [[145,0],[350,1],[410,0],[485,1],[540,1],[635,1],[670,0],[810,1],[885,0],[1015,1],[1095,1],[1185,1],[1285,1],[1490,1],[1570,1,70],[1650,0]])await move(x,!!jump,holdMs);
    await waitFor(s=>!s.enemies.some(e=>e.mode==='winged'&&Math.abs(e.x-1737)>1&&e.x>s.player.x-20&&e.x<s.player.x+100),'hopping enemy passes the gap');
    await move(1705,true,70);
    await waitFor(s=>!s.enemies.some(e=>e.mode==='winged'&&Math.abs(e.x-1737)<1&&e.y<290),'vertical enemy lowers');
    await move(1800,true);
    for(const [x,jump]of [[1870,1],[1950,1],[2020,1],[2175,1],[2370,1]])await move(x,!!jump);
    for(let i=0;i<200;i++){const s=await sample();if(s.state.status==='complete'){await release();return s;}await key('ArrowRight',true);await page.waitForTimeout(20);}
    throw Error('Route did not reach flag');
  } finally {await release();}
}
