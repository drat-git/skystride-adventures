// Source-derived Astro Hop gameplay, integrated with SkyStride's run lifecycle.
import Phaser from 'phaser';
import type { Level } from '../level';
import type { Block, LayoutV2, PowerupKind, MovingPlatform } from '../course-format';
import { buildGameplayContext } from '../ai';
import { prefersReducedMotion } from '../settings';
import { createAssets, preloadAssets } from './assets';
import { AudioEngine } from './AudioEngine';
import { Player } from './Player';
import { Enemy } from './Enemy';
import { RunModel } from './RunModel';
import type { CompletionResult, ControlAction, GameOptions, RunHud } from './types';

type Static = Phaser.Physics.Arcade.StaticGroup;
type Sprite = Phaser.Physics.Arcade.Sprite;
type BlockSprite = Sprite & { spec: Block; identity: string; used: boolean };
type Moving = { sprite: Sprite; spec: MovingPlatform; startX: number; startY: number; direction: 1 | -1 };
const center = (n: number) => n * 18 + 9;
const bodyOf = (object: Phaser.GameObjects.GameObject) => (object as Sprite).body as Phaser.Physics.Arcade.Body;

export class CourseScene extends Phaser.Scene {
  private layout: LayoutV2;
  private model: RunModel;
  private player!: Player;
  private solids!: Static;
  private blocks!: Static;
  private enemies!: Phaser.Physics.Arcade.Group;
  private powers!: Phaser.Physics.Arcade.Group;
  private fireballs!: Phaser.Physics.Arcade.Group;
  private movingGroup!: Phaser.Physics.Arcade.Group;
  private moving: Moving[] = [];
  private blockSprites: BlockSprite[] = [];
  private audio = new AudioEngine();
  private hills?: Phaser.GameObjects.TileSprite;
  private releaseListeners?: () => void;
  private controls: Record<ControlAction, boolean> = { left: false, right: false, jump: false, fire: false };
  private keysHeld = new Set<string>();
  private presses = new Set<ControlAction>();
  private jumpHeld = false; private fireHeld = false;
  private ready = false; private transforming = false; private deathReady = false;
  private lastHud = -Infinity; private runTime = 0;
  private flag!: Phaser.GameObjects.Sprite;
  private finishNotified = false;

  constructor(private level: Level & { layout: LayoutV2 }, private onFinish: (result: CompletionResult) => void, private surface: HTMLElement, private options: GameOptions = {}) {
    super('course'); this.layout = level.layout; this.model = new RunModel(this.layout);
  }
  preload() { preloadAssets(this); }
  create() {
    this.ready = false; this.transforming = false; this.deathReady = false; this.moving = []; this.blockSprites = []; this.lastHud = -Infinity; this.runTime = 0;
    // Scene restarts retain Arcade's world; a death-menu pause must not survive
    // into the new checkpoint scene.
    this.physics.resume(); this.time.paused = false; this.tweens.resumeAll();
    this.keysHeld.clear(); this.clearControls(); this.audio = new AudioEngine();
    createAssets(this);
    const worldWidth = this.layout.cols * 18;
    this.physics.world.setBounds(0, 0, worldWidth, 450, true, true, true, false);
    this.cameras.main.setBounds(0, 0, worldWidth, 450).setBackgroundColor(this.layout.theme === 'cave' ? '#12122a' : this.layout.theme === 'sky' ? '#8dbbe9' : '#5c94fc');
    this.buildBackground(worldWidth);
    this.solids = this.physics.add.staticGroup(); this.blocks = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group(); this.powers = this.physics.add.group(); this.fireballs = this.physics.add.group();
    this.movingGroup = this.physics.add.group({ allowGravity: false, immovable: true, frictionX: 1 });
    this.buildWorld();
    const spawn = this.model.checkpoint ?? this.layout.start;
    this.player = new Player(this, center(spawn.x), (spawn.y + 1) * 18 - 12, this.audio, active => {
      this.transforming = active;
      if (active) this.physics.pause();
      else if (this.model.status === 'playing') this.physics.resume();
    }, () => this.runTime);
    this.physics.add.collider(this.player, this.solids);
    this.physics.add.collider(this.player, this.blocks, (_p, b) => this.hitBlock(b as BlockSprite));
    this.physics.add.collider(this.player, this.movingGroup);
    for (const spec of this.layout.enemies) { const enemy = new Enemy(this, spec); this.enemies.add(enemy); enemy.setCollideWorldBounds(true); if (spec.kind === 'winged' && spec.behavior !== 'hop') enemy.body.setAllowGravity(false); }
    this.physics.add.collider(this.enemies, this.solids); this.physics.add.collider(this.enemies, this.blocks); this.physics.add.collider(this.enemies, this.movingGroup);
    this.physics.add.overlap(this.player, this.enemies, (_p, enemy) => this.touchEnemy(enemy as Enemy));
    this.physics.add.overlap(this.enemies, this.enemies, (a, b) => this.shellContact(a as Enemy, b as Enemy));
    this.physics.add.collider(this.powers, this.solids); this.physics.add.collider(this.powers, this.blocks); this.physics.add.collider(this.powers, this.movingGroup);
    this.physics.add.overlap(this.player, this.powers, (_p, item) => this.collectPower(item as Sprite));
    this.physics.add.collider(this.fireballs, this.solids, ball => this.bounceFire(ball as Sprite));
    this.physics.add.collider(this.fireballs, this.blocks, ball => this.bounceFire(ball as Sprite));
    this.physics.add.collider(this.fireballs, this.movingGroup, ball => this.bounceFire(ball as Sprite));
    this.physics.add.overlap(this.fireballs, this.enemies, (ball, mob) => {
      const enemy = mob as Enemy; if (this.model.status !== 'playing' || enemy.mode === 'defeated') return;
      enemy.knockAway((ball as Sprite).x); this.model.score += 100; this.popup(enemy.x, enemy.y, '100'); this.poof(ball as Sprite);
    });
    for (const spec of this.layout.powerups) this.spawnPower(center(spec.x), center(spec.y), spec.kind, false);
    this.buildInteractions();
    this.cameras.main.startFollow(this.player, true, .12, .12);
    if (!prefersReducedMotion()) this.cameras.main.fadeIn(250);
    this.bindInput(); this.ready = true;
    if (this.model.status === 'paused' || document.hidden) this.setPaused(true);
    else if (!this.options.demo) this.surface.focus({ preventScroll: true });
    this.audio.startMusic(this.layout.theme);
    this.emitState(); this.emitHud();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.releaseInput(); this.audio.dispose(); this.ready = false; });
  }

  private addSolid(x: number, y: number, width: number, height = 1) {
    const zone = this.add.zone((x + width / 2) * 18, (y + height / 2) * 18, width * 18, height * 18);
    this.physics.add.existing(zone, true); this.solids.add(zone);
  }
  private platform(x: number, y: number, width: number, moving = false) {
    for (let i = 0; i < width; i++) {
      const image = this.add.image(center(x + i), center(y), 'tiles', width === 1 ? 76 : i === 0 ? 77 : i === width - 1 ? 79 : 78);
      if (this.layout.theme === 'sky') image.setTint(0xd6e6ff);
      if (moving) image.setData('moving-offset', i * 18 - (width - 1) * 9);
    }
  }
  private buildWorld() {
    const terrain = new Set<string>();
    for (const run of this.layout.terrain) for (let x = run.x; x < run.x + run.width; x++) terrain.add(`${x},${run.y}`);
    for (const cell of terrain) {
      const [x, y] = cell.split(',').map(Number), top = !terrain.has(`${x},${y - 1}`);
      if (this.layout.theme === 'sky') this.add.image(center(x), center(y), top ? 'sky-top' : 'sky-fill');
      else this.add.image(center(x), center(y), 'tiles', this.layout.theme === 'cave' ? top ? 42 : 142 : top ? 2 : 122);
    }
    // Merge row bodies to avoid collisions at decorative tile seams.
    for (let y = 0; y < 25; y++) {
      for (let x = 0; x < this.layout.cols;) {
        if (!terrain.has(`${x},${y}`)) { x++; continue; }
        const start = x; while (terrain.has(`${x},${y}`)) x++; this.addSolid(start, y, x - start);
      }
    }
    for (const p of this.layout.platforms) { this.platform(p.x, p.y, p.width); this.addSolid(p.x, p.y, p.width); }
    for (const p of this.layout.obstacles) {
      for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) {
        const img = this.add.image(center(p.x + x), center(p.y + y), `stone-${p.kind}`);
        if (this.layout.theme !== 'cave') img.setTint(this.layout.theme === 'sky' ? 0xc4d5f4 : 0xc7c3b7);
      }
      this.addSolid(p.x, p.y, p.width, p.height);
    }
    for (const b of this.layout.blocks) {
      const identity = `block:${b.x},${b.y}`; if (this.model.broken.has(identity)) continue;
      const used = this.model.consumed.has(identity);
      const sprite = this.blocks.create(center(b.x), center(b.y), b.kind === 'glow' && !used ? 'glow-block' : 'tiles', b.kind === 'glow' && !used ? undefined : used ? 31 : b.kind === 'solid' ? 31 : 6) as BlockSprite;
      sprite.spec = b; sprite.identity = identity; sprite.used = used;
      if (b.kind === 'hidden' && !used) { sprite.setVisible(false); sprite.body!.enable = false; }
      this.blockSprites.push(sprite);
    }
    for (const spec of this.layout.movingPlatforms) {
      const sprite = this.physics.add.sprite((spec.x + spec.width / 2) * 18, center(spec.y), 'tiles', 78).setVisible(false).setImmovable(true);
      sprite.body!.setSize(spec.width * 18, 18); this.movingGroup.add(sprite);
      const art: Phaser.GameObjects.Image[] = [];
      for (let i = 0; i < spec.width; i++) art.push(this.add.image(sprite.x + (i - (spec.width - 1) / 2) * 18, sprite.y, 'tiles', spec.width === 1 ? 76 : i === 0 ? 77 : i === spec.width - 1 ? 79 : 78).setTint(this.layout.theme === 'sky' ? 0xd6e6ff : 0xffffff));
      sprite.setData('art', art);
      this.moving.push({ sprite, spec, startX: sprite.x, startY: sprite.y, direction: 1 });
    }
    for (const deco of this.layout.decorations) {
      const frames = { sign: 86, bush: 125, pine: 126, sprout: 124, cloud: 156, crystal: 67, ruin: 44, door: 150, terrain: 122 };
      const image = this.add.image(center(deco.x), center(deco.y), deco.kind === 'ruin' ? 'stone-ruin' : 'tiles', deco.kind === 'ruin' ? undefined : frames[deco.kind]).setDepth(-1);
      if (deco.kind === 'door') this.add.image(center(deco.x), center(deco.y - 1), 'tiles', 130).setDepth(-1);
      if (deco.kind === 'cloud') image.setScale(2);
      if (deco.kind === 'crystal') image.setTint(0xc8baff);
    }
  }
  private buildBackground(width: number) {
    this.hills = undefined;
    if (this.layout.theme === 'cave') return;
    if (this.layout.theme === 'overworld') this.hills = this.add.tileSprite(this.scale.width / 2, 378, Math.ceil(this.scale.width / 3), 24, 'hills').setScale(3).setScrollFactor(0).setDepth(-10);
    const span = this.scale.width + (width - this.scale.width) * .2;
    for (let x = 70; x < span + 200; x += 200) {
      const y = 50 + ((x * 13) % 80);
      for (let n = 0; n < 3; n++) this.add.image(x + n * 36, y, 'tiles', 153 + n).setScale(2).setScrollFactor(.2).setDepth(-9).setAlpha(this.layout.theme === 'sky' ? .85 : 1);
    }
  }

  private buildInteractions() {
    for (const p of this.layout.items) {
      const id = `coin:${p.x},${p.y}`; if (this.model.consumed.has(id)) continue;
      const sprite = this.physics.add.staticSprite(center(p.x), center(p.y), 'tiles', 151).play('coin-spin');
      this.physics.add.overlap(this.player, sprite, () => {
        if (!this.model.collect(id)) return;
        sprite.body.enable = false; this.audio.play('coin'); this.sparkle(sprite.x, sprite.y);
        this.tweens.add({ targets: sprite, y: sprite.y - 24, scale: 1.4, alpha: 0, duration: 250, ease: 'Cubic.easeOut', onComplete: () => sprite.destroy() });
      });
    }
    for (const p of this.layout.checkpoints) {
      const active = this.model.checkpoint?.x === p.x && this.model.checkpoint.y === p.y;
      const marker = this.add.image(center(p.x), center(p.y), 'tiles', 111).setTint(active ? 0x7dffab : 0x86d7ff);
      const sensor = this.add.zone(center(p.x), center(p.y), 18, 24); this.physics.add.existing(sensor, true);
      this.physics.add.overlap(this.player, sensor, () => {
        if (this.model.status !== 'playing' || this.model.checkpoint?.x === p.x && this.model.checkpoint.y === p.y) return;
        this.model.checkpoint = { ...p }; marker.setTint(0x7dffab); this.popup(marker.x, marker.y, 'CHECKPOINT'); this.emitState();
      });
    }
    for (const h of this.layout.hazards) {
      for (let i = 0; i < h.width; i++) this.add.image(center(h.x + i), center(h.y), h.kind === 'spike' ? 'spikes' : 'tiles', h.kind === 'lava' ? 142 : undefined).setTint(h.kind === 'lava' ? 0xff674b : 0xffffff);
      const sensor = this.add.zone((h.x + h.width / 2) * 18, center(h.y) + 3, h.width * 18 - 4, 12); this.physics.add.existing(sensor, true);
      this.physics.add.overlap(this.player, sensor, () => h.kind === 'lava' ? this.die('Fell into lava') : this.hurt());
    }
    const bottom = (this.layout.finish.y + 1) * 18, top = bottom - this.layout.finishHeight * 18;
    for (let y = top + 9; y < bottom; y += 18) this.add.image(center(this.layout.finish.x), y, 'tiles', 131);
    this.flag = this.add.sprite(center(this.layout.finish.x) + 9, top + 9, 'tiles', 111).play('flag-wave');
    const sensor = this.add.zone(center(this.layout.finish.x), (top + bottom) / 2, 10, bottom - top); this.physics.add.existing(sensor, true);
    this.physics.add.overlap(this.player, sensor, () => this.finish(top, bottom));
  }

  private hitBlock(block: BlockSprite) {
    if (this.model.status !== 'playing' || this.player.isDead || !this.player.body.touching.up || block.y >= this.player.y) return;
    if (block.spec.kind === 'breakable' && this.player.powerState !== 'SMALL') {
      this.model.broken.add(block.identity); block.disableBody(true, true); this.audio.play('break'); this.model.score += 50;
      if (!prefersReducedMotion()) this.cameras.main.shake(110, .006);
      for (const [vx, vy] of [[-60, -280], [60, -280], [-110, -180], [110, -180]]) {
        const piece = this.physics.add.image(block.x, block.y, 'tiles', 6).setScale(.5).setVelocity(vx, vy).setAngularVelocity(vx * 3);
        this.tweens.add({ targets: piece, alpha: 0, delay: 250, duration: 450, onComplete: () => piece.destroy() });
      }
      return;
    }
    this.audio.play('bump');
    if (block.spec.kind === 'solid' || block.used || block.getData('bumping')) return;
    block.setData('bumping', true);
    this.tweens.add({ targets: block, y: block.y - 6, duration: 70, yoyo: true, ease: 'Quad.easeOut', onComplete: () => block.setData('bumping', false) });
    // Enemies standing over a bumped block are defeated, like source blocks.
    for (const obj of this.enemies.getChildren()) {
      const enemy = obj as Enemy;
      if (enemy.mode !== 'defeated' && Math.abs(enemy.x - block.x) < 19 && Math.abs(enemy.body.bottom - (block.y - 9)) < 8) { enemy.knockAway(this.player.x); this.model.score += 100; }
    }
    if (block.spec.content === 'none') return;
    block.used = true; block.setTexture('tiles', 31);
    if (block.spec.content === 'coin') {
      this.model.collect(block.identity); this.audio.play('coin');
      const coin = this.add.sprite(block.x, block.y - 18, 'tiles', 151).play('coin-spin');
      this.tweens.add({ targets: coin, y: coin.y - 30, duration: 200, yoyo: true, onComplete: () => coin.destroy() }); this.popup(block.x, block.y - 18, '100');
    } else {
      this.model.consumed.add(block.identity);
      const kind = block.spec.content === 'adaptive' ? this.player.powerState === 'SMALL' ? 'growth' : 'fire' : block.spec.content;
      this.spawnPower(block.x, block.y, kind, true);
    }
  }
  private spawnPower(x: number, y: number, kind: PowerupKind, emerge: boolean) {
    const texture = kind === 'growth' ? 'tiles' : kind === 'fire' ? 'gem-fire' : 'gem-star';
    const sprite = this.powers.create(x, y, texture, kind === 'growth' ? 128 : undefined) as Sprite;
    sprite.setData('kind', kind).setDepth(emerge ? -1 : 1).setCollideWorldBounds(true).setBounceX(1);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(kind === 'star' ? 12 : 14, kind === 'star' ? 12 : 14).setOffset(kind === 'star' ? 3 : 2, kind === 'star' ? 3 : 4);
    const activate = () => { body.enable = true; body.reset(sprite.x, sprite.y); sprite.setDepth(1); body.setAllowGravity(kind !== 'fire'); sprite.setVelocity(kind === 'fire' ? 0 : kind === 'star' ? 110 : 60, kind === 'star' ? -240 : 0); };
    if (emerge) { body.enable = false; this.tweens.add({ targets: sprite, y: y - 18, duration: 450, ease: 'Sine.easeOut', onComplete: activate }); }
    else activate();
  }
  private collectPower(sprite: Sprite) {
    if (this.model.status !== 'playing' || this.player.isDead || !sprite.body?.enable || this.player.isTransforming) return;
    const kind = sprite.getData('kind') as PowerupKind; sprite.disableBody(true, true); sprite.destroy();
    this.model.score += 1000; this.popup(this.player.x, this.player.y, '1000'); this.audio.play('powerup');
    if (kind === 'growth' && this.player.powerState === 'SMALL') this.player.changeState('BIG');
    if (kind === 'fire') this.player.changeState(this.player.powerState === 'SMALL' ? 'BIG' : 'FIRE');
    if (kind === 'star') this.player.startStar();
    this.model.observePower(this.player.powerState, this.player.starActive);
  }
  private touchEnemy(enemy: Enemy) {
    if (this.model.status !== 'playing' || this.player.isDead || enemy.mode === 'defeated' || this.player.isTransforming) return;
    if (this.player.starActive) { enemy.knockAway(this.player.x); this.model.score += 200; this.popup(enemy.x, enemy.y, '200'); return; }
    if (enemy.contactGraceUntil > this.runTime) return;
    const stomp = this.player.body.velocity.y > 0 && this.player.body.bottom < enemy.body.center.y + 4;
    if (stomp) {
      enemy.stomp(); enemy.contactGraceUntil = this.runTime + 220; this.player.setVelocityY(-300); this.model.score += 100; this.audio.play('stomp'); this.popup(enemy.x, enemy.y, '100');
      if (!prefersReducedMotion()) this.cameras.main.shake(70, .004);
    } else if (enemy.mode === 'shell' && !enemy.shellMoving) { enemy.kick(this.player.x, this.runTime); this.audio.play('stomp'); }
    else if (enemy.contactGraceUntil <= this.runTime) this.hurt();
  }
  private shellContact(a: Enemy, b: Enemy) {
    if (this.model.status !== 'playing' || a === b || a.mode === 'defeated' || b.mode === 'defeated') return;
    if (a.mode === 'shell' && a.shellMoving) { b.knockAway(a.x); this.model.score += 200; this.popup(b.x, b.y, '200'); }
    else if (b.mode === 'shell' && b.shellMoving) { a.knockAway(b.x); this.model.score += 200; this.popup(a.x, a.y, '200'); }
  }
  private hurt() {
    if (this.model.status !== 'playing' || this.player.isDead || this.player.invulnerable || this.player.isTransforming || this.player.starActive) return;
    if (this.player.powerState === 'SMALL') this.die('Hit an enemy or hazard');
    else { this.audio.play('hurt'); this.player.downgrade(); }
  }
  private shoot() {
    if (this.player.powerState !== 'FIRE' || this.player.isTransforming || this.fireballs.countActive() >= 2) return;
    const direction = this.player.flipX ? -1 : 1;
    const ball = this.fireballs.create(this.player.x + direction * 14, this.player.y, 'fireball') as Sprite;
    ball.setCircle(5).setVelocity(direction * 300, 80).setAngularVelocity(direction * 600).setDepth(2); this.audio.play('fireball');
    this.time.delayedCall(3000, () => { if (ball.active) this.poof(ball); });
  }
  private bounceFire(ball: Sprite) { if (!ball.body?.enable) return; const body = ball.body as Phaser.Physics.Arcade.Body; if (body.blocked.left || body.blocked.right || body.touching.left || body.touching.right) this.poof(ball); else if (body.blocked.down || body.touching.down) ball.setVelocityY(-170); }
  private poof(ball: Sprite) { if (!ball.body?.enable) return; ball.body.enable = false; ball.setActive(false); this.tweens.add({ targets: ball, scale: 1.8, alpha: 0, duration: 120, onComplete: () => ball.destroy() }); }
  private popup(x: number, y: number, text: string) {
    const label = this.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', stroke: '#172038', strokeThickness: 3 }).setOrigin(.5).setDepth(20);
    this.tweens.add({ targets: label, y: y - 28, alpha: 0, duration: 600, onComplete: () => label.destroy() });
  }
  private sparkle(x: number, y: number) {
    if (prefersReducedMotion()) return;
    const emitter = this.add.particles(x, y, 'spark', { speed: { min: 50, max: 150 }, lifespan: 350, scale: { start: 1.3, end: 0 }, emitting: false, maxParticles: 8 }).setDepth(3);
    emitter.explode(8); this.time.delayedCall(500, () => emitter.destroy());
  }

  private die(reason: string) {
    if (!this.model.die(reason)) return;
    this.clearControls(); this.audio.stopMusic(); this.audio.play('death'); this.player.die(); this.cameras.main.stopFollow();
    this.time.delayedCall(1800, () => {
      if (this.options.demo) { this.model = new RunModel(this.layout); this.scene.restart(); return; }
      this.deathReady = true; this.physics.pause(); this.emitState(); this.emitHud();
    });
  }
  resumeAfterDeath() {
    if (!this.deathReady || !this.model.resume()) return;
    this.ready = false;
    this.scene.restart();
  }
  private finish(top: number, bottom: number) {
    this.model.observePower(this.player.powerState, this.player.starActive);
    if (!this.model.finish()) return;
    const ratio = Phaser.Math.Clamp((bottom - this.player.body.bottom) / (bottom - top), 0, 1);
    this.model.score += 100 + Math.round(ratio * 49) * 100 + Math.ceil(this.model.remainingMs / 1000) * 50;
    const completed = this.model.result();
    this.clearControls(); this.audio.stopMusic(); this.audio.play('flag'); this.player.body.enable = false;
    this.player.x = center(this.layout.finish.x) + 10; this.player.setFlipX(true).play(`${this.player.animPrefix}-jump`);
    this.tweens.add({ targets: this.flag, y: bottom - 18, duration: 700 });
    this.tweens.add({ targets: this.player, y: bottom - 12 * this.player.baseScale, duration: 400 + ratio * 500, onComplete: () => {
      this.player.setFlipX(false).play(`${this.player.animPrefix}-run`);
      this.tweens.add({ targets: this.player, x: Math.min(this.layout.cols * 18 - 20, this.player.x + 54), duration: 450, onComplete: () => {
        this.player.play(`${this.player.animPrefix}-idle`); this.physics.pause();
        if (this.options.demo) { this.time.delayedCall(700, () => { this.model = new RunModel(this.layout); this.scene.restart(); }); return; }
        this.emitState(); this.emitHud();
        if (!this.finishNotified) { this.finishNotified = true; this.onFinish(completed); }
      } });
    } });
  }

  private clearControls() { for (const key of Object.keys(this.controls) as ControlAction[]) this.controls[key] = false; this.keysHeld.clear(); this.presses.clear(); this.jumpHeld = false; this.fireHeld = false; }
  setControl(action: ControlAction, pressed: boolean) { if (this.model.status === 'playing' && !this.options.demo) { if (pressed && !this.controls[action]) this.presses.add(action); this.controls[action] = pressed; if (pressed) this.audio.unlock(); } }
  setMuted(muted: boolean) { this.audio.setMuted(muted); }
  private bindInput() {
    const actions: Record<string, ControlAction> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyX: 'fire', KeyJ: 'fire' };
    const keyDown = (event: KeyboardEvent) => {
      if (this.options.demo || this.model.status !== 'playing' || !actions[event.code]) return;
      if (event.target instanceof HTMLElement && (event.target.matches('input,select,textarea,button') || event.target.isContentEditable)) return;
      event.preventDefault(); if (!this.keysHeld.has(event.code)) this.presses.add(actions[event.code]); this.keysHeld.add(event.code); this.audio.unlock();
    };
    const keyUp = (event: KeyboardEvent) => { this.keysHeld.delete(event.code); };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Node && !this.surface.contains(event.target)) this.clearControls();
      if (event.target instanceof HTMLElement && (event.target.matches('input,select,textarea') || event.target.isContentEditable)) this.setPaused(true);
    };
    const hidden = () => { if (document.hidden) this.setPaused(true); else if (this.options.demo) this.setPaused(false); };
    const blur = () => this.setPaused(true);
    const focusWindow = () => { if (this.options.demo && !document.hidden) this.setPaused(false); };
    const pointer = () => { if (!this.options.demo) { this.surface.focus({ preventScroll: true }); this.audio.unlock(); } };
    this.surface.addEventListener('keydown', keyDown); this.surface.addEventListener('keyup', keyUp);
    this.surface.addEventListener('pointerdown', pointer); document.addEventListener('focusin', focus); document.addEventListener('visibilitychange', hidden); window.addEventListener('blur', blur); window.addEventListener('focus', focusWindow);
    let active = true;
    this.releaseListeners = () => {
      if (!active) return; active = false; this.clearControls();
      this.surface.removeEventListener('keydown', keyDown); this.surface.removeEventListener('keyup', keyUp); this.surface.removeEventListener('pointerdown', pointer);
      document.removeEventListener('focusin', focus); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', blur); window.removeEventListener('focus', focusWindow);
    };
  }
  releaseInput() { this.releaseListeners?.(); this.audio.dispose(); }
  setPaused(paused: boolean) {
    const previous = this.model.status;
    if (!this.model.pause(paused)) return;
    this.clearControls();
    if (this.ready) {
      if (paused) { this.physics.pause(); this.time.paused = true; this.tweens.pauseAll(); this.audio.suspend(); }
      else {
        this.time.paused = false; this.tweens.resumeAll(); if (!this.transforming) this.physics.resume();
        if (!this.options.demo) this.surface.focus({ preventScroll: true }); this.audio.unlock(); this.audio.startMusic(this.layout.theme);
      }
      for (const child of this.children.list) if (child instanceof Phaser.GameObjects.Sprite) paused ? child.anims.pause() : child.anims.resume();
    }
    if (previous !== this.model.status) { this.game?.events.emit('pause-changed', paused); this.emitState(); this.emitHud(); }
  }
  private emitState() { this.options.onState?.(this.model.state()); }
  private emitHud() {
    if (!this.player) return;
    const hud: RunHud = { ...this.model.attempt.result(), score: this.model.score, timeLeft: Math.ceil(this.model.remainingMs / 1000), power: this.player.powerState, star: this.player.starActive };
    this.options.onHud?.(hud);
  }
  getContext() {
    const x=this.player?this.player.x/18-.5:this.layout.start.x;
    const nearby=<T extends {x:number;y:number}>(list:T[])=>list.filter(p=>p.x>=x-12&&p.x<=x+28).sort((a,b)=>Math.abs(a.x-x)-Math.abs(b.x-x)).slice(0,32);
    return buildGameplayContext(this.level, {
      position:this.player?{x,y:this.player.y/18-.5}:this.layout.start,checkpoint:this.model.checkpoint,
      ...this.model.attempt.result(),paused:this.model.status==='paused',finished:this.model.status==='complete',
      power:this.player?.powerState??'SMALL',star:this.player?.starActive??false,timeLeft:Math.ceil(this.model.remainingMs/1000),
      enemies:nearby((this.enemies?.getChildren()??[]).filter(o=>o.active&&(o as Enemy).mode!=='defeated').map(o=>{const e=o as Enemy;return {x:e.x/18-.5,y:e.y/18-.5,kind:e.mode==='shell'&&e.shellMoving?'moving-shell':e.mode,direction:e.direction,behavior:e.spec.behavior};})),
      movingPlatforms:nearby(this.moving.map(m=>({x:m.sprite.x/18-m.spec.width/2,y:m.sprite.y/18-.5,kind:'platform',width:m.spec.width,behavior:m.spec.axis}))),
      powerups:nearby((this.powers?.getChildren()??[]).filter(o=>o.active).map(o=>{const p=o as Sprite;return {x:p.x/18-.5,y:p.y/18-.5,kind:String(p.getData('kind'))};})),
      consumed:[...this.model.consumed],broken:[...this.model.broken],
    });
  }
  /** Immutable observation seam: all objects are copied, no live physics handles. */
  getSnapshot() {
    const p = this.player, body = p?.body;
    return structuredClone({ state: this.model.state(), ready: this.ready, player: p && body ? { x: p.x, y: p.y, velocity: { x: body.velocity.x, y: body.velocity.y }, body: { x: body.x, y: body.y, width: body.width, height: body.height, bottom: body.bottom }, grounded: body.onFloor(), power: p.powerState, star: p.starActive, invulnerable: p.invulnerable, transforming: p.isTransforming } : null,
      camera: this.cameras?.main ? { x: this.cameras.main.scrollX, y: this.cameras.main.scrollY, width: this.cameras.main.width } : null,
      enemies: this.enemies?.getChildren().map(o => { const e = o as Enemy; return { x: e.x, y: e.y, mode: e.mode, direction: e.direction, moving: e.shellMoving }; }) ?? [],
      blocks: this.blockSprites.map(b => ({ x: b.spec.x, y: b.spec.y, kind: b.spec.kind, used: b.used, visible: b.visible, active: b.active })),
      movingPlatforms: this.moving.map(m => ({ x: m.sprite.x, y: m.sprite.y, width: m.spec.width, velocity: { x: bodyOf(m.sprite).velocity.x, y: bodyOf(m.sprite).velocity.y } })),
      checkpoint: this.model.checkpoint, attempt: this.model.attempt.result(), score: this.model.score, smallOnly: this.model.result().smallOnly, timeLeft: Math.ceil(this.model.remainingMs / 1000),
      powerups: this.powers?.getChildren().map(o => { const item = o as Sprite; return { x: item.x, y: item.y, kind: item.getData('kind'), active: item.active }; }) ?? [], fireballs: this.fireballs?.countActive() ?? 0 });
  }
  update(_time: number, delta: number) {
    if (!this.ready || this.model.status !== 'playing') return;
    this.model.observePower(this.player.powerState, this.player.starActive);
    if (this.options.demo && prefersReducedMotion()) { this.player.handleInput(false, false, false, false); return; }
    this.model.tick(delta); this.runTime += delta;
    if (this.runTime - this.lastHud >= 100) { this.emitHud(); this.lastHud = this.runTime; }
    if (this.model.remainingMs <= 0) { this.die('Time ran out'); return; }
    if (this.player.y > 540) { this.die('Fell below the course'); return; }
    if (this.hills) this.hills.tilePositionX = this.cameras.main.scrollX * .4 / 3;
    if (this.transforming) return;
    const key = (...codes: string[]) => codes.some(code => this.keysHeld.has(code));
    let left = this.controls.left || key('ArrowLeft', 'KeyA'), right = this.controls.right || key('ArrowRight', 'KeyD');
    let jump = this.controls.jump || key('ArrowUp', 'KeyW', 'Space'), fire = this.controls.fire || key('KeyX', 'KeyJ');
    if (this.options.demo) {
      left = false; right = true; fire = Math.floor(this.runTime / 500) % 2 === 0;
      const body = this.player.body;
      const obstacle = this.physics.overlapRect(body.right + 8, body.bottom - 15, 22, 13, false, true).length > 0;
      const gap = !this.physics.overlapRect(body.right + 20, body.bottom + 2, 20, 30, false, true).length;
      const enemy = this.enemies.getChildren().some(o => (o as Enemy).mode !== 'defeated' && (o as Enemy).x > this.player.x && (o as Enemy).x - this.player.x < 65);
      jump = body.onFloor() ? obstacle || gap || enemy : body.velocity.y < 0;
    }
    this.player.handleInput(left, right, jump, this.presses.has('jump') || jump && !this.jumpHeld);
    if (this.presses.has('fire') || fire && !this.fireHeld) this.shoot(); this.jumpHeld = jump; this.fireHeld = fire; this.presses.clear();
    for (const enemy of this.enemies.getChildren()) (enemy as Enemy).step(this.runTime);
    for (const item of this.powers.getChildren()) {
      const sprite = item as Sprite, body = sprite.body as Phaser.Physics.Arcade.Body;
      if (sprite.getData('kind') === 'star') { if (body.onFloor()) sprite.setVelocityY(-330); sprite.setTint([0xffffff, 0xffe066, 0x66e0ff, 0xff8de1][Math.floor(this.runTime / 120) % 4]); }
      if (sprite.y > 550) sprite.destroy();
    }
    for (const block of this.blockSprites) {
      if (block.spec.kind !== 'hidden' || block.used || block.body!.enable || this.player.body.velocity.y >= -40) continue;
      const body = this.player.body, bottom = block.y + 9;
      if (body.right > block.x - 9 && body.left < block.x + 9 && body.top <= bottom + 2 && body.top >= bottom - 14) {
        block.setVisible(true); block.body!.enable = true; this.player.body.touching.up = true; this.hitBlock(block); this.player.setVelocityY(50);
      }
    }
    for (const m of this.moving) {
      const body = m.sprite.body as Phaser.Physics.Arcade.Body;
      const origin = m.spec.axis === 'x' ? m.startX : m.startY;
      const position = m.spec.axis === 'x' ? m.sprite.x : m.sprite.y;
      if (position >= origin + m.spec.distance * 18) m.direction = -1;
      else if (position <= origin) m.direction = 1;
      const speed = m.direction * m.spec.distance * 36 * 1000 / m.spec.durationMs;
      // Arcade's immovable-body friction carries standing riders with the body.
      // Constant velocity avoids amplifying render/fixed-step timing differences.
      body.setVelocity(m.spec.axis === 'x' ? speed : 0, m.spec.axis === 'y' ? speed : 0);
      const art = m.sprite.getData('art') as Phaser.GameObjects.Image[];
      art.forEach((image, index) => image.setPosition(m.sprite.x + (index - (m.spec.width - 1) / 2) * 18, m.sprite.y));
    }
  }
}
