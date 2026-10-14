// The putt-putt courses, in the order they're offered: the living-room mat
// (where it all started) and Scott's garden course under the oaks. Each
// keeps its own best round; per-hole bests and aces are kept by hole id,
// which is unique across both.

import { COURSE, COURSE_ID, type CourseRef, type Hole } from './putting';
import { GARDEN_COURSE_ID, GARDEN_HOLES } from '../data/gardenCourse';

export type CourseId = 'livingRoom' | 'garden';

export interface Course extends CourseRef {
  id: CourseId;
  name: string;
  /** "the mat", "the garden course": how the end of a round refers to it. */
  short: string;
  holes: Hole[];
  par: number;
  /** How it's drawn. */
  theme: 'livingRoom' | 'garden';
}

function course(c: Omit<Course, 'par'>): Course {
  return { ...c, par: c.holes.reduce((s, h) => s + h.par, 0) };
}

export const LIVING_ROOM_COURSE = course({ id: 'livingRoom', recordId: COURSE_ID, name: 'The Living-Room Mat', short: 'the mat', holes: COURSE, theme: 'livingRoom' });
export const GARDEN_COURSE = course({ id: 'garden', recordId: GARDEN_COURSE_ID, name: 'The Garden Course', short: 'the garden course', holes: GARDEN_HOLES, theme: 'garden' });

export const COURSES: Course[] = [LIVING_ROOM_COURSE, GARDEN_COURSE];

export function findCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}

/** The course after this one, for "Next course" at the end of a round. */
export function otherCourse(c: Course): Course {
  return COURSES[(COURSES.indexOf(c) + 1) % COURSES.length];
}

/**
 * Where the garden course is found: the flag on its cane at the first tee,
 * under the last oaks at the woodland's edge (tile coords, outdoors).
 */
export const GARDEN_TEE_SPOT = { zone: 'woodland' as const, x: 32.5, y: 27.5 };
