export const MAX_EXERCISES_PER_LESSON = 30;

/**
 * Splits the requested total into lessons of roughly `lessonSize` exercises. The remainder is
 * spread over the last lessons (25 → [6, 6, 6, 7]), never as a trailing one-exercise lesson,
 * and no lesson exceeds the package contract limit.
 */
export function distribute(total: number, lessonSize: number): number[] {
  if (!Number.isInteger(total) || total < 1) throw new Error('Total must be a positive integer');
  const size = Math.max(1, Math.min(lessonSize, MAX_EXERCISES_PER_LESSON));
  const lessons = Math.max(
    1,
    Math.floor(total / size),
    Math.ceil(total / MAX_EXERCISES_PER_LESSON),
  );
  const base = Math.floor(total / lessons);
  const extra = total - base * lessons;
  return Array.from({ length: lessons }, (_, i) => base + (i >= lessons - extra ? 1 : 0));
}

export const MAX_WORDS = 40;

/** Fewer words than lessons + 1 cannot give every lesson its own word set. */
export const minWordsFor = (distribution: number[]) =>
  Math.min(MAX_WORDS, Math.max(3, distribution.length + 1));

/**
 * How many vocabulary words the plan asks for: an explicit request from the wizard; otherwise
 * the target words alone when they are enough for the lessons (two per lesson plus one —
 * padding ten numbers up to four words per lesson filled a numbers set with colours and
 * «happy»), else `wordsPerLesson` new words per lesson. Never fewer than the required words
 * or the minimum.
 */
export function wordCountFor(
  distribution: number[],
  targetWords: number,
  options: { wordsPerLesson?: number; requested?: number | null } = {},
) {
  const perLesson = options.wordsPerLesson ?? 4;
  const enough = targetWords >= distribution.length * 2 + 1;
  const base = options.requested ?? (enough ? targetWords : distribution.length * perLesson);
  return Math.min(MAX_WORDS, Math.max(minWordsFor(distribution), base, targetWords));
}
