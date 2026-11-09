import { V2_ARRAY_LIMITS, V2_MAX_BYTES, V2_MAX_ENTITIES, type LayoutV2, type BlockContent, type PowerupKind, type EnemyKind, type EnemyBehavior, type Obstacle, type Decoration, type Hazard } from './course-format';

export type V2Tool = 'select' | 'terrain' | 'platform' | 'solid' | 'breakable' | 'glow' | 'hidden' | 'item' | 'powerup' | 'hazard' | 'checkpoint' | 'start' | 'finish' | 'enemy' | 'moving-platform' | 'obstacle' | 'decoration' | 'erase';
export const EDITOR_TOOLS: { group: string; entries: readonly [V2Tool, string][] }[] = [
  { group: 'Edit', entries: [['select', 'Select / inspect'], ['erase', 'Erase']] },
  { group: 'World', entries: [['terrain', 'Terrain'], ['platform', 'Platform'], ['moving-platform', 'Moving platform'], ['obstacle', 'Solid obstacle'], ['decoration', 'Decoration']] },
  { group: 'Blocks', entries: [['solid', 'Ordinary block'], ['breakable', 'Breakable block'], ['glow', 'Glowing power-up block'], ['hidden', 'Hidden life block']] },
  { group: 'Encounters', entries: [['item', 'Coin'], ['powerup', 'Power-up'], ['enemy', 'Enemy'], ['hazard', 'Hazard']] },
  { group: 'Course', entries: [['start', 'Start'], ['checkpoint', 'Checkpoint'], ['finish', 'Finish']] },
];
export interface ToolProperties {
  width: number; height: number; content: Exclude<BlockContent, 'none'>; powerup: PowerupKind;
  hazard: Hazard['kind']; enemy: EnemyKind; behavior: EnemyBehavior; direction: -1 | 1; speed: number; range: number;
  axis: 'x' | 'y'; distance: number; durationMs: number; obstacle: Obstacle['kind']; decoration: Decoration['kind'];
}
export const DEFAULT_PROPERTIES: ToolProperties = { width: 1, height: 3, content: 'adaptive', powerup: 'growth', hazard: 'spike', enemy: 'walker', behavior: 'patrol', direction: -1, speed: 40, range: 4, axis: 'x', distance: 4, durationMs: 4000, obstacle: 'column', decoration: 'bush' };
type Collection = keyof typeof V2_ARRAY_LIMITS;
type Component = { x: number; y: number; width?: number; height?: number; kind?: string };
export interface Selection { collection: Collection | 'start' | 'finish'; index: number; x: number; y: number; tool: V2Tool; properties: ToolProperties; label: string }
const collections = Object.keys(V2_ARRAY_LIMITS) as Collection[];
const number = (value: number, min: number, max: number, label: string, integral = true) => {
  if (!Number.isFinite(value) || (integral && !Number.isInteger(value)) || value < min || value > max) throw Error(`${label} must be ${integral ? 'a whole number ' : ''}from ${min} to ${max}.`);
};
const covers = (p: Component, x: number, y: number) => x >= p.x && x < p.x + (p.width ?? 1) && y >= p.y && y < p.y + (p.height ?? 1);

export function newEditorLayout(): LayoutV2 {
  return { version: 2, cols: 64, rows: 25, theme: 'overworld', timeLimit: 300, start: { x: 2, y: 22 }, finish: { x: 60, y: 22 }, finishHeight: 5,
    terrain: [{ x: 0, y: 23, width: 64 }, { x: 0, y: 24, width: 64 }], platforms: [], blocks: [], items: [], powerups: [], hazards: [], checkpoints: [], enemies: [], movingPlatforms: [], obstacles: [], decorations: [] };
}

function clearRectangle(layout: LayoutV2, x: number, y: number, width: number, height: number, decorations = false) {
  const intersects = (p: Component) => p.x < x + width && p.x + (p.width ?? 1) > x && p.y < y + height && p.y + (p.height ?? 1) > y;
  const split = <T extends { x: number; y: number; width: number }>(rows: T[]) => rows.flatMap(p => {
    if (!intersects(p)) return [p];
    const pieces: T[] = [];
    if (p.x < x) pieces.push({ ...p, width: x - p.x });
    if (p.x + p.width > x + width) pieces.push({ ...p, x: x + width, width: p.x + p.width - x - width });
    return pieces;
  });
  layout.terrain = split(layout.terrain); layout.platforms = split(layout.platforms); layout.hazards = split(layout.hazards);
  layout.blocks = layout.blocks.filter(p => !intersects(p)); layout.items = layout.items.filter(p => !intersects(p));
  layout.powerups = layout.powerups.filter(p => !intersects(p)); layout.checkpoints = layout.checkpoints.filter(p => !intersects(p));
  layout.enemies = layout.enemies.filter(p => !intersects(p)); layout.movingPlatforms = layout.movingPlatforms.filter(p => !intersects(p));
  layout.obstacles = layout.obstacles.filter(p => !intersects(p));
  if (decorations) layout.decorations = layout.decorations.filter(p => !intersects(p));
}

function enforceBudget(layout: LayoutV2) {
  let count = 0;
  for (const key of collections) {
    count += layout[key].length;
    if (layout[key].length > V2_ARRAY_LIMITS[key]) throw Error(`This course supports at most ${V2_ARRAY_LIMITS[key]} ${key}.`);
  }
  if (count > V2_MAX_ENTITIES || new TextEncoder().encode(JSON.stringify(layout)).length > V2_MAX_BYTES) throw Error('This course has reached its component or file-size limit.');
}

function mergeRuns<T extends { x: number; y: number; width: number; kind?: string }>(runs: T[]): T[] {
  const result: T[] = [];
  for (const run of runs.sort((a, b) => a.y - b.y || a.x - b.x)) {
    const previous = result.at(-1);
    if (previous && previous.y === run.y && previous.kind === run.kind && previous.x + previous.width >= run.x) previous.width = Math.max(previous.width, run.x + run.width - previous.x);
    else result.push({ ...run });
  }
  return result;
}

export function placeComponent(source: LayoutV2, x: number, y: number, tool: V2Tool, props: ToolProperties = DEFAULT_PROPERTIES): LayoutV2 {
  number(x, 0, source.cols - 1, 'Column'); number(y, 0, 24, 'Row');
  if (tool === 'select') return structuredClone(source);
  const next = structuredClone(source);
  const wide = ['terrain', 'platform', 'moving-platform', 'obstacle', 'hazard'].includes(tool), width = wide ? props.width : 1;
  const height = tool === 'obstacle' ? props.height : 1;
  number(width, 1, source.cols - x, 'Width'); number(height, 1, 25 - y, 'Height');
  if (tool === 'moving-platform') {
    number(props.distance, 1, 16, 'Travel distance'); number(props.durationMs, 1000, 12000, 'Travel period');
    if (props.axis === 'x' ? x + width + props.distance > source.cols : y + props.distance >= 25) throw Error('The moving platform’s far endpoint must stay inside the course.');
  }
  if (tool === 'enemy') { number(props.speed, 10, 120, 'Enemy speed', false); number(props.range, 1, 16, 'Enemy range'); }
  if (tool === 'decoration') next.decorations = next.decorations.filter(p => p.x !== x || p.y !== y);
  else clearRectangle(next, x, y, width, height, tool === 'erase');
  switch (tool) {
    case 'terrain': next.terrain.push({ x, y, width }); break;
    case 'platform': next.platforms.push({ x, y, width }); break;
    case 'solid': case 'breakable': case 'glow': case 'hidden':
      next.blocks.push({ x, y, kind: tool, content: tool === 'glow' ? props.content : tool === 'hidden' ? 'life' : 'none' }); break;
    case 'item': next.items.push({ x, y }); break;
    case 'powerup': next.powerups.push({ x, y, kind: props.powerup }); break;
    case 'hazard': next.hazards.push({ x, y, width, kind: props.hazard }); break;
    case 'checkpoint': next.checkpoints.push({ x, y }); break;
    case 'start': next.start = { x, y }; break;
    case 'finish': next.finish = { x, y }; break;
    case 'enemy': next.enemies.push({ x, y, kind: props.enemy, behavior: props.enemy === 'winged' ? (props.behavior === 'patrol' ? 'hop' : props.behavior) : 'patrol', direction: props.direction, speed: props.speed, range: props.range }); break;
    case 'moving-platform': next.movingPlatforms.push({ x, y, width, axis: props.axis, distance: props.distance, durationMs: props.durationMs }); break;
    case 'obstacle': next.obstacles.push({ x, y, width, height, kind: props.obstacle }); break;
    case 'decoration': next.decorations.push({ x, y, kind: props.decoration }); break;
  }
  if (tool === 'terrain') next.terrain = mergeRuns(next.terrain);
  if (tool === 'platform') next.platforms = mergeRuns(next.platforms);
  if (tool === 'hazard') next.hazards = mergeRuns(next.hazards);
  enforceBudget(next);
  return next;
}

export function selectionsAt(layout: LayoutV2, x: number, y: number): Selection[] {
  const selections: Selection[] = [];
  const tools: Record<Collection, V2Tool> = { terrain: 'terrain', platforms: 'platform', blocks: 'solid', items: 'item', powerups: 'powerup', hazards: 'hazard', checkpoints: 'checkpoint', enemies: 'enemy', movingPlatforms: 'moving-platform', obstacles: 'obstacle', decorations: 'decoration' };
  for (const collection of ['start', 'finish'] as const) if (covers(layout[collection], x, y)) selections.push({ collection, index: 0, ...layout[collection], tool: collection, properties: { ...DEFAULT_PROPERTIES }, label: collection });
  for (const collection of collections) layout[collection].forEach((component, index) => {
    if (!covers(component, x, y)) return;
    const props = { ...DEFAULT_PROPERTIES }, p = component as Component & Record<string, unknown>;
    let tool = tools[collection];
    if ('width' in p) props.width = Number(p.width); if ('height' in p) props.height = Number(p.height);
    if (collection === 'blocks') { tool = p.kind as V2Tool; if (p.content !== 'none') props.content = p.content as ToolProperties['content']; }
    if (collection === 'powerups') props.powerup = p.kind as PowerupKind;
    if (collection === 'hazards') props.hazard = p.kind as Hazard['kind'];
    if (collection === 'enemies') { props.enemy = p.kind as EnemyKind; props.behavior = p.behavior as EnemyBehavior; props.direction = p.direction as -1 | 1; props.speed = Number(p.speed); props.range = Number(p.range); }
    if (collection === 'movingPlatforms') { props.axis = p.axis as 'x' | 'y'; props.distance = Number(p.distance); props.durationMs = Number(p.durationMs); }
    if (collection === 'obstacles') props.obstacle = p.kind as Obstacle['kind'];
    if (collection === 'decorations') props.decoration = p.kind as Decoration['kind'];
    selections.push({ collection, index, x: p.x, y: p.y, tool, properties: props, label: `${p.kind ?? tool}${collection === 'blocks' && p.content !== 'none' ? ` (${p.content})` : ''} at column ${p.x + 1}, row ${p.y + 1}` });
  });
  return selections;
}

export function replaceSelection(layout: LayoutV2, selection: Selection, x: number, y: number, props: ToolProperties): LayoutV2 {
  const source = structuredClone(layout);
  if (selection.collection !== 'start' && selection.collection !== 'finish') source[selection.collection].splice(selection.index, 1);
  return placeComponent(source, x, y, selection.tool, props);
}

export function resizeCourse(layout: LayoutV2, cols: number): LayoutV2 {
  number(cols, 24, 512, 'Course width');
  for (const point of [layout.start, layout.finish, ...collections.flatMap(key => layout[key] as Component[])]) {
    if (point.x + ('width' in point ? Number(point.width) : 1) > cols) throw Error('Remove or resize components beyond the new right edge before making the course narrower.');
  }
  if (layout.movingPlatforms.some(p => p.axis === 'x' && p.x + p.width + p.distance > cols)) throw Error('A moving platform travels beyond the new right edge.');
  return { ...structuredClone(layout), cols };
}

export function describeCell(layout: LayoutV2, x: number, y: number): { kind: string; label: string; description: string } {
  const picks = selectionsAt(layout, x, y);
  const item = picks.find(p => p.collection === 'start' || p.collection === 'finish') ?? picks.find(p => !['terrain', 'platforms', 'decorations'].includes(p.collection)) ?? picks.find(p => p.collection !== 'decorations') ?? picks[0];
  if (!item) return { kind: 'empty', label: '', description: 'empty' };
  const symbols: Record<V2Tool, string> = { select: '', terrain: '', platform: '━', solid: '■', breakable: '▥', glow: '✦', hidden: '◇', item: '●', powerup: '✚', hazard: '▲', checkpoint: 'C', start: 'S', finish: '⚑', enemy: '◉', 'moving-platform': '↔', obstacle: '▥', decoration: '✧', erase: '' };
  let kind: string = item.tool;
  if (item.tool === 'enemy') kind += ` enemy-${item.properties.enemy}`;
  if (item.tool === 'powerup') kind += ` powerup-${item.properties.powerup}`;
  if (item.tool === 'obstacle') kind += ` obstacle-${item.properties.obstacle}`;
  if (item.tool === 'decoration') kind += ` decoration-${item.properties.decoration}`;
  if (item.tool === 'glow') kind += ` content-${item.properties.content}`;
  if (item.tool === 'hazard') kind += ` hazard-${item.properties.hazard}`;
  return { kind, label: symbols[item.tool], description: picks.map(p => p.label).join('; ') };
}
