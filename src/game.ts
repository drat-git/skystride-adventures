import Phaser from 'phaser';
import { TILE, COLS, ROWS, validateLayout, type Level, type Point } from './level';
import { Attempt, type RunResult } from './attempt';
import { buildGameplayContext, type GameplayHintContext } from './ai';

export type { RunResult } from './attempt';

/** Phaser 3.90's core visibility handler has no teardown. Scope its synchronous
 * boot registrations so repeated previews release those handlers as well. */
class ManagedGame extends Phaser.Game {
  private releaseCoreListeners?: () => void;
  private released = false;

  protected start() {
    const add = document.addEventListener;
    const previousBlur = window.onblur, previousFocus = window.onfocus;
    const visibility: { type: string; listener: EventListenerOrEventListenerObject; options?: boolean | AddEventListenerOptions }[] = [];
    document.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
      if (type.endsWith('visibilitychange')) visibility.push({ type, listener, options });
      add.call(document, type, listener, options);
    } as typeof document.addEventListener;
    try { super.start(); }
    finally { document.addEventListener = add; }
    const blur = window.onblur, focus = window.onfocus;
    // Keep application-owned event properties intact; our Phaser callbacks get
    // normal removable subscriptions instead of replacing window handlers.
    window.onblur = previousBlur; window.onfocus = previousFocus;
    if (blur) window.addEventListener('blur', blur);
    if (focus) window.addEventListener('focus', focus);
    let active = true;
    this.releaseCoreListeners = () => {
      if (!active) return;
      active = false;
      for (const hook of visibility) document.removeEventListener(hook.type, hook.listener, hook.options);
      if (blur) window.removeEventListener('blur', blur);
      if (focus) window.removeEventListener('focus', focus);
    };
    this.events.once(Phaser.Core.Events.DESTROY, this.releaseCoreListeners);
    if (this.released) this.releaseCoreListeners();
  }

  releaseDomListeners() { this.released = true; this.releaseCoreListeners?.(); }
}

export class CourseScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private attempt: Attempt;
  private status!: Phaser.GameObjects.Text;
  private checkpoint: Point | null = null;
  private ready = false;
  private releaseInputListeners?: () => void;

  constructor(private level: Level, private onFinish: (result: RunResult) => void, private surface: HTMLElement) {
    super('course');
    this.attempt = new Attempt(level.layout.items.map(p => `${p.x},${p.y}`));
  }

  create() {
    const layout = this.level.layout;
    this.cameras.main.setBackgroundColor('#dceee9');
    const g = this.add.graphics();
    g.fillStyle(0xb7d3cb, 1); g.fillTriangle(0, 384, 170, 170, 340, 384); g.fillTriangle(250, 384, 510, 110, 768, 384);
    g.fillStyle(0xc9e1d9, 1); g.fillCircle(600, 80, 42);
    g.fillStyle(0xf3c35c, 1); g.fillRect(0, 0, 24, 28); g.generateTexture('player', 24, 28); g.clear();
    g.fillStyle(0x234740, 1); g.fillRect(0, 0, 32, 32); g.fillStyle(0x76a58c, 1); g.fillRect(0, 0, 32, 5); g.generateTexture('platform', 32, 32); g.clear();
    const solids = this.physics.add.staticGroup();
    for (const p of layout.platforms) {
      for (let i = 0; i < p.width; i++) solids.create((p.x + i) * TILE + 16, p.y * TILE + 16, 'platform');
    }
    this.player = this.physics.add.sprite(layout.start.x * TILE + 16, layout.start.y * TILE + 16, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.body!.setSize(22, 28);
    this.physics.add.collider(this.player, solids);

    for (const point of layout.checkpoints) {
      const marker = this.add.rectangle(point.x * TILE + 16, point.y * TILE + 16, 16, 24, 0x679ab0);
      const zone = this.add.zone(point.x * TILE + 16, point.y * TILE + 16, 24, 30);
      this.physics.add.existing(zone, true);
      this.physics.add.overlap(this.player, zone, () => {
        if (!this.attempt.finished && !this.attempt.paused) {
          this.checkpoint = point;
          marker.setFillStyle(0x3a8c55);
        }
      });
    }
    for (const point of layout.items) {
      const marker = this.add.circle(point.x * TILE + 16, point.y * TILE + 16, 8, 0xe6a43b).setStrokeStyle(2, 0x8d5e18);
      const zone = this.add.zone(point.x * TILE + 16, point.y * TILE + 16, 20, 20);
      this.physics.add.existing(zone, true);
      this.physics.add.overlap(this.player, zone, () => {
        if (this.attempt.collect(`${point.x},${point.y}`)) {
          (zone.body as Phaser.Physics.Arcade.StaticBody).enable = false;
          zone.setActive(false);
          marker.setVisible(false);
        }
      });
    }
    for (const h of layout.hazards) {
      this.add.triangle(h.x * TILE + 16, h.y * TILE + 24, 0, 18, 14, 0, 28, 18, 0xd46b57);
      const zone = this.add.zone(h.x * TILE + 16, h.y * TILE + 24, 24, 16);
      this.physics.add.existing(zone, true);
      this.physics.add.overlap(this.player, zone, () => this.respawn());
    }
    this.add.rectangle(layout.finish.x * TILE + 7, layout.finish.y * TILE + 5, 4, 44, 0x244c44);
    this.add.triangle(layout.finish.x * TILE + 23, layout.finish.y * TILE - 7, 0, 0, 24, 10, 0, 20, 0xeaa849);
    const goal = this.add.zone(layout.finish.x * TILE + 16, layout.finish.y * TILE + 16, 26, 30);
    this.physics.add.existing(goal, true);
    this.physics.add.overlap(this.player, goal, () => {
      if (this.attempt.finish()) {
        this.player.setVelocity(0);
        this.physics.pause();
        this.enableKeyboard(false);
        this.onFinish(this.attempt.result());
      }
    });
    this.status = this.add.text(18, 16, '', {
      fontFamily: 'monospace', fontSize: '16px', color: '#173e36', backgroundColor: '#f3faf6', padding: { x: 10, y: 7 },
    });
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.keys = this.input.keyboard!.addKeys('A,D,W') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.addCapture(['UP', 'LEFT', 'RIGHT', 'SPACE']);
    this.ready = true;
    this.bindInputFocus();
    if (document.hidden || this.attempt.paused) this.setPaused(true);
    else {
      this.surface.focus({ preventScroll: true });
      this.enableKeyboard(true);
    }
  }

  private bindInputFocus() {
    const focus = (event: FocusEvent) => {
      const target = event.target;
      const editable = target instanceof HTMLElement &&
        (target.matches('input,select,textarea') || target.isContentEditable);
      if (editable) this.setPaused(true);
      this.enableKeyboard(this.surface.contains(document.activeElement) && !this.attempt.paused && !this.attempt.finished);
    };
    const hidden = () => { if (document.hidden) this.setPaused(true); };
    const blur = () => this.setPaused(true);
    const pointer = () => this.surface.focus({ preventScroll: true });
    document.addEventListener('focusin', focus);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', blur);
    this.surface.addEventListener('pointerdown', pointer);
    let active = true;
    this.releaseInputListeners = () => {
      if (!active) return;
      active = false;
      document.removeEventListener('focusin', focus);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', blur);
      this.surface.removeEventListener('pointerdown', pointer);
      this.enableKeyboard(false);
      this.ready = false;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.releaseInputListeners);
    this.events.once(Phaser.Scenes.Events.DESTROY, this.releaseInputListeners);
  }

  private enableKeyboard(enabled: boolean) {
    if (!this.ready) return;
    const keyboard = this.input.keyboard!;
    keyboard.resetKeys();
    keyboard.enabled = enabled;
    if (enabled) keyboard.enableGlobalCapture();
    else keyboard.disableGlobalCapture();
  }

  /** Remove DOM listeners immediately, even though Phaser destroys on its next step. */
  releaseInput() { this.releaseInputListeners?.(); }

  private respawn() {
    if (this.attempt.finished || this.attempt.paused) return;
    this.attempt.die();
    const p = this.checkpoint ?? this.level.layout.start;
    this.player.setPosition(p.x * TILE + 16, p.y * TILE + 16).setVelocity(0);
  }

  setPaused(paused: boolean) {
    if (this.attempt.finished) return;
    this.attempt.paused = paused;
    if (this.ready) {
      if (paused) {
        this.player.setVelocity(0);
        this.physics.pause();
      } else {
        this.physics.resume();
        this.surface.focus({ preventScroll: true });
      }
      this.enableKeyboard(!paused);
    }
    this.game?.events.emit('pause-changed', paused);
  }

  getContext(): GameplayHintContext {
    return buildGameplayContext(this.level, {
      position: this.ready ? { x: this.player.x / TILE - 0.5, y: this.player.y / TILE - 0.5 } : this.level.layout.start,
      checkpoint: this.checkpoint,
      ...this.attempt.result(), paused: this.attempt.paused, finished: this.attempt.finished,
    });
  }

  update(_time: number, delta: number) {
    this.attempt.tick(delta);
    this.status.setText(`${(this.attempt.elapsedMs / 1000).toFixed(1)}s   ${this.attempt.deaths} deaths   ${this.attempt.collected}/${this.attempt.totalItems} items${this.attempt.paused ? '   PAUSED' : ''}`);
    if (this.attempt.paused || this.attempt.finished) return;
    const left = this.cursors.left.isDown || this.keys.A.isDown;
    const right = this.cursors.right.isDown || this.keys.D.isDown;
    this.player.setVelocityX(left === right ? 0 : left ? -210 : 210);
    const jump = Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.keys.W);
    if (jump && (this.player.body as Phaser.Physics.Arcade.Body).blocked.down) this.player.setVelocityY(-410);
    if (this.player.y > ROWS * TILE - 30) this.respawn();
  }
}

export function mountGame(parent: HTMLElement, level: Level, onFinish: (result: RunResult) => void) {
  validateLayout(level.layout);
  const previousTabIndex = parent.getAttribute('tabindex');
  const previousLabel = parent.getAttribute('aria-label');
  parent.tabIndex = 0;
  parent.setAttribute('aria-label', 'Course keyboard controls');
  // Keyboard events are scoped to this surface, never to the global window.
  const scene = new CourseScene(structuredClone(level), onFinish, parent);
  const game = new ManagedGame({
    type: Phaser.AUTO, parent, width: COLS * TILE, height: ROWS * TILE,
    input: { keyboard: { target: parent } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 950 }, debug: false } },
    scene: [scene], render: { pixelArt: true }, banner: false,
  });
  let destroyed = false;
  return {
    game, scene,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      scene.releaseInput();
      game.releaseDomListeners();
      game.destroy(true);
      if (previousTabIndex === null) parent.removeAttribute('tabindex'); else parent.setAttribute('tabindex', previousTabIndex);
      if (previousLabel === null) parent.removeAttribute('aria-label'); else parent.setAttribute('aria-label', previousLabel);
    },
  };
}
