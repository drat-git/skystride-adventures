import Phaser from 'phaser';
import { validateLayout, type Level } from './level';
import type { CompletionResult as RunResult } from './runtime/types';
import { ManagedGame } from './runtime/ManagedGame';
import { CourseScene } from './runtime/CourseScene';
import type { GameOptions } from './runtime/types';
export type { CompletionResult as RunResult } from './runtime/types';
export type { GameOptions, RunState, RunHud, ControlAction } from './runtime/types';
export { CourseScene } from './runtime/CourseScene';

export function mountGame(parent: HTMLElement, level: Level, onFinish: (result: RunResult) => void, options: GameOptions = {}) {
  validateLayout(level.layout);
  const previousTabIndex = parent.getAttribute('tabindex'), previousLabel = parent.getAttribute('aria-label');
  parent.tabIndex = options.demo ? -1 : 0;
  parent.setAttribute('aria-label', options.demo ? 'SkyStride gameplay demonstration' : 'Course keyboard controls: arrows or A D to move, Space or W to jump, X or J to fire');
  const scene = new CourseScene(structuredClone(level), onFinish, parent, options);
  const width = window.innerWidth < 600 ? 540 : 800;
  const game = new ManagedGame({
    type: Phaser.AUTO, parent, width, height: 450,
    input: { keyboard: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1000 }, debug: false } },
    scene: [scene], render: { pixelArt: true, roundPixels: true }, banner: false,
  });
  let destroyed = false;
  return { game, scene, destroy: () => {
    if (destroyed) return; destroyed = true;
    scene.releaseInput(); game.releaseDomListeners(); game.destroy(true);
    if (previousTabIndex === null) parent.removeAttribute('tabindex'); else parent.setAttribute('tabindex', previousTabIndex);
    if (previousLabel === null) parent.removeAttribute('aria-label'); else parent.setAttribute('aria-label', previousLabel);
  } };
}
