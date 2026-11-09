import Phaser from 'phaser';
import { COLS, ROWS, TILE, validateLayout, type Layout, type Level } from './level';
import type { LayoutV2 } from './course-format';
import type { RunResult } from './attempt';
import { ManagedGame } from './runtime/ManagedGame';
import { LegacyScene } from './runtime/LegacyScene';
import { CourseScene } from './runtime/CourseScene';
import type { GameOptions } from './runtime/types';
export type { RunResult } from './attempt';
export type { GameOptions, RunState, RunHud, ControlAction } from './runtime/types';
export { CourseScene } from './runtime/CourseScene';

export function mountGame(parent: HTMLElement, level: Level, onFinish: (result: RunResult) => void, options: GameOptions = {}) {
  validateLayout(level.layout);
  const previousTabIndex = parent.getAttribute('tabindex'), previousLabel = parent.getAttribute('aria-label');
  parent.tabIndex = options.demo ? -1 : 0;
  parent.setAttribute('aria-label', options.demo ? 'SkyStride gameplay demonstration' : 'Course keyboard controls: arrows or A D to move, Space or W to jump, X or J to fire');
  const v2 = level.layout.version === 2;
  const scene = v2
    ? new CourseScene(structuredClone(level) as Level & { layout: LayoutV2 }, onFinish, parent, options)
    : new LegacyScene(structuredClone(level) as Level & { layout: Layout }, onFinish, parent, options);
  const width = v2 ? window.innerWidth < 600 ? 540 : 800 : COLS * TILE;
  const game = new ManagedGame({
    type: Phaser.AUTO, parent, width, height: v2 ? 450 : ROWS * TILE,
    input: { keyboard: v2 ? false : { target: parent } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: v2 ? 1000 : 950 }, debug: false } },
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
