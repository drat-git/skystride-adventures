-- Re-running updates the one system course, never creates auth accounts.
begin;
insert into public.levels(id,creator_id,title,description,difficulty,layout,published) values
('11111111-1111-4111-8111-111111111111',null,'First Flight','Jump over the coral hazards and reach the gold flag.','easy','{"version":1,"cols":24,"rows":14,"start":{"x":1,"y":11},"finish":{"x":22,"y":11},"platforms":[{"x":0,"y":12,"width":24},{"x":5,"y":9,"width":4},{"x":12,"y":8,"width":4},{"x":18,"y":9,"width":3}],"hazards":[{"x":7,"y":11},{"x":14,"y":11},{"x":19,"y":11}],"checkpoints":[],"items":[]}'::jsonb,true)
on conflict(id) do update set title=excluded.title,description=excluded.description,difficulty=excluded.difficulty,layout=excluded.layout,published=excluded.published,updated_at=now();
commit;
