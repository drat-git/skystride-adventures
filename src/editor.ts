import { type Backend, type OwnedLevel } from './backend';
import { COLS, ROWS, practiceLevel, validateLayout, type Layout, type Level } from './level';
import { mountGame, type RunResult } from './game';
import { prefersReducedMotion } from './settings';

export type EditorTool = 'platform' | 'hazard' | 'checkpoint' | 'item' | 'start' | 'finish' | 'erase';

export function paintCell(layout: Layout, x: number, y: number, tool: EditorTool): Layout {
  const next = structuredClone(layout);
  const same = (p: { x: number; y: number }) => p.x === x && p.y === y;
  next.platforms = next.platforms.flatMap(p => Array.from({ length: p.width }, (_, i) => ({ x: p.x + i, y: p.y, width: 1 }))).filter(p => !same(p));
  next.hazards = next.hazards.filter(p => !same(p));
  next.checkpoints = next.checkpoints.filter(p => !same(p));
  next.items = next.items.filter(p => !same(p));
  if (tool === 'platform') next.platforms.push({ x, y, width: 1 });
  if (tool === 'hazard') next.hazards.push({ x, y });
  if (tool === 'checkpoint') next.checkpoints.push({ x, y });
  if (tool === 'item') next.items.push({ x, y });
  if (tool === 'start') next.start = { x, y };
  if (tool === 'finish') next.finish = { x, y };
  // Keep adjacent painted tiles in runs, rather than spending one segment per tile.
  const tiles = next.platforms.sort((a, b) => a.y - b.y || a.x - b.x);
  next.platforms = [];
  for (const tile of tiles) {
    const previous = next.platforms.at(-1);
    if (previous && previous.y === tile.y && previous.x + previous.width >= tile.x) {
      previous.width = Math.max(previous.width, tile.x + 1 - previous.x);
    } else next.platforms.push({ ...tile });
  }
  return next;
}

export interface EditorController {
  destroy(): void;
  isDirty(): boolean;
  canLeave(): boolean;
}

const errorText = (error: unknown) => error instanceof Error ? error.message :
  typeof error === 'object' && error && 'message' in error ? String(error.message) : 'The request failed. Please try again.';

/** Private drafts and immutable published courses share one creator workspace. */
export function mountEditor(host: HTMLElement, api: Backend, userId: string): EditorController {
  let active = true, busy = false, beforeUnloadAttached = false, generation = 0;
  let id: string = crypto.randomUUID();
  let current: OwnedLevel | undefined;
  let layout = structuredClone(practiceLevel.layout), courses: OwnedLevel[] = [];
  let baseline = '', paused = false, finished = false, loading = true;
  let previewIsSavedTest = false, approvalInvalidated = false, saveAttempted = false, listRequest = 0;
  let preview: ReturnType<typeof mountGame> | undefined;
  let pendingCompletion: { id: string; result: RunResult; generation: number } | undefined;

  host.innerHTML = `<div class="editor-toolbar">
    <label>Your courses<select id="draft-list"><option value="">New draft</option></select></label>
    <button id="new-draft" class="secondary">New draft</button>
    <button id="refresh-drafts" class="secondary">Refresh course list</button>
  </div>
  <p id="draft-status" class="small"></p>
  <form id="draft-form" class="draft-form">
    <div class="draft-fields"><label>Title<input id="draft-title" required maxlength="60" value="My first course"></label>
    <label>Difficulty<select id="draft-difficulty"><option>easy</option><option>medium</option><option>hard</option></select></label></div>
    <label>Description<input id="draft-description" maxlength="280"></label>
    <label>Tile tool<select id="tile-tool"><option value="platform">Platform</option><option value="hazard">Hazard</option><option value="checkpoint">Checkpoint</option><option value="item">Item</option><option value="start">Start</option><option value="finish">Finish</option><option value="erase">Erase</option></select></label>
    <p class="small">Choose a tool, then select a tile. S = start, F = finish, C = checkpoint, ◆ = item, ▲ = hazard. Start, finish and checkpoints need a platform below them. Items are optional and stay collected after death.</p>
    <div id="editor-grid" class="editor-grid" role="group" aria-label="Level grid"></div>
    <div class="actions">
      <button id="save-draft" type="submit">Save draft</button>
      <button id="preview-draft" type="button" class="secondary">Preview draft</button>
      <button id="test-draft" type="button" class="secondary">Test saved version</button>
      <button id="publish-draft" type="button">Publish course</button>
      <button id="copy-draft" type="button" class="secondary">Copy to new draft</button>
      <button id="reload-draft" type="button" class="secondary" hidden>Reload saved version</button>
      <button id="editor-ai" type="button" class="secondary" disabled aria-describedby="editor-ai-status">AI Editor Feedback</button>
    </div>
    <p id="editor-ai-status" class="small">AI editor feedback is not available yet. Editing and publishing work without it.</p>
    <p id="draft-message" class="message" role="status">Loading your courses…</p>
  </form>
  <div class="actions" id="preview-controls" hidden>
    <button id="pause-preview" class="secondary">Pause preview</button>
    <button id="stop-preview" class="secondary">Stop preview</button>
    <button id="retry-playtest" hidden>Retry saving playtest</button>
  </div>
  <div id="draft-preview" class="game" hidden></div>`;

  const el = <T extends HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const note = (text: string, error = false) => {
    if (!active) return;
    el('#draft-message').textContent = text;
    el('#draft-message').className = error ? 'message error' : 'message';
  };
  const values = (): Omit<Level, 'id'> => ({
    title: el<HTMLInputElement>('#draft-title').value.trim(),
    description: el<HTMLInputElement>('#draft-description').value.trim(),
    difficulty: el<HTMLSelectElement>('#draft-difficulty').value as Level['difficulty'],
    layout: structuredClone(layout),
  });
  const snapshot = () => JSON.stringify(values());
  const isDirty = () => active && snapshot() !== baseline;
  const beforeUnload = (event: BeforeUnloadEvent) => { if (isDirty()) { event.preventDefault(); event.returnValue = ''; } };

  function controls() {
    if (!active) return;
    const dirty = isDirty(), published = !!current?.published;
    for (const control of host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button')) control.disabled = busy;
    for (const control of host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('#draft-title,#draft-description,#draft-difficulty,#tile-tool,.tile')) control.disabled = busy || published;
    el<HTMLSelectElement>('#draft-list').disabled = busy || loading;
    el<HTMLButtonElement>('#save-draft').disabled = busy || published;
    el<HTMLButtonElement>('#preview-draft').disabled = busy;
    el<HTMLButtonElement>('#test-draft').disabled = busy || published || !current || dirty;
    el<HTMLButtonElement>('#publish-draft').disabled = busy || published || !current?.canPublish || dirty || approvalInvalidated;
    el<HTMLButtonElement>('#copy-draft').disabled = busy;
    el<HTMLButtonElement>('#reload-draft').disabled = busy || (!current && !saveAttempted);
    el('#reload-draft').hidden = !current && !saveAttempted;
    el<HTMLButtonElement>('#editor-ai').disabled = true;
    el<HTMLButtonElement>('#pause-preview').disabled = busy || !preview || finished;
    el<HTMLButtonElement>('#pause-preview').textContent = paused ? 'Resume preview' : 'Pause preview';
    el('#retry-playtest').hidden = !pendingCompletion;
    el<HTMLButtonElement>('#retry-playtest').disabled = busy;
    el('#draft-status').textContent = published ? `Published course · revision ${current!.revision}. This version is read-only. Copy it to a new private draft to make changes.` :
      current ? `Private draft · revision ${current.revision}${dirty ? ' · Unsaved changes: save and retest before publishing.' : current.canPublish && !approvalInvalidated ? ' · Saved playtest passed. Ready to publish.' : ' · Save, test the saved version, then publish.'}` :
      'New private draft. Save it before starting a publication playtest.';
    if (dirty && !beforeUnloadAttached) { window.addEventListener('beforeunload', beforeUnload); beforeUnloadAttached = true; }
    if (!dirty && beforeUnloadAttached) { window.removeEventListener('beforeunload', beforeUnload); beforeUnloadAttached = false; }
  }

  function canLeave() {
    if (busy) { note('Please wait for the current request to finish before leaving.'); return false; }
    return !isDirty() || window.confirm('Discard your unsaved draft changes?');
  }

  function stop() {
    generation++;
    preview?.destroy(); preview = undefined; pendingCompletion = undefined;
    paused = false; finished = false; previewIsSavedTest = false;
    if (active) { el('#draft-preview').hidden = true; el('#preview-controls').hidden = true; controls(); }
  }

  function changed() {
    if (busy || current?.published) return;
    approvalInvalidated = true;
    if (previewIsSavedTest) stop();
    else preview?.scene.setPaused(true);
    controls();
    note((isDirty() ? 'Unsaved changes. Save and test the saved version before publishing.' : 'Your fields match the saved version. Test it again before publishing.') +
      (preview ? ' The local preview uses its earlier layout. Choose Preview draft to refresh it.' : ''));
  }

  function grid() {
    const target = el('#editor-grid'); target.replaceChildren();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      let kind = 'empty', label = '';
      if (layout.platforms.some(p => p.y === y && x >= p.x && x < p.x + p.width)) kind = 'platform';
      if (layout.hazards.some(p => p.x === x && p.y === y)) { kind = 'hazard'; label = '▲'; }
      if (layout.checkpoints.some(p => p.x === x && p.y === y)) { kind = 'checkpoint'; label = 'C'; }
      if (layout.items.some(p => p.x === x && p.y === y)) { kind = 'item'; label = '◆'; }
      if (layout.start.x === x && layout.start.y === y) { kind = 'start'; label = 'S'; }
      if (layout.finish.x === x && layout.finish.y === y) { kind = 'finish'; label = 'F'; }
      const cell = document.createElement('button'); cell.type = 'button'; cell.className = `tile ${kind}`; cell.textContent = label;
      cell.setAttribute('aria-label', `Column ${x + 1}, row ${y + 1}: ${kind}`);
      cell.onclick = () => {
        if (busy || current?.published) return;
        layout = paintCell(layout, x, y, el<HTMLSelectElement>('#tile-tool').value as EditorTool);
        grid(); changed();
      };
      target.append(cell);
    }
  }

  function options() {
    if (!active) return;
    const select = el<HTMLSelectElement>('#draft-list');
    select.replaceChildren(new Option('New draft', ''));
    for (const course of courses) select.add(new Option(`${course.title}${course.published ? ' · Published' : ' · Private'}`, course.id));
    select.value = current?.id ?? '';
  }

  function remember(course: OwnedLevel) {
    listRequest++;
    loading = false;
    courses = [course, ...courses.filter(other => other.id !== course.id)];
    options();
  }

  function load(course?: OwnedLevel, copy?: Omit<Level, 'id'>) {
    stop(); current = course; id = course?.id ?? crypto.randomUUID();
    approvalInvalidated = false; saveAttempted = false;
    const data = course ?? copy;
    layout = structuredClone(data?.layout ?? practiceLevel.layout);
    el<HTMLInputElement>('#draft-title').value = data?.title ?? 'My first course';
    el<HTMLInputElement>('#draft-description').value = data?.description ?? '';
    el<HTMLSelectElement>('#draft-difficulty').value = data?.difficulty ?? 'easy';
    baseline = copy ? '' : snapshot();
    grid(); options(); controls();
    note(copy ? 'Copied into a new private draft. Save and complete a new playtest to publish it.' : course ? 'Course loaded from the database.' : 'New draft. No changes have been saved.');
  }

  async function refreshList() {
    if (busy) return;
    const request = ++listRequest;
    loading = true; controls();
    try {
      const loaded = await api.ownedLevels(userId); if (!active || request !== listRequest) return;
      courses = loaded; options();
      if (!isDirty() && !preview) note('Choose a private draft or a published course, or create a new draft.');
    } catch (error) { if (request === listRequest) note(`Could not load your courses: ${errorText(error)}. Refresh the course list to retry.`, true); }
    finally { if (request === listRequest) { loading = false; controls(); } }
  }

  async function reloadSelected(selectedId: string) {
    if (!canLeave()) { options(); return; }
    stop(); busy = true; controls(); note('Loading saved course…');
    try {
      const course = await api.getOwnedLevel(userId, selectedId); if (!active) return;
      remember(course); load(course);
    } catch (error) { options(); note(`Could not reload the course: ${errorText(error)}. Your edits are still here.`, true); }
    finally { busy = false; controls(); }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault(); if (busy || current?.published) return;
    const form = el<HTMLFormElement>('#draft-form'); if (!form.reportValidity()) return;
    stop(); busy = true; saveAttempted = true; controls(); note('Saving draft…');
    try {
      const saved = await api.saveDraft(userId, values(), id, current?.revision); if (!active) return;
      const needsRetest = approvalInvalidated;
      remember(saved); load(saved); approvalInvalidated = needsRetest;
      note(`Draft saved. Revision ${saved.revision}. Available after refresh or your next sign-in.`);
    } catch (error) {
      if (!current) baseline = '';
      note(`Draft not saved: ${errorText(error)}. Your edits are still here. Retry saving, reload the saved version, or copy your edits to a new draft.`, true);
    } finally { busy = false; controls(); }
  }

  function launch(level: Level, testId?: string) {
    const stamp = generation;
    previewIsSavedTest = !!testId;
    el('#draft-preview').hidden = false; el('#preview-controls').hidden = false;
    preview = mountGame(el('#draft-preview'), level, result => {
      if (!active || stamp !== generation) return;
      finished = true; controls();
      if (testId) {
        pendingCompletion = { id: testId, result, generation: stamp };
        void savePlaytest();
      } else note(`Preview complete: ${(result.elapsedMs / 1000).toFixed(2)} seconds · ${result.deaths} deaths · ${result.collected}/${result.totalItems} items. This preview does not approve publication or save a score.`);
    });
    preview.game.events.on('pause-changed', (value: boolean) => {
      if (active && stamp === generation) { paused = value; controls(); }
    });
    controls();
    el('#draft-preview').scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }

  async function savePlaytest() {
    const completion = pendingCompletion;
    if (!completion || busy || !active || completion.generation !== generation) return;
    busy = true; controls(); note('Finish reached. Saving the playtest result…');
    try {
      await api.completeDraftPlaytest(completion.id, completion.result.elapsedMs, completion.result.deaths);
      const saved = await api.getOwnedLevel(userId, id);
      if (!active || completion.generation !== generation) return;
      if (saved.revision !== current?.revision || !saved.canPublish || saved.published) {
        throw new Error('The saved course changed. Reload it and test its current revision before publishing.');
      }
      current = saved; approvalInvalidated = false; remember(saved); pendingCompletion = undefined;
      note(`Saved playtest passed for revision ${saved.revision}. ${completion.result.collected}/${completion.result.totalItems} items collected. You can now publish this version.`);
    } catch (error) {
      note(`Playtest approval not confirmed: ${errorText(error)}. Retry saving the playtest. If the saved course changed, reload it and test the new version.`, true);
    } finally { busy = false; controls(); }
  }

  async function testSaved() {
    if (busy || !current || current.published || isDirty()) return;
    stop(); const stamp = generation; busy = true; controls(); note('Starting a playtest of the saved version…');
    try {
      const test = await api.startDraftPlaytest(id, current.revision);
      if (!active || stamp !== generation) return;
      current = test.level; remember(test.level);
      launch(test.level, test.id);
      note(`Testing saved revision ${test.level.revision}. Reach the finish to qualify for publication. This is separate from leaderboard runs and completion awards.`);
    } catch (error) { note(`Could not start the saved playtest: ${errorText(error)}. Reload if the draft changed elsewhere.`, true); }
    finally { busy = false; controls(); }
  }

  async function publish() {
    if (busy || !current || current.published || isDirty() || !current.canPublish || approvalInvalidated) return;
    stop(); busy = true; controls(); note('Publishing the tested version…');
    try {
      const saved = await api.publishLevel(id, current.revision); if (!active) return;
      remember(saved); load(saved);
      note('Course published. Other players can now discover and play it. To change it, copy it into a new private draft.');
    } catch (error) { note(`Course not published: ${errorText(error)}. Reload the saved version if it changed, then complete a new playtest.`, true); }
    finally { busy = false; controls(); }
  }

  el('#new-draft').onclick = () => { if (canLeave()) load(); };
  el('#refresh-drafts').onclick = () => { void refreshList(); };
  el<HTMLSelectElement>('#draft-list').onchange = () => {
    const selected = el<HTMLSelectElement>('#draft-list').value;
    if (selected) void reloadSelected(selected);
    else if (canLeave()) load();
    else options();
  };
  el('#reload-draft').onclick = () => { if (current || saveAttempted) void reloadSelected(id); };
  el('#copy-draft').onclick = () => {
    if (busy) return;
    if (isDirty() && !window.confirm('Keep these unsaved edits in a new private draft? The original saved course will stay unchanged.')) return;
    const copy = values(); copy.title = `${copy.title.slice(0, 53)} (copy)`;
    load(undefined, copy);
  };
  el<HTMLFormElement>('#draft-form').onsubmit = event => { void save(event); };
  for (const field of ['#draft-title', '#draft-description', '#draft-difficulty']) el(field).addEventListener('input', changed);
  el('#preview-draft').onclick = () => {
    if (busy) return;
    try {
      validateLayout(layout); stop(); launch({ ...values(), id });
      note('Previewing current edits. This local preview does not approve publication. Use Test saved version after saving.');
    } catch (error) { note(errorText(error), true); }
  };
  el('#test-draft').onclick = () => { void testSaved(); };
  el('#publish-draft').onclick = () => { void publish(); };
  el('#pause-preview').onclick = () => preview?.scene.setPaused(!paused);
  el('#stop-preview').onclick = () => { stop(); note('Preview stopped. Your draft is unchanged.'); };
  el('#retry-playtest').onclick = () => { void savePlaytest(); };

  baseline = snapshot(); grid(); controls(); void refreshList();
  return {
    isDirty,
    canLeave,
    destroy() {
      active = false; generation++; preview?.destroy(); preview = undefined;
      window.removeEventListener('beforeunload', beforeUnload);
    },
  };
}
