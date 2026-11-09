-- Sprint 3: UC04 completion, UC05 private drafts, UC09 awards, UC10 rankings.
-- Existing data is retained. Application roles never receive unrestricted writes.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create function private.valid_level_layout(v jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare p jsonb; q jsonb; k text; x numeric; y numeric; w numeric;
begin
 if v is null or jsonb_typeof(v) <> 'object' or pg_column_size(v)>131072
   or not (v @> '{"version":1,"cols":24,"rows":14}'::jsonb) then return false; end if;
 foreach k in array array['platforms','hazards','checkpoints','items'] loop
  if jsonb_typeof(v->k) is distinct from 'array' then return false; end if;
  if jsonb_array_length(v->k) > (case when k='platforms' then 60 else 50 end) then return false; end if;
 end loop;
 if jsonb_array_length(v->'platforms')=0 or (v->'start'->'x'=v->'finish'->'x' and v->'start'->'y'=v->'finish'->'y') then return false; end if;
 for p in select value from jsonb_array_elements(v->'platforms') loop
  if jsonb_typeof(p->'x') is distinct from 'number' or jsonb_typeof(p->'y') is distinct from 'number'
     or jsonb_typeof(p->'width') is distinct from 'number' then return false; end if;
  x:=(p->>'x')::numeric; y:=(p->>'y')::numeric; w:=(p->>'width')::numeric;
  if x<>trunc(x) or y<>trunc(y) or w<>trunc(w) or x<0 or x>23 or y<1 or y>13 or w<1 or x+w>24 then return false; end if;
 end loop;
 for p in select value from jsonb_array_elements(jsonb_build_array(v->'start',v->'finish') || (v->'hazards') || (v->'checkpoints') || (v->'items')) loop
  if jsonb_typeof(p->'x') is distinct from 'number' or jsonb_typeof(p->'y') is distinct from 'number' then return false; end if;
  x:=(p->>'x')::numeric; y:=(p->>'y')::numeric;
  if x<>trunc(x) or y<>trunc(y) or x<0 or x>23 or y<0 or y>12 then return false; end if;
 end loop;
 foreach k in array array['hazards','checkpoints','items'] loop
  if (select count(*) from jsonb_array_elements(v->k)) <> (select count(distinct (value->>'x',value->>'y')) from jsonb_array_elements(v->k)) then return false; end if;
 end loop;
 for p in select value from jsonb_array_elements(jsonb_build_array(v->'start',v->'finish') || (v->'checkpoints')) loop
  x:=(p->>'x')::numeric; y:=(p->>'y')::numeric;
  if exists(select 1 from jsonb_array_elements(v->'hazards') h where (h->>'x')::numeric=x and (h->>'y')::numeric=y)
    or exists(select 1 from jsonb_array_elements(v->'platforms') t where (t->>'y')::numeric=y and x>=(t->>'x')::numeric and x<(t->>'x')::numeric+(t->>'width')::numeric)
    or not exists(select 1 from jsonb_array_elements(v->'platforms') t where (t->>'y')::numeric=y+1 and x>=(t->>'x')::numeric and x<(t->>'x')::numeric+(t->>'width')::numeric) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end; $$;
revoke all on function private.valid_level_layout(jsonb) from public,anon,authenticated;
grant execute on function private.valid_level_layout(jsonb) to authenticated;
alter table public.levels add constraint levels_valid_layout check(private.valid_level_layout(layout));
grant insert(creator_id,title,description,difficulty,layout), update(title,description,difficulty,layout) on public.levels to authenticated;
create policy own_level_drafts_read on public.levels for select to authenticated using(creator_id=(select auth.uid()));
create policy own_level_drafts_insert on public.levels for insert to authenticated with check(creator_id=(select auth.uid()) and not published);
create policy own_level_drafts_update on public.levels for update to authenticated using(creator_id=(select auth.uid()) and not published) with check(creator_id=(select auth.uid()) and not published);
create function private.touch_level() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=clock_timestamp(); return new; end; $$;
revoke all on function private.touch_level() from public,anon,authenticated;
create trigger level_updated before update on public.levels for each row execute function private.touch_level();

create table public.achievements (
 code text primary key check(code in ('first_completion','first_created_level','first_flight_under_30s')),
 name text not null,
 rule text not null check(rule in ('first_completion','first_created_level','timed_course')),
 threshold_ms integer check(threshold_ms>0),
 check((rule='timed_course' and threshold_ms is not null) or (rule<>'timed_course' and threshold_ms is null))
);
insert into public.achievements values
 ('first_completion','First finish','first_completion',null),
 ('first_created_level','Course creator','first_created_level',null),
 ('first_flight_under_30s','First Flight under 30 seconds','timed_course',30000);
create table public.player_achievements (
 player_id uuid not null references public.profiles(id) on delete cascade,
 achievement_code text not null references public.achievements(code) on delete restrict,
 earned_at timestamptz not null default now(),
 primary key(player_id,achievement_code)
);
create index player_achievements_code_idx on public.player_achievements(achievement_code);
create index attempts_completed_ranking_idx on public.play_attempts(level_id,user_id,elapsed_ms) where completed_at is not null;
alter table public.achievements enable row level security;
alter table public.player_achievements enable row level security;
revoke all on public.achievements, public.player_achievements from anon,authenticated;
grant select on public.achievements,public.player_achievements to authenticated;
create policy achievement_catalog_read on public.achievements for select to authenticated using(true);
create policy own_awards_read on public.player_achievements for select to authenticated using(player_id=(select auth.uid()));

create function private.award_created_level() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.creator_id is not null and new.creator_id=auth.uid() then
  insert into public.player_achievements(player_id,achievement_code) values(new.creator_id,'first_created_level') on conflict do nothing;
 end if;
 return new;
end; $$;
revoke all on function private.award_created_level() from public,anon,authenticated;
create trigger award_first_created_level after insert on public.levels for each row execute function private.award_created_level();

-- Only server defaults may set attempt start time, ID and initial result fields.
revoke insert on public.play_attempts from authenticated;
grant insert(user_id,level_id) on public.play_attempts to authenticated;
create function private.complete_attempt(p_attempt_id uuid,p_elapsed_ms integer,p_deaths integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.play_attempts; caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Sign in to save a result'; end if;
 if p_elapsed_ms is null or p_elapsed_ms<0 or p_elapsed_ms>86400000 or p_deaths is null or p_deaths<0 or p_deaths>100000 then raise exception 'Invalid result'; end if;
 select * into a from public.play_attempts where id=p_attempt_id and user_id=caller for update;
 if not found then raise exception 'Attempt not found'; end if;
 if a.completed_at is not null then
  if a.elapsed_ms=p_elapsed_ms and a.deaths=p_deaths then return a.id; end if;
  raise exception 'A completed attempt cannot be changed';
 end if;
 if not exists(select 1 from public.levels where id=a.level_id and published) then raise exception 'Course is not published'; end if;
 if p_elapsed_ms>extract(epoch from (clock_timestamp()-a.started_at))*1000+1500 then raise exception 'Result exceeds elapsed wall-clock time'; end if;
 update public.play_attempts set completed_at=clock_timestamp(),elapsed_ms=p_elapsed_ms,deaths=p_deaths where id=a.id;
 insert into public.player_achievements(player_id,achievement_code) values(caller,'first_completion') on conflict do nothing;
 if p_elapsed_ms<30000 and exists(select 1 from public.levels where id=a.level_id and creator_id is null and title='First Flight') then
  insert into public.player_achievements(player_id,achievement_code) values(caller,'first_flight_under_30s') on conflict do nothing;
 end if;
 return a.id;
end; $$;
revoke all on function private.complete_attempt(uuid,integer,integer) from public,anon,authenticated;
grant execute on function private.complete_attempt(uuid,integer,integer) to authenticated;
create function public.complete_attempt(p_attempt_id uuid,p_elapsed_ms integer,p_deaths integer)
returns uuid language sql security invoker set search_path='' as $$ select private.complete_attempt(p_attempt_id,p_elapsed_ms,p_deaths); $$;
revoke all on function public.complete_attempt(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.complete_attempt(uuid,integer,integer) to authenticated;

-- A narrow aggregate crosses player RLS intentionally; private attempts remain private.
create function private.level_leaderboard(p_level_id uuid)
returns table(rank bigint,display_name text,elapsed_ms integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view the leaderboard'; end if;
 return query
 with best as (
  select a.user_id,min(a.elapsed_ms) as time_ms from public.play_attempts a
  join public.levels l on l.id=a.level_id and l.published
  where a.level_id=p_level_id and a.completed_at is not null
  group by a.user_id
 )
 select rank() over(order by b.time_ms),p.display_name,b.time_ms
 from best b join public.profiles p on p.id=b.user_id
 order by b.time_ms,b.user_id limit 50;
end; $$;
revoke all on function private.level_leaderboard(uuid) from public,anon,authenticated;
grant execute on function private.level_leaderboard(uuid) to authenticated;
create function public.level_leaderboard(p_level_id uuid)
returns table(rank bigint,display_name text,elapsed_ms integer)
language sql stable security invoker set search_path='' as $$ select * from private.level_leaderboard(p_level_id); $$;
revoke all on function public.level_leaderboard(uuid) from public,anon,authenticated;
grant execute on function public.level_leaderboard(uuid) to authenticated;
commit;
