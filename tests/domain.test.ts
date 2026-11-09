import { describe,it,expect } from 'vitest';
import { validateLayout,parseLevel } from '../src/level';
import { testCourse } from './fixtures/course';
import { validateAccount, validateLogin } from '../src/auth';
import { Attempt } from '../src/attempt';
describe('untrusted level data',()=>{
 it('accepts the reproducible course',()=>expect(()=>parseLevel(testCourse)).not.toThrow());
 it.each([null,{}, {...testCourse.layout,version:1}, {...testCourse.layout,platforms:[{x:63,y:12,width:2}]}, {...testCourse.layout,start:{x:7,y:11}}, {...testCourse.layout,finish:{x:1,y:22}}, {...testCourse.layout,checkpoints:[{x:3,y:2}]}, {...testCourse.layout,hazards:[{x:3,y:11},{x:3,y:11}]}])('rejects malformed or unsafe layout %#',(layout)=>expect(()=>validateLayout(layout)).toThrow());
 it('rejects missing record metadata before rendering',()=>expect(()=>parseLevel({...testCourse,title:null})).toThrow());
});
describe('account input',()=>{
 it('allows a valid account',()=>expect(()=>validateAccount('player@example.com','Correct-horse9','Player 1')).not.toThrow());
 it.each([['invalid','Correct-horse9','Player'],['a@b.com','short','Player'],['a@b.com','Correct-horse9','<script>']])('rejects invalid credentials/name',(...args)=>expect(()=>validateAccount(...args as [string,string,string])).toThrow());
 it.each(['lowercase9!', 'UPPERCASE9!', 'NoDigitsHere!', 'NoSymbolsHere9', 'Password9 ', 'Password9é', 'Password9💫', 'Aa1!aaa', 'Aa1!'+ 'a'.repeat(125)])('rejects a new password missing a requirement %#',password=>expect(()=>validateAccount('player@example.com',password,'Player')).toThrow());
 it.each(['Aa1!aaaa', 'Aa1!'+ 'a'.repeat(124)])('accepts new passwords at the length boundaries %#',password=>expect(()=>validateAccount('player@example.com',password,'Player')).not.toThrow());
 it.each(['!', '-', '_', ':', '[', ']', '\\', '`', '~', '"', "'"])('accepts supported punctuation %s',symbol=>expect(()=>validateAccount('player@example.com','Password9'+symbol,'Player')).not.toThrow());
});
describe('attempt semantics',()=>{
 it('preserves time on death, pauses time, emits completion once',()=>{
  const a=new Attempt();a.tick(300);a.die();a.paused=true;a.tick(800);a.die();expect(a.elapsedMs).toBe(300);expect(a.deaths).toBe(1);
  expect(a.finish()).toBe(false);a.paused=false;a.tick(200);expect(a.finish()).toBe(true);expect(a.finish()).toBe(false);a.tick(500);expect(a.elapsedMs).toBe(500);
 });
});

it('accepts existing short passwords only at sign-in',()=>{expect(()=>validateLogin('player@example.com','secret')).not.toThrow();expect(()=>validateLogin('player@example.com','')).toThrow();expect(()=>validateAccount('player@example.com','secret','Player')).toThrow();});
