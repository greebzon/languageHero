import { choicePresetOf, type DraftExercise, type ExerciseType } from '@lingvohero/contracts';
import { GENERATION_MECHANICS, shuffle, wordLessonMix } from './mechanics/index.js';

/*
 * Variety inside a set. Each word lesson gets its own mechanics (a window over the requested
 * ones, moved on by two from lesson to lesson), so neighbouring lessons feel different while
 * the set as a whole uses every mechanic. Inside a lesson the order follows a rhythm: never the
 * same task twice in a row, harder tasks in the middle, an easy one at the end.
 */
export const MECHANICS_PER_LESSON = 4;

/** The mechanics of word lesson `index` (all of them when there are few). */
export function lessonMechanics(
  mix: readonly ExerciseType[],
  index: number,
  perLesson = MECHANICS_PER_LESSON,
): ExerciseType[] {
  const words = wordLessonMix(mix);
  if (words.length <= perLesson) return words;
  const start = (index * 2) % words.length;
  return Array.from({ length: perLesson }, (_, i) => words[(start + i) % words.length]!);
}

/** What counts as «the same task»: the mechanic, and for a choice its kind. */
const kindOf = (e: DraftExercise) =>
  e.type === 'choice' ? `choice:${choicePresetOf(e) ?? 'custom'}` : e.type;
const effortOf = (e: DraftExercise) => GENERATION_MECHANICS[e.type].effort;

/** The lesson's exercises in rhythm order, renumbered `ex-1…` (deterministic for the seed). */
export function arrangeExercises(exercises: DraftExercise[], seed: string): DraftExercise[] {
  if (exercises.length < 3) return exercises;
  const sorted = shuffle(exercises, seed).sort((a, b) => effortOf(a) - effortOf(b));
  // The easiest task ends the lesson; the others climb towards the middle and come down.
  const last = sorted.shift()!;
  const front: DraftExercise[] = [];
  const back: DraftExercise[] = [];
  sorted.forEach((e, i) => (i % 2 ? back : front).push(e));
  const order = [...front, ...back.reverse(), last];
  // Never the same task twice in a row: swap in a later, different one (the ending stays
  // unless nothing else fits).
  for (let i = 1; i < order.length; i += 1) {
    if (kindOf(order[i]!) !== kindOf(order[i - 1]!)) continue;
    const fits = (k: number) =>
      kindOf(order[k]!) !== kindOf(order[i - 1]!) &&
      (k + 1 >= order.length || kindOf(order[i]!) !== kindOf(order[k + 1]!));
    let j = order.findIndex((_, k) => k > i && k < order.length - 1 && fits(k));
    if (j < 0) j = order.findIndex((_, k) => k > i && fits(k));
    if (j > 0) [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order.map((e, i) => ({ ...e, id: `ex-${i + 1}` }));
}
