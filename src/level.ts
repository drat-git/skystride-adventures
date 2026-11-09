import { validateLayoutV2, type LayoutV2 } from './course-format';
export type { Point, Platform } from './course-format';
export type Layout = LayoutV2;
export type CourseLayout = LayoutV2;
export interface Level { id: string; title: string; description: string; difficulty: 'easy' | 'medium' | 'hard'; layout: LayoutV2; officialOrder?: number }
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const integer = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && Number(v) >= min && Number(v) <= max;
export function validateLayout(v: unknown): asserts v is LayoutV2 { validateLayoutV2(v); }
export function parseLevel(v: unknown): Level {
  if (!record(v) || typeof v.id !== 'string' || typeof v.title !== 'string' || !v.title.trim() || typeof v.description !== 'string' || !['easy','medium','hard'].includes(String(v.difficulty))) throw new Error('Invalid level record.');
  validateLayout(v.layout);
  const officialOrder = v.official_order ?? v.officialOrder;
  if (officialOrder != null && !integer(officialOrder, 1, 6)) throw new Error('Invalid official course order.');
  return {id:v.id,title:v.title,description:v.description,difficulty:v.difficulty as Level['difficulty'],layout:v.layout,...(officialOrder == null ? {} : {officialOrder:Number(officialOrder)})};
}
