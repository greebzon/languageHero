import { BOSS_LESSON_ID, type CourseExercise, type CourseLesson } from '@lingvohero/contracts';
import { composeWordLesson, reviewPool, type Frame, type TaskKind } from './review';

/*
 * «Испытание сета»: the boss at the end of a finished set, assembled on the device from every
 * lesson of the set (no generation, so every set has one). Ten tasks over all the set's words
 * in every mechanic, plus a sentence of the set's sentence lesson for each age group; three
 * hearts (learning-core `learn`). The server assembles the same lesson from the same lessons
 * and seed. The first win of a set earns a chest and the set's crown.
 */
const PLAN: TaskKind[] = [
  'listen',
  'find-picture',
  'spell',
  'memory',
  'is-it',
  'catch',
  'name-picture',
  'pairs',
  'first-sound',
  'listen',
];
/** Where the sentences go: after the first six tasks, when the child is warmed up. */
const SENTENCES_AT = 6;

const FRAMES: Record<'ru' | 'en' | 'he', Frame> = {
  ru: {
    title: 'Испытание сета',
    intro: 'Покажи всё, что умеешь! У тебя три сердечка.',
    completionTitle: 'Испытание пройдено!',
    completionMessage: 'Корона этого сета твоя. Тим тобой гордится!',
  },
  en: {
    title: 'Set challenge',
    intro: 'Show everything you know! You have three hearts.',
    completionTitle: 'Challenge complete!',
    completionMessage: 'The crown of this set is yours. Tim is proud of you!',
  },
  he: {
    title: 'אתגר הסט',
    intro: 'מראים את כל מה שיודעים! יש שלושה לבבות.',
    completionTitle: 'האתגר הושלם!',
    completionMessage: 'הכתר של הסט הזה שלך. טים גאה בך!',
  },
};

/** The set's challenge from its lessons (the packages the child played) and the seed. */
export function composeBoss(lessons: CourseLesson[], seed: string): CourseLesson {
  const pool = reviewPool(lessons);
  // One sentence of each age group from the set's sentence lesson, with its recording and
  // translations; each child plays the one of their group.
  const sentences: CourseExercise[] = [];
  const media: CourseLesson['media'] = [];
  const texts: Partial<Record<'en' | 'he', Record<string, { prompt: string; hint: string }>>> = {};
  for (const lesson of lessons)
    for (const band of ['6-7', '8-9'] as const) {
      if (sentences.some((e) => e.ageBands?.includes(band))) continue;
      const source = lesson.exercises.find(
        (e) => e.type === 'build-sentence' && e.ageBands?.includes(band),
      );
      if (source?.type !== 'build-sentence') continue;
      const id = `${BOSS_LESSON_ID}-sentence-${band}`;
      const audio = lesson.media.find((m) => m.id === source.audioId)!;
      sentences.push({ ...source, id, ageBands: [band], audioId: `${id}-audio` });
      media.push({ ...audio, id: `${id}-audio` });
      for (const locale of ['en', 'he'] as const) {
        const translated = lesson.texts?.[locale]?.exercises?.[source.id];
        if (translated) (texts[locale] ??= {})[id] = translated;
      }
    }
  return composeWordLesson(
    pool.map(({ lesson, word }) => ({ lesson, wordId: word.id })),
    seed,
    {
      id: BOSS_LESSON_ID,
      plan: PLAN,
      frame: (locale) => FRAMES[locale],
      extra: { exercises: sentences, media, texts },
      extraAt: SENTENCES_AT,
    },
  );
}
