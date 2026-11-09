// Historical migration input only. Never imported by the application or current seed.
import type { PGlite } from '@electric-sql/pglite';
type Point={x:number;y:number};
export interface HistoricalLayout {version:1;cols:24;rows:14;start:Point;finish:Point;platforms:(Point&{width:number})[];hazards:Point[];checkpoints:Point[];items:Point[]}
export const historicalCourse: {id:string;title:string;description:string;difficulty:string;layout:HistoricalLayout} = {
  id: '11111111-1111-4111-8111-111111111111', title: 'First Flight', difficulty: 'easy',
  description: 'Jump over the coral hazards and reach the gold flag.',
  layout: { version:1, cols:24, rows:14, start:{x:1,y:11}, finish:{x:22,y:11},
    platforms:[{x:0,y:12,width:24},{x:5,y:9,width:4},{x:12,y:8,width:4},{x:18,y:9,width:3}],
    hazards:[{x:7,y:11},{x:14,y:11},{x:19,y:11}], checkpoints:[], items:[] }
};

export async function seedHistoricalV1(db:PGlite) {
 await db.query('insert into public.levels(id,creator_id,title,description,difficulty,layout,published) values($1,null,$2,$3,$4,$5,true)',[historicalCourse.id,historicalCourse.title,historicalCourse.description,historicalCourse.difficulty,historicalCourse.layout]);
}
