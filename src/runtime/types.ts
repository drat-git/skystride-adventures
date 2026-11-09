import type { RunResult } from '../attempt';

export type ControlAction = 'left' | 'right' | 'jump' | 'fire';
export type PowerState = 'SMALL' | 'BIG' | 'FIRE';
export interface RunState {
  status: 'playing' | 'paused' | 'dead' | 'complete';
  hasCheckpoint: boolean;
  lives: number;
  reason?: string;
}
export interface RunHud extends RunResult {
  score: number; lives: number; timeLeft: number; power: PowerState; star: boolean;
}
export interface GameOptions { demo?: boolean; onState?: (state: RunState) => void; onHud?: (hud: RunHud) => void }
export const PHYSICS = Object.freeze({ acceleration: 1600, drag: 1300, speed: 240, fallSpeed: 900,
  jump: -480, jumpCut: -160, gravity: 1000, extraFallGravity: 900, bigScale: 1.5,
  starDuration: 8000, hurtDuration: 2000, stompBounce: -300 });

/** Source hitbox math: visual squash never changes effective collision dimensions. */
export function playerBody(power: PowerState, scaleX: number, scaleY: number) {
  const base = power === 'SMALL' ? 1 : PHYSICS.bigScale;
  const width = 16 / scaleX, height = (power === 'SMALL' ? 20 : 30) / scaleY;
  return { width, height, x: (24 - width) / 2, y: 12 + 12 * base / scaleY - height };
}
