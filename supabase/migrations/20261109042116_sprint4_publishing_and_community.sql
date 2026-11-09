-- Sprint 4: revision-safe drafts, qualified publication, and community aggregates.
-- Additive upgrade. Existing account/course/interaction/award records are retained.
begin;

alter table public.levels add column revision integer not null default 1 check(revision > 0);

-- Saves go through an atomic ownership/revision check. Column grants must also be
-- revoked: revoking a table-level privilege does not remove column privileges.
revoke insert, update on public.levels from authenticated;
revoke insert(creator_id,title,description,difficulty,layout), update(title,description,difficulty,layout) on public.levels from authenticated;

create or replace function private.touch_level() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.published and (new.title,new.description,new.difficulty,new.layout,new.published)
   is distinct from (old.title,old.description,old.difficulty,old.layout,old.published) then
  raise exception 'Published courses are immutable. Copy this course to a new draft.';
 end if;
 if (new.title,new.description,new.difficulty,new.layout)
   is distinct from (old.title,old.description,old.difficulty,old.layout) then
  new.revision:=old.revision+1;
 else new.revision:=old.revision; end if;
 new.updated_at:=clock_timestamp();
 return new;
end; $$;

create table public.draft_playtests (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 level_id uuid not null references public.levels(id) on delete cascade,
 revision integer not null check(revision>0),
 started_at timestamptz not null default clock_timestamp(),
 completed_at timestamptz,
 elapsed_ms integer check(elapsed_ms between 0 and 86400000),
 deaths integer check(deaths between 0 and 100000),
 check((completed_at is null and elapsed_ms is null and deaths is null) or
       (completed_at is not null and elapsed_ms is not null and deaths is not null and completed_at>=started_at))
);
create index draft_playtests_owner_idx on public.draft_playtests(user_id);
create index draft_playtests_level_revision_idx on public.draft_playtests(level_id,revision) where completed_at is not null;
create index draft_playtests_level_idx on public.draft_playtests(level_id);
alter table public.draft_playtests enable row level security;
revoke all on public.draft_playtests from public,anon,authenticated;
grant select on public.draft_playtests to authenticated;
create policy own_draft_playtests_read on public.draft_playtests for select to authenticated using(user_id=(select auth.uid()));

create function private.owned_level_json(p_level_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select to_jsonb(l) || jsonb_build_object('can_publish',not l.published and exists(
  select 1 from public.draft_playtests t where t.level_id=l.id and t.user_id=auth.uid()
   and t.revision=l.revision and t.completed_at is not null))
 from public.levels l where l.id=p_level_id and l.creator_id=auth.uid();
$$;
revoke all on function private.owned_level_json(uuid) from public,anon,authenticated;
grant execute on function private.owned_level_json(uuid) to authenticated;

create function public.owned_levels() returns setof jsonb
language sql stable security invoker set search_path='' as $$
 select private.owned_level_json(l.id) from public.levels l
 where l.creator_id=auth.uid() order by l.updated_at desc,l.id;
$$;
revoke all on function public.owned_levels() from public,anon,authenticated;
grant execute on function public.owned_levels() to authenticated;

create function private.save_draft(p_id uuid,p_expected_revision integer,p_title text,p_description text,p_difficulty text,p_layout jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.levels; caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Sign in to save a draft'; end if;
 if p_id is null or p_title is null or p_description is null or p_difficulty is null or p_layout is null then raise exception 'Missing draft fields'; end if;
 if p_expected_revision is not null and p_expected_revision<1 then raise exception 'Invalid draft revision'; end if;
 if p_expected_revision is null then
  insert into public.levels(id,creator_id,title,description,difficulty,layout)
   values(p_id,caller,btrim(p_title),btrim(p_description),p_difficulty,p_layout)
   on conflict(id) do nothing;
 end if;
 select * into l from public.levels where id=p_id and creator_id=caller for update;
 if not found then raise exception 'Draft not found'; end if;
 if l.published then raise exception 'Published courses are immutable. Copy this course to a new draft.'; end if;
 -- A successful save whose response was lost is safe to retry with identical data.
 if (l.title,l.description,l.difficulty,l.layout) is not distinct from
    (btrim(p_title),btrim(p_description),p_difficulty,p_layout) then return private.owned_level_json(l.id); end if;
 if p_expected_revision is null or l.revision<>p_expected_revision then
  raise exception 'This draft changed in another tab. Reload it or save your edits as a new draft.' using errcode='40001';
 end if;
 update public.levels set title=btrim(p_title),description=btrim(p_description),difficulty=p_difficulty,layout=p_layout where id=l.id;
 return private.owned_level_json(l.id);
end; $$;
revoke all on function private.save_draft(uuid,integer,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.save_draft(uuid,integer,text,text,text,jsonb) to authenticated;
create function public.save_draft(p_id uuid,p_expected_revision integer,p_title text,p_description text,p_difficulty text,p_layout jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select private.save_draft(p_id,p_expected_revision,p_title,p_description,p_difficulty,p_layout);
$$;
revoke all on function public.save_draft(uuid,integer,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_draft(uuid,integer,text,text,text,jsonb) to authenticated;

create function private.start_draft_playtest(p_level_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.levels; test_id uuid; caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Sign in to test a saved draft'; end if;
 select * into l from public.levels where id=p_level_id and creator_id=caller for update;
 if not found then raise exception 'Draft not found'; end if;
 if l.published then raise exception 'This course is already published'; end if;
 if p_expected_revision is null or l.revision<>p_expected_revision then raise exception 'Draft revision changed. Reload and test the saved version.' using errcode='40001'; end if;
 insert into public.draft_playtests(user_id,level_id,revision) values(caller,l.id,l.revision) returning id into test_id;
 return jsonb_build_object('id',test_id,'level',private.owned_level_json(l.id));
end; $$;
revoke all on function private.start_draft_playtest(uuid,integer) from public,anon,authenticated;
grant execute on function private.start_draft_playtest(uuid,integer) to authenticated;
create function public.start_draft_playtest(p_level_id uuid,p_expected_revision integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.start_draft_playtest(p_level_id,p_expected_revision); $$;
revoke all on function public.start_draft_playtest(uuid,integer) from public,anon,authenticated;
grant execute on function public.start_draft_playtest(uuid,integer) to authenticated;

create function private.complete_draft_playtest(p_test_id uuid,p_elapsed_ms integer,p_deaths integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.draft_playtests; l public.levels; caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Sign in to record a playtest'; end if;
 if p_elapsed_ms is null or p_elapsed_ms<0 or p_elapsed_ms>86400000 or p_deaths is null or p_deaths<0 or p_deaths>100000 then raise exception 'Invalid playtest result'; end if;
 select * into t from public.draft_playtests where id=p_test_id and user_id=caller;
 if not found then raise exception 'Playtest not found'; end if;
 -- Always lock level before test; saving/publication use the same ordering.
 select * into l from public.levels where id=t.level_id and creator_id=caller for update;
 if not found then raise exception 'Draft not found'; end if;
 select * into t from public.draft_playtests where id=p_test_id and user_id=caller for update;
 if l.revision<>t.revision then raise exception 'Draft changed. Test the current saved version again.' using errcode='40001'; end if;
 if t.completed_at is not null then
  if t.elapsed_ms=p_elapsed_ms and t.deaths=p_deaths then return t.id; end if;
  raise exception 'A completed playtest cannot be changed';
 end if;
 if l.published then raise exception 'This course is already published'; end if;
 if p_elapsed_ms>extract(epoch from(clock_timestamp()-t.started_at))*1000+1500 then raise exception 'Playtest exceeds elapsed wall-clock time'; end if;
 update public.draft_playtests set completed_at=clock_timestamp(),elapsed_ms=p_elapsed_ms,deaths=p_deaths where id=t.id;
 return t.id;
end; $$;
revoke all on function private.complete_draft_playtest(uuid,integer,integer) from public,anon,authenticated;
grant execute on function private.complete_draft_playtest(uuid,integer,integer) to authenticated;
create function public.complete_draft_playtest(p_test_id uuid,p_elapsed_ms integer,p_deaths integer)
returns uuid language sql security invoker set search_path='' as $$ select private.complete_draft_playtest(p_test_id,p_elapsed_ms,p_deaths); $$;
revoke all on function public.complete_draft_playtest(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.complete_draft_playtest(uuid,integer,integer) to authenticated;

create function private.publish_level(p_level_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.levels; caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Sign in to publish a course'; end if;
 select * into l from public.levels where id=p_level_id and creator_id=caller for update;
 if not found then raise exception 'Draft not found'; end if;
 if p_expected_revision is null or l.revision<>p_expected_revision then raise exception 'Draft changed. Test the current saved version again.' using errcode='40001'; end if;
 if l.published then return private.owned_level_json(l.id); end if;
 if not exists(select 1 from public.draft_playtests where level_id=l.id and user_id=caller and revision=l.revision and completed_at is not null) then
  raise exception 'Finish a playtest of this saved version before publishing';
 end if;
 update public.levels set published=true where id=l.id;
 return private.owned_level_json(l.id);
end; $$;
revoke all on function private.publish_level(uuid,integer) from public,anon,authenticated;
grant execute on function private.publish_level(uuid,integer) to authenticated;
create function public.publish_level(p_level_id uuid,p_expected_revision integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.publish_level(p_level_id,p_expected_revision); $$;
revoke all on function public.publish_level(uuid,integer) from public,anon,authenticated;
grant execute on function public.publish_level(uuid,integer) to authenticated;

-- Aggregates intentionally cross individual-row privacy, revealing only totals
-- for published courses, never account IDs or individual rating/favorite rows.
grant usage on schema private to anon;
create function private.level_statistics()
returns table(level_id uuid,average_rating numeric,rating_count bigint,favorite_count bigint)
language sql stable security definer set search_path='' as $$
 select l.id,r.average_rating,coalesce(r.rating_count,0),coalesce(f.favorite_count,0)
 from public.levels l
 left join (select level_id,avg(score) as average_rating,count(*) as rating_count from public.ratings group by level_id) r on r.level_id=l.id
 left join (select level_id,count(*) as favorite_count from public.favorites group by level_id) f on f.level_id=l.id
 where l.published;
$$;
revoke all on function private.level_statistics() from public,anon,authenticated;
grant execute on function private.level_statistics() to anon,authenticated;
create function public.level_statistics()
returns table(level_id uuid,average_rating numeric,rating_count bigint,favorite_count bigint)
language sql stable security invoker set search_path='' as $$ select * from private.level_statistics(); $$;
revoke all on function public.level_statistics() from public,anon,authenticated;
grant execute on function public.level_statistics() to anon,authenticated;

create function private.touch_rating() returns trigger language plpgsql set search_path='' as $$
begin
 if new.score is distinct from old.score then new.updated_at:=clock_timestamp(); else new.updated_at:=old.updated_at; end if;
 return new;
end; $$;
revoke all on function private.touch_rating() from public,anon,authenticated;
create trigger rating_updated before update on public.ratings for each row execute function private.touch_rating();

-- Geometry and completion function replacements are appended below.

create or replace function private.valid_level_layout(v jsonb) returns boolean
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
  if (select count(*) from jsonb_array_elements(v->k)) <> (select count(distinct ((value->>'x')::numeric,(value->>'y')::numeric)) from jsonb_array_elements(v->k)) then return false; end if;
 end loop;
 for p in select value from jsonb_array_elements(jsonb_build_array(v->'start',v->'finish') || (v->'checkpoints')) loop
  x:=(p->>'x')::numeric; y:=(p->>'y')::numeric;
  if exists(select 1 from jsonb_array_elements(v->'hazards') h where (h->>'x')::numeric=x and (h->>'y')::numeric=y)
    or exists(select 1 from jsonb_array_elements(v->'platforms') t where (t->>'y')::numeric=y and x>=(t->>'x')::numeric and x<(t->>'x')::numeric+(t->>'width')::numeric)
    or not exists(select 1 from jsonb_array_elements(v->'platforms') t where (t->>'y')::numeric=y+1 and x>=(t->>'x')::numeric and x<(t->>'x')::numeric+(t->>'width')::numeric) then return false; end if;
 end loop;
 for p in select value from jsonb_array_elements(v->'items') loop
  x:=(p->>'x')::numeric; y:=(p->>'y')::numeric;
  if exists(select 1 from jsonb_array_elements(v->'hazards') h where (h->>'x')::numeric=x and (h->>'y')::numeric=y)
   or exists(select 1 from jsonb_array_elements(v->'platforms') t where (t->>'y')::numeric=y and x>=(t->>'x')::numeric and x<(t->>'x')::numeric+(t->>'width')::numeric) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end; $$;

alter table public.levels drop constraint levels_valid_layout;
alter table public.levels add constraint levels_valid_layout check(private.valid_level_layout(layout));

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
 if a.level_id='11111111-1111-4111-8111-111111111111'::uuid and p_elapsed_ms<(select threshold_ms from public.achievements where code='first_flight_under_30s') then
  insert into public.player_achievements(player_id,achievement_code) values(caller,'first_flight_under_30s') on conflict do nothing;
 end if;
 return a.id;
end; $$;

commit;
