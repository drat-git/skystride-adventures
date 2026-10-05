-- Supabase may grant client roles EXECUTE through project default privileges.
-- This function is used by an auth-table trigger, not by a client RPC.
begin;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create index levels_creator_id_idx on public.levels(creator_id);
create index play_attempts_level_id_idx on public.play_attempts(level_id);
create index ratings_level_id_idx on public.ratings(level_id);
create index favorites_level_id_idx on public.favorites(level_id);
commit;
