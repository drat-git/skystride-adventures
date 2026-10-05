-- Run once in a NEW Supabase project's SQL Editor. No credential columns here.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (display_name ~ '^[A-Za-z0-9 _-]{2,24}$'),
 created_at timestamptz not null default now()
);
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,
 case when new.raw_user_meta_data->>'display_name' ~ '^[A-Za-z0-9 _-]{2,24}$' then new.raw_user_meta_data->>'display_name' else 'Player' end);
 return new;
end;$$;
revoke all on function public.handle_new_user() from public;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create table public.levels (
 id uuid primary key default gen_random_uuid(),
 creator_id uuid references public.profiles(id) on delete set null,
 title text not null check(char_length(btrim(title)) between 1 and 60),
 description text not null default '' check(char_length(description)<=280),
 difficulty text not null check(difficulty in ('easy','medium','hard')),
 layout jsonb not null check(jsonb_typeof(layout)='object' and layout @> '{"version":1,"cols":24,"rows":14}'::jsonb),
 published boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
-- Sprint 2 uses seeded, read-only levels. Future editing requires stronger backend geometry validation.
create table public.play_attempts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 level_id uuid not null references public.levels(id) on delete cascade,
 started_at timestamptz not null default now(),
 completed_at timestamptz, elapsed_ms integer check(elapsed_ms>=0), deaths integer not null default 0 check(deaths>=0),
 check((completed_at is null and elapsed_ms is null) or (completed_at is not null and elapsed_ms is not null and completed_at>=started_at))
);
create index play_attempts_user_level on public.play_attempts(user_id,level_id);
create table public.ratings (
 user_id uuid not null references public.profiles(id) on delete cascade,
 level_id uuid not null references public.levels(id) on delete cascade,
 score smallint not null check(score between 1 and 5), updated_at timestamptz not null default now(),
 primary key(user_id,level_id)
);
create table public.favorites (
 user_id uuid not null references public.profiles(id) on delete cascade,
 level_id uuid not null references public.levels(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,level_id)
);
alter table public.profiles enable row level security;
alter table public.levels enable row level security;
alter table public.play_attempts enable row level security;
alter table public.ratings enable row level security;
alter table public.favorites enable row level security;
revoke all on public.profiles,public.levels,public.play_attempts,public.ratings,public.favorites from anon,authenticated;
grant usage on schema public to anon,authenticated;
grant select on public.levels to anon,authenticated;
grant select on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant select,insert on public.play_attempts to authenticated;
grant select,insert,update,delete on public.ratings to authenticated;
grant select,insert,delete on public.favorites to authenticated;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy profile_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy published_levels on public.levels for select to anon,authenticated using(published);
create policy own_attempts on public.play_attempts for select to authenticated using(user_id=(select auth.uid()));
create policy start_attempt on public.play_attempts for insert to authenticated with check(
 user_id=(select auth.uid()) and completed_at is null and elapsed_ms is null and deaths=0 and exists(select 1 from public.levels where id=level_id and published));
create policy own_ratings_read on public.ratings for select to authenticated using(user_id=(select auth.uid()));
create policy eligible_rating_insert on public.ratings for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.play_attempts p where p.user_id=(select auth.uid()) and p.level_id=ratings.level_id) and exists(select 1 from public.levels l where l.id=ratings.level_id and l.published));
create policy eligible_rating_update on public.ratings for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and exists(select 1 from public.play_attempts p where p.user_id=(select auth.uid()) and p.level_id=ratings.level_id) and exists(select 1 from public.levels l where l.id=ratings.level_id and l.published));
create policy own_ratings_delete on public.ratings for delete to authenticated using(user_id=(select auth.uid()));
create policy own_favorites_read on public.favorites for select to authenticated using(user_id=(select auth.uid()));
create policy eligible_favorite_insert on public.favorites for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.play_attempts p where p.user_id=(select auth.uid()) and p.level_id=favorites.level_id) and exists(select 1 from public.levels l where l.id=favorites.level_id and l.published));
create policy own_favorites_delete on public.favorites for delete to authenticated using(user_id=(select auth.uid()));
commit;
