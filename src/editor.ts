import { type Backend, type OwnedLevel } from './backend';
import { validateLayout, type Layout, type Level, type CourseLayout } from './level';
import type { LayoutV2 } from './course-format';
import { EDITOR_TOOLS, DEFAULT_PROPERTIES, newEditorLayout, convertLegacyLayout, placeComponent, selectionsAt, replaceSelection, resizeCourse, describeCell, type Selection, type V2Tool, type ToolProperties } from './editor-tools';
import { mountGame, type RunResult, type RunState, type RunHud, type ControlAction } from './game';
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
  let layout: CourseLayout = newEditorLayout();
  let courses: OwnedLevel[] = [];
  let cursor = { x: 2, y: 22 }, cellSize = 32, renderFrame = 0;
  let selection: Selection | undefined, previewDead = false, previewHasCheckpoint = false;
  let baseline = '', paused = false, finished = false, loading = true;
  let previewIsSavedTest = false, approvalInvalidated = false, saveAttempted = false, listRequest = 0;
  let preview: ReturnType<typeof mountGame> | undefined;
  let pendingCompletion: { id: string; result: RunResult; generation: number } | undefined;

  const numeric = (key: string, label: string, value: number, min: number, max: number, step = '1') => `<label>${label}<input id="${key}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required></label>`;
  const choice = (key: string, label: string, options: readonly string[]) => `<label>${label}<select id="${key}">${options.map(option => `<option value="${option}">${option}</option>`).join('')}</select></label>`;
  host.innerHTML = `<div class="editor-toolbar">
    <label>Your courses<select id="draft-list"><option value="">New draft</option></select></label>
    <button id="new-draft" class="secondary">New draft</button><button id="refresh-drafts" class="secondary">Refresh course list</button>
  </div><p id="draft-status" class="small"></p>
  <form id="draft-form" class="draft-form" novalidate>
    <details class="editor-metadata" open><summary>Course details</summary><div class="draft-fields">
      <label>Title<input id="draft-title" required maxlength="60" value="My first course"></label>
      <label>Difficulty<select id="draft-difficulty"><option>easy</option><option>medium</option><option>hard</option></select></label>
      <label>Description<input id="draft-description" maxlength="280"></label>
    </div><div class="editor-world-controls">
      ${choice('course-theme', 'World theme', ['overworld', 'cave', 'sky'])}
      ${numeric('course-cols', 'Course width (tiles)', 64, 24, 512)}
      ${numeric('course-time', 'Time limit (seconds)', 300, 30, 900)}
      ${numeric('finish-height', 'Finish flag height (tiles)', 5, 1, 20)}
    </div></details>
    <div class="editor-layout"><aside class="editor-palette">
      <label>Tile tool<select id="tile-tool">${EDITOR_TOOLS.map(group => `<optgroup label="${group.group}">${group.entries.map(([value, name]) => `<option value="${value}">${name}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <label id="cell-components-label" hidden>Components at cursor<select id="cell-components"></select></label>
      <fieldset class="editor-properties"><legend id="property-heading">Component properties</legend>
        <div data-tools="terrain platform moving-platform obstacle hazard">${numeric('prop-width', 'Width (tiles)', 1, 1, 512)}</div>
        <div data-tools="obstacle">${numeric('prop-height', 'Height (tiles)', 3, 1, 25)}${choice('prop-obstacle', 'Obstacle appearance', ['column', 'rock', 'ruin'])}</div>
        <div data-tools="glow">${choice('prop-content', 'Block contents', ['adaptive', 'coin', 'growth', 'fire', 'star', 'life'])}</div>
        <p data-tools="hidden" class="small">Hidden blocks contain an extra life. They are revealed by a hit from below.</p>
        <div data-tools="powerup">${choice('prop-powerup', 'Power-up type', ['growth', 'fire', 'star', 'life'])}</div>
        <div data-tools="hazard">${choice('prop-hazard', 'Hazard type', ['spike', 'lava'])}</div>
        <div data-tools="enemy">${choice('prop-enemy', 'Enemy type', ['walker', 'turtle', 'winged'])}${choice('prop-behavior', 'Enemy behavior', ['patrol', 'hop', 'horizontal', 'vertical'])}
          <label>Starting direction<select id="prop-direction"><option value="-1">Left</option><option value="1">Right</option></select></label>
          ${numeric('prop-speed', 'Enemy speed (pixels / second)', 40, 10, 120, 'any')}${numeric('prop-range', 'Flight span (tiles)', 4, 1, 16)}
        </div><div data-tools="moving-platform">${choice('prop-axis', 'Travel axis', ['x', 'y'])}${numeric('prop-distance', 'Travel distance (tiles)', 4, 1, 16)}${numeric('prop-durationMs', 'Travel period (milliseconds)', 4000, 1000, 12000)}</div>
        <div data-tools="decoration">${choice('prop-decoration', 'Decoration type', ['sign', 'bush', 'pine', 'sprout', 'cloud', 'crystal', 'ruin', 'door', 'terrain'])}<p class="small">Decorations are visual only. Doors cannot be entered.</p></div>
        <div id="selected-position" hidden>${numeric('component-x', 'Component column', 1, 1, 512)}${numeric('component-y', 'Component row', 1, 1, 25)}</div>
        <p id="property-help" class="small">Choose a tool, then click or press Enter on a tile.</p>
        <button type="button" id="apply-component" hidden>Apply component changes</button>
      </fieldset>
    </aside><section class="editor-workspace" aria-label="Course map">
      <div class="editor-viewport-toolbar">
        <label>Zoom<select id="editor-zoom"><option value="24">Compact</option><option value="32" selected>Standard</option><option value="44">Large</option></select></label>
        ${numeric('cursor-x', 'Cursor column', 3, 1, 512)}${numeric('cursor-y', 'Cursor row', 23, 1, 25)}
        <button type="button" id="go-to-cell" class="secondary">Go to tile</button><button type="button" id="go-to-start" class="secondary">Go to start</button><button type="button" id="go-to-finish" class="secondary">Go to finish</button>
      </div>
      <p id="editor-position" class="small" role="status"></p>
      <div id="editor-viewport" tabindex="0" role="grid" aria-label="Level grid" aria-describedby="editor-keyboard-help"><div id="editor-canvas" role="rowgroup"></div></div>
      <details class="editor-help"><summary>Building controls</summary><p id="editor-keyboard-help">Arrow keys move the map cursor. Enter or Space places the chosen tool; Delete erases. Home and End jump to row edges; Page Up and Page Down move one viewport. Select / inspect lets you edit an existing component, including its position. Escape returns to the tool picker. Scroll or use Go to tile to explore a large course.</p><p>Start, finish and checkpoints need safe solid support. Coins and power-ups may be airborne. Validate your course before testing. Every component uses the same rules in previews and published courses.</p></details>
    </section></div>
    <div class="actions"><button id="save-draft" type="submit">Save draft</button><button id="validate-draft" type="button" class="secondary">Check course</button>
      <button id="preview-draft" type="button" class="secondary">Preview draft</button><button id="test-draft" type="button" class="secondary">Test saved version</button><button id="publish-draft" type="button">Publish course</button>
      <button id="copy-draft" type="button" class="secondary">Copy to new draft</button><button id="reload-draft" type="button" class="secondary" hidden>Reload saved version</button>
      <button id="editor-ai" type="button" class="secondary" disabled aria-describedby="editor-ai-status">AI Editor Feedback</button>
    </div><p id="editor-ai-status" class="small">AI editor feedback is not available yet. Editing and publishing work without it.</p><p id="draft-message" class="message" role="status">Loading your courses…</p>
  </form>
  <div class="editor-preview-panel" id="preview-panel" hidden><p id="preview-state" role="status"></p><p id="preview-hud" class="small"></p>
    <div class="actions" id="preview-controls" hidden><button id="pause-preview" class="secondary">Pause preview</button><button id="restart-preview" class="secondary">Restart preview</button><button id="resume-preview-death" hidden>Resume at checkpoint</button><button id="stop-preview" class="secondary">Stop preview</button><button id="retry-playtest" hidden>Retry saving playtest</button></div>
    <div id="draft-preview" class="game" hidden></div>
    <div class="touch-controls" aria-label="Preview touch controls"><div><button data-preview-control="left" aria-label="Preview move left">◀</button><button data-preview-control="right" aria-label="Preview move right">▶</button></div><div><button data-preview-control="fire" aria-label="Preview throw fireball">FIRE</button><button data-preview-control="jump" aria-label="Preview jump">JUMP</button></div></div>
    <p class="small">Move: arrows or A / D · Jump: Space / W / ↑ (hold for height) · Fireball: X / J</p>
  </div>`;

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
    const dirty = isDirty(), published = !!current?.published, readOnly = published || layout.version === 1;
    viewport.setAttribute('aria-readonly', String(readOnly));
    viewport.setAttribute('aria-busy', String(busy));
    for (const control of host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input,select,button')) control.disabled = busy;
    for (const control of host.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('#draft-title,#draft-description,#draft-difficulty,#course-theme,#course-cols,#course-time,#finish-height,.editor-properties input,.editor-properties select,#apply-component')) control.disabled = busy || readOnly;
    for (const group of host.querySelectorAll<HTMLElement>('[data-tools],#selected-position')) {
      for (const field of group.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')) field.disabled = busy || readOnly || group.hidden;
    }
    el<HTMLInputElement>('#prop-range').disabled ||= !!el('#prop-range').closest('label')?.hidden;
    el<HTMLSelectElement>('#draft-list').disabled = busy || loading;
    el<HTMLButtonElement>('#save-draft').disabled = busy || readOnly;
    el<HTMLButtonElement>('#preview-draft').disabled = busy;
    el<HTMLButtonElement>('#test-draft').disabled = busy || readOnly || !current || dirty;
    el<HTMLButtonElement>('#publish-draft').disabled = busy || readOnly || !current?.canPublish || dirty || approvalInvalidated;
    el<HTMLButtonElement>('#copy-draft').disabled = busy;
    el<HTMLButtonElement>('#reload-draft').disabled = busy || (!current && !saveAttempted);
    el('#reload-draft').hidden = !current && !saveAttempted;
    el<HTMLButtonElement>('#editor-ai').disabled = true;
    el<HTMLButtonElement>('#pause-preview').disabled = busy || !preview || finished || previewDead;
    el<HTMLButtonElement>('#restart-preview').disabled = busy || !preview;
    for (const control of host.querySelectorAll<HTMLButtonElement>('[data-preview-control]')) control.disabled = busy || !preview || paused || previewDead || finished;
    el('#resume-preview-death').hidden = !previewDead;
    el<HTMLButtonElement>('#resume-preview-death').textContent = previewHasCheckpoint ? 'Resume at checkpoint' : 'Retry from start';
    el<HTMLButtonElement>('#pause-preview').textContent = paused ? 'Resume preview' : 'Pause preview';
    el('#retry-playtest').hidden = !pendingCompletion;
    el<HTMLButtonElement>('#retry-playtest').disabled = busy;
    el('#draft-status').textContent = layout.version === 1 ? 'Legacy course · read-only. Copy to new draft to upgrade its tile layout, then save and test it under the new rules.' : published ? `Published course · revision ${current!.revision}. This version is read-only. Copy it to a new private draft to make changes.` :
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
    paused = false; finished = false; previewIsSavedTest = false; previewDead = false; previewHasCheckpoint = false;
    if (active) { el('#draft-preview').hidden = true; el('#preview-controls').hidden = true; el('#preview-panel').hidden = true; controls(); }
  }

  function changed() {
    if (busy || current?.published || layout.version === 1) return;
    approvalInvalidated = true;
    if (previewIsSavedTest) stop();
    else preview?.scene.setPaused(true);
    controls();
    note((isDirty() ? 'Unsaved changes. Save and test the saved version before publishing.' : 'Your fields match the saved version. Test it again before publishing.') +
      (preview ? ' The local preview uses its earlier layout. Choose Preview draft to refresh it.' : ''));
  }

  const viewport = el('#editor-viewport'), canvas = el('#editor-canvas');
  viewport.style.overflow = 'auto'; viewport.style.maxHeight = '65vh';
  canvas.style.position = 'relative';
  const tool = () => el<HTMLSelectElement>('#tile-tool').value as V2Tool;
  const readOnly = () => !!current?.published || layout.version === 1;

  function properties(): ToolProperties {
    const values = { ...DEFAULT_PROPERTIES };
    for (const key of Object.keys(values) as (keyof ToolProperties)[]) {
      const field = el<HTMLInputElement | HTMLSelectElement>(`#prop-${key}`);
      (values as unknown as Record<string, unknown>)[key] = typeof DEFAULT_PROPERTIES[key] === 'number' ? Number(field.value) : field.value;
    }
    return values;
  }

  function syncProperties(values?: ToolProperties) {
    if (values) for (const [key, value] of Object.entries(values)) el<HTMLInputElement | HTMLSelectElement>(`#prop-${key}`).value = String(value);
    const kind = el<HTMLSelectElement>('#prop-enemy').value;
    const behavior = el<HTMLSelectElement>('#prop-behavior');
    for (const option of behavior.options) option.disabled = kind === 'winged' ? option.value === 'patrol' : option.value !== 'patrol';
    if (behavior.selectedOptions[0]?.disabled) behavior.value = kind === 'winged' ? 'hop' : 'patrol';
    el('#prop-range').closest('label')!.hidden = kind !== 'winged' || behavior.value === 'hop';
    const direction = el<HTMLSelectElement>('#prop-direction');
    direction.options[0].text = behavior.value === 'vertical' ? 'Up' : 'Left'; direction.options[1].text = behavior.value === 'vertical' ? 'Down' : 'Right';
    const activeTool = selection?.tool ?? tool();
    for (const group of host.querySelectorAll<HTMLElement>('[data-tools]')) group.hidden = !group.dataset.tools!.split(' ').includes(activeTool);
    el('#property-heading').textContent = selection ? `Selected: ${selection.tool}` : 'Component properties';
    el('#selected-position').hidden = !selection;
    el('#apply-component').hidden = !selection;
    el('#property-help').textContent = selection ? 'Change properties or position, then select Apply component changes.' : activeTool === 'select' ? 'Select a component on the map to inspect or change it.' : 'These properties apply to the next tile you place.';
    if (selection && values) { el<HTMLInputElement>('#component-x').value = String(selection.x + 1); el<HTMLInputElement>('#component-y').value = String(selection.y + 1); }
    controls();
  }

  function inspectCell(index = 0) {
    if (layout.version === 1) { selection = undefined; syncProperties(); return; }
    const picks = selectionsAt(layout, cursor.x, cursor.y), select = el<HTMLSelectElement>('#cell-components');
    select.replaceChildren(...picks.map((pick, i) => new Option(pick.label, String(i))));
    selection = picks[index]; select.value = String(index);
    el('#cell-components-label').hidden = !picks.length;
    syncProperties(selection?.properties);
    controls();
  }

  function syncWorldFields() {
    const v2 = layout.version === 2 ? layout : undefined;
    el<HTMLSelectElement>('#course-theme').value = v2?.theme ?? 'overworld';
    el<HTMLInputElement>('#course-cols').value = String(layout.cols);
    el<HTMLInputElement>('#course-time').value = String(v2?.timeLimit ?? 300);
    el<HTMLInputElement>('#finish-height').value = String(v2?.finishHeight ?? 5);
    el<HTMLInputElement>('#cursor-x').max = String(layout.cols); el<HTMLInputElement>('#cursor-y').max = String(layout.rows);
    el<HTMLInputElement>('#component-x').max = String(layout.cols); el<HTMLInputElement>('#component-y').max = String(layout.rows);
    viewport.dataset.theme = v2?.theme ?? 'overworld';
    viewport.setAttribute('aria-rowcount', String(layout.rows)); viewport.setAttribute('aria-colcount', String(layout.cols));
  }

  function announceCursor() {
    el<HTMLInputElement>('#cursor-x').value = String(cursor.x + 1); el<HTMLInputElement>('#cursor-y').value = String(cursor.y + 1);
    el('#editor-position').textContent = `Column ${cursor.x + 1} of ${layout.cols}, row ${cursor.y + 1} of ${layout.rows}: ${describeCell(layout, cursor.x, cursor.y).description}.`;
  }

  function revealCursor() {
    const left = cursor.x * cellSize, top = cursor.y * cellSize, margin = cellSize * 2;
    if (left - margin < viewport.scrollLeft) viewport.scrollLeft = Math.max(0, left - margin);
    else if (left + cellSize + margin > viewport.scrollLeft + viewport.clientWidth) viewport.scrollLeft = left + cellSize + margin - viewport.clientWidth;
    if (top - margin < viewport.scrollTop) viewport.scrollTop = Math.max(0, top - margin);
    else if (top + cellSize + margin > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = top + cellSize + margin - viewport.clientHeight;
    grid();
  }

  function edit(action: (draft: LayoutV2) => LayoutV2) {
    if (busy) return;
    if (readOnly() || layout.version !== 2) { note('This course is read-only. Copy it to a new draft to make changes.'); return; }
    try {
      layout = action(layout); selection = undefined; el('#cell-components-label').hidden = true;
      cursor.x = Math.min(cursor.x, layout.cols - 1); cursor.y = Math.min(cursor.y, layout.rows - 1);
      syncWorldFields(); syncProperties(); grid(); changed();
    } catch (error) { note(errorText(error), true); }
  }

  function activateCell(erase = false) {
    if (!erase && (tool() === 'select' || readOnly())) { inspectCell(); return; }
    edit(draft => placeComponent(draft, cursor.x, cursor.y, erase ? 'erase' : tool(), properties()));
  }

  function grid() {
    if (!active) return;
    canvas.style.width = `${layout.cols * cellSize}px`; canvas.style.height = `${layout.rows * cellSize}px`;
    const firstX = Math.max(0, Math.floor(viewport.scrollLeft / cellSize) - 1), firstY = Math.max(0, Math.floor(viewport.scrollTop / cellSize) - 1);
    const lastX = Math.min(layout.cols, Math.ceil((viewport.scrollLeft + (viewport.clientWidth || 800)) / cellSize) + 1);
    const lastY = Math.min(layout.rows, Math.ceil((viewport.scrollTop + (viewport.clientHeight || 500)) / cellSize) + 1);
    const fragment = document.createDocumentFragment();
    for (let y = firstY; y < lastY; y++) {
      const row = document.createElement('div'); row.setAttribute('role', 'row'); row.setAttribute('aria-rowindex', String(y + 1));
      Object.assign(row.style, { position: 'absolute', left: '0', top: `${y * cellSize}px`, width: '100%', height: `${cellSize}px` });
      for (let x = firstX; x < lastX; x++) {
        const appearance = describeCell(layout, x, y), selected = cursor.x === x && cursor.y === y;
        const cell = document.createElement('button'); cell.type = 'button'; cell.tabIndex = -1; cell.disabled = busy;
        cell.id = `editor-cell-${x}-${y}`; cell.className = `tile editor-cell ${appearance.kind}${selected ? ' selected' : ''}`; cell.textContent = appearance.label;
        Object.assign(cell.style, { position: 'absolute', left: `${x * cellSize}px`, top: '0', width: `${cellSize}px`, height: `${cellSize}px` });
        cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-rowindex', String(y + 1)); cell.setAttribute('aria-colindex', String(x + 1)); cell.setAttribute('aria-selected', String(selected));
        cell.setAttribute('aria-label', `Column ${x + 1}, row ${y + 1}: ${appearance.description}`);
        cell.onclick = () => { cursor = { x, y }; activateCell(); viewport.focus({ preventScroll: true }); grid(); };
        row.append(cell);
      }
      fragment.append(row);
    }
    canvas.replaceChildren(fragment);
    if (cursor.x >= firstX && cursor.x < lastX && cursor.y >= firstY && cursor.y < lastY) viewport.setAttribute('aria-activedescendant', `editor-cell-${cursor.x}-${cursor.y}`);
    else viewport.removeAttribute('aria-activedescendant');
    announceCursor();
  }

  function queueRender() { if (!active) return; cancelAnimationFrame(renderFrame); renderFrame = requestAnimationFrame(grid); }
  const resizeObserver = new ResizeObserver(queueRender); resizeObserver.observe(viewport);
  viewport.addEventListener('scroll', queueRender, { passive: true });
  viewport.addEventListener('focus', () => preview?.scene.setPaused(true));
  viewport.addEventListener('keydown', event => {
    const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', 'Enter', ' ', 'Delete', 'Backspace', 'Escape'];
    if (!keys.includes(event.key)) return;
    event.preventDefault(); event.stopPropagation(); if (busy) return;
    if (event.key === 'Escape') { el('#tile-tool').focus(); return; }
    if (event.key === 'Enter' || event.key === ' ') { activateCell(); grid(); return; }
    if (event.key === 'Delete' || event.key === 'Backspace') { activateCell(true); grid(); return; }
    const page = Math.max(1, Math.floor(viewport.clientWidth / cellSize) - 1);
    if (event.key === 'ArrowLeft') cursor.x--; if (event.key === 'ArrowRight') cursor.x++;
    if (event.key === 'ArrowUp') cursor.y--; if (event.key === 'ArrowDown') cursor.y++;
    if (event.key === 'Home') cursor.x = 0; if (event.key === 'End') cursor.x = layout.cols - 1;
    if (event.key === 'PageUp') cursor.x -= page; if (event.key === 'PageDown') cursor.x += page;
    cursor.x = Math.max(0, Math.min(layout.cols - 1, cursor.x)); cursor.y = Math.max(0, Math.min(layout.rows - 1, cursor.y));
    if (tool() === 'select' || readOnly()) inspectCell(); revealCursor();
  });

  el<HTMLSelectElement>('#tile-tool').onchange = () => { selection = undefined; el('#cell-components-label').hidden = true; syncProperties(); };
  el<HTMLSelectElement>('#cell-components').onchange = () => inspectCell(Number(el<HTMLSelectElement>('#cell-components').value));
  el<HTMLSelectElement>('#prop-enemy').onchange = () => syncProperties();
  el<HTMLSelectElement>('#prop-behavior').onchange = () => syncProperties();
  el('#apply-component').onclick = () => {
    const picked = selection; if (!picked) return;
    const x = Number(el<HTMLInputElement>('#component-x').value) - 1, y = Number(el<HTMLInputElement>('#component-y').value) - 1;
    edit(draft => replaceSelection(draft, picked, x, y, properties()));
    if (!selection) { cursor = { x, y }; revealCursor(); inspectCell(); }
  };
  for (const selector of ['#course-theme', '#course-cols', '#course-time', '#finish-height']) el<HTMLInputElement>(selector).onchange = () => {
    const field = el<HTMLInputElement>(selector);
    if (!field.reportValidity()) { syncWorldFields(); return; }
    edit(draft => {
      if (selector === '#course-cols') return resizeCourse(draft, Number(field.value));
      return { ...draft, theme: el<HTMLSelectElement>('#course-theme').value as LayoutV2['theme'], timeLimit: Number(el<HTMLInputElement>('#course-time').value), finishHeight: Number(el<HTMLInputElement>('#finish-height').value) };
    });
    syncWorldFields();
  };
  el<HTMLSelectElement>('#editor-zoom').onchange = () => { cellSize = Number(el<HTMLSelectElement>('#editor-zoom').value); revealCursor(); };
  el('#go-to-cell').onclick = () => {
    const x = Number(el<HTMLInputElement>('#cursor-x').value) - 1, y = Number(el<HTMLInputElement>('#cursor-y').value) - 1;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= layout.cols || y >= layout.rows) { note('Choose a cursor position inside the course.', true); return; }
    cursor = { x, y }; revealCursor(); if (tool() === 'select' || readOnly()) inspectCell(); viewport.focus();
  };
  el('#go-to-start').onclick = () => { cursor = { ...layout.start }; revealCursor(); viewport.focus(); };
  el('#go-to-finish').onclick = () => { cursor = { ...layout.finish }; revealCursor(); viewport.focus(); };
  el('#validate-draft').onclick = () => { try { validateLayout(layout); note('Course geometry is valid. Preview it, then save and test the saved version to confirm it is playable.'); } catch (error) { note(errorText(error), true); } };

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
    layout = structuredClone(data?.layout ?? newEditorLayout());
    selection = undefined; el('#cell-components-label').hidden = true; cursor = { ...layout.start }; syncWorldFields(); syncProperties(DEFAULT_PROPERTIES);
    el<HTMLInputElement>('#draft-title').value = data?.title ?? 'My first course';
    el<HTMLInputElement>('#draft-description').value = data?.description ?? '';
    el<HTMLSelectElement>('#draft-difficulty').value = data?.difficulty ?? 'easy';
    baseline = copy ? '' : snapshot();
    grid(); options(); controls(); revealCursor();
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
    event.preventDefault(); if (busy || current?.published || layout.version === 1) return;
    if (!['#draft-title', '#draft-description'].every(selector => el<HTMLInputElement>(selector).reportValidity())) return;
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
    el('#draft-preview').hidden = false; el('#preview-controls').hidden = false; el('#preview-panel').hidden = false;
    el('#draft-preview').style.aspectRatio = level.layout.version === 1 ? '12 / 7' : window.innerWidth < 600 ? '6 / 5' : '16 / 9';
    el('#preview-state').textContent = testId ? 'Saved-version playtest. Reach the finish to approve this revision.' : 'Local preview. Results do not approve publication.';
    el('#preview-hud').textContent = '';
    preview = mountGame(el('#draft-preview'), level, result => {
      if (!active || stamp !== generation) return;
      finished = true; controls();
      if (testId) {
        pendingCompletion = { id: testId, result, generation: stamp };
        void savePlaytest();
      } else note(`Preview complete: ${(result.elapsedMs / 1000).toFixed(2)} seconds · ${result.deaths} deaths · ${result.collected}/${result.totalItems} items. This preview does not approve publication or save a score.`);
    }, {
      onState: (state: RunState) => {
        if (!active || stamp !== generation) return;
        previewDead = state.status === 'dead'; previewHasCheckpoint = state.hasCheckpoint;
        paused = state.status === 'paused';
        el('#preview-state').textContent = previewDead ? `${state.reason ?? 'Run interrupted.'} ${state.hasCheckpoint ? 'Resume at your checkpoint or restart this preview.' : 'Retry from the start or restart this preview.'}` : state.status === 'paused' ? 'Preview paused. Select Resume preview to continue.' : state.status === 'complete' ? 'Finish reached.' : testId ? 'Testing the saved version. Reach the finish.' : 'Playing the current local preview.';
        controls();
      },
      onHud: (hud: RunHud) => {
        if (!active || stamp !== generation) return;
        el('#preview-hud').textContent = `${Math.ceil(hud.timeLeft)}s left · ${hud.lives} lives · ${hud.collected}/${hud.totalItems} coins · ${hud.score} points · ${hud.power}${hud.star ? ' · invincible' : ''}`;
      },
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
    if (busy || !current || current.published || layout.version === 1 || isDirty()) return;
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
    const copy = values(); if (copy.layout.version === 1) copy.layout = convertLegacyLayout(copy.layout); copy.title = `${copy.title.slice(0, 53)} (copy)`;
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
  el('#resume-preview-death').onclick = () => preview?.scene.resumeAfterDeath();
  el('#restart-preview').onclick = () => {
    if (busy) return;
    if (previewIsSavedTest) void testSaved();
    else { try { validateLayout(layout); stop(); launch({ ...values(), id }); } catch (error) { note(errorText(error), true); } }
  };
  el('#stop-preview').onclick = () => { stop(); note('Preview stopped. Your draft is unchanged.'); };
  el('#retry-playtest').onclick = () => { void savePlaytest(); };
  for (const control of host.querySelectorAll<HTMLButtonElement>('[data-preview-control]')) {
    const action = control.dataset.previewControl as ControlAction;
    control.onpointerdown = event => { event.preventDefault(); control.setPointerCapture(event.pointerId); preview?.scene.setControl(action, true); };
    const release = () => preview?.scene.setControl(action, false);
    control.onpointerup = release; control.onpointercancel = release; control.onlostpointercapture = release;
  }

  syncWorldFields(); syncProperties(DEFAULT_PROPERTIES); baseline = snapshot(); grid(); controls(); revealCursor(); void refreshList();
  return {
    isDirty,
    canLeave,
    destroy() {
      active = false; generation++; preview?.destroy(); preview = undefined;
      window.removeEventListener('beforeunload', beforeUnload);
      cancelAnimationFrame(renderFrame); viewport.removeEventListener('scroll', queueRender);
      resizeObserver.disconnect();
    },
  };
}
