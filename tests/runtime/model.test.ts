import { describe, expect, it } from 'vitest';
import { RunModel } from '../../src/runtime/RunModel';
import { playerBody, PHYSICS } from '../../src/runtime/types';
import { officialCourses } from '../../src/content/official';

describe('source-derived runtime contract', () => {
  it('matches source movement and invariant hitbox dimensions through squash/stretch', () => {
    expect(PHYSICS).toMatchObject({ acceleration:1600,drag:1300,speed:240,jump:-480,jumpCut:-160,gravity:1000,extraFallGravity:900 });
    for(const power of ['SMALL','BIG','FIRE'] as const) for(const [sx,sy] of [[1,1],[.82,1.18],[1.18,.82],[1.5,1.5]]) {
      const b=playerBody(power,sx,sy), height=power==='SMALL'?20:30, feet=power==='SMALL'?12:18;
      expect(b.width*sx).toBeCloseTo(16);expect(b.height*sy).toBeCloseTo(height);
      expect((-12+b.y+b.height)*sy).toBeCloseTo(feet);
    }
  });
  it('retains time and unique coin identities through death while restarting a fresh run clears them', () => {
    const layout=structuredClone(officialCourses[0].layout);layout.items=[{x:3,y:21}];layout.blocks=[{x:5,y:19,kind:'glow',content:'coin'}];
    const run=new RunModel(layout);run.tick(1200);expect(run.collect('coin:3,21')).toBe(true);expect(run.collect('coin:3,21')).toBe(false);
    run.checkpoint={x:10,y:22};run.die('Test');run.tick(2000);expect(run.attempt.elapsedMs).toBe(1200);expect(run.resume()).toBe(true);
    run.tick(300);expect(run.attempt.result()).toEqual({elapsedMs:1500,deaths:1,collected:1,totalItems:2});
    expect(run.collect('coin:3,21')).toBe(false);expect(run.collect('block:5,19')).toBe(true);expect(run.score).toBe(200);
    expect(new RunModel(layout).attempt.result()).toEqual({elapsedMs:0,deaths:0,collected:0,totalItems:2});
  });
  it('pauses time and emits a completion only once, independent of optional coins', () => {
    const run=new RunModel(officialCourses[0].layout);run.tick(300);run.pause(true);run.tick(5000);expect(run.finish()).toBe(false);
    expect(run.attempt.elapsedMs).toBe(300);run.pause(false);expect(run.finish()).toBe(true);expect(run.finish()).toBe(false);
    run.tick(100);expect(run.attempt.elapsedMs).toBe(300);expect(run.die('late')).toBe(false);
  });
  it('allows repeated checkpoint retries without a lives limit and restores the course countdown', () => {
    const run=new RunModel(officialCourses[0].layout);run.checkpoint={x:10,y:22};
    for(let i=0;i<8;i++) {
      run.tick(1000);expect(run.die('Test retry')).toBe(true);expect(run.resume()).toBe(true);
      expect(run.remainingMs).toBe(150000);expect(run.checkpoint).toEqual({x:10,y:22});
    }
    expect(run.result()).toMatchObject({deaths:8,elapsedMs:8000,smallOnly:true});
    expect(run.state()).toEqual({status:'playing',hasCheckpoint:true});
  });
  it.each([['BIG',false],['FIRE',false],['SMALL',true]] as const)('remembers use of %s power with star=%s for the entire run', (power,star) => {
    const run=new RunModel(officialCourses[0].layout);
    expect(run.result().smallOnly).toBe(true);run.observePower(power,star);run.observePower('SMALL');
    run.die('Test');run.resume();run.observePower('SMALL');run.finish();
    expect(run.result().smallOnly).toBe(false);
    expect(new RunModel(officialCourses[0].layout).result().smallOnly).toBe(true);
  });
  it('returns independent completion data including coins, score and small-only qualification', () => {
    const layout=structuredClone(officialCourses[0].layout);layout.items=[{x:3,y:21}];layout.blocks=[{x:5,y:19,kind:'hidden',content:'coin'}];
    const run=new RunModel(layout);run.collect('coin:3,21');run.collect('block:5,19');run.tick(14000);run.finish();
    run.score+=7500;const completed=run.result();
    expect(completed).toEqual({elapsedMs:14000,deaths:0,collected:2,totalItems:2,score:7700,smallOnly:true});
    run.score+=100;expect(completed.score).toBe(7700);
  });
});
