-- Persist completed-run score/challenge evidence and remove life mechanics.
-- Existing users, attempts, interactions and earned award identities are retained.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function private.valid_level_layout_v2_shape(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare
 cols integer; total integer:=0; k text; p jsonb; x integer; y integer; n integer; lim integer;
 expected text[]; names text[]:=array['terrain','platforms','blocks','items','powerups','hazards','checkpoints','enemies','movingPlatforms','obstacles','decorations'];
begin
 if not private.v2_keys(v,array['version','cols','rows','theme','timeLimit','start','finish','finishHeight']||names)
  or v->'version' is distinct from '2'::jsonb or v->'rows' is distinct from '25'::jsonb
  or not private.v2_integer(v->'cols',24,512) or not private.v2_integer(v->'timeLimit',30,900)
  or not private.v2_integer(v->'finishHeight',1,20) or v->>'theme' not in ('overworld','cave','sky') then return false; end if;
 -- V2 fields contain only numbers, booleans/containers and whitelisted ASCII enums.
 -- Compact JSON size matches the client's serialization cap; no arbitrary strings.
 if octet_length(regexp_replace(v::text,'[[:space:]]','','g'))>262144 then return false; end if;
 cols:=(v->>'cols')::integer;
 if not private.v2_keys(v->'start',array['x','y']) or not private.v2_point(v->'start',cols)
  or not private.v2_keys(v->'finish',array['x','y']) or not private.v2_point(v->'finish',cols)
  or v->'start'=v->'finish' or (v->>'finishHeight')::integer>(v->'finish'->>'y')::integer+1 then return false; end if;
 foreach k in array names loop
  if jsonb_typeof(v->k) is distinct from 'array' then return false; end if;
  lim:=case when k in ('terrain','platforms') then 512 when k in ('blocks','items','decorations') then 1024
   when k='checkpoints' then 64 when k='movingPlatforms' then 128 else 256 end;
  n:=jsonb_array_length(v->k); total:=total+n;
  if n>lim then return false; end if;
  expected:=case k
   when 'terrain' then array['x','y','width'] when 'platforms' then array['x','y','width']
   when 'blocks' then array['x','y','kind','content'] when 'items' then array['x','y']
   when 'powerups' then array['x','y','kind'] when 'hazards' then array['x','y','width','kind']
   when 'checkpoints' then array['x','y'] when 'enemies' then array['x','y','kind','behavior','direction','speed','range']
   when 'movingPlatforms' then array['x','y','width','axis','distance','durationMs']
   when 'obstacles' then array['x','y','width','height','kind'] when 'decorations' then array['x','y','kind'] end;
  for p in select value from jsonb_array_elements(v->k) loop
   if not private.v2_keys(p,expected) or not private.v2_point(p,cols) then return false; end if;
   x:=(p->>'x')::integer; y:=(p->>'y')::integer;
   if k in ('terrain','platforms','hazards','movingPlatforms','obstacles') and not private.v2_integer(p->'width',1,cols-x) then return false; end if;
   if k='blocks' and (p->>'kind' not in ('solid','breakable','glow','hidden') or p->>'content' not in ('none','coin','adaptive','growth','fire','star')
    or (p->>'kind' in ('solid','breakable') and p->>'content'<>'none') or (p->>'kind'='glow' and p->>'content'='none')
    or (p->>'kind'='hidden' and p->>'content'<>'coin')) then return false; end if;
   if k='powerups' and p->>'kind' not in ('growth','fire','star') then return false; end if;
   if k='hazards' and p->>'kind' not in ('spike','lava') then return false; end if;
   if k='enemies' then
    if p->>'kind' not in ('walker','turtle','winged') or p->'direction' not in ('-1'::jsonb,'1'::jsonb)
     or jsonb_typeof(p->'speed') is distinct from 'number' or (p->>'speed')::numeric<10 or (p->>'speed')::numeric>120
     or not private.v2_integer(p->'range',1,16) then return false; end if;
    if (p->>'kind'='winged' and p->>'behavior' not in ('hop','horizontal','vertical'))
     or (p->>'kind'<>'winged' and p->>'behavior'<>'patrol') then return false; end if;
   end if;
   if k='movingPlatforms' then
    if p->>'axis' not in ('x','y') or not private.v2_integer(p->'distance',1,16) or not private.v2_integer(p->'durationMs',1000,12000) then return false; end if;
    if (p->>'axis'='x' and x+(p->>'width')::integer+(p->>'distance')::integer>cols)
     or (p->>'axis'='y' and y+(p->>'distance')::integer>=25) then return false; end if;
   end if;
   if k='obstacles' and (p->>'kind' not in ('column','rock','ruin') or not private.v2_integer(p->'height',1,25-y)) then return false; end if;
   if k='decorations' and p->>'kind' not in ('sign','bush','pine','sprout','cloud','crystal','ruin','door','terrain') then return false; end if;
  end loop;
  if n<>(select count(distinct ((value->>'x')::numeric,(value->>'y')::numeric)) from jsonb_array_elements(v->k)) then return false; end if;
 end loop;
 if total>4096 then return false; end if;
 -- JSON null enum values must fail rather than being swallowed by SQL NULL logic.
 if jsonb_path_exists(v,'$.** ? (@ == null)') then return false; end if;
 for p in select value from jsonb_array_elements(jsonb_build_array(v->'start',v->'finish')||(v->'checkpoints')) loop
  x:=(p->>'x')::integer; y:=(p->>'y')::integer;
  if private.v2_solid(v,x,y) or private.v2_danger(v,x,y) or not private.v2_solid(v,x,y+1,true) then return false; end if;
 end loop;
 for p in select value from jsonb_array_elements((v->'items')||(v->'powerups')) loop
  x:=(p->>'x')::integer; y:=(p->>'y')::integer;
  if private.v2_solid(v,x,y) or private.v2_danger(v,x,y) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end; $$;

-- Convert only the requested course properties. Temporarily disable the
-- immutable-publication trigger inside this transaction; its normal protection
-- is restored before commit. Revision changes invalidate old draft approvals.
alter table public.levels disable trigger level_updated;
with converted as (
 select l.id,
  jsonb_set(jsonb_set(jsonb_set(jsonb_set(l.layout,'{timeLimit}','150'::jsonb),
   '{blocks}',coalesce((select jsonb_agg(case when b->>'content'='life' then jsonb_set(b,'{content}','"coin"'::jsonb) else b end order by ord)
     from jsonb_array_elements(l.layout->'blocks') with ordinality as t(b,ord)),'[]'::jsonb)),
   '{powerups}',coalesce((select jsonb_agg(p order by ord) from jsonb_array_elements(l.layout->'powerups') with ordinality as t(p,ord) where p->>'kind'<>'life'),'[]'::jsonb)),
   '{items}',coalesce((select jsonb_agg(item order by source,ord) from (
      select i as item,0 as source,ord from jsonb_array_elements(l.layout->'items') with ordinality as t(i,ord)
      union all
      select p-'kind',1,ord from jsonb_array_elements(l.layout->'powerups') with ordinality as t(p,ord)
      where p->>'kind'='life' and not exists(select 1 from jsonb_array_elements(l.layout->'items') i where i=p-'kind')
    ) items),'[]'::jsonb)) as layout
 from public.levels l
)
update public.levels l set layout=c.layout,revision=l.revision+1,updated_at=clock_timestamp()
 from converted c where l.id=c.id and l.layout is distinct from c.layout;
alter table public.levels enable trigger level_updated;
do $$ begin
 if exists(select 1 from public.levels where not private.valid_level_layout(layout)) then raise exception 'Converted course failed validation'; end if;
end; $$;

-- Null means the earlier client did not record this evidence; never infer it.
alter table public.play_attempts
 add column score integer check(score between 0 and 1000000000),
 add column collected integer check(collected between 0 and 2048),
 add column total_items integer check(total_items between 0 and 2048),
 add column small_only boolean,
 add constraint attempts_extended_result_check check(
  (score is null and collected is null and total_items is null and small_only is null) or
  (completed_at is not null and score is not null and collected is not null and total_items is not null and small_only is not null and collected<=total_items));
create index attempts_completed_score_idx on public.play_attempts(level_id,user_id,score desc,elapsed_ms)
 where completed_at is not null and score is not null;

alter table public.achievements drop constraint achievements_code_check;
alter table public.achievements drop constraint achievements_rule_check;
alter table public.achievements drop constraint achievements_check;
alter table public.achievements
 add column level_id uuid references public.levels(id) on delete restrict,
 add column description text not null default '',
 add constraint achievements_code_check check(code ~ '^(first_completion|first_created_level|first_flight_under_30s|official_[1-6]_(all_coins|under_15s|small_only))$'),
 add constraint achievements_rule_check check(rule in ('first_completion','first_created_level','timed_course','official_all_coins','official_under_15s','official_small_only')),
 add constraint achievements_threshold_check check((rule in ('timed_course','official_under_15s') and threshold_ms is not null) or (rule not in ('timed_course','official_under_15s') and threshold_ms is null)),
 add constraint achievements_course_check check((rule like 'official_%' and level_id is not null) or (rule not like 'official_%' and level_id is null));
create index achievements_level_idx on public.achievements(level_id) where level_id is not null;
update public.achievements set description=case code
 when 'first_completion' then 'Complete a published course while signed in.'
 when 'first_created_level' then 'Save your first private draft.'
 when 'first_flight_under_30s' then 'Complete Meadow Run in under 30 seconds.' end;
insert into public.achievements(code,name,rule,threshold_ms,level_id,description)
 select 'official_'||l.official_order||'_'||c.code,l.title||' — '||c.name,c.rule,c.threshold_ms,l.id,
  replace(c.description,'{course}',l.title)
 from public.levels l cross join (values
  ('all_coins','All coins','official_all_coins',null::integer,'Collect every coin and finish {course} in the same run.'),
  ('under_15s','Under 15 seconds','official_under_15s',15000,'Finish {course} in under 15 seconds of elapsed gameplay time.'),
  ('small_only','Small all the way','official_small_only',null::integer,'Finish {course} while staying SMALL for the entire run, without growth, fire or star power.')
 ) as c(code,name,rule,threshold_ms,description)
 where l.official_order between 1 and 6;

-- Keep complete_attempt(uuid,int,int) available for earlier clients. Their
-- records contribute to time rankings, but have no invented score or awards.
create function private.complete_run(p_attempt_id uuid,p_elapsed_ms integer,p_deaths integer,
 p_score integer,p_collected integer,p_total_items integer,p_small_only boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.play_attempts; l public.levels; caller uuid:=auth.uid(); coins integer;
begin
 if caller is null then raise exception 'Sign in to save a result'; end if;
 if p_elapsed_ms is null or p_elapsed_ms<0 or p_elapsed_ms>86400000
  or p_deaths is null or p_deaths<0 or p_deaths>100000
  or p_score is null or p_score<0 or p_score>1000000000
  or p_collected is null or p_collected<0 or p_collected>2048
  or p_total_items is null or p_total_items<0 or p_total_items>2048
  or p_collected>p_total_items or p_small_only is null then raise exception 'Invalid completed run'; end if;
 select * into a from public.play_attempts where id=p_attempt_id and user_id=caller for update;
 if not found then raise exception 'Attempt not found'; end if;
 if a.completed_at is not null then
  if (a.elapsed_ms,a.deaths,a.score,a.collected,a.total_items,a.small_only) is not distinct from
   (p_elapsed_ms,p_deaths,p_score,p_collected,p_total_items,p_small_only) then return a.id; end if;
  raise exception 'A completed attempt cannot be changed';
 end if;
 select * into l from public.levels where id=a.level_id and published;
 if not found then raise exception 'Course is not published'; end if;
 coins:=jsonb_array_length(l.layout->'items')+(select count(*) from jsonb_array_elements(l.layout->'blocks') b where b->>'content'='coin');
 if p_total_items<>coins then raise exception 'Course coin count changed. Restart the course before saving a result.'; end if;
 if p_elapsed_ms>extract(epoch from (clock_timestamp()-a.started_at))*1000+1500 then raise exception 'Result exceeds elapsed wall-clock time'; end if;
 update public.play_attempts set completed_at=clock_timestamp(),elapsed_ms=p_elapsed_ms,deaths=p_deaths,
  score=p_score,collected=p_collected,total_items=p_total_items,small_only=p_small_only where id=a.id;
 insert into public.player_achievements(player_id,achievement_code) values(caller,'first_completion') on conflict do nothing;
 if a.level_id='22222222-2222-4222-8222-000000000001'::uuid
  and p_elapsed_ms<(select threshold_ms from public.achievements where code='first_flight_under_30s') then
  insert into public.player_achievements(player_id,achievement_code) values(caller,'first_flight_under_30s') on conflict do nothing;
 end if;
 insert into public.player_achievements(player_id,achievement_code)
  select caller,c.code from public.achievements c where c.level_id=l.id and l.official_order between 1 and 6
   and ((c.rule='official_all_coins' and coins>0 and p_collected=coins)
    or (c.rule='official_under_15s' and p_elapsed_ms<c.threshold_ms)
    or (c.rule='official_small_only' and p_small_only)) on conflict do nothing;
 return a.id;
end; $$;
revoke all on function private.complete_run(uuid,integer,integer,integer,integer,integer,boolean) from public,anon,authenticated;
grant execute on function private.complete_run(uuid,integer,integer,integer,integer,integer,boolean) to authenticated;
create function public.complete_run(p_attempt_id uuid,p_elapsed_ms integer,p_deaths integer,
 p_score integer,p_collected integer,p_total_items integer,p_small_only boolean)
returns uuid language sql security invoker set search_path='' as $$
 select private.complete_run(p_attempt_id,p_elapsed_ms,p_deaths,p_score,p_collected,p_total_items,p_small_only);
$$;
revoke all on function public.complete_run(uuid,integer,integer,integer,integer,integer,boolean) from public,anon,authenticated;
grant execute on function public.complete_run(uuid,integer,integer,integer,integer,integer,boolean) to authenticated;

-- Each mode chooses one actual completed run per player. Legacy unknown scores
-- are excluded only from score mode. Ties share rank, with stable display order.
create function private.course_leaderboard(p_level_id uuid,p_mode text)
returns table(rank bigint,display_name text,elapsed_ms integer,score integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view the leaderboard'; end if;
 if p_mode is null or p_mode not in ('time','score') then raise exception 'Choose time or score ranking'; end if;
 return query
 with candidates as (
  select a.user_id,a.elapsed_ms,a.score,
   row_number() over(partition by a.user_id order by
    case when p_mode='time' then a.elapsed_ms end asc,
    case when p_mode='score' then a.score end desc,
    a.elapsed_ms,a.completed_at,a.id) as position
  from public.play_attempts a join public.levels l on l.id=a.level_id and l.published
  where a.level_id=p_level_id and a.completed_at is not null and (p_mode='time' or a.score is not null)
 ), best as (select * from candidates c where c.position=1)
 select rank() over(order by case when p_mode='time' then b.elapsed_ms end asc,
  case when p_mode='score' then b.score end desc),p.display_name,b.elapsed_ms,b.score
 from best b join public.profiles p on p.id=b.user_id
 order by 1,b.elapsed_ms,b.user_id limit 50;
end; $$;
revoke all on function private.course_leaderboard(uuid,text) from public,anon,authenticated;
grant execute on function private.course_leaderboard(uuid,text) to authenticated;
create function public.course_leaderboard(p_level_id uuid,p_mode text)
returns table(rank bigint,display_name text,elapsed_ms integer,score integer)
language sql stable security invoker set search_path='' as $$ select * from private.course_leaderboard(p_level_id,p_mode); $$;
revoke all on function public.course_leaderboard(uuid,text) from public,anon,authenticated;
grant execute on function public.course_leaderboard(uuid,text) to authenticated;
commit;
