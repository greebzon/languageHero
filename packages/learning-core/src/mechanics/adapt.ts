import type { AgeBand, CourseLesson, Difficulty } from '@lingvohero/contracts';

/* How far an exercise is eased for an age group. The older group plays lessons as published;
   for 6–7-year-olds there are fewer options to read through and fewer extra letters. */
export type Limits = { options: number; pairs: number; extraTiles: number };
export const LIMITS: Record<AgeBand, Limits> = {
  '6-7': { options: 3, pairs: 3, extraTiles: 1 },
  '8-9': { options: 6, pairs: 4, extraTiles: 30 },
};
export type AdaptContext = { limits: Limits; lesson: CourseLesson; rand: () => number };
export const limitsFor = (difficulty?: Difficulty): Limits => LIMITS[difficulty?.ageBand ?? '8-9'];

/** A deterministic random source: the same seed always eases an exercise the same way. */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** At most `n` of `items`, always with those `must` marks, in their original order. */
export function keep<T>(items: T[], n: number, must: (item: T) => boolean, rand: () => number) {
  if (items.length <= n) return items;
  const others = items.filter((item) => !must(item));
  for (let i = others.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [others[i], others[j]] = [others[j]!, others[i]!];
  }
  const room = Math.max(0, n - (items.length - others.length));
  const chosen = new Set(others.slice(0, room));
  return items.filter((item) => must(item) || chosen.has(item));
}
