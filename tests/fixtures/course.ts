import { newEditorLayout } from '../../src/editor-tools';
import type { Level } from '../../src/level';
export const testCourse:Level={id:'33333333-3333-4333-8333-000000000009',title:'Test course',description:'V2 test geometry',difficulty:'easy',layout:{...newEditorLayout(),start:{x:1,y:22},finish:{x:22,y:22},hazards:[{x:7,y:22,width:1,kind:'spike'}]}};
