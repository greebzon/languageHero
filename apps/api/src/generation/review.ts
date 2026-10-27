import { createHash } from 'node:crypto';
import { exerciseWords, type GenerationInput, type GenerationOutput } from '@lingvohero/contracts';
import { toCourseLesson, type AssetRef } from '../publishing/convert.js';
import { wordLessonMix } from './mechanics/index.js';

export type ReviewProblem = { lessonId: string | null; message: string };

/**
 * Local material check before any media is paid for: the package schema (solvability, references,
 * limits), the requested counts and mechanics, and that lessons are not copies of each other.
 */
export function reviewMaterial(
  output: GenerationOutput,
  input: GenerationInput,
  language: string,
): ReviewProblem[] {
  // A translated clone mirrors its source on purpose: only schema and counts are checked.
  const translated = Boolean(input.source);
  const problems: ReviewProblem[] = [];
  const placeholders = new Map<string, AssetRef>();
  const placeholder = (key: string, ext: 'png' | 'wav') => {
    const id = `00000000-0000-4000-8000-${createHash('md5').update(key).digest('hex').slice(0, 12)}`;
    placeholders.set(id, { id, sha256: createHash('sha256').update(key).digest('hex'), ext });
    return id;
  };
  // The closing sentence lesson is outside the requested number of exercises.
  const wordLessons = output.lessons.filter((l) => l.kind !== 'sentences');
  const total = wordLessons.reduce((sum, l) => sum + (l.document?.exercises.length ?? 0), 0);
  if (total !== input.totalExercises)
    problems.push({
      lessonId: null,
      message: `Получилось ${total} заданий вместо ${input.totalExercises}`,
    });
  const wordMix = wordLessonMix(input.mix);
  const seen = new Set<string>();
  const usedWords = new Set<string>();
  for (const lesson of output.lessons) {
    if (!lesson.document) {
      problems.push({ lessonId: lesson.lessonId, message: 'Нет текста урока' });
      continue;
    }
    const document = {
      ...lesson.document,
      media: lesson.document.media.map((m) => ({
        ...m,
        assetId: placeholder(m.id, m.kind === 'image' ? 'png' : 'wav'),
      })),
    };
    const built = toCourseLesson(
      document,
      {
        id: lesson.lessonId,
        version: 1,
        language,
        title: lesson.title,
        presentation: lesson.presentation,
      },
      placeholders,
    );
    if (!built.lesson)
      problems.push({
        lessonId: lesson.lessonId,
        message: Object.entries(built.fieldErrors)
          .map(([k, v]) => `${k === '_' ? '' : k + ': '}${v.join('; ')}`)
          .join(' · '),
      });
    // Each word lesson has its own mechanics (generation/rhythm.ts); old jobs used all of them.
    const requested = new Set(lesson.mechanics ?? wordMix);
    const types = new Set(lesson.document.exercises.map((e) => e.type));
    const missing = [...requested].filter((t) => !types.has(t));
    if (
      !translated &&
      lesson.kind !== 'sentences' &&
      missing.length &&
      lesson.document.exercises.length >= requested.size
    )
      problems.push({
        lessonId: lesson.lessonId,
        message: `Не использованы механики: ${missing.join(', ')}`,
      });
    for (const exercise of lesson.document.exercises) {
      const words = exerciseWords(exercise);
      const key = `${exercise.type}:${exercise.prompt.toLowerCase()}:${words.join('+')}`;
      if (!translated && seen.has(key))
        problems.push({
          lessonId: lesson.lessonId,
          message: `Задание «${exercise.prompt}» повторяет другой урок`,
        });
      seen.add(key);
      for (const id of words) usedWords.add(id);
    }
  }
  const unused = output.words.filter((w) => !usedWords.has(w.key));
  if (unused.length && problems.length === 0)
    problems.push({
      lessonId: null,
      message: `Слова без заданий: ${unused.map((w) => w.text).join(', ')}`,
    });
  return problems;
}
