import { createHash } from 'node:crypto';
import { z } from 'zod';
import type {
  DraftExercise,
  GenerationInput,
  GenerationLessonPlan,
  GenerationWord,
  LessonDocument,
} from '@lingvohero/contracts';

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
      type: z.enum(['listen-and-select', 'match-pairs', 'build-word']),
      prompt: z.string(),
      hint: z.string(),
      wordKey: z.string(),
      choiceKeys: z.array(z.string()),
      pairKeys: z.array(z.string()),
      distractorLetters: z.string(),
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

const slug = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
const clip = (text: string, max: number) => text.trim().slice(0, max);

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

/** Deterministic shuffle so a re-run of the same input yields the same tiles. */
function shuffle<T>(items: T[], seed: string) {
  const out = [...items];
  const digest = createHash('sha256').update(seed).digest();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = digest[i % digest.length]! % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Model exercises → draft exercises with server-assigned ids and letter tiles. */
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
  const resolve = (k: string) => keyMap.get(k) ?? slug(k);
  const exercises: DraftExercise[] = [];
  dto.exercises.forEach((item, index) => {
    const id = `ex-${index + 1}`;
    const prompt = clip(item.prompt, 200) || 'Выполни задание';
    const hint = clip(item.hint, 300) || 'Подумай ещё немного!';
    if (!mix.includes(item.type)) {
      problems.push(`exercise ${index + 1} uses a mechanic that was not requested`);
      return;
    }
    if (item.type === 'match-pairs') {
      const keys = [...new Set(item.pairKeys.map(resolve))].filter((k) => allowed.has(k));
      if (keys.length < 2) {
        problems.push(`exercise ${index + 1} (pairs) needs 2–4 known words`);
        return;
      }
      const wordIds = keys.slice(0, 4);
      exercises.push({
        id,
        type: 'match-pairs',
        prompt,
        hint,
        wordIds,
        imageOrder: shuffle(wordIds, `${lesson.lessonId}:${id}`),
      });
      return;
    }
    const wordId = resolve(item.wordKey);
    const word = byKey.get(wordId);
    if (!word || !allowed.has(wordId)) {
      problems.push(`exercise ${index + 1} refers to unknown word "${item.wordKey}"`);
      return;
    }
    if (item.type === 'listen-and-select') {
      const choices = [...new Set([wordId, ...item.choiceKeys.map(resolve)])].filter((k) =>
        allowed.has(k),
      );
      if (choices.length < 2) {
        // Borrow another lesson word so the exercise stays valid.
        const other = lesson.wordKeys.find((k) => k !== wordId);
        if (other) choices.push(other);
      }
      if (choices.length < 2) {
        problems.push(`exercise ${index + 1} (listen) needs at least 2 choices`);
        return;
      }
      exercises.push({
        id,
        type: 'listen-and-select',
        prompt,
        hint,
        wordId,
        choices: shuffle(choices.slice(0, 6), `${lesson.lessonId}:${id}`),
      });
      return;
    }
    const letters = Array.from(word.spelling.normalize('NFC'));
    const distractors = Array.from(item.distractorLetters.toLowerCase().replace(/[^\p{L}]/gu, ''))
      .filter((l) => !letters.includes(l))
      .slice(0, 3);
    const tiles = shuffle(
      [...letters, ...(distractors.length ? distractors : ['x'])].map((letter, i) => ({
        id: `t${i + 1}`,
        letter,
      })),
      `${lesson.lessonId}:${id}`,
    );
    exercises.push({ id, type: 'build-word', prompt, hint, wordId, tiles: tiles.slice(0, 30) });
  });
  if (exercises.length !== lesson.exerciseCount)
    problems.push(
      `lesson "${lesson.title}" has ${exercises.length} usable exercises, expected ${lesson.exerciseCount}`,
    );
  if (problems.length) throw new MaterialError('Задания не прошли проверку', problems);
  return exercises;
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
    media: used.flatMap((w) => [
      {
        id: `${w.key}-image`,
        kind: 'image' as const,
        assetId: w.image?.assetId ?? assetIds[`image:${w.key}`] ?? '',
        ...(w.image?.region ? { region: w.image.region } : {}),
      },
      { id: `${w.key}-audio`, kind: 'audio' as const, assetId: assetIds[`audio:${w.key}`] ?? '' },
    ]),
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

const bareLetters = (text: string) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}]/gu, '') // drops spaces, articles' punctuation and Hebrew vowel points
    .slice(0, 24);

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
 * and pictures stay; build-word tiles are rebuilt from the new spelling plus distractors.
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
  const byKey = new Map(words.map((w) => [w.key, w]));
  return source.map((exercise, index) => {
    const item = dto.exercises[index]!;
    const prompt = clip(item.prompt, 200) || exercise.prompt;
    const hint = clip(item.hint, 300) || exercise.hint;
    if (exercise.type !== 'build-word') return { ...exercise, prompt, hint };
    const word = byKey.get(exercise.wordId);
    const letters = Array.from(word?.spelling ?? '');
    // Distractors from the model, else letters of the other words, so the script stays the same.
    const pool = [
      ...Array.from(bareLetters(item.distractorLetters)),
      ...words.flatMap((w) => Array.from(w.spelling)),
    ];
    const distractors = [...new Set(pool.filter((l) => !letters.includes(l)))].slice(0, 2);
    const tiles = shuffle(
      [...letters, ...distractors].map((letter, i) => ({ id: `t${i + 1}`, letter })),
      `${lesson.lessonId}:${exercise.id}`,
    );
    return { ...exercise, prompt, hint, tiles: tiles.slice(0, 30) };
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
