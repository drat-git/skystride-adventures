-- Additive V2 support for isolated local development. No legacy deletion or reseeding.
-- Production cutover and optional V1 retirement are separate, later operations.
begin;
alter table public.levels add column official_order smallint unique check(official_order between 1 and 6);

-- Preserve the complete installed V1 validator, including its permissions.
alter function private.valid_level_layout(jsonb) rename to valid_level_layout_v1;
alter table public.levels drop constraint levels_layout_check;
alter table public.levels drop constraint levels_valid_layout;

create function private.v2_keys(v jsonb,keys text[]) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'object' then return false; end if;
 return (select count(*) from jsonb_object_keys(v))=cardinality(keys) and v ?& keys;
end; $$;
create function private.v2_integer(v jsonb,lo numeric,hi numeric) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare n numeric;
begin
 if jsonb_typeof(v) is distinct from 'number' then return false; end if;
 n:=(v#>>'{}')::numeric; return n=trunc(n) and n>=lo and n<=hi;
exception when others then return false;
end; $$;
create function private.v2_point(v jsonb,cols integer) returns boolean
language sql immutable security invoker set search_path='' as $$
 select private.v2_integer(v->'x',0,cols-1) and private.v2_integer(v->'y',0,24);
$$;
create function private.v2_solid(v jsonb,px integer,py integer,support boolean default false) returns boolean
language sql immutable security invoker set search_path='' as $$
 select exists(select 1 from jsonb_array_elements((v->'terrain')||(v->'platforms')) t
  where (t->>'y')::integer=py and px>=(t->>'x')::integer and px<(t->>'x')::integer+(t->>'width')::integer)
 or exists(select 1 from jsonb_array_elements(v->'blocks') b
  where (b->>'x')::integer=px and (b->>'y')::integer=py and (not support or b->>'kind'<>'hidden'))
 or exists(select 1 from jsonb_array_elements(v->'obstacles') o
  where px>=(o->>'x')::integer and px<(o->>'x')::integer+(o->>'width')::integer
  and py>=(o->>'y')::integer and py<(o->>'y')::integer+(o->>'height')::integer);
$$;
create function private.v2_danger(v jsonb,px integer,py integer) returns boolean
language sql immutable security invoker set search_path='' as $$
 select exists(select 1 from jsonb_array_elements(v->'hazards') h where (h->>'y')::integer=py
  and px>=(h->>'x')::integer and px<(h->>'x')::integer+(h->>'width')::integer);
$$;
create function private.valid_level_layout_v2(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
declare
 cols integer; total integer:=0; k text; p jsonb; x integer; y integer; n integer; lim integer;
 expected text[]; names text[]:=array['terrain','platforms','blocks','items','powerups','hazards','checkpoints','enemies','movingPlatforms','obstacles','decorations'];
begin
 if not private.v2_keys(v,array['version','cols','rows','theme','timeLimit','start','finish','finishHeight']||names)
  or v->'version' is distinct from '2'::jsonb or v->'rows' is distinct from '25'::jsonb
  or not private.v2_integer(v->'cols',24,512) or not private.v2_integer(v->'timeLimit',30,900)
  or not private.v2_integer(v->'finishHeight',1,20) or v->>'theme' not in ('overworld','cave','sky') then return false; end if;
 -- V2 fields contain only numbers, booleans/containers and whitelisted ASCII enums.
 -- Compact JSON size matches the client's serialization cap; no arbitrary strings.
 if octet_length(regexp_replace(v::text,'[[:space:]]','','g'))>262144 then return false; end if;
 cols:=(v->>'cols')::integer;
 if not private.v2_keys(v->'start',array['x','y']) or not private.v2_point(v->'start',cols)
  or not private.v2_keys(v->'finish',array['x','y']) or not private.v2_point(v->'finish',cols)
  or v->'start'=v->'finish' or (v->>'finishHeight')::integer>(v->'finish'->>'y')::integer+1 then return false; end if;
 foreach k in array names loop
  if jsonb_typeof(v->k) is distinct from 'array' then return false; end if;
  lim:=case when k in ('terrain','platforms') then 512 when k in ('blocks','items','decorations') then 1024
   when k='checkpoints' then 64 when k='movingPlatforms' then 128 else 256 end;
  n:=jsonb_array_length(v->k); total:=total+n;
  if n>lim then return false; end if;
  expected:=case k
   when 'terrain' then array['x','y','width'] when 'platforms' then array['x','y','width']
   when 'blocks' then array['x','y','kind','content'] when 'items' then array['x','y']
   when 'powerups' then array['x','y','kind'] when 'hazards' then array['x','y','width','kind']
   when 'checkpoints' then array['x','y'] when 'enemies' then array['x','y','kind','behavior','direction','speed','range']
   when 'movingPlatforms' then array['x','y','width','axis','distance','durationMs']
   when 'obstacles' then array['x','y','width','height','kind'] when 'decorations' then array['x','y','kind'] end;
  for p in select value from jsonb_array_elements(v->k) loop
   if not private.v2_keys(p,expected) or not private.v2_point(p,cols) then return false; end if;
   x:=(p->>'x')::integer; y:=(p->>'y')::integer;
   if k in ('terrain','platforms','hazards','movingPlatforms','obstacles') and not private.v2_integer(p->'width',1,cols-x) then return false; end if;
   if k='blocks' and (p->>'kind' not in ('solid','breakable','glow','hidden') or p->>'content' not in ('none','coin','adaptive','growth','fire','star','life')
    or (p->>'kind' in ('solid','breakable') and p->>'content'<>'none') or (p->>'kind'='glow' and p->>'content'='none')
    or (p->>'kind'='hidden' and p->>'content'<>'life')) then return false; end if;
   if k='powerups' and p->>'kind' not in ('growth','fire','star','life') then return false; end if;
   if k='hazards' and p->>'kind' not in ('spike','lava') then return false; end if;
   if k='enemies' then
    if p->>'kind' not in ('walker','turtle','winged') or p->'direction' not in ('-1'::jsonb,'1'::jsonb)
     or jsonb_typeof(p->'speed') is distinct from 'number' or (p->>'speed')::numeric<10 or (p->>'speed')::numeric>120
     or not private.v2_integer(p->'range',1,16) then return false; end if;
    if (p->>'kind'='winged' and p->>'behavior' not in ('hop','horizontal','vertical'))
     or (p->>'kind'<>'winged' and p->>'behavior'<>'patrol') then return false; end if;
   end if;
   if k='movingPlatforms' then
    if p->>'axis' not in ('x','y') or not private.v2_integer(p->'distance',1,16) or not private.v2_integer(p->'durationMs',1000,12000) then return false; end if;
    if (p->>'axis'='x' and x+(p->>'width')::integer+(p->>'distance')::integer>cols)
     or (p->>'axis'='y' and y+(p->>'distance')::integer>=25) then return false; end if;
   end if;
   if k='obstacles' and (p->>'kind' not in ('column','rock','ruin') or not private.v2_integer(p->'height',1,25-y)) then return false; end if;
   if k='decorations' and p->>'kind' not in ('sign','bush','pine','sprout','cloud','crystal','ruin','door','terrain') then return false; end if;
  end loop;
  if n<>(select count(distinct ((value->>'x')::numeric,(value->>'y')::numeric)) from jsonb_array_elements(v->k)) then return false; end if;
 end loop;
 if total>4096 then return false; end if;
 -- JSON null enum values must fail rather than being swallowed by SQL NULL logic.
 if jsonb_path_exists(v,'$.** ? (@ == null)') then return false; end if;
 for p in select value from jsonb_array_elements(jsonb_build_array(v->'start',v->'finish')||(v->'checkpoints')) loop
  x:=(p->>'x')::integer; y:=(p->>'y')::integer;
  if private.v2_solid(v,x,y) or private.v2_danger(v,x,y) or not private.v2_solid(v,x,y+1,true) then return false; end if;
 end loop;
 for p in select value from jsonb_array_elements((v->'items')||(v->'powerups')) loop
  x:=(p->>'x')::integer; y:=(p->>'y')::integer;
  if private.v2_solid(v,x,y) or private.v2_danger(v,x,y) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end; $$;

revoke all on function private.v2_keys(jsonb,text[]),private.v2_integer(jsonb,numeric,numeric),private.v2_point(jsonb,integer),private.v2_solid(jsonb,integer,integer,boolean),private.v2_danger(jsonb,integer,integer),private.valid_level_layout_v2(jsonb) from public,anon,authenticated;
grant execute on function private.v2_keys(jsonb,text[]),private.v2_integer(jsonb,numeric,numeric),private.v2_point(jsonb,integer),private.v2_solid(jsonb,integer,integer,boolean),private.v2_danger(jsonb,integer,integer),private.valid_level_layout_v2(jsonb) to authenticated;

create function private.valid_level_layout(v jsonb) returns boolean
language plpgsql immutable security invoker set search_path='' as $$
begin
 if v->'version'='1'::jsonb then return private.valid_level_layout_v1(v); end if;
 if v->'version'='2'::jsonb then return private.valid_level_layout_v2(v); end if;
 return false;
end; $$;
revoke all on function private.valid_level_layout(jsonb) from public,anon,authenticated;
grant execute on function private.valid_level_layout(jsonb) to authenticated;
alter table public.levels add constraint levels_layout_check check(jsonb_typeof(layout)='object' and layout->'version' in ('1'::jsonb,'2'::jsonb));
alter table public.levels add constraint levels_valid_layout check(private.valid_level_layout(layout));

-- RLS and the explicit owner predicate both restrict progress to the current user.
create function public.own_progress() returns table(level_id uuid,best_ms integer)
language sql stable security invoker set search_path='' as $$
 select a.level_id,min(a.elapsed_ms) from public.play_attempts a
 where a.user_id=(select auth.uid()) and a.completed_at is not null group by a.level_id order by a.level_id;
$$;
revoke all on function public.own_progress() from public,anon,authenticated;
grant execute on function public.own_progress() to authenticated;
commit;
