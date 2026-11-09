import Phaser from 'phaser';
import { TILE, ROWS, type Level, type Layout, type Point } from '../level';
import { Attempt, type RunResult } from '../attempt';
import { buildGameplayContext, type GameplayHintContext } from '../ai';
import type { ControlAction, GameOptions } from './types';

export class LegacyScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private attempt: Attempt;
  private status!: Phaser.GameObjects.Text;
  private checkpoint: Point | null = null;
  private ready = false;
  private previousJump = false;
  private lastHud = 0;
  private controls = { left: false, right: false, jump: false, fire: false };
  setControl(action: ControlAction, pressed: boolean) { this.controls[action] = pressed; }
  resumeAfterDeath() { this.setPaused(false); }
  setMuted(_muted: boolean) { /* The preserved classic renderer has no audio. */ }
  getSnapshot() { return { state: { status: this.attempt.finished ? 'complete' : this.attempt.paused ? 'paused' : 'playing', hasCheckpoint: Boolean(this.checkpoint), lives: 3 }, player: this.ready ? { x: this.player.x, y: this.player.y, velocity: { ...(this.player.body as Phaser.Physics.Arcade.Body).velocity } } : null, attempt: this.attempt.result() }; }
  private releaseInputListeners?: () => void;

  constructor(private level: Level & { layout: Layout }, private onFinish: (result: RunResult) => void, private surface: HTMLElement, private options: GameOptions = {}) {
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
        this.options.onState?.({ status: 'complete', hasCheckpoint: !!this.checkpoint, lives: 3 });
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
    this.options.onState?.({ status: 'playing', hasCheckpoint: false, lives: 3 });
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
    const changed = this.attempt.paused !== paused;
    this.attempt.paused = paused;
    this.controls = { left: false, right: false, jump: false, fire: false };
    this.previousJump = false;
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
    if (changed) this.options.onState?.({ status: paused ? 'paused' : 'playing', hasCheckpoint: !!this.checkpoint, lives: 3 });
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
    this.lastHud += delta;
    if (this.lastHud >= 100) { this.lastHud = 0; this.options.onHud?.({ ...this.attempt.result(), score: 0, lives: 3, timeLeft: 0, power: 'SMALL', star: false }); }
    this.status.setText(`${(this.attempt.elapsedMs / 1000).toFixed(1)}s   ${this.attempt.deaths} deaths   ${this.attempt.collected}/${this.attempt.totalItems} items${this.attempt.paused ? '   PAUSED' : ''}`);
    if (this.attempt.paused || this.attempt.finished) return;
    const left = this.cursors.left.isDown || this.keys.A.isDown || this.controls.left;
    const right = this.cursors.right.isDown || this.keys.D.isDown || this.controls.right;
    this.player.setVelocityX(left === right ? 0 : left ? -210 : 210);
    const jump = Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.cursors.space) || Phaser.Input.Keyboard.JustDown(this.keys.W) || (this.controls.jump && !this.previousJump);
    this.previousJump = this.controls.jump;
    if (jump && (this.player.body as Phaser.Physics.Arcade.Body).blocked.down) this.player.setVelocityY(-410);
    if (this.player.y > ROWS * TILE - 30) this.respawn();
  }
}
