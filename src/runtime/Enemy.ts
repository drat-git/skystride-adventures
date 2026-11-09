// Patrol/ledge detection/knockback ported from Astro Hop Walker.js (MIT).
// Sky turtles, wings and shells extend those same contact rules.
import Phaser from 'phaser';
import type { Enemy as EnemySpec } from '../course-format';

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  mode: 'walker' | 'turtle' | 'winged' | 'shell' | 'defeated';
  direction: -1 | 1;
  shellMoving = false;
  contactGraceUntil = 0;
  private wings?: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene, readonly spec: EnemySpec) {
    super(scene, spec.x * 18 + 9, (spec.y + 1) * 18 - 12, spec.kind === 'walker' ? 'chars' : 'turtle-0', spec.kind === 'walker' ? 18 : undefined);
    scene.add.existing(this); scene.physics.add.existing(this);
    this.mode = spec.kind; this.direction = spec.direction;
    this.body.setSize(16, 14).setOffset(4, 10); this.setDepth(1).setCollideWorldBounds(true);
    this.anims.play(spec.kind === 'walker' ? 'walker-walk' : 'turtle-walk');
    if (this.mode === 'winged') {
      this.wings = scene.add.image(this.x, this.y - 6, 'wings-0').setDepth(.9);
      if (spec.behavior !== 'hop') this.body.setAllowGravity(false);
    }
  }
  step(time: number) {
    if (this.mode === 'defeated') return;
    if (this.wings) this.wings.setPosition(this.x, this.y - 6).setTexture(`wings-${Math.floor(time / 140) % 2}`);
    const camera = this.scene.cameras.main;
    if (Math.abs(this.x - camera.midPoint.x) > 1100) { this.setVelocity(0); return; }
    // Overlap-only player/shell contacts also set `touching`; only a resolved
    // solid collision may turn an actor, otherwise a kick reverses itself.
    if (this.body.blocked.left) this.direction = 1;
    else if (this.body.blocked.right) this.direction = -1;
    if (this.mode === 'winged' && this.spec.behavior !== 'hop') {
      const horizontal = this.spec.behavior === 'horizontal';
      if (!horizontal) {
        if (this.body.blocked.up) this.direction = 1;
        else if (this.body.blocked.down) this.direction = -1;
      }
      const origin = horizontal ? this.spec.x * 18 + 9 : (this.spec.y + 1) * 18 - 12;
      const position = horizontal ? this.x : this.y;
      const worldEnd = horizontal ? this.scene.physics.world.bounds.width - 12 : 426;
      const min = Math.max(12, origin - this.spec.range * 9), max = Math.min(worldEnd, origin + this.spec.range * 9);
      if (position <= min) this.direction = 1; if (position >= max) this.direction = -1;
      this.setVelocity(horizontal ? this.direction * this.spec.speed : 0, horizontal ? 0 : this.direction * this.spec.speed);
    } else if (this.mode === 'shell') {
      this.setVelocityX(this.shellMoving ? this.direction * 300 : 0);
    } else {
      if (this.body.onFloor()) {
        if (this.mode === 'winged') this.setVelocityY(-280);
        else {
          const ahead = this.direction > 0 ? this.body.right + 2 : this.body.left - 3;
          if (!this.scene.physics.overlapRect(ahead, this.body.bottom + 2, 2, 4, false, true).length) this.direction = this.direction === 1 ? -1 : 1;
        }
      }
      this.setVelocityX(this.direction * this.spec.speed);
    }
    this.setFlipX(this.direction > 0);
    if (this.y > 550) this.destroy();
  }
  stomp() {
    if (this.mode === 'winged') {
      this.mode = 'turtle'; this.wings?.destroy(); this.wings = undefined;
      this.body.setAllowGravity(true); this.setVelocity(0); return;
    }
    if (this.mode === 'turtle') {
      this.mode = 'shell'; this.anims.stop(); this.setTexture('shell').setVelocityX(0); this.shellMoving = false; return;
    }
    if (this.mode === 'shell') { this.shellMoving = false; this.setVelocityX(0); return; }
    this.mode = 'defeated'; this.anims.stop(); this.setFrame(20); this.body.checkCollision.none = true; this.setVelocity(0); this.body.setAllowGravity(false);
    this.scene.tweens.add({ targets: this, alpha: 0, delay: 300, duration: 200, onComplete: () => this.destroy() });
  }
  kick(fromX: number, time: number) {
    this.direction = fromX < this.x ? 1 : -1; this.shellMoving = true; this.contactGraceUntil = time + 220; this.setVelocityX(this.direction * 300);
  }
  knockAway(fromX: number) {
    if (this.mode === 'defeated') return;
    this.mode = 'defeated'; this.wings?.destroy(); this.wings = undefined; this.anims.stop(); this.body.checkCollision.none = true;
    this.body.setAllowGravity(true); this.setCollideWorldBounds(false).setFlipY(true).setVelocity(this.x < fromX ? -120 : 120, -280).setAngularVelocity(240);
    this.scene.time.delayedCall(900, () => this.destroy());
  }
  destroy(fromScene?: boolean) { this.wings?.destroy(); this.wings = undefined; super.destroy(fromScene); }
}
