import type { AgeBand } from '@lingvohero/contracts';

/* The child gives an age (6, 7, 8, 9+); the server keeps the year, so the age grows by itself. */
export const birthYearFor = (age: number, now = new Date()) => now.getFullYear() - age;
export const ageFrom = (birthYear: number, now = new Date()) => now.getFullYear() - birthYear;
/** The age group lessons are eased for; none until the child has given an age. */
export function difficultyFor(
  birthYear: number | null | undefined,
  now = new Date(),
): { ageBand: AgeBand } | undefined {
  if (birthYear == null) return undefined;
  return { ageBand: ageFrom(birthYear, now) <= 7 ? '6-7' : '8-9' };
}
