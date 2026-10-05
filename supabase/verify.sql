-- Read-only diagnostics in Supabase SQL Editor after migration + seed.
select tablename,rowsecurity from pg_tables where schemaname='public' order by tablename;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname;
select table_name,column_name,data_type,is_nullable from information_schema.columns where table_schema='public' order by table_name,ordinal_position;
select title,difficulty,published,layout->>'version' as layout_version from public.levels;
select c.conrelid::regclass as table_name,c.conname,pg_get_constraintdef(c.oid) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' order by 1,2;
