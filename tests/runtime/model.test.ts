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
});
