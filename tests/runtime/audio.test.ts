import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/runtime/AudioEngine';
import { MUSIC_TRACKS, musicForTheme } from '../../src/runtime/music';

class Param {
  value = 0;
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class Gain {
  gain = new Param();
  connect = vi.fn();
  disconnect = vi.fn();
}
class Oscillator {
  type = 'sine';
  frequency = new Param();
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  onended: (() => void) | null = null;
}
class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  currentTime = 0;
  state = 'running';
  destination = {};
  gains: Gain[] = [];
  oscillators: Oscillator[] = [];
  constructor() { FakeAudioContext.instances.push(this); }
  createGain() { const node = new Gain(); this.gains.push(node); return node; }
  createOscillator() { const node = new Oscillator(); this.oscillators.push(node); return node; }
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
}

describe('theme music and course audio lifecycle', () => {
  let engine: AudioEngine;
  beforeEach(() => {
    vi.useFakeTimers(); FakeAudioContext.instances = [];
    vi.stubGlobal('window', { AudioContext: FakeAudioContext });
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn() });
    engine = new AudioEngine();
  });
  afterEach(() => { engine.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('selects a distinct eight-bar sky song and keeps the cave alias', () => {
    expect(musicForTheme('sky')).toBe(MUSIC_TRACKS.sky);
    expect(musicForTheme('cave')).toBe(MUSIC_TRACKS.underground);
    expect(musicForTheme('underground')).toBe(MUSIC_TRACKS.underground);
    expect(musicForTheme('unknown')).toBeUndefined();
    expect(MUSIC_TRACKS.sky.steps).toHaveLength(64);
    expect(MUSIC_TRACKS.sky.steps).not.toEqual(MUSIC_TRACKS.overworld.steps);
    expect(MUSIC_TRACKS.sky.bpm).not.toBe(MUSIC_TRACKS.overworld.bpm);
  });

  it('waits for an audio unlock and schedules the selected song on the audio clock', () => {
    engine.startMusic('sky'); expect(FakeAudioContext.instances).toHaveLength(0);
    engine.unlock();
    const ctx = FakeAudioContext.instances[0], first = ctx.oscillators[0];
    expect(first.frequency.setValueAtTime).toHaveBeenCalledWith(MUSIC_TRACKS.sky.steps[0][0], 0.1);
    expect(first.start).toHaveBeenCalledWith(0.1);
    expect(vi.getTimerCount()).toBe(1);
    const count = ctx.oscillators.length;
    const nextLoop = 0.1 + MUSIC_TRACKS.sky.steps.length * 60 / MUSIC_TRACKS.sky.bpm / 2;
    ctx.currentTime = nextLoop - 0.2; vi.advanceTimersByTime(100);
    expect(ctx.oscillators).toHaveLength(count * 2);
    expect(ctx.oscillators[count].start).toHaveBeenCalledWith(nextLoop);
  });

  it('does not schedule overdue notes in the past after a stalled callback', () => {
    engine.unlock(); engine.startMusic('sky');
    const ctx = FakeAudioContext.instances[0], count = ctx.oscillators.length;
    ctx.currentTime = 90; vi.advanceTimersByTime(100);
    for (const osc of ctx.oscillators.slice(count)) expect(osc.start.mock.calls[0][0]).toBeGreaterThanOrEqual(90);
  });

  it('stops scheduled notes and timers when pausing, replacing a theme, or disposing', () => {
    engine.unlock(); engine.startMusic('sky');
    const ctx = FakeAudioContext.instances[0], skyNotes = [...ctx.oscillators];
    engine.suspend(); expect(vi.getTimerCount()).toBe(0); expect(ctx.suspend).toHaveBeenCalledOnce();
    for (const note of skyNotes) { expect(note.stop).toHaveBeenLastCalledWith(); expect(note.disconnect).toHaveBeenCalled(); }
    engine.unlock(); engine.startMusic('sky'); expect(vi.getTimerCount()).toBe(1);
    const restartedNotes = ctx.oscillators.slice(skyNotes.length);
    engine.startMusic('cave'); expect(vi.getTimerCount()).toBe(1);
    for (const note of restartedNotes) expect(note.stop).toHaveBeenLastCalledWith();
    engine.dispose(); expect(vi.getTimerCount()).toBe(0); expect(ctx.close).toHaveBeenCalledOnce();
  });

  it('keeps mute independent of track scheduling and clears pending music on stop', () => {
    engine.startMusic('sky'); engine.stopMusic(); engine.unlock();
    const ctx = FakeAudioContext.instances[0]; expect(ctx.oscillators).toHaveLength(0);
    engine.startMusic('sky'); const count = ctx.oscillators.length;
    engine.setMuted(true); expect(ctx.gains[0].gain.value).toBe(0);
    engine.setMuted(false); expect(ctx.gains[0].gain.value).toBe(1);
    expect(ctx.oscillators).toHaveLength(count); expect(vi.getTimerCount()).toBe(1);
    expect(localStorage.setItem).toHaveBeenLastCalledWith('skystride.audio-muted.v1', '0');
  });
});
