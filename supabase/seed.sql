-- The six official V2 courses are installed by the versioned course migration.
-- Keep seeding idempotent and mutation-free so existing immutable courses,
-- player records and private drafts are never overwritten or recreated.
begin;
do $$ begin
 if (select count(*) from public.levels where official_order between 1 and 6
     and published and layout->'version'='2'::jsonb) <> 6 then
  raise exception 'Apply all migrations to install the six official V2 courses before seeding';
 end if;
end; $$;
commit;
