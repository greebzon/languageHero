import { z } from 'zod';
import {
  AGE_BANDS,
  sentenceKey,
  type AgeBand,
  type DraftExercise,
  type GenerationLessonPlan,
  type GenerationWord,
} from '@lingvohero/contracts';
import { MaterialError } from './dto.js';
import { clip, shuffle } from './mechanics/index.js';

/*
 * The last lesson of a generated set: sentences built from the set's words («Собери фразу»),
 * one group of tasks per age. The model writes the sentences; the server checks that every
 * word is a word of the set or one of the few helper words the model declared for the whole
 * set, cuts the sentences into tiles and adds the extra tiles. Each sentence gets its own
 * recording (the audio stage), no picture.
 */
export const SENTENCES_PER_BAND = 4;
export const SENTENCE_LESSON_SIZE = SENTENCES_PER_BAND * AGE_BANDS.length;
/** Words per sentence and extra tiles for each age group. */
const LENGTH: Record<AgeBand, [number, number]> = { '6-7': [2, 4], '8-9': [3, 6] };
const EXTRA: Record<AgeBand, number> = { '6-7': 1, '8-9': 2 };
const MAX_HELPERS = 12;

export const sentencesDtoSchema = z.object({
  helperWords: z.array(z.string()),
  sentences: z.array(
    z.object({
      ageBand: z.enum(AGE_BANDS),
      text: z.string(),
      translation: z.string(),
      hint: z.string(),
      extraWords: z.array(z.string()),
    }),
  ),
});
export type SentencesDto = z.infer<typeof sentencesDtoSchema>;

/** The plan entry of the sentence lesson that ends a set. */
export function sentenceLessonPlan(
  lessonId: string,
  words: GenerationWord[],
): GenerationLessonPlan {
  return {
    lessonId,
    kind: 'sentences',
    title: 'Собери фразы',
    goal: 'Составить фразы из слов этого сета',
    presentation: {
      intro: 'Из знакомых слов получаются целые фразы. Давай попробуем!',
      completionTitle: 'Фразы собраны!',
      completionMessage: 'Теперь у тебя получается говорить целыми фразами. Тим в восторге!',
    },
    wordKeys: words.slice(0, 40).map((w) => w.key),
    exerciseCount: SENTENCE_LESSON_SIZE,
  };
}

/** A word as it stands in a sentence: punctuation around it goes, inner «'» and «-» stay. */
const bare = (token: string) =>
  token.normalize('NFC').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/** Sentence exercises (one `ageBands` group each) and the sentences to record. */
export function buildSentenceExercises(
  dto: SentencesDto,
  lesson: GenerationLessonPlan,
  words: GenerationWord[],
): { exercises: DraftExercise[]; sentences: NonNullable<GenerationLessonPlan['sentences']> } {
  const problems: string[] = [];
  const known = new Map(
    words
      .filter((w) => lesson.wordKeys.includes(w.key))
      .map((w) => [sentenceKey(w.spelling), w.key] as const),
  );
  const helpers = new Set(
    dto.helperWords
      .map((w) => sentenceKey(bare(w)))
      .filter((w) => w && !known.has(w))
      .slice(0, MAX_HELPERS),
  );
  const allowed = (key: string) => known.has(key) || helpers.has(key);
  const exercises: DraftExercise[] = [];
  const sentences: NonNullable<GenerationLessonPlan['sentences']> = [];
  const seen = new Set<string>();
  for (const band of AGE_BANDS) {
    const [min, max] = LENGTH[band];
    const usable = dto.sentences
      .filter((s) => s.ageBand === band)
      .flatMap((item) => {
        const tokens = item.text.split(/\s+/).map(bare).filter(Boolean);
        const keys = tokens.map(sentenceKey);
        const outside = keys.filter((k) => !allowed(k));
        const problem =
          tokens.length < min || tokens.length > max
            ? `has ${tokens.length} words, expected ${min}–${max}`
            : outside.length
              ? `uses words that are neither set words nor helper words: ${outside.join(', ')}`
              : !keys.some((k) => known.has(k))
                ? 'has no word of the set'
                : seen.has(keys.join(' '))
                  ? 'repeats another sentence'
                  : null;
        if (problem) {
          problems.push(`"${item.text}" (${band}) ${problem}`);
          return [];
        }
        seen.add(keys.join(' '));
        return [{ item, tokens, keys }];
      });
    if (usable.length < SENTENCES_PER_BAND)
      problems.push(
        `only ${usable.length} usable sentences for ages ${band}, expected ${SENTENCES_PER_BAND}`,
      );
    for (const { item, tokens, keys } of usable.slice(0, SENTENCES_PER_BAND)) {
      const n = exercises.length + 1;
      const key = `sentence-${n}`;
      // A capital would show which tile starts the sentence; the app capitalises the built
      // sentence itself. One-letter words keep theirs («I»).
      const answer = tokens.map((t, i) =>
        i === 0 && Array.from(t).length > 1 ? t[0]!.toLowerCase() + t.slice(1) : t,
      );
      const inSentence = new Set(keys);
      const extras = [
        ...item.extraWords.map((w) => sentenceKey(bare(w))),
        ...known.keys(), // set words not in the sentence, when the model gave too few
      ]
        .filter((k, i, all) => k && allowed(k) && !inSentence.has(k) && all.indexOf(k) === i)
        .slice(0, EXTRA[band]);
      const tiles = shuffle(
        [...answer, ...extras].map((text, i) => {
          const wordId = known.get(sentenceKey(text));
          return { id: `w${i + 1}`, text, ...(wordId ? { wordId } : {}) };
        }),
        `${lesson.lessonId}:${key}`,
      );
      exercises.push({
        id: `ex-${n}`,
        type: 'build-sentence',
        prompt: clip(`Собери фразу: «${clip(item.translation, 150) || answer.join(' ')}»`, 200),
        hint: clip(item.hint, 300) || 'Послушай фразу ещё раз',
        ageBands: [band],
        tokens: tiles,
        answer,
        audioId: `${key}-audio`,
      });
      sentences.push({ key, text: clip(item.text, 120) });
    }
  }
  if (problems.length) throw new MaterialError('Фразы не прошли проверку', problems);
  return { exercises, sentences };
}

/** The fake provider's sentences: «I see a fox», «The fox is big», «I see the fox and owl». */
export function fakeSentences(words: { spelling: string }[]): SentencesDto {
  const at = (i: number) => words[i % words.length]!.spelling;
  return {
    helperWords: ['I', 'see', 'a', 'the', 'is', 'big', 'small', 'and'],
    sentences: AGE_BANDS.flatMap((band) =>
      Array.from({ length: SENTENCES_PER_BAND }, (_, i) => ({
        ageBand: band,
        text:
          band === '6-7'
            ? `I see a ${at(i)}`
            : i % 2
              ? `The ${at(i)} is ${i % 4 === 1 ? 'big' : 'small'}`
              : `I see the ${at(i)} and ${at(i + 1)}`,
        translation: `Фраза ${i + 1}`,
        hint: 'Послушай фразу',
        extraWords: [at(i + 2)],
      })),
    ),
  };
}
