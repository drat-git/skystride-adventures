/** Desktop keyboard walkthrough. Observes copied snapshots; never mutates simulation. */
export async function driveSkyCourse(page,{getSnapshot,courseNumber=5,onStep=()=>{},timeoutMs=150000}={}) {
  const observe=getSnapshot??(()=>page.evaluate(()=>window.current?.scene.getSnapshot()??window.__SKYSTRIDE_SNAPSHOT__?.()));
  const start=Date.now(),held=new Set();
  async function key(name,down){if(held.has(name)===down)return;down?await page.keyboard.down(name):await page.keyboard.up(name);down?held.add(name):held.delete(name);}
  async function release(){for(const name of [...held])await key(name,false);}
  async function sample(){if(Date.now()-start>timeoutMs)throw Error('Keyboard route timeout');const s=await observe();if(s.state.status==='dead')throw Error(`Died at x=${s.player.x} y=${s.player.y}: ${s.state.reason}`);return s;}
  async function settle(){await key('ArrowRight',false);await key('ArrowLeft',false);await key('Space',false);for(let i=0;i<140;i++){const s=await sample();if(s.state.status==='complete')return s;if(s.player.grounded&&Math.abs(s.player.velocity.x)<1)return s;await page.waitForTimeout(20);}throw Error('Did not land');}
  async function move(x,jump=false){
    let s=await sample();if(s.state.status==='complete')return;
    let airborne=false;
    if(jump){await settle();await key('Space',true);}
    for(let i=0;i<250;i++){
      s=await sample();if(s.state.status==='complete'){await release();return;}
      const distance=x-s.player.x, vx=s.player.velocity.x, braking=vx*vx/(2*1300)+3;
      if(Math.abs(distance)<8&&Math.abs(vx)<20){if(!jump||s.player.grounded)break;}
      await key('ArrowRight',distance>0&&distance>braking);
      await key('ArrowLeft',distance<0&&-distance>braking);
      if(s.player.velocity.y<0)airborne=true;
      if(airborne&&s.player.velocity.y>=0)await key('Space',false);
      await page.waitForTimeout(16);
    }
    await settle();s=await sample();await onStep({x, jump, snapshot:s});
  }
  try {
    if(courseNumber===5){
      // Follow the ascending caps, broad upper ledge, shell-chain floor,
      // isolated towers, moving cap, and final checkpoint cliff.
      const routeStart=(await sample()).player.x;
      for(const [x,jump]of [[70,0],[235,1],[270,0],[380,1],[545,1],[600,0],[725,1],[890,1],[980,1],[1130,1],[1260,1],[1380,1],[1500,1],[1565,1],[1650,1],[1735,1],[1925,1]])if(x>=routeStart-10)await move(x,!!jump);
      let s=await sample();const platform=s.movingPlatforms[0];
      // Land on the moving cap where it is now, then travel with its body.
      await move(Math.min(platform.x,2080),true);
      for(let i=0;i<300;i++){s=await sample();if(s.movingPlatforms[0].x<2110)break;await page.waitForTimeout(20);}
      for(let adjustment=0;adjustment<3;adjustment++){
        s=await sample();const bird=s.enemies.filter(e=>e.mode==='winged'&&e.x>2100).sort((a,b)=>a.x-b.x)[0];
        let predicted=bird.x+bird.direction*45*.55;
        if(predicted>2196)predicted=2196-(predicted-2196);if(predicted<2142)predicted=2142+(2142-predicted);
        const launch=predicted-112;
        if(Math.abs(s.player.x-launch)<8)break;
        await move(launch,false);
      }
      // Launch before the flying line. Holding jump preserves the full stomp
      // bounce, allowing a keyboard chain across the winged enemies.
      await key('Space',true);await key('ArrowRight',true);
      for(let i=0;i<500;i++){s=await sample();if(s.state.status==='complete')return s;if(s.player.x>2300&&s.player.grounded)break;await page.waitForTimeout(16);}
      await key('Space',false);await key('ArrowRight',false);await move(2450,false);
    } else throw Error('Use sky-six-keyboard-driver.mjs for course 6.');
    for(let i=0;i<200;i++){const s=await sample();if(s.state.status==='complete'){await release();return s;}await key('ArrowRight',true);await page.waitForTimeout(20);}
    throw Error('Route did not reach flag');
  } finally {await release();}
}
