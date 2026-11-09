import type { CourseSummary } from './backend';

export type CourseOrder = 'title' | 'rating' | 'favorites';
export function orderCourses(courses: CourseSummary[], order: CourseOrder, favoritesOnly = false): CourseSummary[] {
  const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return courses.filter(course => !favoritesOnly || course.isFavorite).sort((a, b) => {
    let difference = 0;
    if (order === 'rating') {
      if (a.averageRating === null && b.averageRating !== null) return 1;
      if (b.averageRating === null && a.averageRating !== null) return -1;
      difference = (b.averageRating ?? 0) - (a.averageRating ?? 0);
    } else if (order === 'favorites') difference = b.favoriteCount - a.favoriteCount;
    return difference || compareText(a.title, b.title) || compareText(a.id, b.id);
  });
}
