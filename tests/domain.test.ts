import { describe,it,expect } from 'vitest';
import { validateLayout,practiceLevel,parseLevel } from '../src/level';
import { validateAccount } from '../src/auth';
import { Attempt } from '../src/attempt';
describe('untrusted level data',()=>{
 it('accepts the reproducible course',()=>expect(()=>parseLevel(practiceLevel)).not.toThrow());
 it.each([null,{}, {...practiceLevel.layout,version:2}, {...practiceLevel.layout,platforms:[{x:23,y:12,width:2}]}, {...practiceLevel.layout,start:{x:7,y:11}}, {...practiceLevel.layout,finish:{x:1,y:11}}, {...practiceLevel.layout,checkpoints:[{x:3,y:2}]}, {...practiceLevel.layout,hazards:[{x:3,y:11},{x:3,y:11}]}])('rejects malformed or unsafe layout %#',(layout)=>expect(()=>validateLayout(layout)).toThrow());
 it('rejects missing record metadata before rendering',()=>expect(()=>parseLevel({...practiceLevel,title:null})).toThrow());
});
describe('account input',()=>{
 it('allows a valid account',()=>expect(()=>validateAccount('player@example.com','correct-horse','Player 1')).not.toThrow());
 it.each([['invalid','abcdefgh','Player'],['a@b.com','short','Player'],['a@b.com','abcdefgh','<script>']])('rejects invalid credentials/name',(...args)=>expect(()=>validateAccount(...args as [string,string,string])).toThrow());
});
describe('attempt semantics',()=>{
 it('preserves time on death, pauses time, emits completion once',()=>{
  const a=new Attempt();a.tick(300);a.die();a.paused=true;a.tick(800);a.die();expect(a.elapsedMs).toBe(300);expect(a.deaths).toBe(1);
  expect(a.finish()).toBe(false);a.paused=false;a.tick(200);expect(a.finish()).toBe(true);expect(a.finish()).toBe(false);a.tick(500);expect(a.elapsedMs).toBe(500);
 });
});
