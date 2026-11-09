import { afterEach, describe, expect, it, vi } from 'vitest';
import { Attempt } from '../src/attempt';
import { validateLayout } from '../src/level';
import { testCourse } from './fixtures/course';
import { AI_UNAVAILABLE_MESSAGE, buildEditorContext, buildGameplayContext, requestEditorFeedback, requestGameplayHint } from '../src/ai';
import { applyMotionPreference, MOTION_STORAGE_KEY, prefersReducedMotion, readMotionPreference, saveMotionPreference } from '../src/settings';

describe('collectible geometry', () => {
  it('accepts airborne items without requiring a platform', () => {
    expect(() => validateLayout({ ...testCourse.layout, items: [{ x: 3, y: 2 }] })).not.toThrow();
  });
  it.each([
    [{ x: 3, y: 23 }], // Inside the floor.
    [{ x: 7, y: 22 }], // In a hazard.
    [{ x: 3, y: 2 }, { x: 3, y: 2 }],
    [{ x: 64, y: 2 }],
    [{ x: 3, y: 25 }],
    [{ x: 3.5, y: 2 }],
  ].map(items => ({ items })))('rejects invalid items %#', ({ items }) => {
    expect(() => validateLayout({ ...testCourse.layout, items })).toThrow();
  });
});

describe('attempt-local collectibles', () => {
  it('counts each registered instance once and preserves collection through deaths', () => {
    const attempt = new Attempt(['1,2', '3,4']);
    attempt.tick(250.2);
    expect(attempt.collect('1,2')).toBe(true);
    expect(attempt.collect('1,2')).toBe(false);
    expect(attempt.collect('missing')).toBe(false);
    attempt.die();
    expect(attempt.result()).toEqual({ elapsedMs: 250, deaths: 1, collected: 1, totalItems: 2 });
    expect(attempt.collect('1,2')).toBe(false);
    expect(attempt.collect('3,4')).toBe(true);
    expect(attempt.collected).toBe(2);
  });
  it('blocks collection while paused or finished and allows finishing without all items', () => {
    const attempt = new Attempt(['1,2']);
    attempt.paused = true;
    expect(attempt.collect('1,2')).toBe(false);
    attempt.paused = false;
    expect(attempt.finish()).toBe(true);
    expect(attempt.collect('1,2')).toBe(false);
    expect(attempt.result()).toMatchObject({ collected: 0, totalItems: 1 });
  });
  it('restores all items for a new attempt and supports courses without items', () => {
    const oldAttempt = new Attempt(['1,2']);
    oldAttempt.collect('1,2');
    const restartedAttempt = new Attempt(['1,2']);
    expect(restartedAttempt.result()).toEqual({ elapsedMs: 0, deaths: 0, collected: 0, totalItems: 1 });
    expect(restartedAttempt.collect('1,2')).toBe(true);
    const noItems = new Attempt();
    expect(noItems.finish()).toBe(true);
    expect(noItems.result()).toMatchObject({ collected: 0, totalItems: 0 });
  });
  it('does not corrupt elapsed time on invalid deltas', () => {
    const attempt = new Attempt();
    attempt.tick(150);
    for (const delta of [-200, NaN, Infinity]) attempt.tick(delta);
    expect(attempt.elapsedMs).toBe(150);
  });
});

describe('device-local motion preference', () => {
  afterEach(() => { applyMotionPreference(false); vi.unstubAllGlobals(); });

  function storage(initial?: string) {
    const values = new Map<string, string>(initial === undefined ? [] : [[MOTION_STORAGE_KEY, initial]]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    return values;
  }

  it('defaults off and saves both enabled and restored default values', () => {
    const values = storage();
    expect(readMotionPreference()).toEqual({ value: false });
    expect(saveMotionPreference(true)).toEqual({ saved: true });
    expect(values.get(MOTION_STORAGE_KEY)).toBe('true');
    expect(prefersReducedMotion()).toBe(true);
    expect(readMotionPreference()).toEqual({ value: true });
    expect(saveMotionPreference(false)).toEqual({ saved: true });
    expect(readMotionPreference()).toEqual({ value: false });
    expect(prefersReducedMotion()).toBe(false);
  });
  it('exposes the applied setting to decorative UI styles', () => {
    const dataset: Record<string, string> = {};
    vi.stubGlobal('document', { documentElement: { dataset } });
    applyMotionPreference(true);
    expect(dataset.reducedMotion).toBe('true');
    applyMotionPreference(false);
    expect(dataset.reducedMotion).toBe('false');
  });
  it('reports invalid saved data and safely falls back to off', () => {
    storage('{broken');
    expect(readMotionPreference()).toMatchObject({ value: false, error: expect.stringContaining('invalid') });
  });
  it('reports unavailable storage without losing the in-memory preference', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    });
    expect(readMotionPreference()).toMatchObject({ value: false, error: expect.stringContaining('could not read') });
    expect(saveMotionPreference(true)).toMatchObject({ saved: false, error: expect.stringContaining('could not be saved') });
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe('deferred AI context', () => {
  it('snapshots editable context and returns only an honest unavailable response', async () => {
    const draft = structuredClone(testCourse);
    const editor = buildEditorContext(draft);
    const state = { position: { x: 1, y: 11 }, checkpoint: null, elapsedMs: 100, deaths: 0, collected: 0, totalItems: 0, paused: false, finished: false };
    const gameplay = buildGameplayContext(draft, state);
    draft.layout.start.x = 5;
    state.position.x = 6;
    expect(editor.draft.layout.start.x).toBe(1);
    expect(gameplay.state.position.x).toBe(1);
    expect(gameplay.level.layout.start.x).toBe(1);
    const unavailable = { status: 'unavailable', reason: 'not_implemented', message: AI_UNAVAILABLE_MESSAGE };
    expect(await requestEditorFeedback(editor)).toEqual(unavailable);
    expect(await requestGameplayHint(gameplay)).toEqual(unavailable);
  });
});
