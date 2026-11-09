// Port of Astro Hop src/objects/Player.js, MIT ©2026 Nuno Amorim.
import Phaser from 'phaser';
import { PHYSICS, playerBody, type PowerState } from './types';
import type { AudioEngine } from './AudioEngine';

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  powerState: PowerState = 'SMALL';
  starUntil = 0; invulnerable = false; isTransforming = false; isDead = false;
  private wasOnFloor = true;
  private stretch?: Phaser.Tweens.Tween;
  constructor(scene: Phaser.Scene, x: number, y: number, private audio: AudioEngine, private freeze: (active: boolean) => void, private activeTime: () => number) {
    super(scene, x, y, 'chars', 0);
    scene.add.existing(this); scene.physics.add.existing(this);
    this.setDepth(2).setCollideWorldBounds(true);
    this.body.setMaxVelocity(PHYSICS.speed, PHYSICS.fallSpeed).setDragX(PHYSICS.drag);
    this.applyState();
  }
  get starActive() { return this.activeTime() < this.starUntil; }
  get animPrefix() { return this.powerState === 'FIRE' ? 'fire' : 'player'; }
  get baseScale() { return this.powerState === 'SMALL' ? 1 : PHYSICS.bigScale; }
  syncBodyToScale() {
    const b = playerBody(this.powerState, this.scaleX, this.scaleY);
    this.body.setSize(b.width, b.height).setOffset(b.x, b.y);
    // Source divides out visual scale; refresh Arcade's cached scale immediately
    // so a tween/input frame cannot temporarily expose an unscaled hitbox.
    this.body.updateBounds();
  }
  applyState() { this.setScale(this.baseScale); this.syncBodyToScale(); }
  squashStretch(x: number, y: number) {
    if (this.isTransforming) return;
    this.stretch?.stop(); this.setScale(this.baseScale * x, this.baseScale * y); this.syncBodyToScale();
    this.stretch = this.scene.tweens.add({ targets: this, scaleX: this.baseScale, scaleY: this.baseScale, duration: 140, ease: 'Quad.easeOut', onUpdate: () => this.syncBodyToScale(), onComplete: () => this.syncBodyToScale() });
  }
  changeState(state: PowerState) {
    if (this.isTransforming || this.powerState === state) return;
    this.isTransforming = true; this.stretch?.stop();
    const feet = this.y + 12 * this.baseScale;
    this.powerState = state; this.applyState(); this.y = feet - 12 * this.baseScale; this.body.reset(this.x, this.y);
    this.freeze(true); const scale = this.baseScale; this.setScale(scale * .75);
    this.scene.tweens.add({ targets: this, scale, duration: 120, yoyo: true, repeat: 1, onComplete: () => {
      this.setScale(scale); this.syncBodyToScale(); this.isTransforming = false; this.freeze(false);
    } });
  }
  downgrade() {
    this.changeState(this.powerState === 'FIRE' ? 'BIG' : 'SMALL'); this.invulnerable = true;
    this.scene.tweens.add({ targets: this, alpha: .3, duration: 100, yoyo: true, repeat: PHYSICS.hurtDuration / 200 - 1, onComplete: () => { this.setAlpha(1); this.invulnerable = false; } });
  }
  startStar() { this.starUntil = this.activeTime() + PHYSICS.starDuration; }
  die() {
    this.isDead = true; this.body.checkCollision.none = true; this.setCollideWorldBounds(false);
    this.body.setAccelerationX(0).setDragX(0).setVelocity(0, -420); this.setFlipY(true); this.anims.play(`${this.animPrefix}-jump`);
  }
  handleInput(left: boolean, right: boolean, jumpHeld: boolean, jumpPressed: boolean) {
    if (this.isDead || this.isTransforming) return;
    const body = this.body, grounded = body.onFloor();
    body.setAccelerationX(left === right ? 0 : left ? -PHYSICS.acceleration : PHYSICS.acceleration);
    if (left !== right) this.setFlipX(left);
    if (jumpPressed && grounded) { body.setVelocityY(PHYSICS.jump); this.audio.play('jump'); this.squashStretch(.82, 1.18); }
    if (!jumpHeld && body.velocity.y < PHYSICS.jumpCut) body.setVelocityY(PHYSICS.jumpCut);
    body.setGravityY(body.velocity.y > 0 ? PHYSICS.extraFallGravity : 0);
    this.anims.play(`${this.animPrefix}-${!grounded ? 'jump' : Math.abs(body.velocity.x) > 10 ? 'run' : 'idle'}`, true);
  }
  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.isDead && this.body) {
      const floor = this.body.onFloor(); if (floor && !this.wasOnFloor) this.squashStretch(1.18, .82); this.wasOnFloor = floor;
    }
    if (this.starUntil > 0) {
      const remaining = this.starUntil - this.activeTime();
      if (remaining <= 0) { this.starUntil = 0; this.clearTint(); }
      else this.setTint([0xffffff, 0xffe066, 0x66e0ff, 0xff8de1, 0x9dff8d, 0xffa05c][Math.floor(this.activeTime() / (remaining < 2000 ? 45 : 90)) % 6]);
    }
  }
}
