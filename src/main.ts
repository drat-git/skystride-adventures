import './styles.css';
import { backend, localBackend, type CourseSummary, type InteractionState } from './backend';
import type { Level } from './level';
import { mountGame, type RunResult, type RunState, type RunHud, type ControlAction } from './game';
import { officialCourses, nextOfficialCourse, themeName, titleCourse } from './content/official';
import { mountEditor, type EditorController } from './editor';
import { applyMotionPreference, readMotionPreference, saveMotionPreference, prefersReducedMotion } from './settings';
import { orderCourses, type CourseOrder } from './catalog';
import { PASSWORD_REQUIREMENTS } from './auth';
import type { Session } from '@supabase/supabase-js';

const root = document.querySelector<HTMLDivElement>('#app')!;
let session: Session | null = null;
let currentGame: ReturnType<typeof mountGame> | null = null;
// Read-only local playtest seam; omitted from production builds.
if (import.meta.env.DEV) Object.defineProperty(window, '__SKYSTRIDE_SNAPSHOT__', { value: () => currentGame?.scene.getSnapshot() ?? null });
let editorController: EditorController | undefined;
let revision = 0;
let screen = 'title';
let screenCleanup: (() => void) | undefined;
let runCanLeave: (() => boolean) | undefined;
const guestProgress = new Map<string, number>();
const guestCourseTitles = new Map<string, string>();
let browseOrder: CourseOrder = 'title';
let favoritesOnly = false;
let accountStatusError = '';
const motion = readMotionPreference();
let motionStorageError = motion.error;
applyMotionPreference(motion.value);
const escape = (text: string) => text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const button = (id: string, text: string, secondary = false, className = '') => `<button id="${id}" class="${secondary ? 'secondary' : ''} ${className}">${text}</button>`;
function on(id: string, fn: () => void | Promise<void>) {
  document.getElementById(id)?.addEventListener('click', event => { event.preventDefault(); void fn(); });
}
function navigate(fn: () => void | Promise<void>) {
  if ((!editorController || editorController.canLeave()) && (!runCanLeave || runCanLeave())) void fn();
}
function onNavigate(id: string, fn: () => void | Promise<void>) { on(id, () => navigate(fn)); }
function clearScreen() {
  revision++;
  screenCleanup?.(); screenCleanup = undefined;
  runCanLeave = undefined;
  currentGame?.destroy(); currentGame = null;
  editorController?.destroy(); editorController = undefined;
}
// Keep the fullscreen element and its ancestors connected during course changes.
// Removing or moving that element would make the browser leave fullscreen.
function replaceAround(parent: HTMLElement, next: ParentNode, keep: Element, placeholder: Element) {
  for (const child of [...parent.childNodes]) if (child !== keep) child.remove();
  let after = false;
  for (const child of [...next.childNodes]) {
    if (child === placeholder) after = true;
    else if (after) parent.append(child);
    else parent.insertBefore(child, keep);
  }
}
function shell(title: string, body: string) {
  const stage = screen === 'play' && document.fullscreenElement?.id === 'play-stage' ? document.fullscreenElement : null;
  clearScreen();
  root.className = `screen-${screen}`;
  const markup = `<header class="game-header"><a href="#" id="brand" class="brand"><span class="player-icon" aria-hidden="true"></span><span>SKYSTRIDE<small>ADVENTURES</small></span></a><nav aria-label="Main navigation">${screen === 'home' ? '' : button('menu', 'Main menu', true)}<div class="account">${session ? `${button('account', 'My account', true)}${button('signout', 'Sign out', true)}` : button('signin', 'Sign in', true)}</div></nav></header>
    <div id="account-status" class="message error global-status" role="alert" ${accountStatusError ? '' : 'hidden'}>${escape(accountStatusError)}</div>
    <main><div class="page-heading"><h1 tabindex="-1">${title}</h1></div>${body}</main>
    <footer>${localBackend ? '<span>LOCAL DEVELOPMENT · Separate test accounts and database</span>' : ''}${button('credits', 'Credits', true)}</footer>`;
  if (stage) {
    const template = document.createElement('template'); template.innerHTML = markup;
    const main = stage.parentElement!, nextMain = template.content.querySelector('main')!;
    const nextStage = nextMain.querySelector('#play-stage')!;
    stage.replaceChildren(...nextStage.childNodes);
    replaceAround(main, nextMain, stage, nextStage);
    replaceAround(root, template.content, main, nextMain);
  } else root.innerHTML = markup;
  onNavigate('brand', home); onNavigate('menu', home); onNavigate('signin', () => auth(false)); onNavigate('account', profile); on('signout', signout); onNavigate('credits', credits);
  if (!stage) document.querySelector<HTMLElement>('h1')?.focus({preventScroll:true});
}
function title() {
  screen = 'title'; clearScreen(); root.className = 'screen-title';
  root.innerHTML = `<main class="title-screen"><div id="title-demo" class="title-demo" aria-hidden="true"></div><div class="title-copy"><h1>SKYSTRIDE<span>ADVENTURES</span></h1><button id="enter-menu" class="start-prompt">PRESS ANY KEY <span>or tap to start</span></button></div></main>`;
  const titleSurface = root.querySelector<HTMLElement>('.title-screen')!;
  currentGame = mountGame(document.getElementById('title-demo')!, titleCourse(), () => {}, {demo:true});
  let activationKey: string | undefined;
  const down = (event: KeyboardEvent) => { if(event.repeat)return; event.preventDefault(); event.stopImmediatePropagation(); activationKey = event.code; };
  const up = (event: KeyboardEvent) => { if(event.code!==activationKey)return; event.preventDefault(); event.stopImmediatePropagation(); home(); };
  const pointer = (event: Event) => { event.preventDefault(); event.stopPropagation(); home(); };
  document.addEventListener('keydown', down, true); document.addEventListener('keyup', up, true);
  // This new subtree cannot receive the menu click that opened it. A handler on
  // the persistent root would catch that same bubbling click and reopen home.
  titleSurface.addEventListener('click', pointer, {once:true});
  screenCleanup = () => { document.removeEventListener('keydown', down, true); document.removeEventListener('keyup', up, true); titleSurface.removeEventListener('click', pointer); };
}
function message(text: string, error = false) {
  const el = document.getElementById('message');
  if (el) { el.textContent = text; el.className = error ? 'message error' : 'message'; }
}
function errorText(error: unknown) {
  return error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'The request failed. Please try again.';
}
async function signout() {
  if (!backend || (editorController && !editorController.canLeave()) || (runCanLeave && !runCanLeave())) return;
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
  shell('Main Menu', `<div class="menu-world" aria-hidden="true"><span class="menu-cloud c1"></span><span class="menu-cloud c2"></span><span class="menu-island"><i class="player-icon"></i></span><span class="menu-island small-island"></span></div>
    <div class="main-menu" aria-label="Main menu"><div class="primary-menu">${button('official', '<span class="menu-glyph">▶</span> Play adventure <small>Six official courses</small>')}${button('levels', '<span class="menu-glyph">♧</span> Community courses <small>Discover, rate, and favorite new routes</small>', true)}${button('editor', '<span class="menu-glyph">✦</span> Course Maker <small>Create, test, and publish your own</small>', true)}</div>
    <div class="secondary-menu">${button('progress', 'My progress', true)}${button('awards', 'Achievements', true)}${button('settings', 'Settings', true)}${button('profile', session ? 'Player profile' : 'Create account', true)}${button('show-title', 'Title screen', true)}</div></div>
    <p id="message" class="menu-note" role="status">${session ? `Welcome back, ${escape(session.user.user_metadata?.display_name || 'adventurer')}.` : 'Play as a guest, or sign in to keep your times and achievements.'} ${localBackend ? 'This preview uses a separate local database.' : ''}</p>`);
  on('official', adventure); on('levels', levels); on('settings', settings);
  on('profile', () => session ? profile() : auth(true)); on('editor', editor); on('awards', awards); on('progress', progress); on('show-title', title);
}
function coursePicture(course: Level) {
  const theme = course.layout.theme;
  return `<div class="course-preview ${theme}" aria-hidden="true"><span class="preview-cloud"></span><i></i><i></i><i></i><span class="player-icon"></span><b>⚑</b></div>`;
}
async function adventure() {
  screen = 'adventure';
  shell('Official Courses', `<p id="message" class="message" role="status">${session ? 'Loading your progress…' : 'Guest progress lasts for this visit. Sign in to save your fastest completions.'}</p><div id="official-courses" class="official-courses"></div>`);
  const stamp=revision;
  const completed = session ? new Map<string,number>() : new Map(guestProgress);
  let published = new Map<string,Level>();
  try {
    if(backend) {
      const [catalog, saved] = await Promise.all([backend.levels(),session ? backend.progress(session.user.id) : Promise.resolve([])]);
      if(stamp!==revision)return;
      published = new Map(catalog.map(c=>[c.id,c]));
      if(session){completed.clear();for(const p of saved)if(p.completed&&p.bestMs!==null)completed.set(p.levelId,p.bestMs);}
    }
    message(session ? 'Your completed courses and best times are up to date.' : 'Guest progress lasts for this visit. Sign in to save your best times.');
  } catch(error){ if(stamp!==revision)return; message(`Progress could not be loaded: ${errorText(error)}. You can still play locally.`,true); }
  if(stamp!==revision)return;
  const container=document.getElementById('official-courses')!;
  for(const level of officialCourses){
    const saved=published.get(level.id),best=completed.get(level.id), card=document.createElement('article');card.className='official-card';
    card.innerHTML=`${coursePicture(level)}<div class="course-body"><p class="eyebrow">${String(level.officialOrder).padStart(2,'0')} / ${themeName(level)}</p><h2>${escape(level.title)}</h2>${best===undefined?'':`<span class="course-progress">✓ Fastest completion: ${(best/1000).toFixed(2)} s</span>`}<div class="actions">${button(`official-${level.officialOrder}`,best===undefined?'Play level':'Replay level')}${saved?button(`official-rank-${level.officialOrder}`,'Leaderboard',true,'leaderboard-link'):''}</div></div>`;
    container.append(card); on(`official-${level.officialOrder}`,()=>play(saved??level,!saved));
    on(`official-rank-${level.officialOrder}`,()=>leaderboard(saved!));
  }
}
async function startOfficial(level: Level) {
  const stamp=revision;
  try {
    const published=backend ? (await backend.levels()).find(c=>c.id===level.id) : undefined;
    if(stamp!==revision)return;
    await play(published??level,!published);
  } catch(error) { if(stamp===revision)message(`Could not load the next course: ${errorText(error)}. Open the level list to retry or play locally.`,true); }
}
async function progress() {
  screen='progress'; shell('Every flight counts.',`<p id="message" class="message" role="status">Loading progress…</p><div id="progress-body"></div><div class="actions">${button('continue','Play adventure')}${button('progress-awards','Achievements',true)}${button('refresh-progress','Refresh progress',true)}</div>`);
  on('continue',adventure);on('progress-awards',awards);on('refresh-progress',progress);const stamp=revision;
  try{
    const saved=session&&backend?await backend.progress(session.user.id):[...guestProgress].map(([levelId,bestMs])=>({levelId,bestMs,completed:true}));
    if(stamp!==revision)return;
    const done=new Map(saved.filter(r=>r.completed).map(r=>[r.levelId,r.bestMs]));
    const officialIds=new Set(officialCourses.map(c=>c.id));
    const community=saved.filter(r=>r.completed&&r.bestMs!==null&&!officialIds.has(r.levelId));
    const names=session&&backend&&community.length?new Map((await backend.levels()).map(c=>[c.id,c.title])):guestCourseTitles;
    if(stamp!==revision)return;
    const fastest=(ms:number|null|undefined)=>ms==null?'Not completed':`Fastest completion: ${(ms/1000).toFixed(2)} s`;
    document.getElementById('progress-body')!.innerHTML=`<p class="progress-total"><strong>${officialCourses.filter(c=>done.has(c.id)).length}</strong> / 6 courses complete</p><ol class="progress-list">${officialCourses.map(c=>`<li><span>${escape(c.title)}<small>${themeName(c)}</small></span><b>${fastest(done.get(c.id))}</b></li>`).join('')}</ol>${community.length?`<h2>Community Courses</h2><ul class="progress-list">${community.map(c=>`<li><span>${escape(names.get(c.levelId)??'Community course')}</span><b>${fastest(c.bestMs)}</b></li>`).join('')}</ul>`:''}`;
    message(session?'Best times are saved to your account.':"Guest progress is kept for this visit only. Sign in to retain future runs.");
  }catch(error){if(stamp===revision)message(errorText(error),true);}
}
function credits() {
  screen='credits';shell('Made for the climb.',`<section class="credits-panel"><h2>Game and art</h2><p>SkyStride Adventures is a software engineering class project. The gameplay, player, and first four course layouts are adapted from <a href="https://github.com/nunoamorim99/AstroHop" target="_blank" rel="noreferrer">Astro Hop by Nuno Amorim</a> (MIT).</p><p>Pixel Platformer sprites by <a href="https://kenney.nl/assets/pixel-platformer" target="_blank" rel="noreferrer">Kenney</a> (CC0). The sky courses draw level-design inspiration from World 7-6 of New Super Mario Bros. for Nintendo DS. Nintendo artwork is not included.</p><p>Built with Phaser, TypeScript, Vite, and Supabase. AI hints and editor feedback are reserved for a later phase.</p></section>`);
}
function auth(register: boolean) {
  screen = 'auth';
  shell(register ? 'Start your adventure.' : 'Welcome back.', `<div class="form-layout"><form id="authform"><h2>${register ? 'Create account' : 'Sign in'}</h2>
    ${register ? '<label>Display name<input name="displayName" required minlength="2" maxlength="24" autocomplete="nickname" pattern="[A-Za-z0-9 _-]{2,24}"></label>' : ''}
    <label>Email<input name="email" type="email" required maxlength="254" autocomplete="email"></label>
    <label>Password<input name="password" type="password" required minlength="${register ? 8 : 1}" maxlength="128" autocomplete="${register ? 'new-password' : 'current-password'}" aria-describedby="password-help"></label>
    <p id="password-help" class="small">${register ? PASSWORD_REQUIREMENTS : localBackend ? 'Local preview accounts are separate from your public game account. Use a new test password.' : 'Enter your registered email and password.'}</p>
    <button type="submit" ${backend ? '' : 'disabled'}>${register ? 'Create account' : 'Sign in'}</button><p id="message" role="status" class="message">${localBackend ? 'Local test authentication: no confirmation emails are sent.' : backend ? '' : 'Online accounts are unavailable until Supabase is configured.'}</p></form>
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
    document.getElementById('profilebody')!.innerHTML = `<form id="profileform"><label>Email<input type="email" value="${escape(session?.user.email ?? '')}" readonly autocomplete="email"></label><label>Display name<input name="name" value="${escape(p.display_name)}" required minlength="2" maxlength="24" pattern="[A-Za-z0-9 _-]{2,24}"></label><p class="small">Saved to your account in the database.</p><button>Save display name</button></form>`;
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
  shell('Community Courses', `<p class="lead">A new route, a personal best, or an old favorite.</p>
    <div class="browse-controls"><label>Sort courses<select id="course-order"><option value="title">Title</option><option value="rating">Highest rating</option><option value="favorites">Most favorites</option></select></label>
    <label class="check-label"><input id="favorites-only" type="checkbox" ${session ? '' : 'disabled'}>My Favorites</label>${session ? '' : '<span class="small">Sign in to view your favorites.</span>'}</div>
    <p id="message" role="status" class="message">Loading online courses…</p><div id="courses" class="courses"></div>
    <div class="actions">${button('reload', 'Retry online courses', true)}${button('adventure', 'Play adventure', true)}${button('back', 'Back to menu', true)}</div>`);
  on('back', home); on('reload', levels); on('adventure', adventure);
  const order = document.getElementById('course-order') as HTMLSelectElement;
  const favorites = document.getElementById('favorites-only') as HTMLInputElement;
  order.value = browseOrder; favorites.checked = favoritesOnly;
  const stamp = revision;
  if (!backend) { message('Community courses need an online connection. The official adventure is available locally.', true); return; }
  try {
    const courses = await backend.catalog(session?.user.id); if (stamp !== revision) return;
    function render() {
      const shown = orderCourses(favoritesOnly ? courses : courses.filter(c=>!c.officialOrder), browseOrder, favoritesOnly), container = document.getElementById('courses')!;
      container.replaceChildren();
      message(shown.length ? `${shown.length} published course${shown.length === 1 ? '' : 's'} loaded from the database.` : favoritesOnly ? 'No favorites yet. Play a course, then add it to your favorites.' : 'No published courses yet.');
      for (const [i, course] of shown.entries()) {
        const card = document.createElement('article'); card.className = 'course';
        card.innerHTML = `${coursePicture(course)}<div class="course-body"><span class="badge">${escape(course.difficulty)}</span><h2>${escape(course.title)}</h2><p class="course-stats">${stats(course)}${course.isFavorite ? ' · Your favorite' : ''}</p><div class="actions">${button(`course-${i}`, 'Play level')}${button(`details-${i}`, 'Course details', true)}${button(`ranking-${i}`, 'Leaderboard', true,'leaderboard-link')}</div></div>`;
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
  shell(escape(level.title), `<span class="badge">${escape(level.difficulty)}</span><p id="course-stats" class="course-stats"></p>
    <div class="actions">${button('play-course', 'Play level')}${button('leaderboard', 'Leaderboard', true,'leaderboard-link')}</div>
    <section class="community-panel" aria-label="Rating and favorites"><div id="interactions"></div></section><p id="message" class="message" role="status">Loading course details…</p>
    <div class="actions">${button('refresh-details', 'Refresh details', true)}${button('back', 'Back to courses', true)}</div>`);
  on('play-course', () => play(level, false)); on('leaderboard', () => leaderboard(level)); on('back', level.officialOrder ? adventure : levels); on('refresh-details', () => courseDetails(level));
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
  screen = 'editor'; shell('Course Maker', `<div id="editor"></div>${button('back', 'Back to menu', true)}`);
  onNavigate('back', home);
  editorController = mountEditor(document.getElementById('editor')!, backend, session.user.id);
}
function settings() {
  screen = 'settings';
  shell('Set your pace.', `<form id="settings-form"><h2>Motion preferences</h2><label class="check-label"><input id="reduced-motion" type="checkbox" ${prefersReducedMotion() ? 'checked' : ''}>Reduce decorative motion</label><p class="small">Reduces the title demonstration, decorative effects, menu transitions, and scrolling on this device. Course controls, physics, and timing stay the same.</p><div class="actions"><button>Save settings</button><button id="reset-settings" type="button" class="secondary">Restore defaults</button></div></form><p id="message" class="message" role="status">${motionStorageError ? escape(motionStorageError) : 'Preferences are stored on this device.'}</p>${button('back', 'Back to menu', true)}`);
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
    document.getElementById('awards')!.innerHTML = list.map(a => `<article class="course course-body"><span class="badge">${a.earned_at ? 'EARNED' : 'LOCKED'}</span><h2>${escape(a.name)}</h2><p>${escape(a.description || (a.rule === 'first_created_level' ? 'Save your first private draft.' : a.rule === 'timed_course' ? `Complete ${officialCourses[0].title} in under ${(a.threshold_ms??30000)/1000} seconds.` : 'Complete a published course while signed in.'))}</p>${a.earned_at?`<p>Earned ${escape(new Date(a.earned_at).toLocaleDateString())}</p>`:''}</article>`).join('');
    message(`${list.filter(a => a.earned_at).length} of ${list.length} achievements earned.`);
  } catch (error) { if (stamp === revision) message(errorText(error), true); }
}
async function leaderboard(level: Level, mode: 'time'|'score' = 'time') {
  if (!session || !backend) { auth(false); return; }
  screen = 'leaderboard';
  shell('Course leaderboard.', `<p class="lead">${escape(level.title)}</p><label class="leaderboard-filter">Rank players by<select id="leaderboard-mode"><option value="time" ${mode==='time'?'selected':''}>Fastest completion</option><option value="score" ${mode==='score'?'selected':''}>Highest score</option></select></label><p class="small">Best completed run per player · Top 50</p><p id="message" class="message" role="status">Loading results…</p><div id="ranking"></div><div class="actions">${button('refresh-ranking', 'Refresh leaderboard', true)}${button('back', 'Back to courses', true)}</div>`);
  on('back', level.officialOrder ? adventure : levels); on('refresh-ranking', () => leaderboard(level,mode));
  document.getElementById('leaderboard-mode')!.onchange=event=>void leaderboard(level,(event.target as HTMLSelectElement).value as 'time'|'score');
  const stamp = revision;
  try {
    const rows = await backend.leaderboard(level.id,mode); if (stamp !== revision) return;
    document.getElementById('ranking')!.innerHTML = rows.length ? `<table class="ranking"><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">${mode==='time'?'Fastest completion':'Highest score'}</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.rank}</td><td>${escape(row.display_name)}</td><td>${mode==='time'?`${(row.elapsed_ms / 1000).toFixed(2)} s`:String(row.score??0)}</td></tr>`).join('')}</tbody></table>` : '';
    message(rows.length ? `Saved results loaded. Equal ${mode==='time'?'times':'scores'} share a rank.` : `No ${mode==='time'?'completed runs':'completed runs with saved scores'} yet. Finish this course while signed in to record ${mode==='time'?'a time':'a score'}.`);
  } catch (error) { if (stamp === revision) message(errorText(error), true); }
}
async function play(level: Level, local: boolean) {
  screen = 'play'; const save = !local && !!session && !!backend;
  shell(escape(level.title), `<div class="play-topline"><span class="badge">${level.officialOrder ? `LEVEL ${level.officialOrder} / 6` : 'COMMUNITY'} · ${themeName(level)}</span><div class="play-options">${button('sound','Sound on',true)}${button('fullscreen','Fullscreen',true)}${button('pause','Pause',true)}</div></div>
    <div id="play-stage" class="play-stage"><div class="play-frame"><div id="game" class="game"></div><div id="run-overlay" class="run-overlay" hidden role="dialog" aria-labelledby="overlay-title"><div class="overlay-panel"><p id="overlay-kicker" class="eyebrow"></p><h2 id="overlay-title"></h2><p id="overlay-copy"></p><div id="overlay-actions" class="overlay-actions"></div></div></div></div>
    <div id="run-hud" class="run-hud" aria-label="Run statistics"><span>COINS <b id="hud-coins">0 / ${level.layout.items.length+level.layout.blocks.filter(b=>b.content==='coin').length}</b></span><span>TIME ELAPSED <b id="hud-elapsed">0.0 s</b><small>Fastest completion<br><span id="hud-fastest">${save?'Loading…':'Not completed'}</span></small></span><span>POWER <b id="hud-power">SMALL</b></span><span>TIME LIMIT <b id="hud-time">${level.layout.timeLimit} s</b><small>remaining of ${level.layout.timeLimit} s</small></span><span>SCORE <b id="hud-score">0</b></span></div>
    <div class="fullscreen-controls">${button('fullscreen-pause','Pause',true)}${button('exit-fullscreen','Exit fullscreen',true)}</div></div>
    <div class="touch-controls" aria-label="Touch game controls"><div><button data-control="left" aria-label="Move left">◀</button><button data-control="right" aria-label="Move right">▶</button></div><div><button data-control="fire" aria-label="Throw fireball">FIRE</button><button data-control="jump" aria-label="Jump">JUMP</button></div></div>
    <p id="message" class="message" role="status">${save ? 'Starting your account attempt…' : 'Guest practice · This run is not saved to an account.'}</p>
    <div class="actions run-actions">${button('retry','Restart course',true)}<button id="save-result" hidden>Retry saving result</button>${local?'':button('details','Course details',true)}${button('back','Level list',true)}${button('run-menu','Main menu',true)}</div>
    <details class="controls-help"><summary>Controls & assistance</summary><p>← / → or A / D: move · Space / ↑ / W: jump · X / J: throw fireball · Esc: pause. Hold jump for more height.</p><div class="ai-placeholder"><button disabled aria-describedby="ai-hint-status">AI Hint</button><span id="ai-hint-status" class="small">Not available yet.</span></div></details>`);
  let paused=false, attemptId:string|undefined, result:RunResult|undefined, saving=false,resultSaved=false;
  const stamp=revision,uid=session?.user.id, list=level.officialOrder?adventure:levels;
  let fastestMs=save?null:guestProgress.get(level.id)??null, fastestKnown=!save;
  const showFastest=()=>{if(stamp===revision)document.getElementById('hud-fastest')!.textContent=fastestKnown?(fastestMs===null?'Not completed':`${(fastestMs/1000).toFixed(2)} s`):'Unavailable';};
  const loadFastest=async()=>{try{const saved=(await backend!.progress(uid!)).find(p=>p.levelId===level.id)?.bestMs??null;if(stamp!==revision)return;fastestKnown=true;fastestMs=resultSaved&&result?Math.min(saved??Infinity,result.elapsedMs):saved;showFastest();}catch{if(stamp===revision&&!fastestKnown)showFastest();}};
  if(save)void loadFastest();else showFastest();
  const resultText=()=>`${(result!.elapsedMs/1000).toFixed(2)} seconds · ${result!.score} points · ${result!.deaths} deaths · ${result!.collected} / ${result!.totalItems} coins`;
  runCanLeave=()=>!save||!result||resultSaved||window.confirm('This result has not been confirmed saved. Leave this run?');
  const leave=(fn:()=>void|Promise<void>)=>navigate(fn);
  let soundMuted=false;try{soundMuted=localStorage.getItem('skystride.audio-muted.v1')==='1';}catch{}
  const soundControl=document.getElementById('sound') as HTMLButtonElement;soundControl.textContent=soundMuted?'Sound off':'Sound on';soundControl.setAttribute('aria-label',soundMuted?'Unmute audio':'Mute audio');
  on('sound',()=>{if(currentGame&&'setMuted' in currentGame.scene){soundMuted=!soundMuted;currentGame.scene.setMuted(soundMuted);soundControl.textContent=soundMuted?'Sound off':'Sound on';soundControl.setAttribute('aria-label',soundMuted?'Unmute audio':'Mute audio');try{if(localStorage.getItem('skystride.audio-muted.v1')!==(soundMuted?'1':'0'))message('Sound changed for this run, but the preference could not be saved.');}catch{message('Sound changed for this run, but browser storage is unavailable.');}}});
  const stage=document.getElementById('play-stage')!;
  const toggleFullscreen=async()=>{try{if(document.fullscreenElement===stage)await document.exitFullscreen();else if(stage.requestFullscreen)await stage.requestFullscreen();else message('Fullscreen is not available in this browser.');}catch{if(stamp===revision)message('Fullscreen could not be opened. You can keep playing in this window.');}};
  on('fullscreen',toggleFullscreen);on('exit-fullscreen',toggleFullscreen);
  const togglePause=()=>currentGame?.scene.setPaused(!paused);
  on('pause',togglePause);on('fullscreen-pause',togglePause);on('retry',()=>leave(()=>play(level,local)));on('back',()=>leave(list));on('run-menu',()=>leave(home));on('details',()=>leave(()=>courseDetails(level)));
  const overlay=(state:RunState)=>{
    if(stamp!==revision)return; paused=state.status==='paused';
    for(const id of ['pause','fullscreen-pause']){const pause=document.getElementById(id) as HTMLButtonElement;
      pause.textContent=paused?'Resume':'Pause';pause.disabled=state.status==='complete'||state.status==='dead';}
    const panel=document.getElementById('run-overlay')!;panel.hidden=state.status==='playing';
    if(panel.hidden)return;
    const complete=state.status==='complete', dead=state.status==='dead';
    document.getElementById('overlay-kicker')!.textContent=complete?level.officialOrder===6?'ALL SIX HORIZONS':'FLAG REACHED':dead?'ANOTHER CHANCE':'TAKE A BREATHER';
    document.getElementById('overlay-title')!.textContent=complete?level.officialOrder===6?'Adventure complete!':'Course complete!':dead?'Back into the sky.':'Paused';
    document.getElementById('overlay-copy')!.textContent=complete?(result?resultText():'A little courage goes a long way.'):dead?(state.reason||'Take another run from your checkpoint or restart the course.'):'Your run will be here when you’re ready.';
    const next=nextOfficialCourse(level);
    document.getElementById('overlay-actions')!.innerHTML=`${complete&&next?button('next-level','Next level'):''}${!complete&&!dead?button('resume-run','Resume'):''}${dead?button('respawn',state.hasCheckpoint?'Resume at checkpoint':'Retry from start'):''}${button('replay',complete?'Replay':'Restart course',true)}${button('overlay-levels','Level list',true)}${button('overlay-menu','Main menu',true)}`;
    on('resume-run',()=>currentGame?.scene.setPaused(false));on('respawn',()=>currentGame?.scene.resumeAfterDeath());on('replay',()=>leave(()=>play(level,local)));on('overlay-levels',()=>leave(list));on('overlay-menu',()=>leave(home));on('next-level',()=>leave(()=>startOfficial(next!)));
    document.querySelector<HTMLButtonElement>('#overlay-actions button')?.focus({preventScroll:true});
  };
  const hud=(state:RunHud)=>{
    if(stamp!==revision)return;
    for(const [id,text] of Object.entries({'hud-coins':`${state.collected} / ${state.totalItems}`,'hud-time':`${Math.ceil(state.timeLeft)} s`,'hud-elapsed':`${(state.elapsedMs/1000).toFixed(1)} s`,'hud-power':state.star?'STAR':state.power,'hud-score':String(state.score)}))document.getElementById(id)!.textContent=text;
  };
  const persist=async()=>{
    if(!attemptId||!result||stamp!==revision||saving)return;
    const retry=document.getElementById('save-result') as HTMLButtonElement;
    saving=true;retry.disabled=true;message('Course complete. Saving result…');
    try{await backend!.completeAttempt(attemptId,result);if(stamp!==revision)return;resultSaved=true;retry.hidden=true;if(fastestKnown){fastestMs=Math.min(fastestMs??Infinity,result.elapsedMs);showFastest();}else void loadFastest();message(`Result saved! ${resultText()}. Your progress, achievements, and leaderboard are updated.`);}
    catch(error){if(stamp===revision){retry.hidden=false;message(`Result not saved: ${errorText(error)}. Retry saving before leaving this screen.`,true);}}
    finally{saving=false;if(stamp===revision)retry.disabled=false;}
  };
  on('save-result',persist);
  const escapeKey=(event:KeyboardEvent)=>{if(event.code==='Escape'&&!event.repeat&&!(event.target instanceof HTMLInputElement||event.target instanceof HTMLTextAreaElement||event.target instanceof HTMLSelectElement)){event.preventDefault();currentGame?.scene.setPaused(!paused);}};
  let fullscreenFrame=0;
  const fullscreenChanged=()=>{const control=document.getElementById('fullscreen');if(control)control.textContent=document.fullscreenElement===stage?'Exit fullscreen':'Fullscreen';
    cancelAnimationFrame(fullscreenFrame);fullscreenFrame=requestAnimationFrame(()=>{if(stamp!==revision)return;currentGame?.game.scale.refresh();if(document.getElementById('run-overlay')?.hidden)document.getElementById('game')?.focus({preventScroll:true});else stage.querySelector<HTMLButtonElement>('#overlay-actions button')?.focus({preventScroll:true});});};
  document.addEventListener('keydown',escapeKey);document.addEventListener('fullscreenchange',fullscreenChanged);fullscreenChanged();screenCleanup=()=>{cancelAnimationFrame(fullscreenFrame);document.removeEventListener('keydown',escapeKey);document.removeEventListener('fullscreenchange',fullscreenChanged);};
  try{
    if(save){attemptId=await backend!.startAttempt(uid!,level.id);if(stamp!==revision)return;message('Reach the flag. Your completed result will be saved.');}
    currentGame=mountGame(document.getElementById('game')!,level,completed=>{
      if(stamp!==revision)return;result=completed;
      if(!save){guestProgress.set(level.id,Math.min(guestProgress.get(level.id)??Infinity,completed.elapsedMs));guestCourseTitles.set(level.id,level.title);fastestMs=guestProgress.get(level.id)!;fastestKnown=true;showFastest();}
      overlay({status:'complete',hasCheckpoint:false});
      if(save)void persist();else message(`Course complete! ${resultText()}. Guest result is not saved to an account.`);
    },{onState:overlay,onHud:hud});
    for(const control of document.querySelectorAll<HTMLButtonElement>('[data-control]')){
      const action=control.dataset.control as ControlAction;
      control.onpointerdown=event=>{event.preventDefault();control.setPointerCapture(event.pointerId);currentGame?.scene.setControl(action,true);};
      const release=()=>currentGame?.scene.setControl(action,false);
      control.onpointerup=release;control.onpointercancel=release;control.onlostpointercapture=release;
    }
  }catch(error){if(stamp===revision)message(`Could not start the course: ${errorText(error)}. Restart to retry.`,true);}
}
async function start() {
  title(); if (!backend) return;
  backend.client.auth.onAuthStateChange((_event, next) => {
    if (_event === 'SIGNED_IN') accountStatusError = '';
    const previous = session?.user.id; session = next;
    if (_event !== 'INITIAL_SESSION' && previous !== next?.user.id) setTimeout(() => {
      favoritesOnly = false;
      if (screen === 'auth' && next) void profile(); else home();
    }, 0);
  });
  const { data, error } = await backend.client.auth.getSession();
  if (error) message(`Session could not be restored: ${error.message}`, true);
  else { session = data.session; if (session && screen === 'home') home(); }
}
void start();
