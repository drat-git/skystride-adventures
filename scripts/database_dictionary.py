import json
from pathlib import Path
rows={
'profiles':[
('id','UUID','No','PK; FK auth.users.id; CASCADE','Managed authentication identity'),
('display_name','TEXT','No','CHECK ASCII letters/digits/space/_/-; 2–24 chars','Public application name; own-account access only'),
('created_at','TIMESTAMPTZ','No','DEFAULT now()','Creation timestamp')],
'levels':[
('id','UUID','No','PK; DEFAULT gen_random_uuid()','Course identity'),
('creator_id','UUID','Yes','FK profiles.id; SET NULL','NULL for system seed or deleted creator'),
('title','TEXT','No','CHECK trimmed length 1–60','Course title'),
('description','TEXT','No','DEFAULT empty; CHECK length <= 280','Course summary'),
('difficulty','TEXT','No','CHECK easy / medium / hard','Difficulty label'),
('layout','JSONB','No','Object; version=1, cols=24, rows=14','Geometry; detailed validation in client for seeded read-only levels'),
('published','BOOLEAN','No','DEFAULT false','Published visibility'),
('created_at','TIMESTAMPTZ','No','DEFAULT now()','Creation timestamp'),
('updated_at','TIMESTAMPTZ','No','DEFAULT now(); seed updates explicitly','Last revision timestamp')],
'play_attempts':[
('id','UUID','No','PK; DEFAULT gen_random_uuid()','Attempt identity'),
('user_id','UUID','No','FK profiles.id; CASCADE','Player'),
('level_id','UUID','No','FK levels.id; CASCADE','Played course'),
('started_at','TIMESTAMPTZ','No','DEFAULT now()','Recorded start'),
('completed_at','TIMESTAMPTZ','Yes','If present >= started_at; paired with elapsed_ms','Future trusted completion'),
('elapsed_ms','INTEGER','Yes','CHECK >= 0; paired with completion','Future active elapsed time'),
('deaths','INTEGER','No','DEFAULT 0; CHECK >= 0','Future persisted death count')],
'ratings':[
('user_id','UUID','No','Composite PK; FK profiles.id; CASCADE','Player'),
('level_id','UUID','No','Composite PK; FK levels.id; CASCADE','Rated course'),
('score','SMALLINT','No','CHECK 1–5','One editable score per player/course'),
('updated_at','TIMESTAMPTZ','No','DEFAULT now(); future updates must refresh it','Rating timestamp')],
'favorites':[
('user_id','UUID','No','Composite PK; FK profiles.id; CASCADE','Player'),
('level_id','UUID','No','Composite PK; FK levels.id; CASCADE','Favorite course'),
('created_at','TIMESTAMPTZ','No','DEFAULT now()','Favorite timestamp')],
'achievements (planned)':[
('code','TEXT','No','PK; fixed three codes','Achievement identity'),
('name','TEXT','No','Fixed human-readable name','Award label'),
('rule','TEXT','No','CHECK first_completion / first_created_level / timed_course','Backend event rule'),
('threshold_ms','INTEGER','Yes','Positive for timed goal; NULL otherwise','30,000 milliseconds for First Flight')],
'player_achievements (planned)':[
('player_id','UUID','No','Composite PK; FK profiles.id; CASCADE','Award owner'),
('achievement_code','TEXT','No','Composite PK; FK achievements.code; RESTRICT','Award identity'),
('earned_at','TIMESTAMPTZ','No','DEFAULT now()','Award timestamp')]
}
Path('docs/database_dictionary.json').write_text(json.dumps(rows,indent=2))
p=['# Database dictionary','', 'PostgreSQL on Supabase. Five core tables are installed; two achievement tables are future logical design. Passwords and confirmation/session data remain in managed `auth.users`. The application neither reads nor writes credentials directly.','']
for table,cols in rows.items():
 p+=['## '+table,'','| Attribute | Type | Nullable | Keys / constraints / deletion | Purpose |','|---|---|---|---|---|']
 p += ['| '+' | '.join(col)+' |' for col in cols];p+=['']
p+=['## Relationships and access','', 'Each managed auth user has one application profile created by the signup trigger. One profile can own zero or more courses; each course has zero or one creator. Each attempt, rating and favorite belongs to exactly one player and one course; players and courses have zero or more such records. Ratings and favorites have unique player/course pairs. A future award connects one player and one achievement with a unique pair.','', 'Anonymous users can read published levels only. Authenticated users can read/update their own display name and start their own eligible attempts. Only owners can read their interaction records; rating/favorite writes require a recorded attempt for a published course. Client roles cannot publish/edit levels or write completion results. New future endpoints must add server geometry validation and carefully bounded aggregate/leaderboard reads.','', 'The SQL JSONB CHECK establishes the object/version/grid envelope. `src/level.ts` additionally checks bounded integer coordinates, array limits, distinct start/finish, duplicate points, platform width, and safe supported spawn positions before loading a seeded level. No reachability guarantee is made. Checkpoints/items belong to geometry; active checkpoint and current timer belong to transient scene state. Reduced-motion preference is planned device storage.','']
Path('docs/DATABASE.md').write_text('\n'.join(p))
