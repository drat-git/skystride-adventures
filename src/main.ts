import './styles.css';
import { backend, configured } from './backend';
import { practiceLevel, type Level } from './level';
import { mountGame } from './game';
import type { Session } from '@supabase/supabase-js';
const root=document.querySelector<HTMLDivElement>('#app')!;
let session:Session|null=null;
let currentGame:ReturnType<typeof mountGame>|null=null;
let revision=0;
let screen='home';
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function button(id:string,text:string,secondary=false){return `<button id="${id}" class="${secondary?'secondary':''}">${text}</button>`;}
function on(id:string,fn:()=>void){document.getElementById(id)?.addEventListener('click',fn);}
function shell(title:string,body:string) {
  revision++;currentGame?.destroy();currentGame=null;
  root.innerHTML=`<header><a href="#" id="brand" class="brand"><span class="mark">↗</span> SkyStride <span>Adventures</span></a><div class="account">${session?`<span>${escape(session.user.email??'Player')}</span>${button('signout','Sign out',true)}`:`${button('signin','Sign in',true)}`}</div></header><main><p class="eyebrow">GROUP 9 · SPRINT 2</p><h1>${title}</h1>${body}</main><footer>Short courses. One more jump. <span>SkyStride Adventures · Fall 2026</span></footer>`;
  on('brand',()=>{void home();});on('signin',()=>auth(false));on('signout',()=>{void signout();});
}
function message(text:string,error=false) {
  const el=document.getElementById('message');if(el){el.textContent=text;el.className=error?'message error':'message';}
}
async function signout(){
  try{await backend!.logout();session=null;void home();}catch(e){message(`Sign out failed: ${errorText(e)}. Retry before leaving a shared computer.`,true);}
}
function errorText(e:unknown){return e instanceof Error?e.message:typeof e==='object'&&e&&'message'in e?String(e.message):'The request failed. Please try again.';}
async function home() {
  screen='home';
  shell('Find your next flight.',`<div class="hero"><div><p class="lead">A little courage. A well-timed jump. Take on compact platform courses and reach the finish flag.</p><div class="actions">${button('levels','Browse courses')}${button('practice','Local practice',true)}</div><p class="small">Arrow keys or A / D to move. Space, ↑ or W to jump.</p></div><div class="hero-art" aria-label="Illustration of platforms and a finish flag"><span class="sun"></span><span class="mountain one"></span><span class="mountain two"></span><span class="ledge l1"></span><span class="ledge l2"></span><span class="ledge l3"></span><span class="runner"></span><span class="flag">⚑</span></div></div><div class="summary"><article><span class="number">01</span><h2>Play a course</h2><p>Stay light on your feet. Coral hazards reset your position; the clock keeps running.</p></article><article><span class="number">02</span><h2>Keep your account</h2><p>Register, sign in, and save your display name across sessions.</p>${button('profile',session?'Your profile':'Create an account',true)}</article><article><span class="number">03</span><h2>A world to build</h2><p>Level creation, checkpoints, favorites, achievements, and AI assistance are planned for later sprints.</p></article></div><p id="message" class="message" role="status">${configured?'Online courses use the project database.':'Online setup is pending. Local practice works without an account and does not save progress.'}</p>`);
  on('levels',()=>{void levels();});on('practice',()=>play(practiceLevel,true));on('profile',()=>session?void profile():auth(true));
}
function auth(register:boolean) {
  screen='auth';
  shell(register?'Start your adventure.':'Welcome back.',`<div class="form-layout"><form id="authform"><h2>${register?'Create account':'Sign in'}</h2>${register?'<label>Display name<input name="displayName" required minlength="2" maxlength="24" autocomplete="nickname" pattern="[A-Za-z0-9 _-]{2,24}"></label>':''}<label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label><label>Password<input name="password" type="password" required minlength="${register?8:1}" maxlength="128" autocomplete="${register?'new-password':'current-password'}"></label><p class="small">${register?'Use 8–128 characters. Your password is handled by the authentication provider.':'Enter your registered email and password.'}</p><button type="submit" ${backend?'':'disabled'}>${register?'Create account':'Sign in'}</button><p id="message" role="status" class="message">${backend?'': 'Online accounts are unavailable until Supabase is configured.'}</p></form><aside><h2>${register?'Your place in the clouds':'Ready for another run?'}</h2><p>${register?'Your account retains your profile. Shared level interactions and progress will follow in later sprints.':'Sign in to load your saved profile, or try the course in local practice.'}</p>${button('switch',register?'Already registered? Sign in':'New here? Create an account',true)}${button('back','Back to menu',true)}</aside></div>`);
  on('switch',()=>auth(!register));on('back',()=>{void home();});
  document.querySelector<HTMLFormElement>('#authform')!.addEventListener('submit',async e=>{
    e.preventDefault();if(!backend)return;
    const form=e.currentTarget as HTMLFormElement;const data=new FormData(form);const submit=form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    const stamp=revision;submit.disabled=true;message('Connecting…');
    try{
      if(register){const result=await backend.register(String(data.get('email')),String(data.get('password')),String(data.get('displayName')));
        if(!result.session && stamp===revision){message('Check your email for a confirmation link. If you already have an account, sign in.');form.reset();}
      }else await backend.login(String(data.get('email')),String(data.get('password')));
    }catch(err){if(stamp===revision)message(errorText(err),true);}finally{if(stamp===revision)submit.disabled=false;}
  });
}
async function profile(){
  if(!session||!backend){auth(false);return;}screen='profile';
  shell('Your player profile.',`<p id="message" class="message" role="status">Loading profile…</p><div id="profilebody"></div>${button('back','Back to menu',true)}`);
  on('back',()=>{void home();});const stamp=revision,uid=session.user.id;
  try{const p=await backend.profile(uid);if(stamp!==revision)return;
    document.getElementById('profilebody')!.innerHTML=`<form id="profileform"><label>Display name<input name="name" value="${escape(p.display_name)}" required minlength="2" maxlength="24" pattern="[A-Za-z0-9 _-]{2,24}"></label><p class="small">Saved to your account in the database.</p><button>Save display name</button></form>`;message('Profile loaded.');
    document.querySelector<HTMLFormElement>('#profileform')!.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget as HTMLFormElement;const btn=form.querySelector('button')!;btn.disabled=true;
      try{const name=await backend!.updateProfile(uid,String(new FormData(form).get('name')));if(stamp===revision)message(`Saved display name: ${name}`);}catch(err){if(stamp===revision)message(errorText(err),true);}finally{if(stamp===revision)btn.disabled=false;}});
  }catch(err){if(stamp===revision)message(`Profile could not be loaded: ${errorText(err)}`,true);}
}
async function levels(){
  screen='levels';shell('Choose a course.',`<p class="lead">Short runs, clear goals. Choose a published course to begin.</p><p id="message" role="status" class="message">Loading online courses…</p><div id="courses" class="courses"></div><div class="actions">${button('reload','Retry online courses',true)}${button('practice','Local practice',true)}${button('back','Back to menu',true)}</div>`);
  on('back',()=>{void home();});on('reload',()=>{void levels();});on('practice',()=>play(practiceLevel,true));const stamp=revision;
  if(!backend){message('Online courses need Supabase setup. Local practice is available separately.',true);return;}
  try{const list=await backend.levels();if(stamp!==revision)return;
    message(list.length?`${list.length} published course${list.length===1?'':'s'} loaded from the database.`:'No published courses yet. Retry after the seed is installed.');
    const container=document.getElementById('courses')!;
    for(const [i,level] of list.entries()){
      const card=document.createElement('article');card.className='course';card.innerHTML=`<div class="course-preview"><span>↗</span><i></i><i></i><i></i></div><div class="course-body"><span class="badge">${escape(level.difficulty)}</span><h2>${escape(level.title)}</h2><p>${escape(level.description)}</p>${button(`course-${i}`,'Play course')}</div>`;
      container.append(card);on(`course-${i}`,()=>play(level,false));
    }
  }catch(err){if(stamp===revision)message(`Online courses could not be loaded: ${errorText(err)}`,true);}
}
function play(level:Level,local:boolean){
  screen='play';shell(escape(level.title),`<div class="game-meta"><span class="badge">${local?'LOCAL PRACTICE':'ONLINE COURSE'}</span><p>Move: ← / → or A / D · Jump: Space / ↑ / W</p></div><div id="game" class="game"></div><p id="message" class="message" role="status">Reach the gold flag. This sprint does not save completion times.</p><div class="actions">${button('pause','Pause',true)}${button('retry','Restart course',true)}${button('back','Back to courses',true)}</div>`);
  let paused=false;const stamp=revision;
  try{currentGame=mountGame(document.getElementById('game')!,level,(elapsed,deaths)=>{if(stamp!==revision)return;message(`Course complete! ${(elapsed/1000).toFixed(2)} seconds · ${deaths} deaths. Result is for this run only.`);document.getElementById('pause')!.setAttribute('disabled','');});
    currentGame.game.events.on('pause-changed',(value:boolean)=>{paused=value;const b=document.getElementById('pause');if(b)b.textContent=paused?'Resume':'Pause';});
  }catch(err){message(errorText(err),true);}
  on('pause',()=>currentGame?.scene.setPaused(!paused));on('retry',()=>play(level,local));on('back',()=>{void levels();});
}
async function start(){
  await home();
  if(!backend)return;
  // Never await another auth operation inside this callback (provider lock).
  backend.client.auth.onAuthStateChange((_event,next)=>{
    const previous=session?.user.id;session=next;
    if(previous!==next?.user.id) setTimeout(()=>{
      if(screen==='auth'&&next)void profile();else void home();
    },0);
  });
  const {data,error}=await backend.client.auth.getSession();
  if(error)message(`Session could not be restored: ${error.message}`,true);
  else {session=data.session;if(session&&screen==='home')void home();}
}
void start();
