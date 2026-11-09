import { Attempt } from '../attempt';
import type { LayoutV2, Point } from '../course-format';
import type { RunState } from './types';

/** Run data survives scene restart for checkpoint retries; no Phaser references. */
export class RunModel {
  readonly attempt: Attempt;
  readonly consumed = new Set<string>();
  readonly broken = new Set<string>();
  checkpoint: Point | null = null;
  score = 0;
  lives = 3;
  status: RunState['status'] = 'playing';
  reason?: string;
  remainingMs: number;
  constructor(readonly layout: LayoutV2) {
    this.attempt = new Attempt([...layout.items.map(p => `coin:${p.x},${p.y}`),
      ...layout.blocks.filter(b => b.content === 'coin').map(p => `block:${p.x},${p.y}`)]);
    this.remainingMs = layout.timeLimit * 1000;
  }
  tick(delta: number) {
    if (this.status !== 'playing' || !Number.isFinite(delta)) return;
    this.attempt.tick(delta);
    this.remainingMs = Math.max(0, this.remainingMs - Math.max(0, delta));
  }
  collect(id: string) { if (!this.attempt.collect(id)) return false; this.score += 100; this.consumed.add(id); return true; }
  die(reason: string) {
    if (this.status !== 'playing') return false;
    this.attempt.die(); this.lives = Math.max(0, this.lives - 1); this.reason = reason; this.status = 'dead'; return true;
  }
  pause(paused: boolean) { if (this.status !== 'playing' && this.status !== 'paused') return false; this.status = paused ? 'paused' : 'playing'; this.attempt.paused = paused; return true; }
  resume() {
    if (this.status !== 'dead') return false;
    this.status = 'playing'; this.reason = undefined;
    // A checkpoint retry is always possible in this course-oriented game.
    if (!this.lives) this.lives = 3;
    this.remainingMs = this.layout.timeLimit * 1000;
    // Restore world encounters/power-ups on retry while retaining earned coins.
    const coinBlocks = new Set(this.layout.blocks.filter(b => b.content === 'coin').map(b => `block:${b.x},${b.y}`));
    for (const id of this.consumed) if (id.startsWith('block:') && !coinBlocks.has(id)) this.consumed.delete(id);
    this.broken.clear();
    return true;
  }
  finish() { if (this.status !== 'playing' || !this.attempt.finish()) return false; this.status = 'complete'; return true; }
  state(): RunState { return { status: this.status, hasCheckpoint: !!this.checkpoint, lives: this.lives, ...(this.reason ? { reason: this.reason } : {}) }; }
}
