import { validateLayoutV2, type LayoutV2, type Point } from './course-format.ts';

export interface LiveEntity extends Point { kind:string; direction?:number; width?:number; behavior?:string }
export interface GameplayState {
  position:Point; checkpoint:Point|null; elapsedMs:number; deaths:number; collected:number; totalItems:number;
  paused:boolean; finished:boolean; power:'SMALL'|'BIG'|'FIRE'; star:boolean; timeLeft:number;
  enemies:LiveEntity[]; movingPlatforms:LiveEntity[]; powerups:LiveEntity[]; consumed:string[]; broken:string[];
}
export type AiCourse={title:string;difficulty:string;layout:LayoutV2};
export type AiRequest={mode:'hint';course:AiCourse;state:GameplayState}|{mode:'editor';course:AiCourse};
export type AiReply={status:'ok';mode:'hint';hint:string}|{status:'ok';mode:'editor';assessment:string;suggestions:string[]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const number=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const point=(v:unknown):v is Point & Record<string,unknown>=>object(v)&&number(v.x,-2,514)&&number(v.y,-50,32);
const short=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function parseAiRequest(value:unknown):AiRequest {
  if(!object(value)||!['hint','editor'].includes(String(value.mode))||!object(value.course))throw Error('Choose gameplay hints or editor feedback.');
  const c=value.course;
  if(!short(c.title,60)||!['easy','medium','hard'].includes(String(c.difficulty)))throw Error('The course needs a title and difficulty.');
  validateLayoutV2(c.layout);
  const course={title:c.title,difficulty:String(c.difficulty),layout:c.layout};
  if(value.mode==='editor')return {mode:'editor',course};
  const s=value.state;
  if(!object(s)||!point(s.position)||!(s.checkpoint===null||point(s.checkpoint))||s.paused!==true||s.finished!==false||
    !number(s.elapsedMs,0,2147483647)||!number(s.timeLeft,0,900)||!number(s.deaths,0,100000)||!number(s.collected,0,2048)||!number(s.totalItems,0,2048)||
    Number(s.collected)>Number(s.totalItems)||!['SMALL','BIG','FIRE'].includes(String(s.power))||typeof s.star!=='boolean')throw Error('Pause an active run before requesting a hint.');
  const entities=(key:string):LiveEntity[]=>{
    const list=s[key];if(!Array.isArray(list)||list.length>32)throw Error('Invalid nearby gameplay observations.');
    return list.map(v=>{if(!point(v)||!object(v)||!short(v.kind,20)||!['walker','turtle','winged','shell','moving-shell','platform','growth','fire','star'].includes(v.kind)||
      v.direction!==undefined&&![-1,1].includes(Number(v.direction))||v.width!==undefined&&!number(v.width,1,512)||v.behavior!==undefined&&!['patrol','hop','horizontal','vertical','x','y'].includes(String(v.behavior)))throw Error('Invalid nearby gameplay observations.');
      return {x:v.x,y:v.y,kind:v.kind,...(v.direction!==undefined?{direction:Number(v.direction)}:{}),...(v.width!==undefined?{width:Number(v.width)}:{}),...(v.behavior!==undefined?{behavior:String(v.behavior)}:{})};});
  };
  const ids=(key:string)=>{const list=s[key];if(!Array.isArray(list)||list.length>2048||!list.every(v=>typeof v==='string'&&/^(coin|block):\d{1,3},\d{1,2}$/.test(v)))throw Error('Invalid collected or broken components.');return list as string[];};
  return {mode:'hint',course,state:{position:{x:s.position.x,y:s.position.y},checkpoint:s.checkpoint?{x:s.checkpoint.x,y:s.checkpoint.y}:null,elapsedMs:Number(s.elapsedMs),timeLeft:Number(s.timeLeft),deaths:Number(s.deaths),collected:Number(s.collected),totalItems:Number(s.totalItems),paused:true,finished:false,power:s.power as GameplayState['power'],star:s.star,enemies:entities('enemies'),movingPlatforms:entities('movingPlatforms'),powerups:entities('powerups'),consumed:ids('consumed'),broken:ids('broken')}};
}
export function parseAiReply(value:unknown,mode:AiRequest['mode']):AiReply {
  if(!object(value)||value.status!=='ok'||value.mode!==mode)throw Error('AI returned an unreadable response. Please try again.');
  if(mode==='hint'&&short(value.hint,900))return {status:'ok',mode,hint:value.hint.trim()};
  if(mode==='editor'&&short(value.assessment,600)&&Array.isArray(value.suggestions)&&value.suggestions.length===3&&value.suggestions.every(v=>short(v,500)))return {status:'ok',mode,assessment:value.assessment.trim(),suggestions:value.suggestions.map(v=>v.trim())};
  throw Error('AI returned an incomplete response. Please try again.');
}

/** Compact prompt, recomputed on the server. Locations use the editor's 1-based grid. */
export function summarizeContext(request:AiRequest) {
  const {layout:l}=request.course;
  const location=(p:Point)=>({column:Math.round((p.x+1)*10)/10,row:Math.round((p.y+1)*10)/10});
  const nearby=(p:Point&{width?:number})=>request.mode==='editor'||p.x+(p.width??1)>=request.state.position.x-12&&p.x<=request.state.position.x+28;
  const cap=request.mode==='hint'?32:40;
  const sample=<T extends Point>(list:T[])=>{
    const selected=list.filter(nearby).sort((a,b)=>a.x-b.x||a.y-b.y);
    const rows=selected.length<=cap?selected:Array.from({length:cap},(_,i)=>selected[Math.floor(i*(selected.length-1)/(cap-1))]);
    return {total:selected.length,shown:rows.map(({x,y,...rest})=>({...location({x,y}),...rest})),partial:selected.length>cap};
  };
  const consumed=new Set(request.mode==='hint'?request.state.consumed:[]),broken=new Set(request.mode==='hint'?request.state.broken:[]);
  const gaps: {fromColumn:number;toColumn:number}[]=[];let start=-1;
  for(let x=0;x<=l.cols;x++){
    const supported=x<l.cols&&l.terrain.some(p=>x>=p.x&&x<p.x+p.width);
    if(x<l.cols&&!supported&&start<0)start=x;
    if((supported||x===l.cols)&&start>=0){gaps.push({fromColumn:start+1,toColumn:x});start=-1;}
  }
  const data={title:request.course.title,difficulty:request.course.difficulty,theme:l.theme,width:l.cols,height:l.rows,timeLimitSeconds:l.timeLimit,start:location(l.start),finish:location(l.finish),finishHeight:l.finishHeight,
    terrain:sample(l.terrain),platforms:sample(l.platforms),obstacles:sample(l.obstacles),hazards:sample(l.hazards),
    blocks:sample(l.blocks.filter(b=>!broken.has(`block:${b.x},${b.y}`)).map(b=>({...b,content:consumed.has(`block:${b.x},${b.y}`)?'spent':b.content}))),
    coins:sample(l.items.filter(p=>!consumed.has(`coin:${p.x},${p.y}`))),checkpoints:sample(l.checkpoints),
    groundGaps:gaps.filter(g=>request.mode==='editor'||g.toColumn>=request.state.position.x-12&&g.fromColumn<=request.state.position.x+29).slice(0,64),
    enemies:sample<Point>(request.mode==='hint'?request.state.enemies:l.enemies),movingPlatforms:sample<Point>(request.mode==='hint'?request.state.movingPlatforms:l.movingPlatforms),powerups:sample<Point>(request.mode==='hint'?request.state.powerups:l.powerups)};
  return request.mode==='editor'?{mode:'editor',course:data}:{mode:'hint',course:data,player:{position:location(request.state.position),checkpoint:request.state.checkpoint?location(request.state.checkpoint):null,power:request.state.power,star:request.state.star,elapsedSeconds:Math.round(request.state.elapsedMs/100)/10,timeLeft:request.state.timeLeft,deaths:request.state.deaths,collected:request.state.collected,totalCoins:request.state.totalItems}};
}
