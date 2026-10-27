import type { AgeBand } from '@lingvohero/contracts';

/* The child gives an age (6, 7, 8, 9+); the server keeps the year, so the age grows by itself. */
export const birthYearFor = (age: number, now = new Date()) => now.getFullYear() - age;
export const ageFrom = (birthYear: number, now = new Date()) => now.getFullYear() - birthYear;

/** Runs remembered in `LearningState.recent`; the last `STREAK` of them move the difficulty. */
export const RECENT_RUNS = 5;
const STREAK = 3;

/**
 * The group lessons are eased for: from the age, then moved by how the last runs went. Three
 * flawless runs in a row lift a 6–7-year-old to the 8–9 tasks; three runs of one star bring an
 * older child down to the easier ones. None until the child gave an age or a streak moved it.
 */
export function difficultyFor(
  birthYear: number | null | undefined,
  recent: readonly number[] = [],
  now = new Date(),
): { ageBand: AgeBand } | undefined {
  const age: AgeBand | undefined =
    birthYear == null ? undefined : ageFrom(birthYear, now) <= 7 ? '6-7' : '8-9';
  const last = recent.slice(-STREAK);
  if (last.length === STREAK && last.every((s) => s === 3) && age === '6-7')
    return { ageBand: '8-9' };
  if (last.length === STREAK && last.every((s) => s <= 1) && age !== '6-7')
    return { ageBand: '6-7' };
  return age && { ageBand: age };
}
