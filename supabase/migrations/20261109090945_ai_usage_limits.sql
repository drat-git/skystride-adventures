begin;
-- Private counters only: no prompts, responses, email addresses or provider secrets.
create table private.ai_usage (
  bucket_key text not null,
  bucket_start timestamptz not null,
  user_id uuid references auth.users(id) on delete cascade,
  requests integer not null default 0 check(requests>=0),
  primary key(bucket_key,bucket_start)
);
alter table private.ai_usage enable row level security;
revoke all on private.ai_usage from public,anon,authenticated;
create index ai_usage_user_idx on private.ai_usage(user_id) where user_id is not null;
create index ai_usage_expiry_idx on private.ai_usage(bucket_start);

create function private.take_ai_quota_impl(p_user_id uuid,p_project_daily_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  t timestamptz:=clock_timestamp();
  day_start timestamptz:=date_trunc('day',t at time zone 'UTC') at time zone 'UTC';
  minute_start timestamptz:=date_trunc('minute',t);
  global_count integer; day_count integer; minute_count integer;
begin
  if p_user_id is null or not exists(select 1 from auth.users where id=p_user_id) or p_project_daily_limit is null or p_project_daily_limit<1 or p_project_daily_limit>10000 then raise exception 'Invalid AI quota request';end if;
  delete from private.ai_usage where bucket_start<t-interval '2 days';
  -- Lock the shared bucket first. Concurrent requests cannot race past either cap.
  insert into private.ai_usage(bucket_key,bucket_start) values('global-day',day_start) on conflict do nothing;
  select requests into global_count from private.ai_usage where bucket_key='global-day' and bucket_start=day_start for update;
  insert into private.ai_usage(bucket_key,bucket_start,user_id) values('day:'||p_user_id,day_start,p_user_id),('minute:'||p_user_id,minute_start,p_user_id) on conflict do nothing;
  select requests into day_count from private.ai_usage where bucket_key='day:'||p_user_id and bucket_start=day_start;
  select requests into minute_count from private.ai_usage where bucket_key='minute:'||p_user_id and bucket_start=minute_start;
  if global_count>=p_project_daily_limit or day_count>=50 then return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from day_start+interval '1 day'-t))::int));end if;
  if minute_count>=5 then return jsonb_build_object('allowed',false,'retry_after',greatest(1,ceil(extract(epoch from minute_start+interval '1 minute'-t))::int));end if;
  update private.ai_usage set requests=requests+1 where (bucket_key='global-day' and bucket_start=day_start) or (bucket_key='day:'||p_user_id and bucket_start=day_start) or (bucket_key='minute:'||p_user_id and bucket_start=minute_start);
  return jsonb_build_object('allowed',true,'retry_after',0);
end $$;
create function public.take_ai_quota(p_user_id uuid,p_project_daily_limit integer default 200)
returns jsonb language sql security invoker set search_path='' as $$ select private.take_ai_quota_impl(p_user_id,p_project_daily_limit) $$;
revoke all on function private.take_ai_quota_impl(uuid,integer) from public,anon,authenticated;
revoke all on function public.take_ai_quota(uuid,integer) from public,anon,authenticated;
-- Some lightweight local SQL fixtures omit the managed Supabase service role.
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
  grant usage on schema private to service_role;
  grant execute on function private.take_ai_quota_impl(uuid,integer) to service_role;
  grant execute on function public.take_ai_quota(uuid,integer) to service_role;
end if; end $$;
commit;
