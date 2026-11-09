-- Business revision conflicts are permanent until the client reloads/copies edits.
-- SQLSTATE 40001 means transient serialization failure and can trigger unbounded
-- retries in managed PostgREST 14. PT409 instead returns HTTP 409 immediately.
-- Preserve the applied migration and change only the four conflict error codes;
-- CREATE OR REPLACE retains function identities, grants and wrapper contracts.
-- Primary reference: https://supabase.com/kb/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
begin;

create or replace function private.save_draft(p_id uuid,p_expected_revision integer,p_title text,p_description text,p_difficulty text,p_layout jsonb)
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
  raise exception 'This draft changed in another tab. Reload it or save your edits as a new draft.' using errcode='PT409';
 end if;
 update public.levels set title=btrim(p_title),description=btrim(p_description),difficulty=p_difficulty,layout=p_layout where id=l.id;
 return private.owned_level_json(l.id);
end; $$;

create or replace function private.start_draft_playtest(p_level_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.levels; test_id uuid; caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Sign in to test a saved draft'; end if;
 select * into l from public.levels where id=p_level_id and creator_id=caller for update;
 if not found then raise exception 'Draft not found'; end if;
 if l.published then raise exception 'This course is already published'; end if;
 if p_expected_revision is null or l.revision<>p_expected_revision then raise exception 'Draft revision changed. Reload and test the saved version.' using errcode='PT409'; end if;
 insert into public.draft_playtests(user_id,level_id,revision) values(caller,l.id,l.revision) returning id into test_id;
 return jsonb_build_object('id',test_id,'level',private.owned_level_json(l.id));
end; $$;

create or replace function private.complete_draft_playtest(p_test_id uuid,p_elapsed_ms integer,p_deaths integer)
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
 if l.revision<>t.revision then raise exception 'Draft changed. Test the current saved version again.' using errcode='PT409'; end if;
 if t.completed_at is not null then
  if t.elapsed_ms=p_elapsed_ms and t.deaths=p_deaths then return t.id; end if;
  raise exception 'A completed playtest cannot be changed';
 end if;
 if l.published then raise exception 'This course is already published'; end if;
 if p_elapsed_ms>extract(epoch from(clock_timestamp()-t.started_at))*1000+1500 then raise exception 'Playtest exceeds elapsed wall-clock time'; end if;
 update public.draft_playtests set completed_at=clock_timestamp(),elapsed_ms=p_elapsed_ms,deaths=p_deaths where id=t.id;
 return t.id;
end; $$;

create or replace function private.publish_level(p_level_id uuid,p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.levels; caller uuid:=auth.uid();
begin
 if caller is null then raise exception 'Sign in to publish a course'; end if;
 select * into l from public.levels where id=p_level_id and creator_id=caller for update;
 if not found then raise exception 'Draft not found'; end if;
 if p_expected_revision is null or l.revision<>p_expected_revision then raise exception 'Draft changed. Test the current saved version again.' using errcode='PT409'; end if;
 if l.published then return private.owned_level_json(l.id); end if;
 if not exists(select 1 from public.draft_playtests where level_id=l.id and user_id=caller and revision=l.revision and completed_at is not null) then
  raise exception 'Finish a playtest of this saved version before publishing';
 end if;
 update public.levels set published=true where id=l.id;
 return private.owned_level_json(l.id);
end; $$;

commit;
