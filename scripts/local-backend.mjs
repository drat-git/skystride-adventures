/** Local development only: real PGlite SQL/RLS, fixture Auth and REST translation.
 * This is not Supabase Auth/PostgREST and sends no email. Never deploy this server. */
import { PGlite } from '@electric-sql/pglite';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, readdir, rename, chmod } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const derive=promisify(scrypt), project=resolve(fileURLToPath(new URL('..',import.meta.url)));
export const LOCAL_PUBLIC_KEY='skystride-local-development-public-key';
const RPC={save_draft:['p_id','p_expected_revision','p_title','p_description','p_difficulty','p_layout'],owned_levels:[],own_progress:[],
 start_draft_playtest:['p_level_id','p_expected_revision'],complete_draft_playtest:['p_test_id','p_elapsed_ms','p_deaths'],
 publish_level:['p_level_id','p_expected_revision'],complete_attempt:['p_attempt_id','p_elapsed_ms','p_deaths'],level_leaderboard:['p_level_id'],level_statistics:[]};
const TABLES=new Set(['profiles','levels','play_attempts','achievements','player_achievements','ratings','favorites','draft_playtests']);
const COLUMNS=new Set(['id','display_name','created_at','title','description','difficulty','layout','creator_id','published','updated_at','user_id','level_id','code','name','rule','threshold_ms','achievement_code','earned_at','player_id','score','revision','official_order','started_at','completed_at','elapsed_ms','deaths']);
const fail=(message,status=400,code='LOCAL_REQUEST')=>Object.assign(new Error(message),{status,code});
const ident=value=>{if(!COLUMNS.has(value))throw fail('Unsupported local column');return '"'+value+'"';};
const isLoopbackOrigin=value=>/^http:\/\/(127\.0\.0\.1|localhost):[0-9]{1,5}$/.test(value);

export async function createLocalBackend({dataDir,port=5187,faults={}}={}){
 const persistent=dataDir!==undefined && dataDir!==null && dataDir!==':memory:';
 if(persistent){dataDir=resolve(dataDir);await mkdir(dataDir,{recursive:true,mode:0o700});await chmod(dataDir,0o700);}
 const authFile=persistent?join(dataDir,'local-auth.json'):null;
 let state={version:1,accounts:[],sessions:[]},queue=Promise.resolve(),closed=false;
 if(authFile){try{state=JSON.parse(await readFile(authFile,'utf8'));if(state.version!==1||!Array.isArray(state.accounts)||!Array.isArray(state.sessions))throw Error('Invalid local auth state');}catch(error){if(error.code!=='ENOENT')throw error;}}
 const db=new PGlite(persistent?join(dataDir,'postgres'):undefined);
 const serialize=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
 const persist=async()=>{if(authFile){const temporary=authFile+'.tmp';await writeFile(temporary,JSON.stringify(state),{mode:0o600});await chmod(temporary,0o600);await rename(temporary,authFile);await chmod(authFile,0o600);}};
 try{
  await db.exec(`do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
   create schema if not exists auth;create table if not exists auth.users(id uuid primary key,raw_user_meta_data jsonb);
   create or replace function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
   create schema if not exists local_dev;revoke all on schema local_dev from public,anon,authenticated;
   create table if not exists local_dev.migrations(name text primary key,sha256 text not null,applied_at timestamptz not null default now());`);
  const directory=join(project,'supabase/migrations');
  for(const name of (await readdir(directory)).filter(name=>name.endsWith('.sql')).sort()){
   const sql=await readFile(join(directory,name),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
   const previous=(await db.query('select sha256 from local_dev.migrations where name=$1',[name])).rows[0];
   if(previous){if(previous.sha256!==hash)throw Error(`Local migration ${name} changed after application. Preserve any wanted local test data, then rebuild the isolated local database; hosted data is unaffected.`);continue;}
   const body=sql.replace(/^\s*begin;\s*/mi,'').replace(/\bcommit;\s*$/i,'');
   await db.transaction(async tx=>{await tx.exec(body);await tx.query('insert into local_dev.migrations(name,sha256) values($1,$2)',[name,hash]);});
  }
  // Official V2 courses are installed by their immutable migration. Do not
  // recreate a retired course when opening an existing local database.
  await db.exec(await readFile(join(project,'supabase/seed.sql'),'utf8'));
 }catch(error){await db.close();throw error;}
 const publicUser=account=>({id:account.id,email:account.email,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email',providers:['email']},user_metadata:{display_name:account.displayName},created_at:account.createdAt,email_confirmed_at:account.createdAt,confirmed_at:account.createdAt,identities:[]});
 const issue=async account=>{
  const expires=Math.floor(Date.now()/1000)+3600,jti=randomBytes(32).toString('base64url');
  const token=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:account.id,role:'authenticated',aud:'authenticated',exp:expires,iat:Math.floor(Date.now()/1000),jti})).toString('base64url')+'.'+randomBytes(32).toString('base64url');
  const refresh=randomBytes(48).toString('base64url');state.sessions.push({token,refresh,userId:account.id,expires});await persist();
  return {access_token:token,refresh_token:refresh,expires_in:3600,expires_at:expires,token_type:'bearer',user:publicUser(account)};
 };
 const fault=name=>{if(faults[name]){faults[name]=false;throw fail('Simulated local '+name+' failure',503,'LOCAL_FAULT');}};
 async function authRequest(path,url,data,session,method){
  if(path==='/auth/v1/signup'&&method==='POST'){
   const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof data.password!=='string'||data.password.length<8||data.password.length>128)throw fail('Use a valid email and an 8–128 character local password.');
   const displayName=data.data?.display_name?.trim()??'Player';if(!/^[A-Za-z0-9 _-]{2,24}$/.test(displayName))throw fail('Use a display name of 2–24 letters, numbers, spaces, underscores or hyphens.');
   if(state.accounts.some(a=>a.email===email))throw fail('This local email is already registered.',400,'user_already_exists');
   const salt=randomBytes(16).toString('hex'),hash=(await derive(data.password,salt,64)).toString('hex');
   const account={id:randomUUID(),email,displayName,salt,hash,createdAt:new Date().toISOString()};
   await db.exec('reset role');await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[account.id,{display_name:displayName}]);
   state.accounts.push(account);return issue(account);
  }
  if(path==='/auth/v1/token'&&method==='POST'){
   if(url.searchParams.get('grant_type')==='refresh_token'){
    const old=state.sessions.find(s=>s.refresh===data.refresh_token);const account=old&&state.accounts.find(a=>a.id===old.userId);
    if(!account)throw fail('Invalid local refresh token.',400,'refresh_token_not_found');
    state.sessions=state.sessions.filter(s=>s!==old);return issue(account);
   }
   const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';const account=state.accounts.find(a=>a.email===email);
   const password=typeof data.password==='string'?data.password:'';
   if(password.length>128)throw fail('Invalid local email or password.',400,'invalid_credentials');
   const hash=await derive(password,account?.salt??'local-invalid-credentials-salt',64);
   if(!account||!timingSafeEqual(hash,Buffer.from(account.hash,'hex')))throw fail('Invalid local email or password.',400,'invalid_credentials');
   return issue(account);
  }
  const account=session&&state.accounts.find(a=>a.id===session.userId);
  if(!account)throw fail('Local session missing or expired.',401,'session_not_found');
  if(path==='/auth/v1/user'&&method==='GET')return publicUser(account);
  if(path==='/auth/v1/logout'&&method==='POST'){
   fault('logout');const scope=url.searchParams.get('scope')??'global';
   state.sessions=state.sessions.filter(s=>scope==='local'?s.token!==session.token:scope==='others'?s.userId!==account.id||s.token===session.token:s.userId!==account.id);await persist();return {};
  }
  throw fail('Unsupported local authentication endpoint.',404);
 }
 async function restRequest(path,url,data,session,method,headers){
  const resource=path.split('/').at(-1);const account=session&&state.accounts.find(a=>a.id===session.userId);
  await db.exec('reset role;set role '+(account?'authenticated':'anon'));await db.query("select set_config('request.jwt.claim.sub',$1,false)",[account?.id??'']);
  if(path.startsWith('/rest/v1/rpc/')){
   if(!Object.hasOwn(RPC,resource)||method!=='POST')throw fail('Unsupported local RPC.',404);
   if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).some(key=>!RPC[resource].includes(key))||RPC[resource].some(key=>!Object.hasOwn(data,key)))throw fail('Invalid local RPC arguments.');
   if(resource==='complete_attempt')fault('completion');if(resource==='complete_draft_playtest')fault('playtest');
   const params=RPC[resource].map(key=>data[key]),args=params.map((_,i)=>'$'+(i+1)).join(',');
   const table=['level_statistics','level_leaderboard','own_progress'].includes(resource);
   const rows=(await db.query(table?`select * from public.${resource}(${args})`:`select public.${resource}(${args}) value`,params)).rows;
   if(resource==='save_draft')fault('draftResponse');
   return {body:table?rows:resource==='owned_levels'?rows.map(row=>row.value):rows[0]?.value??null};
  }
  if(!TABLES.has(resource)||path!='/rest/v1/'+resource)throw fail('Unsupported local table.',404);
  const params=[],bind=value=>{params.push(value);return '$'+params.length;};
  const fields=(url.searchParams.get('select')??'*').split(',').map(field=>field==='*'?'*':ident(field)).join(',');
  const conditions=[];
  for(const [key,value]of url.searchParams){
   if(['select','order','limit','offset','on_conflict','columns'].includes(key))continue;
   const column=ident(key);
   if(value.startsWith('eq.'))conditions.push(column+'='+bind(value.slice(3)));
   else if(value==='is.null')conditions.push(column+' is null');
   else if(value==='not.is.null')conditions.push(column+' is not null');
   else throw fail('Unsupported local filter.');
  }
  const where=conditions.length?' where '+conditions.join(' and '):'';let sql;
  if(method==='GET'||method==='HEAD')sql=`select ${fields} from public.${resource}${where}`;
  else if(method==='POST'){
   if(!data||Array.isArray(data)||typeof data!=='object'||!Object.keys(data).length)throw fail('Local inserts accept one object.');
   sql=`insert into public.${resource}(${Object.keys(data).map(ident).join(',')}) values(${Object.values(data).map(bind).join(',')})`;
   if(url.searchParams.has('on_conflict')){
    sql+=' on conflict('+url.searchParams.get('on_conflict').split(',').map(ident).join(',')+') ';
    sql+=headers.prefer?.includes('resolution=ignore-duplicates')?'do nothing':'do update set '+Object.keys(data).map(key=>`${ident(key)}=excluded.${ident(key)}`).join(',');
   }
   sql+=' returning '+fields;
  }else if(method==='PATCH'){
   if(!data||Array.isArray(data)||typeof data!=='object'||!Object.keys(data).length)throw fail('Invalid local update.');
   sql=`update public.${resource} set ${Object.entries(data).map(([key,value])=>ident(key)+'='+bind(value)).join(',')}${where} returning ${fields}`;
  }else if(method==='DELETE')sql=`delete from public.${resource}${where} returning ${fields}`;
  else throw fail('Unsupported local method.',405);
  if(method==='GET'||method==='HEAD'){
   if(url.searchParams.has('order'))sql+=' order by '+url.searchParams.get('order').split(',').map(value=>{const [column,direction]=value.split('.');if(direction&&!['asc','desc'].includes(direction))throw fail('Unsupported local order.');return ident(column)+(direction==='desc'?' desc':' asc');}).join(',');
   let limit=url.searchParams.get('limit'),offset=url.searchParams.get('offset');
   if(headers.range){const match=/^(\d+)-(\d+)$/.exec(headers.range);if(!match)throw fail('Invalid range.');offset=match[1];limit=String(Number(match[2])-Number(match[1])+1);}
   if(limit!==null&&limit!==undefined){if(!/^\d+$/.test(limit)||Number(limit)>10000)throw fail('Invalid local limit.');sql+=' limit '+bind(Number(limit));}
   if(offset!==null&&offset!==undefined){if(!/^\d+$/.test(offset))throw fail('Invalid local offset.');sql+=' offset '+bind(Number(offset));}
  }
  const rows=(await db.query(sql,params)).rows;if(resource==='favorites'&&method==='POST')fault('favoriteResponse');
  if(headers.accept?.includes('vnd.pgrst.object')){if(rows.length!==1)return {status:406,body:{message:'Expected one row',code:'PGRST116',details:`The result contains ${rows.length} rows`}};return {body:rows[0]};}
  return {body:rows};
 }
 const server=createServer(async(req,res)=>{
  const origin=req.headers.origin;
  const reply=(body,status=200)=>{if(res.destroyed)return;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...(origin&&isLoopbackOrigin(origin)?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,accept-profile,content-profile,prefer,x-client-info,x-supabase-api-version,range,range-unit','Access-Control-Allow-Methods':'GET,HEAD,POST,PATCH,DELETE,OPTIONS'}:{})});res.end(req.method==='HEAD'?'':JSON.stringify(body));};
  const address=server.address();if(!address||!['127.0.0.1:'+address.port,'localhost:'+address.port].includes(req.headers.host)||origin&&!isLoopbackOrigin(origin)){reply({message:'Only loopback development clients are allowed.'},403);return;}
  if(req.method==='OPTIONS'){reply({},200);return;}
  if(req.headers.apikey!==LOCAL_PUBLIC_KEY){reply({message:'Use the local development public key.'},401);return;}
  try{
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>1048576)throw fail('Local request exceeds 1 MiB.',413);chunks.push(chunk);}
   const raw=Buffer.concat(chunks).toString('utf8');let data={};try{if(raw)data=JSON.parse(raw);}catch{throw fail('Invalid JSON body.');}
   const url=new URL(req.url,'http://127.0.0.1:'+address.port),token=req.headers.authorization?.replace(/^Bearer /i,'');
   await serialize(async()=>{
    const session=state.sessions.find(s=>s.token===token&&s.expires>Math.floor(Date.now()/1000));
    if(token&&token!==LOCAL_PUBLIC_KEY&&!session&&url.pathname!=='/auth/v1/token')throw fail('Local session missing or expired.',401,'session_not_found');
    if(url.pathname.startsWith('/auth/v1/')){reply(await authRequest(url.pathname,url,data,session,req.method));return;}
    const result=await restRequest(url.pathname,url,data,session,req.method,req.headers);reply(result.body,result.status??200);
   });
  }catch(error){const status=error.status??(error.code==='PT409'?409:error.code==='42501'?403:['23505','23503'].includes(error.code)?409:400);reply({message:error.message,code:error.code??'LOCAL_REQUEST',details:error.detail??null,hint:error.hint??null},status);}
 });
 try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}catch(error){await db.close();throw error;}
 return {url:'http://127.0.0.1:'+server.address().port,db,
  admin:(sql,values=[])=>serialize(async()=>{await db.exec('reset role');return (await db.query(sql,values)).rows;}),
  close:async()=>{if(closed)return;closed=true;await new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});await queue;await db.close();},
 };
}
