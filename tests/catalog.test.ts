import { describe, expect, it } from 'vitest';
import { orderCourses } from '../src/catalog';
import { practiceLevel } from '../src/level';
import type { CourseSummary } from '../src/backend';
const course = (id:string,title:string,rating:number|null,favorites:number,isFavorite=false):CourseSummary => ({...practiceLevel,id,title,averageRating:rating,ratingCount:rating===null?0:1,favoriteCount:favorites,isFavorite});
describe('course discovery',()=>{
 const rows=[course('3','Cloud',null,5),course('2','Bridge',4,2,true),course('1','Bridge',4,2),course('4','Arrow',5,0)];
 it('sorts highest ratings first, unrated last, and ties by title then ID',()=>{
  expect(orderCourses(rows,'rating').map(x=>x.id)).toEqual(['4','1','2','3']);
  expect(rows.map(x=>x.id)).toEqual(['3','2','1','4']);
 });
 it('sorts favorite totals and applies only the signed-in account favorite flags',()=>{
  expect(orderCourses(rows,'favorites').map(x=>x.id)).toEqual(['3','1','2','4']);
  expect(orderCourses(rows,'title',true).map(x=>x.id)).toEqual(['2']);
  expect(orderCourses(rows.map(x=>({...x,isFavorite:false})),'title',true)).toEqual([]);
 });
});
