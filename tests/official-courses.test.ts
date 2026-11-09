import { describe, it, expect } from 'vitest';
import { officialCourses, nextOfficialCourse, titleCourse } from '../src/content/official';
import { validateLayout } from '../src/level';
describe('official V2 courses', () => {
  it('provides six valid independent courses in three themes', () => {
    expect(officialCourses.map(c => c.officialOrder)).toEqual([1,2,3,4,5,6]);
    expect(new Set(officialCourses.map(c=>c.id)).size).toBe(6);
    expect(officialCourses.map(c=>c.layout.theme)).toEqual(['overworld','overworld','cave','cave','sky','sky']);
    for (const course of officialCourses) {
      expect(()=>validateLayout(course.layout), course.title).not.toThrow();
      expect(course.layout.checkpoints.length).toBeGreaterThan(0);
      expect(course.layout.cols).toBeLessThanOrEqual(150);
      expect(course.layout.timeLimit).toBe(150);
      expect(course.layout.blocks.filter(b=>b.kind==='hidden').every(b=>b.content==='coin')).toBe(true);
    }
  });
  it('ends progression after six and has a valid unsaved title simulation', () => {
    expect(nextOfficialCourse(officialCourses[0])?.id).toBe(officialCourses[1].id);
    expect(nextOfficialCourse(officialCourses[5])).toBeUndefined();
    expect(()=>validateLayout(titleCourse().layout)).not.toThrow();
    expect(titleCourse().layout.timeLimit).toBe(150);
  });
});
