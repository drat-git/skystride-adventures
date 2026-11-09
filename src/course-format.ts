/** Version 2 uses Astro Hop's source grid: 18 px tiles, 25 rows. */
export const V2_TILE = 18, V2_ROWS = 25, V2_MIN_COLS = 24, V2_MAX_COLS = 512;
export type Point = { x: number; y: number };
export type Platform = Point & { width: number };
export type Theme = 'overworld' | 'cave' | 'sky';
export type BlockKind = 'solid' | 'breakable' | 'glow' | 'hidden';
export type BlockContent = 'none' | 'coin' | 'adaptive' | 'growth' | 'fire' | 'star' | 'life';
export type PowerupKind = 'growth' | 'fire' | 'star' | 'life';
export type Block = Point & { kind: BlockKind; content: BlockContent };
export type Powerup = Point & { kind: PowerupKind };
export type Hazard = Platform & { kind: 'spike' | 'lava' };
export type EnemyKind = 'walker' | 'turtle' | 'winged';
export type EnemyBehavior = 'patrol' | 'hop' | 'horizontal' | 'vertical';
export type Enemy = Point & { kind: EnemyKind; behavior: EnemyBehavior; direction: -1 | 1; speed: number; range: number };
export type MovingPlatform = Platform & { axis: 'x' | 'y'; distance: number; durationMs: number };
export type Obstacle = Platform & { height: number; kind: 'column' | 'rock' | 'ruin' };
export type Decoration = Point & { kind: 'sign' | 'bush' | 'pine' | 'sprout' | 'cloud' | 'crystal' | 'ruin' | 'door' | 'terrain' };
export interface LayoutV2 {
  version: 2; cols: number; rows: 25; theme: Theme; timeLimit: number;
  start: Point; finish: Point; finishHeight: number;
  terrain: Platform[]; platforms: Platform[]; blocks: Block[]; items: Point[];
  powerups: Powerup[]; hazards: Hazard[]; checkpoints: Point[]; enemies: Enemy[];
  movingPlatforms: MovingPlatform[]; obstacles: Obstacle[]; decorations: Decoration[];
}
export const V2_ARRAY_LIMITS = {
  terrain: 512, platforms: 512, blocks: 1024, items: 1024, powerups: 256,
  hazards: 256, checkpoints: 64, enemies: 256, movingPlatforms: 128,
  obstacles: 256, decorations: 1024,
} as const;
export const V2_MAX_ENTITIES = 4096, V2_MAX_BYTES = 262144, V2_MAX_RENDER_TILES = 32768;

const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number => Number.isInteger(value) && Number(value) >= min && Number(value) <= max;
const finite = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const member = (value: unknown, options: readonly unknown[]) => options.includes(value);

/** Declarative, bounded data only; field whitelists intentionally exclude pipe/URL/code hooks. */
export function validateLayoutV2(value: unknown): asserts value is LayoutV2 {
  const fail = (reason: string): never => { throw new Error(`Invalid version 2 course: ${reason}`); };
  const arrays = Object.keys(V2_ARRAY_LIMITS) as (keyof typeof V2_ARRAY_LIMITS)[];
  if (!exact(value, ['version', 'cols', 'rows', 'theme', 'timeLimit', 'start', 'finish', 'finishHeight', ...arrays]) ||
      value.version !== 2 || value.rows !== V2_ROWS || !integer(value.cols, V2_MIN_COLS, V2_MAX_COLS) ||
      !member(value.theme, ['overworld', 'cave', 'sky']) || !integer(value.timeLimit, 30, 900) || !integer(value.finishHeight, 1, 20)) fail('unsupported shape, theme or dimensions.');
  const v = value as Record<string, unknown>, cols = v.cols as number;
  if (new TextEncoder().encode(JSON.stringify(v)).length > V2_MAX_BYTES) fail('payload exceeds 256 KiB.');
  const point = (p: unknown): p is Point => object(p) && integer(p.x, 0, cols - 1) && integer(p.y, 0, V2_ROWS - 1);
  if (!exact(v.start, ['x', 'y']) || !point(v.start) || !exact(v.finish, ['x', 'y']) || !point(v.finish)) fail('start and finish must be grid points.');
  const start = v.start as Point, finish = v.finish as Point;
  if (start.x === finish.x && start.y === finish.y) fail('start and finish must differ.');
  if (Number(v.finishHeight) > finish.y + 1) fail('finish flag extends outside the world.');
  let total = 0, renderedTiles = 0;
  const keys: Record<keyof typeof V2_ARRAY_LIMITS, string[]> = {
    terrain: ['x', 'y', 'width'], platforms: ['x', 'y', 'width'], blocks: ['x', 'y', 'kind', 'content'],
    items: ['x', 'y'], powerups: ['x', 'y', 'kind'], hazards: ['x', 'y', 'width', 'kind'], checkpoints: ['x', 'y'],
    enemies: ['x', 'y', 'kind', 'behavior', 'direction', 'speed', 'range'],
    movingPlatforms: ['x', 'y', 'width', 'axis', 'distance', 'durationMs'], obstacles: ['x', 'y', 'width', 'height', 'kind'],
    decorations: ['x', 'y', 'kind'],
  };
  for (const name of arrays) {
    const list = v[name];
    if (!Array.isArray(list) || list.length > V2_ARRAY_LIMITS[name]) fail(`${name} count exceeds its limit.`);
    const entries = list as unknown[], positions = new Set<string>(); total += entries.length;
    for (const item of entries) {
      if (!exact(item, keys[name]) || !point(item)) fail(`malformed ${name} component.`);
      const p = item as Record<string, unknown> & Point, identity = `${p.x},${p.y}`;
      if (positions.has(identity)) fail(`duplicate ${name} position.`); positions.add(identity);
      if (['terrain', 'platforms', 'hazards', 'movingPlatforms', 'obstacles'].includes(name) && !integer(p.width, 1, cols - p.x)) fail(`${name} width is outside the world.`);
      if (name === 'blocks' && (!member(p.kind, ['solid', 'breakable', 'glow', 'hidden']) ||
          !member(p.content, ['none', 'coin', 'adaptive', 'growth', 'fire', 'star', 'life']) ||
          ((p.kind === 'solid' || p.kind === 'breakable') && p.content !== 'none') ||
          (p.kind === 'glow' && p.content === 'none') || (p.kind === 'hidden' && p.content !== 'life'))) fail('invalid block contents.');
      if (name === 'powerups' && !member(p.kind, ['growth', 'fire', 'star', 'life'])) fail('unsupported power-up.');
      if (name === 'hazards' && !member(p.kind, ['spike', 'lava'])) fail('unsupported hazard.');
      if (name === 'enemies' && (!member(p.kind, ['walker', 'turtle', 'winged']) || !member(p.direction, [-1, 1]) || !finite(p.speed, 10, 120) || !integer(p.range, 1, 16) ||
          (p.kind === 'winged' ? !member(p.behavior, ['hop', 'horizontal', 'vertical']) : p.behavior !== 'patrol'))) fail('unsupported enemy behavior.');
      if (name === 'movingPlatforms') {
        if (!member(p.axis, ['x', 'y']) || !integer(p.distance, 1, 16) || !integer(p.durationMs, 1000, 12000)) fail('invalid moving platform path.');
        if ((p.axis === 'x' && p.x + Number(p.width) + Number(p.distance) > cols) || (p.axis === 'y' && p.y + Number(p.distance) >= V2_ROWS)) fail('moving platform endpoint is outside the world.');
      }
      if (name === 'obstacles' && (!member(p.kind, ['column', 'rock', 'ruin']) || !integer(p.height, 1, V2_ROWS - p.y))) fail('unsupported obstacle or height.');
      if (name === 'decorations' && !member(p.kind, ['sign', 'bush', 'pine', 'sprout', 'cloud', 'crystal', 'ruin', 'door', 'terrain'])) fail('unsupported decoration.');
      renderedTiles += ['terrain', 'platforms', 'hazards', 'movingPlatforms', 'obstacles'].includes(name) ? Number(p.width) * (name === 'obstacles' ? Number(p.height) : 1) : 1;
      if (renderedTiles > V2_MAX_RENDER_TILES) fail('expanded components exceed the 32768-tile rendering budget.');
    }
  }
  if (total > V2_MAX_ENTITIES) fail('more than 4096 components.');
  const layout = v as unknown as LayoutV2;
  const blocked = (p: Point, support = false) => [...layout.terrain, ...layout.platforms].some(t => t.y === p.y && p.x >= t.x && p.x < t.x + t.width) ||
    layout.blocks.some(b => b.x === p.x && b.y === p.y && (!support || b.kind !== 'hidden')) ||
    layout.obstacles.some(o => p.x >= o.x && p.x < o.x + o.width && p.y >= o.y && p.y < o.y + o.height);
  const dangerous = (p: Point) => layout.hazards.some(h => h.y === p.y && p.x >= h.x && p.x < h.x + h.width);
  for (const p of [start, finish, ...layout.checkpoints]) {
    if (blocked(p) || dangerous(p) || !blocked({ x: p.x, y: p.y + 1 }, true)) fail('start, finish and checkpoints must be safe and supported.');
  }
  for (const p of [...layout.items, ...layout.powerups]) if (blocked(p) || dangerous(p)) fail('items and power-ups must be outside solids and hazards.');
}
