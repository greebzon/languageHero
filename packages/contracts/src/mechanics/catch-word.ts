import { z } from 'zod';
import { base, draftBase, draftRef, id, unique, type Fail, type LessonRefs } from './shared';

/* «Поймай слово»: rounds of a word heard and bubbles with pictures floating by; the child pops
   the right one. The answer is every tap in order (`{taps}`), so the server sees the misses
   too: at most `CATCH_MISSES` of them and the exercise is right. */
export const CATCH_MISSES = 1;

type Round = { wordId: string; choices: string[] };

/** Where the taps got to: the round now played and the misses so far. */
export function catchProgress(rounds: Round[], taps: string[]) {
  let round = 0;
  let misses = 0;
  for (const tap of taps) {
    if (round >= rounds.length) return { round, misses, extra: true };
    if (tap === rounds[round]!.wordId) round += 1;
    else misses += 1;
  }
  return { round, misses, extra: false };
}

const round = (ref: z.ZodString) => z.object({ wordId: ref, choices: z.array(ref).max(6) });

export const catchWord = {
  exercise: z.object({
    ...base,
    type: z.literal('catch-word'),
    rounds: z
      .array(round(id).extend({ choices: z.array(id).min(2).max(6) }))
      .min(2)
      .max(8),
  }),
  draft: z.object({
    ...draftBase,
    type: z.literal('catch-word'),
    rounds: z.array(round(draftRef)).max(8),
  }),
  answer: z.object({ taps: z.array(id).max(100) }),
  validate(ex: { rounds: Round[] }, { words }: LessonRefs, fail: Fail) {
    if (
      ex.rounds.some(
        (r) =>
          !unique(r.choices) ||
          !r.choices.includes(r.wordId) ||
          r.choices.some((w) => !words.has(w)),
      )
    )
      fail('Invalid catch rounds');
  },
  words: (ex: { rounds: Round[] }) => [...new Set(ex.rounds.map((r) => r.wordId))],
  mapWords: <T extends { rounds: Round[] }>(ex: T, f: (id: string) => string) => ({
    ...ex,
    rounds: ex.rounds.map((r) => ({ wordId: f(r.wordId), choices: r.choices.map(f) })),
  }),
};
