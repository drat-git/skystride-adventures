import './styles.css';
import { backend, configured, type CourseSummary, type InteractionState } from './backend';
import { practiceLevel, type Level } from './level';
import { mountGame, type RunResult } from './game';
import { mountEditor, type EditorController } from './editor';
import { applyMotionPreference, readMotionPreference, saveMotionPreference, prefersReducedMotion } from './settings';
import { orderCourses, type CourseOrder } from './catalog';
import type { Session } from '@supabase/supabase-js';

const root = document.querySelector<HTMLDivElement>('#app')!;
let session: Session | null = null;
let currentGame: ReturnType<typeof mountGame> | null = null;
let editorController: EditorController | undefined;
let revision = 0;
let screen = 'home';
let browseOrder: CourseOrder = 'title';
let favoritesOnly = false;
let accountStatusError = '';
const motion = readMotionPreference();
let motionStorageError = motion.error;
applyMotionPreference(motion.value);
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const button = (id: string, text: string, secondary = false) => `<button id="${id}" class="${secondary ? 'secondary' : ''}">${text}</button>`;
function on(id: string, fn: () => void | Promise<void>) {
  document.getElementById(id)?.addEventListener('click', event => { event.preventDefault(); void fn(); });
}
function navigate(fn: () => void | Promise<void>) {
  if (!editorController || editorController.canLeave()) void fn();
}
function onNavigate(id: string, fn: () => void | Promise<void>) { on(id, () => navigate(fn)); }
function shell(title: string, body: string) {
  revision++;
  currentGame?.destroy(); currentGame = null;
  editorController?.destroy(); editorController = undefined;
  root.innerHTML = `<header><a href="#" id="brand" class="brand"><span class="mark">↗</span> SkyStride <span>Adventures</span></a><div class="account">${session ? `<span>${escape(session.user.email ?? 'Player')}</span>${button('signout', 'Sign out', true)}` : button('signin', 'Sign in', true)}</div></header>
    <div id="account-status" class="message error global-status" role="alert" ${accountStatusError ? '' : 'hidden'}>${escape(accountStatusError)}</div>
    <main><p class="eyebrow">GROUP 9 · SPRINT 4</p><h1>${title}</h1>${body}</main>
    <footer>Short courses. One more jump. <span>SkyStride Adventures · Fall 2026</span></footer>`;
  onNavigate('brand', home); onNavigate('signin', () => auth(false)); on('signout', signout);
}
function message(text: string, error = false) {
  const el = document.getElementById('message');
  if (el) { el.textContent = text; el.className = error ? 'message error' : 'message'; }
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'The request failed. Please try again.';
}
async function signout() {
  if (!backend || (editorController && !editorController.canLeave())) return;
  const control = document.getElementById('signout') as HTMLButtonElement;
  control.disabled = true;
  try { await backend.logout(); accountStatusError = ''; session = null; favoritesOnly = false; home(); }
  catch (error) {
    accountStatusError = `Sign out failed: ${errorText(error)}. Retry if still signed in; otherwise sign in again.`;
    const status = document.getElementById('account-status');
    if (status) { status.hidden = false; status.textContent = accountStatusError; }
    const currentControl = document.getElementById('signout') as HTMLButtonElement | null;
    if (currentControl) currentControl.disabled = false;
  }
}
function home() {
  screen = 'home';
  shell('Find your next flight.', `<div class="hero"><div><p class="lead">A little courage. A well-timed jump. Take on compact platform courses and reach the finish flag.</p>
    <div class="actions">${button('levels', 'Browse courses')}${button('practice', 'Local practice', true)}</div>
    <p class="small">Arrow keys or A / D to move. Space, ↑ or W to jump.</p></div>
    <div class="hero-art" aria-label="Illustration of platforms and a finish flag"><span class="sun"></span><span class="mountain one"></span><span class="mountain two"></span><span class="ledge l1"></span><span class="ledge l2"></span><span class="ledge l3"></span><span class="runner"></span><span class="flag">⚑</span></div></div>
    <div class="summary"><article><span class="number">01</span><h2>Play a course</h2><p>Find community courses, collect sky tokens, and make every checkpoint count.</p>${button('settings', 'Settings', true)}</article>
    <article><span class="number">02</span><h2>Keep your progress</h2><p>Save your best times, collect achievements, and return to your favorite courses.</p>${button('profile', session ? 'Your profile' : 'Create an account', true)} ${button('awards', 'Achievements', true)}</article>
    <article><span class="number">03</span><h2>Build a new flight</h2><p>Create a private draft, finish a test of its saved version, and publish it for everyone.</p>${button('editor', 'Create a level', true)}</article></div>
    <p id="message" class="message" role="status">${configured ? 'Online courses and account progress use the project database.' : 'Online setup is pending. Local practice works without an account and does not save progress.'}</p>`);
  on('levels', levels); on('practice', () => play(practiceLevel, true)); on('settings', settings);
  on('profile', () => session ? profile() : auth(true)); on('editor', editor); on('awards', awards);
}
function auth(register: boolean) {
  screen = 'auth';
  shell(register ? 'Start your adventure.' : 'Welcome back.', `<div class="form-layout"><form id="authform"><h2>${register ? 'Create account' : 'Sign in'}</h2>
    ${register ? '<label>Display name<input name="displayName" required minlength="2" maxlength="24" autocomplete="nickname" pattern="[A-Za-z0-9 _-]{2,24}"></label>' : ''}
    <label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
    <label>Password<input name="password" type="password" required minlength="${register ? 8 : 1}" maxlength="128" autocomplete="${register ? 'new-password' : 'current-password'}"></label>
    <p class="small">${register ? 'Use 8–128 characters. Your password is handled by the authentication provider.' : 'Enter your registered email and password.'}</p>
    <button type="submit" ${backend ? '' : 'disabled'}>${register ? 'Create account' : 'Sign in'}</button><p id="message" role="status" class="message">${backend ? '' : 'Online accounts are unavailable until Supabase is configured.'}</p></form>
    <aside><h2>${register ? 'Your place in the clouds' : 'Ready for another run?'}</h2><p>Your account retains your profile, courses, completed runs, favorites, and achievements.</p>
    ${button('switch', register ? 'Already registered? Sign in' : 'New here? Create an account', true)}${button('back', 'Back to menu', true)}</aside></div>`);
  on('switch', () => auth(!register)); on('back', home);
  document.querySelector<HTMLFormElement>('#authform')!.addEventListener('submit', async event => {
    event.preventDefault(); if (!backend) return;
    const form = event.currentTarget as HTMLFormElement, data = new FormData(form);
    const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
    const stamp = revision; submit.disabled = true; message('Connecting…');
    try {
      if (register) {
        const result = await backend.register(String(data.get('email')), String(data.get('password')), String(data.get('displayName')));
        if (!result.session && stamp === revision) { message('Check your email for a confirmation link. If you already have an account, sign in.'); form.reset(); }
      } else await backend.login(String(data.get('email')), String(data.get('password')));
    } catch (error) { if (stamp === revision) message(errorText(error), true); }
    finally { if (stamp === revision) submit.disabled = false; }
  });
}
async function profile() {
  if (!session || !backend) { auth(false); return; }
  screen = 'profile';
  shell('Your player profile.', `<p id="message" class="message" role="status">Loading profile…</p><div id="profilebody"></div>${button('back', 'Back to menu', true)}`);
  on('back', home); const stamp = revision, uid = session.user.id;
  try {
    const p = await backend.profile(uid); if (stamp !== revision) return;
    document.getElementById('profilebody')!.innerHTML = `<form id="profileform"><label>Display name<input name="name" value="${escape(p.display_name)}" required minlength="2" maxlength="24" pattern="[A-Za-z0-9 _-]{2,24}"></label><p class="small">Saved to your account in the database.</p><button>Save display name</button></form>`;
    message('Profile loaded.');
    document.querySelector<HTMLFormElement>('#profileform')!.addEventListener('submit', async event => {
      event.preventDefault(); const form = event.currentTarget as HTMLFormElement, control = form.querySelector('button')!; control.disabled = true;
      try { const name = await backend!.updateProfile(uid, String(new FormData(form).get('name'))); if (stamp === revision) message(`Saved display name: ${name}`); }
      catch (error) { if (stamp === revision) message(errorText(error), true); }
      finally { if (stamp === revision) control.disabled = false; }
    });
  } catch (error) { if (stamp === revision) message(`Profile could not be loaded: ${errorText(error)}`, true); }
}
function stats(course: CourseSummary) {
  return `${course.averageRating === null ? 'Unrated' : `${course.averageRating.toFixed(1)} / 5`} · ${course.ratingCount} rating${course.ratingCount === 1 ? '' : 's'} · ${course.favoriteCount} favorite${course.favoriteCount === 1 ? '' : 's'}`;
}
async function levels() {
  screen = 'levels'; if (!session) favoritesOnly = false;
  shell('Choose a course.', `<p class="lead">A new route, a personal best, or an old favorite.</p>
    <div class="browse-controls"><label>Sort courses<select id="course-order"><option value="title">Title</option><option value="rating">Highest rating</option><option value="favorites">Most favorites</option></select></label>
    <label class="check-label"><input id="favorites-only" type="checkbox" ${session ? '' : 'disabled'}>My Favorites</label>${session ? '' : '<span class="small">Sign in to view your favorites.</span>'}</div>
    <p id="message" role="status" class="message">Loading online courses…</p><div id="courses" class="courses"></div>
    <div class="actions">${button('reload', 'Retry online courses', true)}${button('practice', 'Local practice', true)}${button('back', 'Back to menu', true)}</div>`);
  on('back', home); on('reload', levels); on('practice', () => play(practiceLevel, true));
  const order = document.getElementById('course-order') as HTMLSelectElement;
  const favorites = document.getElementById('favorites-only') as HTMLInputElement;
  order.value = browseOrder; favorites.checked = favoritesOnly;
  const stamp = revision;
  if (!backend) { message('Online courses need Supabase setup. Local practice is available separately.', true); return; }
  try {
    const courses = await backend.catalog(session?.user.id); if (stamp !== revision) return;
    function render() {
      const shown = orderCourses(courses, browseOrder, favoritesOnly), container = document.getElementById('courses')!;
      container.replaceChildren();
      message(shown.length ? `${shown.length} published course${shown.length === 1 ? '' : 's'} loaded from the database.` : favoritesOnly ? 'No favorites yet. Play a course, then add it to your favorites.' : 'No published courses yet.');
      for (const [i, course] of shown.entries()) {
        const card = document.createElement('article'); card.className = 'course';
        card.innerHTML = `<div class="course-preview" aria-hidden="true"><span>↗</span><i></i><i></i><i></i></div><div class="course-body"><span class="badge">${escape(course.difficulty)}</span><h2>${escape(course.title)}</h2><p>${escape(course.description)}</p><p class="course-stats">${stats(course)}${course.isFavorite ? ' · Your favorite' : ''}</p>${button(`course-${i}`, 'Play course')}${button(`details-${i}`, 'Course details', true)}${button(`ranking-${i}`, 'Leaderboard', true)}</div>`;
        container.append(card);
        on(`course-${i}`, () => play(course, false)); on(`details-${i}`, () => courseDetails(course)); on(`ranking-${i}`, () => leaderboard(course));
      }
    }
    order.onchange = () => { browseOrder = order.value as CourseOrder; render(); };
    favorites.onchange = () => { favoritesOnly = favorites.checked; render(); }; render();
  } catch (error) { if (stamp === revision) message(`Online courses could not be loaded: ${errorText(error)}`, true); }
}
async function courseDetails(level: Level) {
  screen = 'details';
  shell(escape(level.title), `<span class="badge">${escape(level.difficulty)}</span><p class="lead">${escape(level.description)}</p><p id="course-stats" class="course-stats"></p>
    <div class="actions">${button('play-course', 'Play course')}${button('leaderboard', 'Leaderboard', true)}</div>
    <section class="community-panel" aria-label="Rating and favorites"><div id="interactions"></div></section><p id="message" class="message" role="status">Loading course details…</p>
    <div class="actions">${button('refresh-details', 'Refresh details', true)}${button('back', 'Back to courses', true)}</div>`);
  on('play-course', () => play(level, false)); on('leaderboard', () => leaderboard(level)); on('back', levels); on('refresh-details', () => courseDetails(level));
  const stamp = revision, uid = session?.user.id;
  if (!backend) { message('Online course details are unavailable until Supabase is configured.', true); return; }
  let state: InteractionState | undefined;
  const load = async () => {
    const [courses, own] = await Promise.all([backend!.catalog(uid), uid ? backend!.interactions(uid, level.id) : Promise.resolve(undefined)]);
    if (stamp !== revision) return false;
    const course = courses.find(c => c.id === level.id); if (!course) throw new Error('This course is no longer available.');
    state = own; document.getElementById('course-stats')!.textContent = stats(course); return true;
  };
  function controls() {
    const panel = document.getElementById('interactions')!;
    if (!uid || !state) {
      panel.innerHTML = `<h2>Make it a favorite</h2><p>Sign in and play this course to rate it or save it to your favorites.</p>${button('community-signin', 'Sign in', true)}`;
      on('community-signin', () => auth(false)); return;
    }
    panel.innerHTML = `<h2>Your course picks</h2><p>${state.eligible ? 'Your saved choices follow your account.' : 'Start a run of this course to unlock ratings and favorites. Finishing is optional.'}</p>
      <form id="rating-form"><label>Your rating<select id="rating-score" ${state.eligible ? '' : 'disabled'}><option value="">Choose a rating</option>${[1, 2, 3, 4, 5].map(score => `<option value="${score}" ${state!.rating === score ? 'selected' : ''}>${score} / 5</option>`).join('')}</select></label>
      <div class="actions"><button id="save-rating" ${state.eligible ? '' : 'disabled'}>Save rating</button><button id="remove-rating" type="button" class="secondary" ${state.rating === null ? 'disabled' : ''}>Remove rating</button></div></form>
      <button id="favorite-toggle" class="secondary" ${state.eligible || state.favorite ? '' : 'disabled'}>${state.favorite ? 'Unfavorite' : 'Favorite'}</button>`;
    const mutate = async (operation: () => Promise<unknown>, success: string) => {
      const inputs = [...panel.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select')];
      const disabled = inputs.map(input => input.disabled); inputs.forEach(input => { input.disabled = true; }); message('Saving your choice…');
      try { await operation(); if (stamp !== revision) return; if (await load()) { controls(); message(success); } }
      catch (error) { if (stamp === revision) { message(`Could not confirm the change: ${errorText(error)}. Retry the action or refresh details.`, true); inputs.forEach((input, i) => { input.disabled = disabled[i]; }); } }
    };
    document.getElementById('rating-form')!.onsubmit = event => {
      event.preventDefault(); const score = Number((document.getElementById('rating-score') as HTMLSelectElement).value);
      if (!Number.isInteger(score) || score < 1 || score > 5) { message('Choose a rating from 1 to 5.', true); return; }
      void mutate(() => backend!.setRating(uid, level.id, score), 'Rating saved.');
    };
    on('remove-rating', () => mutate(() => backend!.setRating(uid, level.id, null), 'Rating removed.'));
    on('favorite-toggle', () => { const value = !state!.favorite; return mutate(() => backend!.setFavorite(uid, level.id, value), value ? 'Favorite saved.' : 'Favorite removed.'); });
  }
  try { if (await load()) { controls(); message('Course details loaded.'); } }
  catch (error) { if (stamp === revision) message(`Could not load course details: ${errorText(error)}`, true); }
}
function editor() {
  if (!session || !backend) { auth(false); return; }
  screen = 'editor'; shell('Build your next flight.', `<div id="editor"></div>${button('back', 'Back to menu', true)}`);
  onNavigate('back', home);
  editorController = mountEditor(document.getElementById('editor')!, backend, session.user.id);
}
function settings() {
  screen = 'settings';
  shell('Set your pace.', `<form id="settings-form"><h2>Motion preferences</h2><label class="check-label"><input id="reduced-motion" type="checkbox" ${prefersReducedMotion() ? 'checked' : ''}>Reduce decorative motion</label><p class="small">Applies to menu transitions and scrolling on this device. Gameplay controls, physics, and timing stay the same.</p><div class="actions"><button>Save settings</button><button id="reset-settings" type="button" class="secondary">Restore defaults</button></div></form><p id="message" class="message" role="status">${motionStorageError ? escape(motionStorageError) : 'Preferences are stored on this device.'}</p>${button('back', 'Back to menu', true)}`);
  const preference = document.getElementById('reduced-motion') as HTMLInputElement;
  preference.onchange = () => message(preference.checked !== prefersReducedMotion() ? 'Unsaved preference. Select Save settings to apply and remember it.' : motionStorageError ?? 'No pending changes.', !!motionStorageError);
  const save = (value: boolean) => {
    applyMotionPreference(value); const result = saveMotionPreference(value);
    motionStorageError = result.error;
    message(result.saved ? 'Settings saved on this device.' : `Applied for this page, but not saved: ${result.error ?? 'Browser storage is unavailable.'}`, !result.saved);
  };
  document.getElementById('settings-form')!.onsubmit = event => { event.preventDefault(); save((document.getElementById('reduced-motion') as HTMLInputElement).checked); };
  on('reset-settings', () => { (document.getElementById('reduced-motion') as HTMLInputElement).checked = false; save(false); }); on('back', home);
}
async function awards() {
  if (!session || !backend) { auth(false); return; }
  screen = 'awards'; shell('Your achievements.', `<p id="message" class="message" role="status">Loading achievements…</p><div id="awards" class="courses"></div><div class="actions">${button('refresh-awards', 'Refresh achievements', true)}${button('back', 'Back to menu', true)}</div>`);
  on('back', home); on('refresh-awards', awards); const stamp = revision;
  try {
    const list = await backend.awards(session.user.id); if (stamp !== revision) return;
    document.getElementById('awards')!.innerHTML = list.map(a => `<article class="course course-body"><span class="badge">${a.earned_at ? 'EARNED' : 'LOCKED'}</span><h2>${escape(a.name)}</h2><p>${a.earned_at ? `Earned ${escape(new Date(a.earned_at).toLocaleDateString())}` : a.rule === 'first_created_level' ? 'Save your first private draft.' : a.rule === 'timed_course' ? `Complete First Flight in under ${(a.threshold_ms ?? 30000) / 1000} seconds.` : 'Complete a published course while signed in.'}</p></article>`).join('');
    message(`${list.filter(a => a.earned_at).length} of ${list.length} achievements earned.`);
  } catch (error) { if (stamp === revision) message(errorText(error), true); }
}
async function leaderboard(level: Level) {
  if (!session || !backend) { auth(false); return; }
  screen = 'leaderboard';
  shell('Course leaderboard.', `<p class="lead">${escape(level.title)} · Best completed time per player (top 50).</p><p class="small">Times are reported by the game client; this class project does not provide production anti-cheat.</p><p id="message" class="message" role="status">Loading results…</p><div id="ranking"></div><div class="actions">${button('refresh-ranking', 'Refresh leaderboard', true)}${button('back', 'Back to courses', true)}</div>`);
  on('back', levels); on('refresh-ranking', () => leaderboard(level)); const stamp = revision;
  try {
    const rows = await backend.leaderboard(level.id); if (stamp !== revision) return;
    document.getElementById('ranking')!.innerHTML = rows.length ? `<table class="ranking"><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Time</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.rank}</td><td>${escape(row.display_name)}</td><td>${(row.elapsed_ms / 1000).toFixed(2)} s</td></tr>`).join('')}</tbody></table>` : '';
    message(rows.length ? 'Saved results loaded. Equal times share a rank.' : 'No completed runs yet. Finish this course while signed in to record a time.');
  } catch (error) { if (stamp === revision) message(errorText(error), true); }
}
async function play(level: Level, local: boolean) {
  screen = 'play'; const save = !local && !!session && !!backend;
  shell(escape(level.title), `<div class="game-meta"><span class="badge">${local ? 'LOCAL PRACTICE' : save ? 'ACCOUNT RUN' : 'GUEST RUN'}</span><p>Move: ← / → or A / D · Jump: Space / ↑ / W</p></div><div id="game" class="game"></div>
    <p id="message" class="message" role="status">${save ? 'Starting your account attempt…' : 'Practice results are not saved. Sign in and play a published course to save a time.'}</p>
    <div class="actions">${button('pause', 'Pause', true)}${button('retry', 'Restart course', true)}<button id="save-result" hidden>Retry saving result</button>${local ? '' : button('details', 'Course details', true)}${button('back', 'Back to courses', true)}</div>
    <div class="ai-placeholder"><button disabled aria-describedby="ai-hint-status">AI Hint</button><span id="ai-hint-status" class="small">Not available yet.</span></div>`);
  let paused = false, attemptId: string | undefined, result: RunResult | undefined, saving = false, resultSaved = false;
  const stamp = revision, uid = session?.user.id;
  const resultText = () => `${(result!.elapsedMs / 1000).toFixed(2)} seconds · ${result!.deaths} deaths · ${result!.collected} / ${result!.totalItems} items`;
  const canLeave = () => !save || !result || resultSaved || window.confirm('This result has not been confirmed saved. Leave this run?');
  on('pause', () => currentGame?.scene.setPaused(!paused));
  on('retry', () => { if (canLeave()) void play(level, local); });
  on('back', () => { if (canLeave()) void levels(); });
  on('details', () => { if (canLeave()) void courseDetails(level); });
  const persist = async () => {
    if (!attemptId || !result || stamp !== revision || saving) return;
    const retry = document.getElementById('save-result') as HTMLButtonElement;
    saving = true; retry.disabled = true; message('Course complete. Saving result…');
    try {
      await backend!.completeAttempt(attemptId, result.elapsedMs, result.deaths); if (stamp !== revision) return;
      resultSaved = true;
      retry.hidden = true; message(`Result saved! ${resultText()}. Your achievements and leaderboard are updated.`);
    } catch (error) { if (stamp === revision) { retry.hidden = false; message(`Result not saved: ${errorText(error)}. Retry saving before leaving this screen.`, true); } }
    finally { saving = false; if (stamp === revision) retry.disabled = false; }
  };
  on('save-result', persist);
  try {
    if (save) { attemptId = await backend!.startAttempt(uid!, level.id); if (stamp !== revision) return; message('Reach the gold flag. Your completed result will be saved.'); }
    currentGame = mountGame(document.getElementById('game')!, level, completed => {
      if (stamp !== revision) return;
      (document.getElementById('pause') as HTMLButtonElement).disabled = true; result = completed;
      if (save) void persist(); else message(`Course complete! ${resultText()}. Practice result is not saved.`);
    });
    currentGame.game.events.on('pause-changed', (value: boolean) => { paused = value; const control = document.getElementById('pause'); if (control) control.textContent = paused ? 'Resume' : 'Pause'; });
  } catch (error) { if (stamp === revision) message(`Could not start the course: ${errorText(error)}. Restart to retry.`, true); }
}
async function start() {
  home(); if (!backend) return;
  backend.client.auth.onAuthStateChange((_event, next) => {
    if (_event === 'SIGNED_IN') accountStatusError = '';
    const previous = session?.user.id; session = next;
    if (previous !== next?.user.id) setTimeout(() => {
      favoritesOnly = false;
      if (screen === 'auth' && next) void profile(); else home();
    }, 0);
  });
  const { data, error } = await backend.client.auth.getSession();
  if (error) message(`Session could not be restored: ${error.message}`, true);
  else { session = data.session; if (session && screen === 'home') home(); }
}
void start();
