import { describe,it,expect,vi } from 'vitest';
import { parseAiRequest,parseAiReply,summarizeContext,type AiRequest } from '../src/ai-contract';
import { createAiHandler,generateOpenAi,type AiDependencies } from '../src/ai-service';
import { buildEditorContext,buildGameplayContext,requestAssistance } from '../src/ai';
import { officialCourses } from '../src/content/official';
const course=officialCourses[0];
const editor=()=>buildEditorContext(course);
const hint=()=>buildGameplayContext(course,{position:{x:15,y:22},checkpoint:null,elapsedMs:3000,deaths:0,collected:0,totalItems:30,paused:true,finished:false,power:'SMALL',star:false,timeLeft:147,enemies:[{x:17,y:22,kind:'moving-shell',direction:1}],movingPlatforms:[],powerups:[],consumed:[],broken:[]});
const answer={status:'ok' as const,mode:'hint' as const,hint:'Jump over the approaching shell and land on the ground beyond it.'};
const feedback={status:'ok' as const,mode:'editor' as const,assessment:'The route has a clear finish.',suggestions:['Add a checkpoint near column 20.','Space the hazards at column 25.','Test the landing at column 30.']};
const deps=():AiDependencies=>({authenticate:vi.fn(async token=>token==='valid'?'user-a':null),takeQuota:vi.fn(async()=>({allowed:true,retryAfter:0})),generate:vi.fn(async c=>c.mode==='hint'?answer:feedback),configured:true,allowedOrigins:['https://drat-git.github.io']});
const request=(data:unknown=hint(),token='valid',origin='https://drat-git.github.io')=>new Request('https://test/ai-assist',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Origin:origin},body:JSON.stringify(data)});

describe('AI context and provider boundary',()=>{
 it('validates both modes, drops unrelated text and filters used items and live enemies',()=>{
  const c=hint();c.state.consumed=course.layout.items.slice(0,3).map(p=>`coin:${p.x},${p.y}`);
  const parsed=parseAiRequest({...c,email:'private@example.test',instructions:'do something else'});
  expect(parsed).toEqual(c);expect(parseAiRequest(editor()).mode).toBe('editor');
  const summary=summarizeContext(c);expect(summary.course.enemies.shown).toEqual([{column:18,row:23,kind:'moving-shell',direction:1}]);
  expect(JSON.stringify(summary)).not.toContain('private@example');
  for(const p of course.layout.items.slice(0,3))expect(summary.course.coins.shown).not.toContainEqual({column:p.x+1,row:p.y+1});
 });
 it.each([null,{}, {mode:'chat'}, {...hint(),state:{...hint().state,paused:false}}, {...hint(),state:{...hint().state,power:'GOD'}}, {...hint(),state:{...hint().state,enemies:[{x:2,y:3,kind:'<script>'}]}}, {...editor(),course:{...editor().course,layout:{version:1}}}])('rejects malformed input without requesting a model',input=>expect(()=>parseAiRequest(input)).toThrow());
 it('keeps all official course summaries bounded and references the complete course span',()=>{
  for(const c of officialCourses){const summary=summarizeContext(buildEditorContext(c));expect(JSON.stringify(summary).length).toBeLessThan(22000);expect(summary.course.finish.column).toBe(c.layout.finish.x+1);}
 });
 it('validates output mode, three suggestions, lengths and refusal/incomplete responses',async()=>{
  expect(()=>parseAiReply({...feedback,suggestions:['only one']},'editor')).toThrow();expect(()=>parseAiReply(feedback,'hint')).toThrow();
  expect(()=>parseAiReply({...answer,hint:'x'.repeat(901)},'hint')).toThrow();
  for(const response of [{status:'incomplete',output:[]},{status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'No'}]}]},{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'broken json'}]}]}])await expect(generateOpenAi(hint(),new AbortController().signal,'test',undefined,async()=>Response.json(response))).rejects.toThrow();
 });
 it('uses genuine structured Responses output with no retention or account data',async()=>{
  let sent:any;
  const result=await generateOpenAi(editor(),new AbortController().signal,'test-secret',undefined,async(url,init)=>{expect(url).toBe('https://api.openai.com/v1/responses');sent=JSON.parse(String(init?.body));return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({assessment:feedback.assessment,suggestions:feedback.suggestions})}]}]});});
  expect(result).toEqual(feedback);expect(sent).toMatchObject({model:'gpt-5.4-mini',store:false,reasoning:{effort:'none'},text:{format:{strict:true}}});expect(JSON.stringify(sent)).not.toContain('test-secret');
 });
});
describe('AI endpoint',()=>{
 it('authenticates both modes and returns CORS-protected JSON',async()=>{const d=deps(),handler=createAiHandler(d);for(const input of [editor(),hint()]){const r=await handler(request(input));expect(r.status).toBe(200);expect(r.headers.get('access-control-allow-origin')).toBe('https://drat-git.github.io');expect((await r.json()).mode).toBe(input.mode);}expect(d.takeQuota).toHaveBeenCalledWith('user-a');});
 it('rejects unauthenticated, malformed and unsupported requests before quota/provider calls',async()=>{const d=deps(),h=createAiHandler(d);expect((await h(request(hint(),'invalid'))).status).toBe(401);expect((await h(request({}))).status).toBe(400);expect((await h(request(hint(),'valid','https://evil.test'))).status).toBe(403);expect((await h(new Request('https://test',{method:'GET'}))).status).toBe(405);expect(d.takeQuota).not.toHaveBeenCalled();expect(d.generate).not.toHaveBeenCalled();});
 it('supports preflight without authentication and rejects oversized bodies',async()=>{const d=deps(),h=createAiHandler(d);expect((await h(new Request('https://test',{method:'OPTIONS',headers:{Origin:'https://drat-git.github.io'}}))).status).toBe(204);expect((await h(request('x'.repeat(360001)))).status).toBe(413);expect(d.generate).not.toHaveBeenCalled();});
 it('enforces quota and exposes retry time without calling provider',async()=>{const d=deps();d.takeQuota=vi.fn(async()=>({allowed:false,retryAfter:50}));const r=await createAiHandler(d)(request());expect(r.status).toBe(429);expect(r.headers.get('retry-after')).toBe('50');expect(d.generate).not.toHaveBeenCalled();});
 it('handles missing key, database/provider failure and timeout without raw error exposure',async()=>{
  let d=deps();d.configured=false;expect((await createAiHandler(d)(request())).status).toBe(503);expect(d.takeQuota).not.toHaveBeenCalled();
  d=deps();d.generate=async()=>{throw Error('secret-raw-provider-error');};let r=await createAiHandler(d)(request());expect(r.status).toBe(502);expect(await r.text()).not.toContain('secret');
  d=deps();d.takeQuota=async()=>{throw Error('database-password');};r=await createAiHandler(d)(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain('password');
  d=deps();d.timeoutMs=5;d.generate=(_,signal)=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));expect((await createAiHandler(d)(request())).status).toBe(504);
 });
 it('client rejects cancellations and renders only validated responses',async()=>{
  const controller=new AbortController();controller.abort();
  const client={functions:{invoke:async()=>({data:answer,error:null})}} as any;
  await expect(requestAssistance(client,hint(),controller.signal)).rejects.toMatchObject({name:'AbortError'});
  expect(await requestAssistance(client,hint(),new AbortController().signal)).toEqual(answer);
 });
});
