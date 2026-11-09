-- Bound expanded geometry as well as JSON/entity counts. Wide overlapping runs
-- must not expand into hundreds of thousands of Phaser objects on a client.
begin;
alter function private.valid_level_layout_v2(jsonb) rename to valid_level_layout_v2_shape;
create function private.valid_level_layout_v2(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare k text; p jsonb; tiles integer:=0;
begin
 if not private.valid_level_layout_v2_shape(v) then return false; end if;
 foreach k in array array['terrain','platforms','blocks','items','powerups','hazards','checkpoints','enemies','movingPlatforms','obstacles','decorations'] loop
  for p in select value from jsonb_array_elements(v->k) loop
   tiles:=tiles+case when k='obstacles' then (p->>'width')::integer*(p->>'height')::integer
     when k in ('terrain','platforms','hazards','movingPlatforms') then (p->>'width')::integer else 1 end;
   if tiles>32768 then return false; end if;
  end loop;
 end loop;
 return true;
exception when others then return false;
end; $$;
revoke all on function private.valid_level_layout_v2(jsonb) from public,anon,authenticated;
grant execute on function private.valid_level_layout_v2(jsonb) to authenticated;
commit;
