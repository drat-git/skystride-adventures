"""Build a revised report from the supplied DOCX template; preserves section/header/footer/styles.
Usage: python scripts/build_report.py /path/to/Group9_Sprint2.docx
"""
from pathlib import Path
from copy import deepcopy
import sys,json
from docx import Document
from docx.shared import Inches,Pt,RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH,WD_COLOR_INDEX
from docx.enum.table import WD_TABLE_ALIGNMENT,WD_CELL_VERTICAL_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
D=Document(sys.argv[1]);body=D._element.body
for child in list(body):
 if child.tag!=qn('w:sectPr'):body.remove(child)
# Old TODO comments are resolved in the new body or explicitly identified as open.
for key,rel in list(D.part.rels.items()):
 if 'comments' in rel.reltype:D.part.drop_rel(key)
S=json.loads(Path('docs/specifications.json').read_text());DB=json.loads(Path('docs/database_dictionary.json').read_text())
out=Path('output');out.mkdir(exist_ok=True)
page=0;contents=[];fig=0

def p(text='',bold=False,center=False,highlight=False,size=11):
 a=D.add_paragraph();a.alignment=WD_ALIGN_PARAGRAPH.CENTER if center else WD_ALIGN_PARAGRAPH.JUSTIFY
 a.paragraph_format.space_after=Pt(5);a.paragraph_format.line_spacing=1.05
 r=a.add_run(text);r.bold=bold;r.font.name='Times New Roman';r.font.size=Pt(size)
 if highlight:r.font.highlight_color=WD_COLOR_INDEX.YELLOW
 return a

def h(text,level=2):
 a=D.add_paragraph(text,style=f'Heading {level}');a.paragraph_format.space_before=Pt(6);a.paragraph_format.space_after=Pt(8)
 for r in a.runs:r.font.color.rgb=RGBColor(0,0,0)
 return a

def new(title,toc=True):
 global page
 page+=1
 if title:
  a=h(title,1); a.paragraph_format.page_break_before=page>1
  if toc:contents.append((title,page))

def table(headers,rows,widths=None):
 t=D.add_table(rows=1, cols=len(headers));t.alignment=WD_TABLE_ALIGNMENT.CENTER;t.autofit=False
 # Clone the source table's grid pattern through retained standard styles.
 try:t.style='Table Grid'
 except KeyError:pass
 for i,v in enumerate(headers):t.rows[0].cells[i].text=v
 for row in rows:
  cells=t.add_row().cells
  for i,v in enumerate(row):cells[i].text=str(v)
 if widths:
  for row in t.rows:
   for c,w in zip(row.cells,widths):c.width=Inches(w)
 for ri,row in enumerate(t.rows):
  pr=row._tr.get_or_add_trPr();pr.append(OxmlElement('w:cantSplit'))
  if ri==0:pr.append(OxmlElement('w:tblHeader'))
  for c in row.cells:
   c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.CENTER
   for a in c.paragraphs:
    a.paragraph_format.space_after=Pt(4);a.paragraph_format.space_before=Pt(3);a.paragraph_format.line_spacing=1
    for r in a.runs:r.font.name='Times New Roman';r.font.size=Pt(9);r.bold=ri==0
 return t

def picture(name,caption,height=None,width=6.35):
 global fig
 path=Path('docs/diagrams')/(name+'.png')
 if '/' in name:path=Path(name)
 if not path.exists():p('Evidence pending: '+caption);return
 from PIL import Image
 w,hh=Image.open(path).size
 maxh=height or 6.8
 actual=min(width,maxh*w/hh)
 a=D.add_paragraph();a.alignment=WD_ALIGN_PARAGRAPH.CENTER;a.paragraph_format.space_before=Pt(0);a.paragraph_format.space_after=Pt(3);a.paragraph_format.line_spacing=1
 a.add_run().add_picture(str(path),width=Inches(actual))
 fig+=1;p(f'Figure {fig}. {caption}',center=True,size=10)

def label(name,text):
 a=p();a.add_run(name+': ').bold=True;a.add_run(text)
 for r in a.runs:r.font.name='Times New Roman';r.font.size=Pt(11)

new('',False)
p('SkyStride Adventures',bold=True,center=True,size=25)
p('Software Engineering Project',center=True,size=18)
p('Sprint 2 • Group 9 • Fall 2026',bold=True,center=True,size=16)
p('Members',bold=True,center=True)
for name in ['Dominic Le','Soleil Jarrett','Finnie Nguyen','Aron Mezretab','Darsh Rathi']:p(name,center=True)
p('Guide: Dr. Tushara Sadasivuni',center=True)
p('Submission date: October 5, 2026',center=True)
p('Coordinator: pending team confirmation',center=True)
p('REVIEW COPY — team planning, peer evaluation and final demonstration checks remain open.',bold=True,center=True)
p('Prepared from the supplied group draft and course materials. Revised scope and technology paragraphs are highlighted. Implementation status is reported from observed evidence.',center=True)
new('TABLE OF CONTENTS',False)
tocp=D.add_paragraph('Contents will be populated after pagination verification.');tocp.paragraph_format.space_after=Pt(0)
new('1.0 INTRODUCTION')
h('1.1 Software Engineers’ Information')
p('The group consists of Dominic Le, Soleil Jarrett, Finnie Nguyen, Aron Mezretab and Darsh Rathi. The technology choice does not rely on unverified experience or contribution claims in the source draft. Actual roles and assignments require team confirmation.')
h('1.2 Planning and Scheduling')
p('Deferred at the user’s request. Before submission, supply the current Sprint 2 table with assignee name, email, task, duration in hours, dependency, due date and peer-granted evaluation percentage. Confirm the coordinator for this sprint; the assignment requires rotation. Earlier prototype/Firebase claims are not used as evidence.')
h('1.3 Teamwork Basics')
p('Working norms: give each member a voice; communicate blockers and deadlines; agree on task ownership; review work constructively; and verify integration before submission. Team examples and contribution evaluations must come from the team. If work stalls, break it into smaller actions and revisit agreed deliverables.')
h('Review status')
p('All eleven source files and the handoff were examined, including embedded figures and Word comments. The generic SWE Sprint 1 document is a template, not the group’s submitted Sprint 1. This report corrects the available group draft without inventing a comparison against an unavailable submission.')
p('The rubric’s listed values total 125 points as written. Required deliverables are tracked independently; no grade is guaranteed. Individual named-PDF uploads and the coordinator’s printed copy remain human submission actions.')
new('1.4 Problem Statement')
for text in [
'SkyStride Adventures is a compact desktop-browser platformer for players who want short, repeatable courses and creators who want to make and share meaningful course variations without developing an entire game. A course fits one 24×14 grid. Players move, jump, avoid hazards and reach a finish; account-linked community features support discovery and personal progress.',
'The application uses Phaser 3, TypeScript, Vite and simple HTML/CSS for menus and gameplay. Supabase manages authentication and PostgreSQL persistence. GitHub Pages hosts the frontend on a provider subdomain. This replaces the draft’s Unity, local SQLite/JSON, Firebase and Firestore combination with one cloud-authoritative data source, reducing synchronization work while retaining all fifteen semester feature categories and all three client requirements.',
'Unity remains a capable alternative with a visual scene editor. Phaser fits this modest fixed-screen 2D game and its browser account/community interfaces; it requires code-driven layouts and familiarity with web development. No existing verified codebase needed migration. Local practice is explicitly separate from online account and persistence behavior.',
'The ordinary grid editor, course saving and sharing remain semester capabilities. The AI-assisted editor is narrowed to a genuine generative design coach: it reviews a bounded draft and suggests route, hazard, checkpoint and difficulty improvements that the creator may apply. A separate optional generative gameplay hint uses current course/player context. Neither feature trains a model, analyzes replay logs or silently generates an entire map. Both AI features are planned for later sprints; this narrower interpretation is a project decision, not a claim of renewed instructor approval.',
'Sprint 2 delivers managed account screens, persistent profile operations, database-backed published-course selection and a playable seeded course. Backend tables and policies also support rating/favorite operations for database verification; their full interfaces, the editor, publishing, checkpoints, collectibles, achievements, leaderboard, settings and AI remain future work. The target recurring cost is $0 within provider free quotas; no live AI requests or paid resources are used.'
]:p(text,highlight=True)
new('1.4.1 Semester Feature Inventory')
features=S['features']
for f in features[:8]:
 p(f'{f[0]} — {f[1]}',bold=True);p(f[2]);p('Use cases: '+', '.join(f[3])+' · '+f[4],size=10)
new('1.4.2 Features and Client Requirements')
for f in features[8:]:
 p(f'{f[0]} — {f[1]}',bold=True);p(f[2]);p('Use cases: '+', '.join(f[3])+' · '+f[4],size=10)
h('Client requirements preserved')
p('Checkpoint/respawn: creators can place checkpoints; touching one saves an attempt-local safe spawn for death recovery. Rating/favorites: logged-in players can rate or favorite a played shared course, with rating and favorite sorting in selection. Achievements: first completion, first created level and a timed goal persist to the account. These client features remain required semester scope.')
new('1.5.1 Context Diagram')
p('Boundary: application-owned menus, Phaser gameplay and business rules comprise SkyStride Adventures; independently managed Supabase and a future generative service are external systems. Internal game mechanics and menus are not environmental systems. All systems use consistent «system» rectangle notation from the lecture.')
picture('context','Corrected system context; the AI service connection is planned.',height=4.5)
p('Instructor feedback addressed: internal subsystem boxes were removed and external-system notation is consistent. Auth credentials remain with the provider; future AI calls will pass through a server endpoint with server-held secrets.')
new('1.5.2 Account Activity Diagram')
picture('activity-auth','Account flow with Player, Application and Supabase swimlanes.',height=6.8)
p('The login question is inside the decision diamond. Invalid input, failed authentication and email confirmation return the player to an actionable account state. Logout invalidates the provider session before private UI is cleared; a failed logout displays a retry message.',size=10)
new('1.5.3 Navigation Activity Diagram')
picture('activity-navigation','Menu alternatives use a decision; course errors offer retry.',height=6.9)
p('Account navigation refers to the preceding figure. Restart creates a fresh attempt; leaving destroys the scene. Local practice is an explicit alternative, rather than a replacement for a failed online read.',size=10)
new('2.0 REQUIREMENTS')
h('2.1 Use Case Inventory')
table(['ID','Use case','Specification'],[(u['id'],u['name'],'Full specification below')for u in S['specs']]+[(x[0],x[1],'Planned summary below')for x in S['future']],[.65,3.7,2.1])
p('Ten use cases and ten matching requirement records are fully specified. A specification describes intended behavior; the implementation status identifies the part currently built. Supporting services are actors only when outside the stated system boundary. The application and its internal tables are not actors.')
for uc in S['specs']:
 new(f"2.1.{int(uc['id'][2:])} {uc['id']} — {uc['name']}",False)
 label('Use Case number',uc['id']);label('Use Case name',uc['name']);label('Actors',', '.join(uc['actors']))
 p('Description',bold=True)
 for i,text in enumerate(uc['steps'],1):p(f'{i}. {text}')
 for key,labeltext in [('alternate','Alternate Path'),('exception','Exception Path'),('pre','Pre-condition'),('post','Post-condition')]:label(labeltext,uc[key])
 p('Implementation status: '+uc['status'],bold=True,size=10)
new('2.1.11 Remaining Planned Use Cases')
for uid,name,desc in S['future']:p(f'{uid} — {name}',bold=True);p(desc)
p('UC14 restart is already available in the playable scene; its detailed standalone specification is deferred. UC15 collectible counts are planned; the current seeded course contains none.')
h('Design assumptions')
p('Ratings are integer 1–5 after recorded play; finishing is not required. Favorites are independent but require the same recorded-play eligibility. Personal favorites filtering and descending favorite-count sorting cover “sort by favorite.” Average-rating sorting places unrated levels last; ties use title then UUID. Active checkpoints reset on exit/restart. The initial timed achievement uses First Flight in under 30,000 active milliseconds. These are explicit implementation defaults, not new stakeholder facts.')
for group in [[0],[1],[2,3],[4,5],[6,7],[8,9]]:
 new('2.2 Requirements'+(''if group[0]==0 else ' (continued)'),toc=group[0]==0)
 for uc in [S['specs'][i]for i in group]:
  h(uc['requirement']+' — '+uc['name'])
  label('Requirement number / Use Case number',uc['requirement']+' / '+uc['id'])
  label('Introduction',uc['introduction']);label('Inputs',uc['inputs'])
  p('Requirements Description',bold=True)
  for i,r in enumerate(uc['rules'],1):p(f'{i}. {r}',size=10.5)
  label('Outputs',uc['outputs'])
new('2.3 Use Case Diagrams')
picture('usecase-account','UC01 account/session operations and external supporting auth actor.',height=3.45)
picture('usecase-levels','UC02 selection includes layout validation/loading; UC04 uses the selected course.',height=3.5)
new('2.3 Use Case Diagrams (continued)',False)
picture('usecase-creation','UC05 creation with optional checkpoint placement; UC06 gameplay respawn, planned.',height=3.45)
picture('usecase-community','UC07 rating and UC08 favorite interactions; SQL exists, UI planned.',height=3.15)
p('Four figures cover six selected use cases including user management. «include» denotes always-included behavior; «extend» denotes conditional added behavior. The assignment’s word “excludes” is interpreted using standard UML «extend», not an invented «exclude» relationship.',size=10)
new('2.4 Traceability')
trace=json.loads(Path('docs/traceability.json').read_text())
short=['profiles / account','levels / creation; AI activity','context / AI activity','levels / selection','device preference / future','levels / classes','transient attempt / classes','layout / classes','layout / classes','layout items / future','profiles, levels / navigation','attempts / future leaderboard','layout checkpoints / creation','ratings, favorites / community','awards / future database']
table(['Feature','Use cases / reqs','Data / diagram','Status'],[(r[0],r[1]+' / '+r[2],short[i],r[5])for i,r in enumerate(trace)],[.55,1.6,2.25,2.05])
p('Full working matrix with test/evidence links: docs/TRACEABILITY.md. Core data and GUI status are separate; planned requirements are not reported as implemented.',size=10)
new('3.0 DATABASE TABLES')
p('DBMS: PostgreSQL hosted by Supabase. The installed schema separates account profiles, course definitions, play eligibility, ratings and favorites. Relationship records are normalized; bounded grid geometry uses a versioned JSONB document. Managed authentication data is outside the public application schema.')
picture('database-core','Implemented relational schema; PK/FK and cardinality are explicit.',height=5.1)
table(['Major use case','Implemented database support'],[('UC01 Manage account','auth.users + signup trigger + own-account profiles'),('UC02 Browse/select','Published levels and validated layout read'),('UC07 Rate','profiles/levels/play_attempts/ratings with eligibility + score constraint'),('UC08 Favorite','profiles/levels/play_attempts/favorites with uniqueness + eligibility')],[2.4,4.05])
for tables,title in [(['profiles','levels'],'3.1 Core Data Dictionary'),(['play_attempts','ratings','favorites'],'3.2 Interaction Data Dictionary')]:
 new(title)
 for name in tables:
  h(name);table(['Attribute','Type / null','Keys / constraints'],[(a,t+(' / NULL' if n=='Yes' else ' / NOT NULL'),k) for a,t,n,k,purpose in DB[name]],[1.15,1.2,4.1])
 p('Deletion rules: auth-user deletion cascades to its profile; profile deletion cascades to its attempts/ratings/favorites and sets owned-course creator_id to NULL. Course deletion cascades to its interaction rows. Each interaction has exactly one player and one course; each may have zero or more interactions.',size=10)
new('3.3 Future Logical Data and Access')
picture('database-future','Achievement logical model; dashed tables are not installed.',height=2.45)
for name in ['achievements (planned)','player_achievements (planned)']:
 h(name);table(['Attribute','Type / null','Keys / constraints'],[(a,t+(' / NULL'if n=='Yes'else' / NOT NULL'),k)for a,t,n,k,pp in DB[name]],[1.35,1.15,3.95])
p('The future player_achievements key is (player_id, achievement_code). Award events and leaderboard completion writes require backend endpoints. The client currently cannot forge completed_at/elapsed_ms or publish/edit levels. Geometry checkpoints persist inside layout; active checkpoint state is transient. Reduced-motion settings are planned device storage.',size=10)
new('3.4 Database Implementation Evidence')
p('The reviewed migration and deterministic course seed were executed in the live Supabase project on October 4, 2026. Verification returned five tables with row security enabled and twelve policies. Public API reads from the deployed app returned the seeded course. Transactional live PostgreSQL checks also passed profile persistence, published read, eligible rating/favorite writes, ownership isolation, score and uniqueness constraints, and anonymous denial. Test fixtures rolled back. These checks use database role/claim fixtures and do not prove managed Auth login. Rating/favorite interfaces remain future work.')
picture('docs/evidence/supabase-schema.jpg','Live SQL result: profiles, levels, play_attempts, ratings and favorites.',height=5.4)
p('Access rules: anonymous users read published levels only. Signed-in players read/update their own profile and start their own incomplete attempt. Rating/favorite writes require ownership and a recorded play of a published level. Interaction records are private. SQL JSONB constraints validate the envelope; seeded layouts receive detailed client validation. Future editing must add server geometry validation.',size=10)
new('3.5 Live Database Behavior Verification')
picture('docs/evidence/supabase-behavior.jpg','Live cloud SQL test result: four major cases and authorization/constraints passed.',height=5.5)
p('supabase/verify-behavior.sql runs a transaction with two temporary identity fixtures, real profile triggers and client database roles/claims. It tests profile writes, published reads, rating/favorite persistence and denied cross-account/anonymous operations. All fixtures roll back. Separate live Auth API testing with two dedicated users passed all thirteen checks. Browser testing also verified profile writes, restored sessions, logout and account switching.')
new('4.0 CLASS DIAGRAMS')
picture('classes','Actual Backend and CourseScene classes, Attempt state and Level/Layout interfaces.',height=5.7)
p('Backend wraps managed auth and bounded data calls. CourseScene owns one Attempt and reads a validated Level. Attempt defines active-time/death/completion behavior. Main-screen navigation is implemented as functions in main.ts. The class model matches the code; planned feature modules are omitted.')
new('5.0 BEHAVIORAL MODELING')
picture('activity-ai','Optional future AI request branches include a direct bypass.',height=4.2)
p('Both creator coaching (UC13) and gameplay hints (UC12) generate contextual text through a backend endpoint. A timeout/provider failure leaves ordinary editing or play available. AI advice is never required to save/play a valid course. This model describes future behavior, not a deployed AI service.')
p('Current attempt lifecycle: active → paused → active; active → death/respawn with time preserved; active → finished once. Restart replaces the attempt; navigation destroys the scene. Hidden-tab pauses require explicit resume. Timer tests confirm pause, death and one-time completion semantics.')
new('6.0 IMPLEMENTATION')
table(['Area','Delivered behavior / boundary'],[('UC01 account','Registration/login forms, provider confirmation/error handling, session restoration, logout and persistent profile editing. Valid/invalid login, saved profile, refresh restoration, logout and account switching verified. New-user email-confirmation check pending.'),('UC02 selection','Live published-level read, loading/empty/error/Retry, selected-layout validation and launch.'),('UC04 gameplay','Movement/jumping, static collision, hazards/start respawn, active clock, finish, pause/restart/back. Completion is transient.'),('Backend','Five PostgreSQL tables; signup trigger; RLS/privileges; rating/favorite database operations supported.'),('Future scope','Editor/publishing, checkpoints, items, sorts/favorite UI, achievements, leaderboard, settings and two AI flows remain planned.')],[1.3,5.15])
h('Reproducible build/run')
for line in ['Node 24 LTS recommended; npm ci','Copy .env.example to .env.local and supply project URL + public publishable key.','npm run dev — standalone local server; no IDE Run button required.','npm test — domain + actual migration checks in local PostgreSQL/PGlite.','npm run build; npm run preview — type check and production bundle/preview.','npm run test:integration — two dedicated test accounts supplied locally; live output records no secrets.']:p(line)
h('Hosted access')
p('https://drat-git.github.io/skystride-adventures/')
p('GitHub Actions installs locked dependencies, runs tests/type check and builds/deploys dist on main. GitHub Pages replaces the proposed Cloudflare Pages host; Supabase remains the meaningful server-side auth/data backend. The exact hosted return URL is configured for authentication. No custom domain or paid plan was purchased.')
p('Two dedicated test accounts were supplied privately and verified. Share demo access privately with the instructor; credentials are excluded from this report and repository.')
new('6.1 Implemented Page Evidence')
picture('docs/evidence/menu.jpg','Main menu: online browsing, explicit local practice, account entry.',height=3.9)
picture('docs/evidence/courses.jpg','Live published-course list returned from Supabase.',height=2.8)
new('6.2 Account Screen Evidence')
for path,caption in [('docs/evidence/login.jpg','Sign-in screen and provider validation/error feedback.'),('docs/evidence/registration.jpg','Registration screen with display-name/email/password validation.')]:picture(path,caption,height=3.15)
p('The forms are implemented. Valid/invalid login, profile persistence, refresh restoration, logout and account switching were verified against managed authentication. New-user registration/email confirmation awaits a human check; existing test accounts were created separately.',size=10)
new('6.3 Persistent Profile Evidence')
picture('docs/evidence/profile.jpg','Own profile loaded after saving a display name and refreshing a valid account session. Account email is excluded from the crop.',height=4.7)
p('Account A signed in through the application, saved SkyStride Tester A and retained both the session and saved name after refresh. Sign out returned to guest navigation; account B then loaded its own original Player profile. The live API separately rejected cross-account reads and updates. Profile creation is linked to the managed-auth user UUID.')
new('6.4 Playable Course Evidence')
picture('docs/evidence/gameplay.jpg','Selected First Flight course loaded from the live record.',height=5.6)
p('Menu → Browse courses → Play course opens the selected database layout. Pause/Resume, Restart course and Back to courses provide navigation. Profile is available only after a valid session. Returning destroys the Phaser game/listeners. Keyboard gameplay targets a desktop browser; touch controls are outside this sprint.')
new('7.0 TESTING')
h('7.1 Test Cases and Observed Results')
table(['Check','Expected','Observed'],[('Production / types','Valid typed build and deployed assets','Passed local build; GitHub Actions succeeded'),('Domain inputs (16 checks)','Reject invalid account/layout input; enforce timer semantics','16 passed'),('Database (13 checks)','Real SQL trigger/keys/ownership/privileges/eligibility','13 passed in PostgreSQL/PGlite with test auth fixtures'),('Live SQL install','Five tables, RLS, policies and seed','Five tables, twelve policies and First Flight verified; migration 002 removes direct trigger execution and adds FK indexes'),('Live public read','Hosted browser reads seeded published course','One real course loaded'),('Cloud SQL behavior','Four major cases plus isolation/constraints','Passed; transactional fixtures rolled back'),('Auth / profile / session','Valid/invalid login, confirmation, refresh, logout, two-user isolation','13 live API checks passed; browser profile/refresh/switch/logout passed; new signup confirmation pending'),('Gameplay lifecycle','Playable course; no accumulated canvases/listeners','Scene launch/navigation checked; detailed keyboard run pending')],[1.3,2.5,2.65])
h('7.2 Testing Limits')
p('Local SQL tests use the actual migration/seed in PGlite with test-only auth.users/auth.uid fixtures; they verify PostgreSQL constraints and policies but cannot prove managed auth or cloud networking. Live installation/read evidence is recorded separately. Structural geometry checks do not prove reachability. The class-project design has no production anti-cheat; local completion times are not uploaded or called verified.')
p('Live integration checks passed with the two dedicated test users: profile round trip, cross-account denial, eligible rating/favorite, invalid score, duplicate favorite, forged ownership, anonymous write denial, missing-level rejection and logout. Test attempts remain as diagnostic evidence; run only in the class test project.')
new('8.0 ARCHITECTURAL MODELING')
h('8.1 Architectural View')
p('Browser UI and Phaser → Supabase Auth and authorized data API → PostgreSQL. The frontend controls display and the current attempt; the backend owns identity, persistence, constraints and row-level authorization. Provider-managed auth storage restores sessions; account-switch/logout clears private active UI. Client visibility is not authorization.')
h('8.2 Architectural Model')
table(['Layer','Responsibility','Files / service'],[('Presentation','Navigation/forms/status, escaped user text, responsive layout','src/main.ts, styles.css'),('Gameplay','Validated geometry, scene/keyboard lifecycle, physics','src/game.ts, level.ts, attempt.ts'),('Data access','Managed auth and bounded profile/level calls','src/backend.ts, auth.ts'),('Backend','Signup/profile linking, RLS, keys and eligibility','Supabase Auth/PostgreSQL, supabase/'),('Delivery','Repeatable dependencies, tests, build, deploy','package-lock.json, GitHub Actions/Pages'),('Future AI','Rate-limited generation with server-only secret; optional creator/player requests','Planned server endpoint and selected provider')],[1.0,3.15,2.3])
p('No application admin role is currently required. The browser receives only the intended public Supabase key; service-role, database and future AI secrets are excluded. Private profile records expose neither another user’s email nor their credentials. Free quotas and inactive-project pause behavior should be checked before a classroom demonstration. Advisory review now reports no exposed-trigger execution warning; leaked-password protection remains unavailable on the current free plan (Supabase password-security documentation).')
new('9.0 GITHUB')
p('Repository: https://github.com/drat-git/skystride-adventures')
p('Board: https://github.com/users/drat-git/projects/1')
p('Deployment verification: https://github.com/drat-git/skystride-adventures/actions')
p('The real public repository contains code, locked dependencies, SQL, tests, editable diagrams, specifications and project evidence. Course source documents, the working handoff, local credential files and private report outputs are excluded. Commits track this implementation; they do not retroactively prove teammate work.')
picture('docs/evidence/github-board.jpg','Actual Sprint 2 tracking board with Todo, In Progress and Done.',height=4.0)
p('Statuses reflect observed work. Actual team assignees remain deferred until confirmed; this gap prevents claiming complete GitHub assignment evidence. Before final submission, confirm assignments, finish the human registration/confirmation and full keyboard demo checks, and record final statuses.')
new('REFERENCES')
refs=[('Course assignment sources','Sprint 1.html; Sprint 2.html; Project Technology Requirements.html, supplied course exports.'),('Group draft / template','Group9_Sprint2.docx; SWE_Sprint 1.docx, supplied documents. The latter is a generic template.'),('Modeling lectures','5_System_Modeling_SWE.pdf; ActivityDiagram.pdf; ContextDiagram.pdf, supplied course slides.'),('Database lecture','DatabaseFundamentals.pdf, supplied course slides.'),('Course feedback / planning','IMG_3374.png; Planning,Scheduling and peer evaluation Table.png, supplied images.'),('Phaser installation','https://docs.phaser.io/phaser/getting-started/installation'),('Vite build/tooling','https://vite.dev/guide/'),('Supabase user data','https://supabase.com/docs/guides/auth/managing-user-data'),('Supabase RLS','https://supabase.com/docs/guides/database/postgres/row-level-security'),('Supabase free limits','https://supabase.com/pricing'),('GitHub Pages','https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages')]
for i,(name,desc)in enumerate(refs,1):p(f'[{i}] {name}. {desc}',size=10)
p('Technical sources checked during implementation on October 4, 2026. Current project evidence is in docs/evidence and docs/VERIFICATION.md. Final course submission still requires factual planning/evaluation/coordinator data, demonstration access, individual uploads and the printed copy.')
# Temporary contents use planned page positions; replace with PDF-observed positions after render.
tocp.text='\n'.join(f'{title}  …  {pg}'for title,pg in contents)
for r in tocp.runs:r.font.name='Times New Roman';r.font.size=Pt(10.5)
tocp.paragraph_format.line_spacing=1.05
D.save(out/'DarshRathi_Group9_Sprint2.docx')
Path('/private/tmp/skystride-review/report-sections.json').write_text(json.dumps(contents))
print(f'Report created with {page} planned pages.')
