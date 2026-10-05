from pathlib import Path
from html import escape
out=Path('docs/diagrams')
class Diagram:
 def __init__(self,w,h):
  self.w=w;self.h=h;self.parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0 0 L10 5 L0 10" fill="none" stroke="#233c40" stroke-width="1.4"/></marker></defs><rect width="100%" height="100%" fill="white"/>']
 def text(self,x,y,lines,size=22,anchor='middle'):
  if isinstance(lines,str):lines=lines.split('\n')
  for i,line in enumerate(lines):self.parts.append(f'<text x="{x}" y="{y+i*(size+7)}" text-anchor="{anchor}" font-family="Arial,sans-serif" font-size="{size}" fill="#142e33">{escape(line)}</text>')
 def box(self,x,y,w,h,lines,fill='#f0f5f4',dash=False):
  self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="#233c40" stroke-width="2" '+('stroke-dasharray="8 5"' if dash else '')+'/>');self.text(x+w/2,y+h/2-10,lines)
 def action(self,x,y,w,h,label):
  self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="15" fill="white" stroke="#233c40" stroke-width="2"/>');self.text(x+w/2,y+h/2+6,label,19)
 def line(self,x,y,x2,y2,label='',arrow=False,dash=False):
  self.parts.append(f'<path d="M{x} {y} L{x2} {y2}" fill="none" stroke="#233c40" stroke-width="2" '+('marker-end="url(#arrow)" ' if arrow else '')+('stroke-dasharray="7 5" 'if dash else '')+'/>')
  if label:self.text((x+x2)/2+7,(y+y2)/2-10,label,16)
 def path(self,d,arrow=True):self.parts.append(f'<path d="{d}" fill="none" stroke="#233c40" stroke-width="2" '+('marker-end="url(#arrow)"'if arrow else '')+'/>')
 def diamond(self,cx,cy,w,h,label):
  self.parts.append(f'<polygon points="{cx},{cy-h/2} {cx+w/2},{cy} {cx},{cy+h/2} {cx-w/2},{cy}" fill="#fff8e4" stroke="#233c40" stroke-width="2"/>');self.text(cx,cy-6,label,18)
 def dot(self,x,y,final=False):
  if final:self.parts.append(f'<circle cx="{x}" cy="{y}" r="15" fill="white" stroke="#233c40" stroke-width="2"/>')
  self.parts.append(f'<circle cx="{x}" cy="{y}" r="10" fill="#233c40"/>')
 def actor(self,x,y,label):
  self.parts.append(f'<circle cx="{x}" cy="{y}" r="16" fill="white" stroke="#233c40" stroke-width="2"/>');self.path(f'M{x} {y+16} L{x} {y+65} M{x-30} {y+35} L{x+30} {y+35} M{x} {y+65} L{x-25} {y+98} M{x} {y+65} L{x+25} {y+98}',False);self.text(x,y+130,label,20)
 def oval(self,x,y,w,h,label):
  self.parts.append(f'<ellipse cx="{x}" cy="{y}" rx="{w/2}" ry="{h/2}" fill="#f0f5f4" stroke="#233c40" stroke-width="2"/>');self.text(x,y-5,label,20)
 def save(self,name): (out/(name+'.svg')).write_text(''.join(self.parts)+'</svg>')
d=Diagram(1100,460);d.box(360,160,380,120,['«system»','SkyStride Adventures']);d.box(30,30,320,100,['«system»','Supabase Auth and Data']);d.box(750,320,320,100,['«system»','Generative AI service']);d.path('M350 80 L550 80 L550 160',False);d.path('M550 280 L550 370 L750 370',False);d.text(550,445,'AI connection planned for a later sprint',18);d.save('context')
d=Diagram(1080,1320)
for x,name in [(0,'Player'),(360,'Application'),(720,'Supabase')]:
 d.box(x+1,1,358,1310,'',fill='white');d.box(x+1,1,358,64,name,fill='#e4eeeb')
d.dot(180,110);d.action(50,155,260,65,'Choose sign in / sign up');d.line(180,120,180,155,arrow=True)
d.action(410,250,260,65,'Validate account input');d.path('M310 188 L540 188 L540 250')
d.diamond(540,395,260,125,['Input','valid?']);d.line(540,315,540,332,arrow=True)
d.action(50,362,260,65,'Correct input');d.line(410,395,310,395,'[no]',True);d.path('M180 362 L180 220')
d.action(770,500,260,65,'Register or authenticate');d.path('M540 458 L540 532 L770 532');d.text(595,482,'[yes]',16)
d.action(770,650,260,90,['Return session / confirmation','or error']);d.line(900,565,900,650,arrow=True)
d.diamond(540,825,275,155,['Login','successful?']);d.path('M900 740 L900 825 L678 825')
d.action(50,792,260,65,'Read error / confirm email');d.line(403,825,310,825,'[no]',True);d.path('M50 825 L25 825 L25 188 L50 188')
d.action(410,985,260,65,'Load profile and menu');d.line(540,902,540,985,'[yes]',True)
d.action(50,1115,260,65,'Choose sign out');d.path('M540 1050 L540 1080 L180 1080 L180 1115')
d.action(770,1115,260,65,'Invalidate session');d.line(310,1148,770,1148,arrow=True)
d.action(410,1220,260,65,'Clear private UI state');d.path('M900 1180 L900 1252 L670 1252');d.dot(180,1252,True);d.line(410,1252,195,1252,arrow=True);d.save('activity-auth')
d=Diagram(1100,710)
d.actor(85,200,'Player');d.box(190,30,875,635,'',fill='white');d.text(620,67,'SkyStride Adventures',24)
d.oval(455,160,390,90,['UC02 Browse and select','published level']);d.oval(820,350,340,95,['Validate and load','selected layout']);d.line(115,235,270,160)
d.line(610,180,700,310,'«include»',True,True)
d.oval(455,495,390,90,['UC04 Play and complete','a level']);d.line(115,250,275,480)
d.text(620,625,'Published levels come from Supabase; local practice is explicit.',18);d.save('usecase-levels')
d=Diagram(1100,630);d.actor(90,220,'Player');d.actor(1000,220,['Supabase','Auth service']);d.box(190,30,715,550,'',fill='white');d.text(550,65,'SkyStride Adventures',24)
for cy,label in [(160,'Register account'),(300,'Sign in / restore session'),(450,'Sign out')]:
 d.oval(545,cy,440,85,label);d.line(120,255,330,cy);d.line(765,cy,970,255)
d.text(545,550,'UC01 Manage account and session',20);d.save('usecase-account')
d=Diagram(1100,620);d.actor(95,180,'Creator');d.box(200,30,850,540,'',fill='white');d.text(620,68,'SkyStride Adventures · planned flows',24)
d.oval(500,175,470,90,['UC05 Create and save','a level']);d.line(125,225,280,180)
d.oval(810,360,360,90,['Place checkpoint','(optional)']);d.line(700,330,560,213,'«extend»',True,True)
d.oval(480,440,435,90,['UC06 Activate checkpoint','and respawn']);d.line(125,240,280,425)
d.text(625,535,'Checkpoint geometry persists in the saved layout.',18);d.save('usecase-creation')
d=Diagram(1100,560);d.actor(105,185,['Logged-in','player']);d.box(225,30,800,480,'',fill='white');d.text(625,67,'SkyStride Adventures',24)
for cy,label in [(195,['UC07 Rate a played level']),(370,['UC08 Manage favorites'])]:d.oval(625,cy,550,110,label);d.line(135,235,350,cy)
d.text(625,480,'Precondition: a recorded play attempt for this published level.',18);d.save('usecase-community')
d=Diagram(1100,740)
d.box(30,40,460,220,['Backend','client: SupabaseClient','register()  login()  logout()','profile()  updateProfile()  levels()']);d.box(610,40,460,220,['CourseScene extends Phaser.Scene','level: Level; attempt: Attempt','create()  update()','setPaused()  respawn()']);
d.box(30,460,460,230,['«interface» Level / Layout','id, title, description, difficulty','version, cols, rows, start, finish','platforms, hazards, checkpoints, items']);d.box(610,460,460,230,['Attempt','elapsedMs, deaths, paused, finished','tick()  die()  finish()']);d.line(260,260,260,460,'returns / validates');d.line(840,260,840,460,'owns one');d.line(710,260,410,460,'reads one');d.text(550,720,'main.ts coordinates screens as functions; it is not a fictional class.',18);d.save('classes')
d=Diagram(1120,850)
for x,y,w,h,lines in [(380,25,360,90,['auth.users (managed)','PK id UUID']), (380,205,360,120,['profiles','PK / FK id → auth.users','display_name TEXT']), (380,465,360,130,['levels','PK id UUID; FK creator_id','layout JSONB, published BOOL']), (20,205,300,120,['play_attempts','PK id; FK user_id, level_id','started_at, elapsed_ms, deaths']), (800,205,300,120,['ratings','PK user_id + level_id','FK both; score 1..5']), (800,465,300,130,['favorites','PK user_id + level_id','FK both'])]:d.box(x,y,w,h,lines)
d.line(560,115,560,205,'1 : 1');d.line(560,325,560,465,'0..1 : 0..*');d.line(380,265,320,265,'1 : 0..*');d.path('M170 325 L170 530 L380 530',False);d.text(275,510,'0..* : 1',16);d.line(740,265,800,265,'1 : 0..*');d.path('M950 325 L950 415 L650 415 L650 465',False);d.text(770,400,'0..* : 1',16);d.line(740,530,800,530,'1 : 0..*');d.path('M740 295 L770 295 L770 565 L800 565',False);d.text(910,635,'Each favorite has one player and one level.',18);d.text(560,775,'Core schema implemented in SQL; cloud execution status recorded separately.',18);d.text(560,810,'User/level relationship records are normalized; bounded geometry uses JSONB.',18);d.save('database-core')
d=Diagram(1100,470);d.box(25,110,300,130,['profiles (core)','PK id UUID']);d.box(405,110,300,130,['player_achievements','PK player_id + achievement_code','FK both; earned_at TIMESTAMPTZ'],dash=True);d.box(785,110,290,130,['achievements','PK code TEXT','name, rule, threshold_ms'],dash=True);d.line(325,175,405,175,'1 : 0..*');d.line(705,175,785,175,'0..* : 1');d.text(550,330,'Dashed tables are logical future design, not installed in Sprint 2.',20);d.text(550,375,'Leaderboard derives best verified completions from play_attempts.',20);d.text(550,420,'Reduced-motion setting stays on the device; active checkpoints stay in the scene.',20);d.save('database-future')
print('9 editable diagrams created')
