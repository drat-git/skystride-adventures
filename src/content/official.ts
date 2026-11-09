import records from './official-courses.json';
import { parseLevel, type Level } from '../level';
import type { LayoutV2 } from '../course-format';
export const officialCourses = records.map(parseLevel) as (Level & { layout: LayoutV2; officialOrder: number })[];
export const nextOfficialCourse = (level: Level): Level | undefined => level.officialOrder ? officialCourses.find(c => c.officialOrder === level.officialOrder! + 1) : undefined;
export const themeName = (level: Level) => level.layout.version === 2 ? ({overworld:'Meadow',cave:'Cavern',sky:'Sky'})[level.layout.theme] : 'Classic';
/** Actual simulation, never an account run. A compact loop for the title. */
export function titleCourse(): Level {
  const level = structuredClone(officialCourses[0]);
  level.id = 'title-demo'; level.layout.cols = 48;
  level.layout.terrain = [{x:0,y:23,width:48},{x:0,y:24,width:48}];
  level.layout.platforms = [{x:23,y:17,width:5},{x:30,y:19,width:5}];
  level.layout.blocks = [{x:16,y:19,kind:'breakable',content:'none'},{x:17,y:19,kind:'glow',content:'adaptive'},{x:18,y:19,kind:'breakable',content:'none'}];
  level.layout.obstacles = [{x:41,y:20,width:2,height:3,kind:'column'}];
  level.layout.items = [{x:8,y:21},{x:9,y:21},{x:10,y:21},{x:24,y:15},{x:25,y:15}];
  level.layout.enemies = [{x:35,y:22,kind:'walker',behavior:'patrol',direction:-1,speed:40,range:4}];
  level.layout.checkpoints = []; level.layout.finish = {x:46,y:22};
  level.layout.decorations = level.layout.decorations.filter(d=>d.x<48);
  return level;
}
