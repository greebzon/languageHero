import { z } from 'zod';
import {
  exerciseTypeSchema,
  type DraftExercise,
  type GenerationInput,
  type GenerationLessonPlan,
  type GenerationWord,
  type LessonDocument,
} from '@lingvohero/contracts';
import { bareLetters, clip, generationMechanic, retranslate, slug } from './mechanics/index.js';
import { arrangeExercises } from './rhythm.js';

/*
 * What the model is allowed to say. Strict structured outputs need every property required and
 * no additional properties; zod's JSON Schema export produces exactly that for plain objects.
 * IDs, order, versions and file paths are assigned by the server, never by the model.
 */
export const planDtoSchema = z.object({
  vocabulary: z.array(
    z.object({
      key: z.string(),
      text: z.string(),
      spelling: z.string(),
      translation: z.string(),
      imagePrompt: z.string(),
      speechText: z.string(),
    }),
  ),
  lessons: z.array(
    z.object({
      title: z.string(),
      goal: z.string(),
      intro: z.string(),
      completionTitle: z.string(),
      completionMessage: z.string(),
      wordKeys: z.array(z.string()),
    }),
  ),
});
export const lessonDtoSchema = z.object({
  exercises: z.array(
    z.object({
      type: exerciseTypeSchema,
      prompt: z.string(),
      hint: z.string(),
      wordKey: z.string(),
      choiceKeys: z.array(z.string()),
      pairKeys: z.array(z.string()),
      distractorLetters: z.string(),
      /* A mechanic's variant (the preset of a `choice`), "" when it has none. */
      variant: z.string(),
    }),
  ),
});
export type PlanDto = z.infer<typeof planDtoSchema>;
export type LessonDto = z.infer<typeof lessonDtoSchema>;

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

export class MaterialError extends Error {
  constructor(
    message: string,
    public readonly problems: string[],
  ) {
    super(message);
  }
}

/**
 * Normalises the model's vocabulary: unique slug keys, bare spellings, length limits.
 * `keyMap` translates the model's own keys to the server-assigned ones.
 */
export function buildVocabulary(
  dto: PlanDto,
  expected: number,
): { words: GenerationWord[]; keyMap: Map<string, string> } {
  const problems: string[] = [];
  const used = new Set<string>();
  const spellings = new Set<string>();
  const words: GenerationWord[] = [];
  const keyMap = new Map<string, string>();
  for (const item of dto.vocabulary) {
    const spelling = item.spelling
      .toLowerCase()
      .replace(/[^\p{L}]/gu, '')
      .slice(0, 24);
    if (!spelling) {
      problems.push(`word "${item.text}" has no spelling`);
      continue;
    }
    if (spellings.has(spelling)) {
      problems.push(`word "${spelling}" is listed twice`);
      continue;
    }
    spellings.add(spelling);
    const base = slug(item.key) || slug(spelling) || `word-${words.length + 1}`;
    let key = base;
    for (let n = 2; used.has(key); n += 1) key = `${base}-${n}`;
    used.add(key);
    keyMap.set(item.key, key);
    words.push({
      key,
      text: clip(item.text, 80) || spelling,
      spelling,
      translation: clip(item.translation, 100) || '—',
      imagePrompt: clip(item.imagePrompt, 400) || `${item.text}, simple illustration`,
      speechText: clip(item.speechText, 120) || item.text,
    });
  }
  if (words.length < Math.min(expected, 4))
    problems.push(`only ${words.length} usable words, expected ${expected}`);
  if (problems.length) throw new MaterialError('Словарь не прошёл проверку', problems);
  return { words: words.slice(0, 40), keyMap };
}

/** Lessons from the plan, aligned with the requested distribution. */
export function buildLessonPlans(
  dto: PlanDto,
  words: GenerationWord[],
  distribution: number[],
  courseId: string,
  keyMap: Map<string, string>,
): GenerationLessonPlan[] {
  const problems: string[] = [];
  if (dto.lessons.length !== distribution.length)
    problems.push(`planned ${dto.lessons.length} lessons, expected ${distribution.length}`);
  const known = new Set(words.map((w) => w.key));
  const lessons = dto.lessons.slice(0, distribution.length).map((lesson, index) => {
    const wordKeys = [...new Set(lesson.wordKeys.map((k) => keyMap.get(k) ?? slug(k)))].filter(
      (k) => known.has(k),
    );
    if (wordKeys.length < 2) problems.push(`lesson ${index + 1} references fewer than 2 words`);
    return {
      lessonId: `${courseId}-${String(index + 1).padStart(2, '0')}`,
      title: clip(lesson.title, 100) || `Урок ${index + 1}`,
      goal: clip(lesson.goal, 300),
      presentation: {
        intro: clip(lesson.intro, 300) || 'Маленький шаг — большое открытие!',
        completionTitle: clip(lesson.completionTitle, 100) || 'Отлично!',
        completionMessage: clip(lesson.completionMessage, 400) || 'Ты справился с уроком!',
      },
      wordKeys: wordKeys.slice(0, 6),
      exerciseCount: distribution[index]!,
    };
  });
  const covered = new Set(lessons.flatMap((l) => l.wordKeys));
  for (const word of words)
    if (!covered.has(word.key)) {
      // Attach an orphan word to the lesson with the fewest words instead of failing.
      const target = lessons.reduce((a, b) => (a.wordKeys.length <= b.wordKeys.length ? a : b));
      if (target && target.wordKeys.length < 6) target.wordKeys.push(word.key);
    }
  const signatures = lessons.map((l) => [...l.wordKeys].sort().join(','));
  if (new Set(signatures).size !== signatures.length)
    problems.push('two lessons practise exactly the same word set');
  if (problems.length) throw new MaterialError('План уроков не прошёл проверку', problems);
  return lessons;
}

/** Model exercises → draft exercises with server-assigned ids, options and letter tiles. */
export function buildExercises(
  dto: LessonDto,
  lesson: GenerationLessonPlan,
  words: GenerationWord[],
  keyMap: Map<string, string>,
  mix: GenerationInput['mix'],
): DraftExercise[] {
  const problems: string[] = [];
  const allowed = new Set(lesson.wordKeys);
  const byKey = new Map(words.map((w) => [w.key, w]));
  const exercises: DraftExercise[] = [];
  dto.exercises.forEach((item, index) => {
    const id = `ex-${index + 1}`;
    if (!mix.includes(item.type)) {
      problems.push(`exercise ${index + 1} uses a mechanic that was not requested`);
      return;
    }
    const built = generationMechanic(item.type).build(item, {
      id,
      prompt: clip(item.prompt, 200) || 'Выполни задание',
      hint: clip(item.hint, 300) || 'Подумай ещё немного!',
      lesson,
      key: (k) => {
        const key = keyMap.get(k) ?? slug(k);
        return allowed.has(key) && byKey.has(key) ? key : undefined;
      },
      word: (key) => byKey.get(key)!,
      seed: `${lesson.lessonId}:${id}`,
    });
    if (typeof built === 'string') problems.push(`exercise ${index + 1} ${built}`);
    else exercises.push(built);
  });
  if (exercises.length !== lesson.exerciseCount)
    problems.push(
      `lesson "${lesson.title}" has ${exercises.length} usable exercises, expected ${lesson.exerciseCount}`,
    );
  if (problems.length) throw new MaterialError('Задания не прошли проверку', problems);
  return arrangeExercises(exercises, `${lesson.lessonId}:rhythm`);
}

/** The lesson document with placeholder media ids; assets are attached by `assemble`. */
export function buildDocument(
  lesson: GenerationLessonPlan,
  words: GenerationWord[],
  exercises: DraftExercise[],
  assetIds: Record<string, string> = {},
): LessonDocument {
  const used = words.filter((w) => lesson.wordKeys.includes(w.key));
  return {
    words: used.map((w) => ({
      id: w.key,
      text: w.text,
      spelling: w.spelling,
      translation: w.translation,
      imageId: `${w.key}-image`,
      audioId: `${w.key}-audio`,
    })),
    media: [
      ...used.flatMap((w) => [
        {
          id: `${w.key}-image`,
          kind: 'image' as const,
          assetId: w.image?.assetId ?? assetIds[`image:${w.key}`] ?? '',
          ...(w.image?.region ? { region: w.image.region } : {}),
        },
        { id: `${w.key}-audio`, kind: 'audio' as const, assetId: assetIds[`audio:${w.key}`] ?? '' },
      ]),
      // Recordings of the sentence lesson's sentences (audio tasks `<lesson id>/<key>`).
      ...(lesson.sentences ?? []).map((s) => ({
        id: `${s.key}-audio`,
        kind: 'audio' as const,
        assetId: assetIds[`audio:${lesson.lessonId}/${s.key}`] ?? '',
      })),
    ],
    exercises,
  };
}

// --- Translated clones: the model translates the vocabulary and adapts the Russian texts;
// the exercise structure, word ids and pictures come from the source set unchanged.
export const courseTranslationDtoSchema = z.object({
  words: z.array(
    z.object({ key: z.string(), text: z.string(), spelling: z.string(), speechText: z.string() }),
  ),
  lessons: z.array(
    z.object({
      title: z.string(),
      intro: z.string(),
      completionTitle: z.string(),
      completionMessage: z.string(),
    }),
  ),
});
export const lessonTranslationDtoSchema = z.object({
  exercises: z.array(
    z.object({ prompt: z.string(), hint: z.string(), distractorLetters: z.string() }),
  ),
});
export type CourseTranslationDto = z.infer<typeof courseTranslationDtoSchema>;
export type LessonTranslationDto = z.infer<typeof lessonTranslationDtoSchema>;

/** Source words keep key, Russian translation and picture; text, spelling and speech are new. */
export function buildTranslatedWords(
  dto: CourseTranslationDto,
  source: GenerationWord[],
): GenerationWord[] {
  const problems: string[] = [];
  const byKey = new Map(dto.words.map((w) => [w.key, w]));
  const spellings = new Set<string>();
  const words = source.map((word) => {
    const item = byKey.get(word.key);
    const spelling = item ? bareLetters(item.spelling) || bareLetters(item.text) : '';
    if (!item || !spelling) problems.push(`no translation for "${word.text}" (${word.key})`);
    else if (spellings.has(spelling)) problems.push(`"${spelling}" is used for two words`);
    spellings.add(spelling);
    return {
      ...word,
      text: clip(item?.text ?? '', 80) || spelling,
      spelling,
      speechText: clip(item?.speechText ?? '', 120) || clip(item?.text ?? '', 80) || spelling,
    };
  });
  if (problems.length) throw new MaterialError('Перевод словаря не прошёл проверку', problems);
  return words;
}

/**
 * Source exercises with adapted prompt/hint. Word references and the order of choices, pairs
 * and pictures stay; what depends on spelling (build-word tiles, first-letter options) is
 * rebuilt by the mechanic from the new spelling plus distractors.
 */
export function buildTranslatedExercises(
  dto: LessonTranslationDto,
  lesson: GenerationLessonPlan,
  words: GenerationWord[],
): DraftExercise[] {
  const source = lesson.sourceExercises ?? [];
  if (dto.exercises.length !== source.length)
    throw new MaterialError('Перевод заданий не прошёл проверку', [
      `lesson "${lesson.title}" returned ${dto.exercises.length} exercises, expected ${source.length}`,
    ]);
  return source.map((exercise, index) => {
    const item = dto.exercises[index]!;
    const prompt = clip(item.prompt, 200) || exercise.prompt;
    const hint = clip(item.hint, 300) || exercise.hint;
    return retranslate({ ...exercise, prompt, hint }, item, {
      words,
      seed: `${lesson.lessonId}:${exercise.id}`,
    });
  });
}

/* Texts job: every target locale in one answer. */
export const lessonTextsDtoSchema = z.object({
  locales: z.array(
    z.object({
      locale: z.enum(['en', 'he']),
      title: z.string(),
      presentation: z
        .object({ intro: z.string(), completionTitle: z.string(), completionMessage: z.string() })
        .nullable(),
      exercises: z.array(z.object({ id: z.string(), prompt: z.string(), hint: z.string() })),
      words: z.array(z.object({ id: z.string(), translation: z.string() })),
    }),
  ),
});
export const courseTextsDtoSchema = z.object({
  locales: z.array(
    z.object({
      locale: z.enum(['en', 'he']),
      title: z.string(),
      description: z.string().nullable(),
      languageTitle: z.string(),
    }),
  ),
});
export const mascotTextsDtoSchema = z.object({
  locales: z.array(
    z.object({
      locale: z.enum(['en', 'he']),
      name: z.string(),
      withName: z.string(),
      trait: z.string(),
      perk: z.string(),
    }),
  ),
});
export const itemTextsDtoSchema = z.object({
  locales: z.array(
    z.object({ locale: z.enum(['en', 'he']), name: z.string(), description: z.string() }),
  ),
});
export type LessonTextsDto = z.infer<typeof lessonTextsDtoSchema>;
export type CourseTextsDto = z.infer<typeof courseTextsDtoSchema>;
