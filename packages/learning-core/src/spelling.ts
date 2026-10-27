import type { CourseExercise } from '@lingvohero/contracts';
import { ageFrom } from './age';

/**
 * How much «Собери слово» helps. `model`: the word stands in faded letters in its slots and
 * only its own tiles are offered, so a child who cannot read yet matches letter shapes;
 * `self`: the plain exercise with distractor letters.
 */
export type SpellingHelp = 'model' | 'self';
/** Up to this age children mostly cannot read yet, Latin letters even less. */
export const MODEL_SPELLING_MAX_AGE = 6;

/** No age yet (an account from before the question): the exercise as it always was. */
export function spellingHelp(birthYear: number | null, now: Date): SpellingHelp {
  return birthYear !== null && ageFrom(birthYear, now) <= MODEL_SPELLING_MAX_AGE ? 'model' : 'self';
}

/** The word's tiles in their shuffled order, without the distractors (NFC, as the schema). */
export function spellingTiles(
  exercise: Extract<CourseExercise, { type: 'build-word' }>,
  spelling: string,
) {
  const needed = Array.from(spelling.normalize('NFC'));
  return exercise.tiles.filter((tile) => {
    const index = needed.indexOf(tile.letter.normalize('NFC'));
    if (index < 0) return false;
    needed.splice(index, 1);
    return true;
  });
}
