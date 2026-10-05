export const COLS = 24, ROWS = 14, TILE = 32;
export type Point = { x: number; y: number };
export type Platform = Point & { width: number };
export interface Layout { version: 1; cols: 24; rows: 14; start: Point; finish: Point; platforms: Platform[]; hazards: Point[]; checkpoints: Point[]; items: Point[] }
export interface Level { id: string; title: string; description: string; difficulty: 'easy' | 'medium' | 'hard'; layout: Layout }
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && Number(v) >= min && Number(v) <= max;
const point = (v: unknown): v is Point => record(v) && integer(v.x, 0, COLS - 1) && integer(v.y, 0, ROWS - 2);
export function validateLayout(v: unknown): asserts v is Layout {
  if (!record(v) || v.version !== 1 || v.cols !== COLS || v.rows !== ROWS) throw new Error('Unsupported level format. Expected version 1, 24 × 14 tiles.');
  if (!point(v.start) || !point(v.finish) || (v.start.x === v.finish.x && v.start.y === v.finish.y)) throw new Error('Level needs distinct valid start and finish positions.');
  for (const key of ['hazards', 'checkpoints', 'items']) {
    const list = v[key];
    if (!Array.isArray(list) || list.length > 50 || !list.every(point)) throw new Error(`Invalid ${key}.`);
    if (new Set(list.map(p => `${p.x},${p.y}`)).size !== list.length) throw new Error(`Duplicate ${key} positions.`);
  }
  if (!Array.isArray(v.platforms) || !v.platforms.length || v.platforms.length > 60 || !v.platforms.every(p => record(p) && integer(p.x,0,COLS-1) && integer(p.y,1,ROWS-1) && integer(p.width,1,COLS-Number(p.x)))) throw new Error('Invalid platforms.');
  const platforms = v.platforms as Platform[];
  const blocked = (p: Point) => platforms.some(t => t.y === p.y && p.x >= t.x && p.x < t.x + t.width);
  const hazards = v.hazards as Point[];
  for (const p of [v.start, v.finish, ...(v.checkpoints as Point[])]) {
    if (blocked(p) || hazards.some(h => h.x === p.x && h.y === p.y)) throw new Error('Start, finish and checkpoint positions must be safe.');
    if (!platforms.some(t => t.y === p.y + 1 && p.x >= t.x && p.x < t.x + t.width)) throw new Error('Start, finish and checkpoints need a supporting platform.');
  }
}
export const practiceLevel: Level = {
  id: '11111111-1111-4111-8111-111111111111', title: 'First Flight', difficulty: 'easy',
  description: 'Jump over the coral hazards and reach the gold flag.',
  layout: { version:1, cols:24, rows:14, start:{x:1,y:11}, finish:{x:22,y:11},
    platforms:[{x:0,y:12,width:24},{x:5,y:9,width:4},{x:12,y:8,width:4},{x:18,y:9,width:3}],
    hazards:[{x:7,y:11},{x:14,y:11},{x:19,y:11}], checkpoints:[], items:[] }
};
export function parseLevel(v: unknown): Level {
  if (!record(v) || typeof v.id !== 'string' || typeof v.title !== 'string' || !v.title.trim() || typeof v.description !== 'string' || !['easy','medium','hard'].includes(String(v.difficulty))) throw new Error('Invalid level record.');
  validateLayout(v.layout);
  return {id:v.id,title:v.title,description:v.description,difficulty:v.difficulty as Level['difficulty'],layout:v.layout};
}
