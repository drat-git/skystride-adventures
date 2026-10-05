import json
from pathlib import Path
features=[
('F01','Login / Logout Save System','Managed registration, login, logout and persistent account profile.',['UC01'],'App built; live integration pending'),
('F02','AI Assisted Level Editor System','A generative design coach reviews a draft and suggests routes, hazards, checkpoints and difficulty improvements.',['UC05','UC13'],'Planned'),
('F03','AI Assisted Hint System','An on-demand generative gameplay tip uses bounded level and current player context.',['UC12'],'Planned'),
('F04','Level Selection System','Browse premade/shared courses; sort by average rating or favorite count and filter My Favorites.',['UC02'],'Published list built; sorts/filters planned'),
('F05','Settings System','Choose reduced-motion preference on the current device.',['UC03'],'Planned'),
('F06','Character Movement System','Move left/right and jump with one character.',['UC04'],'Built locally'),
('F07','Timer System','Measure active attempt time with explicit pause, death and restart rules.',['UC04','UC14'],'Built locally; persistence planned'),
('F08','Camera System','Fixed-screen framing scales the bounded course to available space.',['UC04'],'Built locally'),
('F09','Obstacle System','Static platforms and stationary hazards provide the course challenge.',['UC04'],'Built locally'),
('F10','Item System','One collectible type contributes to an optional completion count.',['UC15'],'Planned'),
('F11','Main Menu System','Navigate play, account and profile now; editor/settings/progress follow.',['UC01','UC02','UC03','UC05','UC09'],'Sprint 2 navigation built'),
('F12','Leaderboard System','List each player\'s best completion time per level.',['UC10'],'Planned'),
('F13','Checkpoint / Respawn System','Place checkpoints in the editor; touching one changes the safe death spawn for that attempt.',['UC05','UC06'],'Checkpoint planned; start respawn built'),
('F14','Level Rating / Favorites System','Rate a played shared level and favorite it with account persistence and selection controls.',['UC02','UC07','UC08'],'SQL built/tested locally; GUI planned'),
('F15','Achievement System','Save first completion, first created course and a designated timed challenge award to the account.',['UC09'],'Planned')]
specs=[]
def add(n,name,actors,steps,alt,exc,pre,post,inputs,rules,outputs,status,tables):
 specs.append(dict(id=f'UC{n:02}',name=name,actors=actors,steps=steps,alternate=alt,exception=exc,pre=pre,post=post,requirement=f'R{n:02}',introduction=f'The system supports {name.lower()} with the following observable rules.',inputs=inputs,rules=rules,outputs=outputs,status=status,tables=tables))
add(1,'Manage account and session',['Player','Supabase Authentication service'],[
'Player opens Create account, enters email, password and display name, and submits.','Application validates the inputs and sends registration to managed authentication.','Authentication creates the user; a database trigger creates a linked profile. If confirmation is enabled, the application explains that the player must confirm the email.','Player signs in with confirmed email and password. Authentication returns a session; application loads the current player profile.','Player may change the display name and save it; the database permits only the player\'s own profile update.','Refreshing the application restores a valid session.','Player signs out. Application requests session invalidation, clears the private interface and returns to signed-out navigation.'],
'An existing player selects Sign in directly. A player can choose clearly labeled local practice without authentication or account persistence.',
'Invalid inputs remain on the form with a specific message. Invalid/unconfirmed credentials and provider/network errors display recoverable feedback. Failed profile loading is shown as an error. A failed sign-out remains visible and can be retried.',
'Application is reachable; online account actions require configured reachable Supabase; sign-in requires a registered, confirmed account when confirmation is enabled.',
'On successful sign-in, a valid session and own persistent profile are available. Successful sign-out removes the session and active private UI. Registration without confirmation yields no signed-in claim.',
'Email (max 254 characters), password (8–128 characters), display name (2–24 allowed characters); session token managed by provider.',[
'The application shall validate email syntax and 8–128-character passwords before account requests.','Display names shall contain only letters, digits, spaces, underscores or hyphens and be 2–24 characters.','Managed authentication shall handle credentials; public application tables shall contain no password.','The application shall implement registration, login, logout and restoration after refresh; confirmation-required registration shall display instructions.','The profile UUID shall reference the managed auth UUID; RLS shall restrict reads/updates to that account.','Account changes shall destroy active game/private interface state. Backend errors shall be displayed without pretending that a write succeeded.'],
'Confirmation guidance, signed-in profile, saved display name, signed-out navigation, or actionable error.', 'Implemented source; local rules tested; live auth pending',['auth.users','profiles'])
add(2,'Browse and select a level',['Player'],[
'Player selects Browse courses.','Application requests published course records from the authorized data API and shows loading feedback.','Application displays title, description and difficulty; player chooses a course.','Application validates the chosen record and layout before creating the game scene.','Game loads the layout belonging to the selected record.'],
'Player explicitly selects Local practice. Future selection supports rating sort, favorite-count sort, and My Favorites for signed-in players.',
'Network/database failures show an error with Retry. An empty published list shows an empty message. An invalid record/layout prevents play and displays an error; no silent local-data substitution occurs.',
'Online browsing requires a configured backend. Local practice requires only a loaded application.',
'The chosen valid course scene is active, or no scene starts and a clear loading/error/empty state remains.',
'Selected level UUID; database records; future sort/filter selection.',[
'The application shall read only published courses for ordinary players.','The list shall display title, description and difficulty and launch the actual selected layout.','The application shall validate version 1 geometry on a 24×14 grid before starting a scene.','Loading, empty, invalid-layout and network-error states shall be distinct; Retry shall repeat the request.','Future sorts shall rank descending average rating or favorite count, break ties by title then UUID, and put unrated courses last with an Unrated label.','A future My Favorites filter shall show the current account\'s favorites only.'],
'Published course list; selected scene; future ordered/filtered list; error/empty state.', 'Core list source built; live read pending; sorts/filters planned',['levels','ratings','favorites'])
add(3,'Change settings',['Player'],['Player opens Settings.','Application loads the saved device reduced-motion preference.','Player switches reduced motion on or off and selects Save.','Application applies that preference to decorative menu motion and stores it on this device.'],
'Player restores the default preference (off). Keyboard and gameplay physics remain functional for both values.',
'Unavailable browser storage produces a message; the preference may apply for the current page but is not claimed saved.',
'Application is reachable; future settings screen is implemented.',
'A valid boolean preference is applied; successful device storage retains it across reload on that browser.',
'Reduced-motion boolean.',[
'The settings interface shall support reduced motion on/off with default off.','Decorative UI animation shall respect this setting; essential gameplay mechanics shall remain consistent.','Settings shall persist only on the current device; the application shall disclose a failed save.'],
'Applied preference and saved/unsaved feedback.', 'Planned',['Device settings (no SQL table)'])
add(4,'Play and complete a level',['Player'],['Application spawns the player at the validated start and starts an active-time clock.','Player moves left/right and jumps; platform collision supports landing.','Player avoids stationary hazards; touching a hazard or falling below the course increments deaths and returns to start in Sprint 2.','Player can pause and resume. Hiding the tab pauses the attempt until explicit resume.','Player reaches the finish flag; application stops physics/time and displays one completion result.'],
'Player restarts for a new attempt or returns to the list. Future activated checkpoints replace the start spawn.',
'Invalid layout prevents scene initialization. Leaving destroys the scene/listeners; a failed future result write must preserve a clear unsaved status.',
'A structurally valid selected course exists; keyboard-capable desktop browser is available.',
'One completion result is displayed with active time and death count; this sprint\'s result is transient.',
'Level layout; left/right/jump input; pause/restart/back actions.',[
'The player shall move with ArrowLeft/ArrowRight or A/D and jump with Space/ArrowUp/W while grounded.','Hazards and out-of-course falls shall increment deaths and respawn at start this sprint.','The timer shall continue through deaths, pause with physics, and stop once at finish.','Restart shall reset timer/deaths; navigation shall destroy the previous game and listeners.','The view shall fit one 24×14 course; the application shall not claim that a transient completion is saved.'],
'Playable course, pause state, death count and single local completion result.', 'Implemented and local UI checked; detailed gameplay verification recorded separately',['levels','play_attempts (future completion integration)'])
add(5,'Create and save a level',['Logged-in creator'],['Creator opens the grid editor and starts from a valid template.','Creator changes platforms and hazards, places one start/finish, and optionally adds checkpoints/items.','Application validates bounds, counts, supported object types and safe supported spawn positions.','Creator enters title, description and difficulty and chooses Save draft.','Backend enforces creator ownership and saves the validated revision; application displays the saved course identifier.'],
'Creator can request optional AI design coaching (UC13), review its feedback, and manually apply suggestions; saving does not require AI. Publishing is a separate UC11.',
'Invalid geometry or metadata is rejected with the offending fields. Network/save failure preserves the unsaved draft and offers retry. Structural validity does not guarantee reachability.',
'Creator has a valid account session; editor/write endpoint is implemented.',
'A private creator-owned draft revision is stored, or draft remains unsaved with feedback.',
'Grid changes; versioned layout; title 1–60 characters; description up to 280; easy/medium/hard difficulty.',[
'The editor shall offer meaningful grid-based platform/hazard changes and checkpoint placement.','Each layout shall have one distinct start and finish, version 1, 24 columns and 14 rows.','Coordinates shall be integers within bounds; safe spawn points shall have supporting platforms and not overlap hazards.','The backend shall validate geometry and enforce creator ownership before saves; client button visibility alone shall not authorize writes.','Saving shall show an identifier only after backend success; AI guidance shall be optional and shall not silently modify the draft.'],
'Saved private course/revision identifier or validation/unsaved-draft errors.', 'Logical design; client level writes disabled in core schema',['levels'])
add(6,'Activate checkpoint and respawn',['Player'],['Player touches a checkpoint while playing.','Application records that checkpoint\'s safe spawn in the current attempt.','On death, application increments death count and respawns at the active checkpoint.','Player continues toward the finish with the same running attempt timer.'],
'With no active checkpoint, death respawns at start. Restart or leaving clears the active checkpoint. Later checkpoints replace earlier ones.',
'Unsafe checkpoint layout is rejected before play; damaged runtime state falls back to the validated start with error feedback.',
'Course supports a valid checkpoint and active play; checkpoint functionality implemented.',
'Player continues at the active checkpoint/start; death does not end the attempt or reset time.',
'Checkpoint collision, death event, restart/navigation events.',[
'Checkpoint placement shall persist in level.layout.checkpoints.','Touching a checkpoint shall activate its safe spawn for this attempt only.','Death shall use the most recently activated checkpoint or level start and preserve elapsed active time.','Restart/exit shall clear active checkpoint state; account persistence of active checkpoints is not promised.'],
'Active checkpoint state and safe respawn.', 'Planned; initial start respawn implemented',['levels.layout.checkpoints; transient scene state'])
add(7,'Rate a played level',['Logged-in player'],['Player opens rating controls for a played shared course.','Backend verifies an account-linked play attempt for that published level.','Player selects an integer 1–5 and submits.','Backend inserts or updates the player-level rating.','Application confirms the saved score; a future aggregate query recalculates the displayed average.'],
'Player changes a previous rating or removes it. Finishing is not required; a recorded play attempt qualifies.',
'Anonymous or unplayed-level requests, invalid score, missing/unpublished level or ownership forgery are rejected. Network failure displays unsaved feedback and allows retry.',
'Valid session; recorded play attempt for the selected published shared course.',
'One current rating exists per player-level pair, updated score is persisted, or no write occurs.',
'Current account UUID; level UUID; integer score 1–5.',[
'The backend shall restrict rating writes to auth.uid() and recorded play eligibility for a published level.','Each player-level pair shall have at most one rating; integer values shall be between 1 and 5.','An eligible player shall be able to replace/remove their own rating; another account\'s records shall be private.','Future average-rating display shall derive from persisted scores; failures shall not show false saved state.'],
'Saved score or rejection; future aggregate average.', 'SQL and policies tested locally; live backend and GUI pending',['profiles','levels','play_attempts','ratings'])
add(8,'Manage favorite levels',['Logged-in player'],['Player chooses Favorite for a played published shared course.','Backend checks session, ownership and a recorded play attempt.','Backend inserts a unique player-level favorite.','Application shows a saved favorite state.','Player can remove the favorite or later browse My Favorites.'],
'Repeated add is idempotent at the application level; removing an absent favorite leaves it absent. Rating and favorite are independent.',
'Unauthorized, unplayed or unpublished-level requests fail. Network failure leaves the last confirmed state and offers retry.',
'Valid session and recorded play for the course; future favorite UI is available.',
'At most one account-linked favorite exists for this course, or it has been removed.',
'Level UUID; authenticated account; add/remove choice.',[
'The backend shall allow only the current account\'s eligible favorite writes/deletes.','The favorite table shall enforce a composite primary key on user_id and level_id.','Favorites shall persist across sessions independently of ratings.','Selection shall support personal favorites filtering and descending favorite-count sorting in future UI.'],
'Saved add/remove state; future favorites list/count.', 'SQL and policies tested locally; live backend and GUI pending',['profiles','levels','play_attempts','favorites'])
add(9,'Earn and view achievements',['Logged-in player'],['Backend evaluates a saved qualifying event: first completion, first saved created level, or First Flight completed in under 30,000 active milliseconds.','Backend inserts the matching player-achievement award if not already awarded.','Player opens Progress.','Application loads and displays the player\'s persisted achievement names and earned dates.'],
'Multiple goals can be met by one event; repeating an event does not create duplicate awards.',
'Failed event/award persistence produces pending/unsaved feedback. Backend rejects requests that attempt to self-award arbitrary achievements.',
'Valid account; trusted event recording/award service implemented.',
'Qualifying awards are persisted once and displayed only to their owner.',
'Player identity; level/completion/save event; active elapsed milliseconds.',[
'The first three achievement codes shall be first_completion, first_created_level and first_flight_under_30s.','The timed goal shall require elapsed_ms < 30000 for First Flight; deaths retain time and pauses exclude inactive time.','Player-achievement pairs shall be unique; backend rules shall determine awards from saved events.','Awards shall persist to the account and not grant guest preview persistence.'],
'Persistent awards and progress list, or pending error state.', 'Planned logical model',['play_attempts','levels','achievements','player_achievements'])
add(10,'View leaderboard',['Player'],['Player opens the leaderboard for a course.','Backend computes the best saved verified completion per account for the selected level.','Application sorts ascending active elapsed milliseconds and displays rank, display name and best time.','Player can change the selected course.'],
'With no completion records, display an empty leaderboard. Ties share rank; stable ordering uses account UUID after elapsed time.',
'Network errors display Retry. Unsaved, unverified or incomplete attempts are excluded. No email or credential data is exposed.',
'Course exists; trusted completion recording and a bounded public leaderboard endpoint are implemented.',
'Leaderboard reflects persisted eligible results or a clear empty/error state.',
'Level UUID; optional bounded result limit (top 50).',[
'The leaderboard shall include only completed backend-recorded attempts and one best time per player per level.','Rank shall order ascending elapsed_ms; equal times shall share rank and stable order by account UUID.','Public results shall expose display name, rank and time only, without emails or full private profiles.','This class-project design shall disclose the absence of production anti-cheat; client-submitted times shall not be called verified.'],
'Top-50 ranked best results or empty/error feedback.', 'Planned; completion writes disabled this sprint',['play_attempts','profiles'])
future=[('UC11','Publish a level','Creator completes a test run of the current draft revision before publishing; this is a practical check, not general reachability proof.'),('UC12','Request AI gameplay advice','Optional genuinely generated tip from bounded level/player context through one server endpoint.'),('UC13','Request AI editor feedback','Optional genuinely generated draft review with specific route/hazard/checkpoint/difficulty suggestions; creator applies edits.'),('UC14','Replay or restart a level','Start a new attempt; reset clock/deaths/checkpoint state; reuse a validated course.'),('UC15','Collect a level item','Collect each instance once per attempt and display an optional completion count.')]
Path('docs/specifications.json').write_text(json.dumps(dict(features=features,specs=specs,future=future),indent=2))
print('15 features, 15 use cases, 10 full specifications and matching requirements')
