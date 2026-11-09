-- Retire V1 only after exporting affected courses and dependent records.
-- Accounts, all V2 records and earned award identities/timestamps are retained.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Refuse to retire the old challenge before its verified replacement exists.
do $$ begin
 if not exists(select 1 from public.levels
   where id='22222222-2222-4222-8222-000000000001'::uuid
     and official_order=1 and published and layout->'version'='2'::jsonb) then
  raise exception 'The published Meadow Run V2 challenge must exist before retiring V1';
 end if;
end; $$;

-- The four course-owned tables use ON DELETE CASCADE. Nothing references a
-- course from profiles/auth or earned awards, so those records remain intact.
delete from public.levels where layout->'version'='1'::jsonb;

create or replace function private.valid_level_layout(v jsonb) returns boolean
language sql immutable security invoker set search_path='' as $$
 select coalesce(v->'version'='2'::jsonb,false) and private.valid_level_layout_v2(v);
$$;
revoke all on function private.valid_level_layout(jsonb) from public,anon,authenticated;
grant execute on function private.valid_level_layout(jsonb) to authenticated;
alter table public.levels drop constraint levels_layout_check;
alter table public.levels add constraint levels_layout_check
 check(jsonb_typeof(layout)='object' and layout->'version'='2'::jsonb);
drop function private.valid_level_layout_v1(jsonb);

-- Keep the stable award key so previously earned awards keep their exact row
-- identity and earned_at. Only its visible name and qualifying course change.
update public.achievements set name='Meadow Run under 30 seconds'
 where code='first_flight_under_30s';

create or replace function private.complete_attempt(p_attempt_id uuid,p_elapsed_ms integer,p_deaths integer)
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
 if a.level_id='22222222-2222-4222-8222-000000000001'::uuid and p_elapsed_ms<(select threshold_ms from public.achievements where code='first_flight_under_30s') then
  insert into public.player_achievements(player_id,achievement_code) values(caller,'first_flight_under_30s') on conflict do nothing;
 end if;
 return a.id;
end; $$;
revoke all on function private.complete_attempt(uuid,integer,integer) from public,anon,authenticated;
grant execute on function private.complete_attempt(uuid,integer,integer) to authenticated;

commit;
