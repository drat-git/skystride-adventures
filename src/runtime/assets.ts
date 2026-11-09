import Phaser from 'phaser';

/** Packed sheets are unmodified Kenney CC0 originals used by Astro Hop. */
export function preloadAssets(scene: Phaser.Scene) {
  const base = `${import.meta.env.BASE_URL}assets/astrohop/`;
  scene.load.spritesheet('tiles', `${base}tiles.png`, { frameWidth: 18, frameHeight: 18 });
  scene.load.spritesheet('chars', `${base}characters.png`, { frameWidth: 24, frameHeight: 24 });
  scene.load.spritesheet('bg', `${base}backgrounds.png`, { frameWidth: 24, frameHeight: 24 });
}

function canvas(scene: Phaser.Scene, key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width, height)!;
  draw(texture.context); texture.refresh();
}
function copyFrame(scene: Phaser.Scene, key: string, frame: number, swap?: 'fire' | 'star' | 'life') {
  canvas(scene, key, 18, 18, ctx => {
    const f = scene.textures.getFrame('tiles', frame);
    ctx.drawImage(f.source.image as HTMLImageElement, f.cutX, f.cutY, 18, 18, 0, 0, 18, 18);
    if (swap) {
      const image = ctx.getImageData(0, 0, 18, 18), d = image.data;
      for (let i = 0; i < d.length; i += 4) {
        if (swap === 'fire') [d[i], d[i + 2]] = [d[i + 2], d[i]];
        if (swap === 'life') [d[i], d[i + 1]] = [d[i + 1], d[i]];
        if (swap === 'star') d[i] = d[i + 1] = d[i + 2] = Math.min(255, Math.max(d[i], d[i + 1], d[i + 2]) * 1.15);
      }
      ctx.putImageData(image, 0, 0);
    }
  });
}

export function createAssets(scene: Phaser.Scene) {
  copyFrame(scene, 'gem-fire', 67, 'fire'); copyFrame(scene, 'gem-star', 67, 'star'); copyFrame(scene, 'mushroom-life', 128, 'life');
  canvas(scene, 'hills', 96, 24, ctx => {
    for (let i = 0; i < 4; i++) {
      const f = scene.textures.getFrame('bg', 8 + i);
      ctx.drawImage(f.source.image as HTMLImageElement, f.cutX, f.cutY, 24, 24, i * 24, 0, 24, 24);
    }
    const data = ctx.getImageData(0, 0, 96, 24);
    for (let i = 0; i < data.data.length; i += 4) if (data.data[i] === 223 && data.data[i + 1] === 246 && data.data[i + 2] === 245) data.data[i + 3] = 0;
    ctx.putImageData(data, 0, 0);
  });
  canvas(scene, 'spark', 4, 4, ctx => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 4, 4); });
  canvas(scene, 'fireball', 10, 10, ctx => {
    for (const [color, radius] of [['#e44e32', 5], ['#ff9b38', 3], ['#ffed8d', 1]] as const) {
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(5, 5, radius, 0, Math.PI * 2); ctx.fill();
    }
  });
  // Original pixel components in the source palette/scale. No question-mark art.
  canvas(scene, 'glow-block', 18, 18, ctx => {
    ctx.fillStyle = '#493b76'; ctx.fillRect(0, 0, 18, 18); ctx.fillStyle = '#9768da'; ctx.fillRect(1, 1, 16, 16);
    ctx.fillStyle = '#dfb6ff'; ctx.fillRect(2, 2, 14, 2); ctx.fillRect(2, 4, 2, 10); ctx.fillStyle = '#704b9e'; ctx.fillRect(3, 15, 13, 2);
    ctx.fillStyle = '#fff0c6'; ctx.fillRect(8, 5, 2, 8); ctx.fillRect(5, 8, 8, 2); ctx.fillStyle = '#ffffff'; ctx.fillRect(8, 8, 2, 2);
  });
  for (const variant of ['turtle-0', 'turtle-1', 'shell'] as const) canvas(scene, variant, 24, 24, ctx => {
    const r = (color: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
    r('#2d4248', 5, 10, 14, 12); r('#5f9f79', 6, 9, 12, 12); r('#91c995', 7, 9, 8, 3);
    r('#44775f', 10, 14, 2, 6); r('#44775f', 6, 16, 12, 2); r('#dce3bd', 5, 20, 14, 2);
    if (variant !== 'shell') {
      r('#2d4248', 2, 10, 6, 9); r('#e4c893', 2, 11, 6, 7); r('#ffffff', 2, 11, 3, 3); r('#293746', 2, 11, 1, 2);
      const shift = variant === 'turtle-0' ? 0 : 2;
      r('#293746', 6 + shift, 22, 5, 2); r('#293746', 15 - shift, 22, 5, 2);
    }
  });
  for (let n = 0; n < 2; n++) canvas(scene, `wings-${n}`, 32, 24, ctx => {
    const pixel = (color: string, x: number, y: number, w: number, h: number) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
    const y = n ? 7 : 1;
    for (const x of [1, 22]) {
      pixel('#7896b4', x, y, 9, 12); pixel('#e7f4f5', x + 1, y, 7, 10);
      pixel('#ffffff', x + 2, y - 1, 4, 7); pixel('#b7d8e2', x + 2, y + 8, 5, 3);
    }
  });
  canvas(scene, 'sky-top', 18, 18, ctx => {
    ctx.fillStyle = '#6178ac'; ctx.fillRect(0, 0, 18, 18); ctx.fillStyle = '#d9edf1'; ctx.fillRect(0, 0, 18, 6);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(2, 0, 5, 3); ctx.fillRect(11, 0, 6, 3);
    ctx.fillStyle = '#99b7d5'; ctx.fillRect(0, 6, 18, 3); ctx.fillStyle = '#778dc0'; ctx.fillRect(2, 11, 6, 4); ctx.fillRect(11, 10, 4, 6);
  });
  canvas(scene, 'sky-fill', 18, 18, ctx => {
    ctx.fillStyle = '#6178ac'; ctx.fillRect(0, 0, 18, 18); ctx.fillStyle = '#778dc0'; ctx.fillRect(2, 2, 6, 4); ctx.fillRect(11, 9, 4, 6);
  });
  for (const kind of ['column', 'rock', 'ruin']) canvas(scene, `stone-${kind}`, 18, 18, ctx => {
    ctx.fillStyle = '#49516b'; ctx.fillRect(0, 0, 18, 18);
    ctx.fillStyle = '#8795ad'; ctx.fillRect(1, 1, 16, 15);
    ctx.fillStyle = '#ccdce2'; ctx.fillRect(1, 1, 15, 2); ctx.fillRect(1, 3, 2, 12);
    ctx.fillStyle = '#65728f'; ctx.fillRect(3, 15, 14, 2); ctx.fillRect(16, 3, 1, 12);
    if (kind === 'column') { ctx.fillStyle = '#65728f'; ctx.fillRect(6, 4, 2, 11); ctx.fillRect(11, 4, 2, 11); }
    if (kind === 'rock') { ctx.fillStyle = '#adb8c7'; ctx.fillRect(4, 5, 5, 3); ctx.fillStyle = '#65728f'; ctx.fillRect(9, 10, 5, 3); }
    if (kind === 'ruin') { ctx.fillStyle = '#49516b'; ctx.fillRect(1, 9, 16, 1); ctx.fillRect(9, 1, 1, 8); ctx.fillRect(5, 10, 1, 7); }
  });
  canvas(scene, 'spikes', 18, 18, ctx => {
    ctx.fillStyle = '#42506a'; ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(5, 2); ctx.lineTo(9, 18); ctx.lineTo(14, 2); ctx.lineTo(18, 18); ctx.fill();
    ctx.fillStyle = '#dbe5e7'; ctx.beginPath(); ctx.moveTo(2, 17); ctx.lineTo(5, 5); ctx.lineTo(7, 17); ctx.lineTo(12, 17); ctx.lineTo(14, 5); ctx.lineTo(16, 17); ctx.fill();
  });
  const anim = (key: string, texture: string, frames: (number | string)[], rate: number, repeat = -1) => {
    if (!scene.anims.exists(key)) scene.anims.create({ key, frames: frames.map(frame => ({ key: texture, frame })), frameRate: rate, repeat });
  };
  anim('player-idle', 'chars', [0], 1); anim('player-run', 'chars', [0, 1], 10); anim('player-jump', 'chars', [1], 1);
  anim('fire-idle', 'chars', [6], 1); anim('fire-run', 'chars', [6, 7], 10); anim('fire-jump', 'chars', [7], 1);
  anim('walker-walk', 'chars', [18, 19], 6); anim('coin-spin', 'tiles', [151, 152], 6); anim('flag-wave', 'tiles', [111, 112], 3);
  if (!scene.anims.exists('turtle-walk')) scene.anims.create({ key: 'turtle-walk', frames: [{ key: 'turtle-0' }, { key: 'turtle-1' }], frameRate: 6, repeat: -1 });
}
