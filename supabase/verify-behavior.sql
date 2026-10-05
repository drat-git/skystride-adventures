-- Cloud PostgreSQL verification, NOT managed Auth API verification.
-- Entire fixture rolls back. Run only after core migration and seed.
begin;
insert into auth.users(id,raw_user_meta_data) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','{"display_name":"Test A"}'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','{"display_name":"Test B"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$ begin
 if (select count(*) from public.profiles)<>1 then raise exception 'Profile isolation failed';end if;
 if (select display_name from public.profiles)<>'Test A' then raise exception 'Signup profile trigger failed';end if;
 if (select count(*) from public.levels where published)<>1 then raise exception 'Seed read failed';end if;
 update public.profiles set display_name='Changed A' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if (select display_name from public.profiles)<>'Changed A' then raise exception 'Profile persistence failed';end if;
 begin
  insert into public.favorites(user_id,level_id)values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
  raise exception 'Unplayed favorite allowed';
 exception when insufficient_privilege then null;end;
 insert into public.play_attempts(user_id,level_id)values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
 insert into public.ratings(user_id,level_id,score)values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111',4);
 insert into public.favorites(user_id,level_id)values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');
 if (select count(*) from public.ratings)<>1 or (select count(*) from public.favorites)<>1 then raise exception 'Interaction persistence failed';end if;
 begin update public.ratings set score=6;raise exception 'Score six allowed';exception when check_violation then null;end;
 begin insert into public.favorites(user_id,level_id)values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');raise exception 'Duplicate allowed';exception when unique_violation then null;end;
 begin insert into public.favorites(user_id,level_id)values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111');raise exception 'Forged owner allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$ begin
 if (select count(*) from public.ratings)<>0 or (select count(*) from public.favorites)<>0 then raise exception 'Other account interaction exposed';end if;
 update public.profiles set display_name='Not Allowed' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 if found then raise exception 'Other profile updated';end if;
end $$;
set local role anon;
do $$ begin
 begin insert into public.favorites(user_id,level_id)values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');raise exception 'Anonymous write allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS' as result, 'UC01 profile; UC02 level read; UC07 rating; UC08 favorite; isolation/constraints' as checks, 'All fixtures rolled back. Managed Auth login still needs dedicated users.' as scope;
