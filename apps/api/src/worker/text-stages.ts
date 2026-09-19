/* Texts job: translates a set's child-facing texts (lessons, card, language name) from Russian
   into the interface locales. Only overlays are written — the Russian base is never touched —
   and every translation records the fingerprint of the Russian it was made from. */
import { createHash } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { lessonLocales, type DraftLessonTexts, type Locale } from '@lingvohero/contracts';
import type { Db, Tx } from '../db/client.js';
import { courses, languages, lessons, mascots, shopItems, type ModelConfig } from '../db/schema.js';
import {
  courseTextsDtoSchema,
  itemTextsDtoSchema,
  lessonTextsDtoSchema,
  mascotTextsDtoSchema,
  toJsonSchema,
} from '../generation/dto.js';
import {
  courseTextsPrompt,
  lessonTextsPrompt,
  wardrobeTextsPrompt,
  type WardrobeTextsPayload,
} from '../generation/prompts.js';
import { ProviderError, type RequestContext } from '../generation/provider.js';
import { baseTextsHash, publishedTexts } from '../publishing/convert.js';
import { addUsage, createAssetJob, type JobRow, type TaskRow } from './queue.js';
import type { StageContext, StageResult } from './stages.js';

type OverlayLocale = Exclude<Locale, 'ru'>;
type LessonRow = typeof lessons.$inferSelect;
type CourseRow = typeof courses.$inferSelect;
type Env = { ctx: StageContext; job: JobRow; task: TaskRow; context: RequestContext };

const permanent = (message: string) => new ProviderError(message, 'permanent');
const retryable = (message: string) => new ProviderError(message, 'retryable');
const clip = (text: string, max: number) => text.trim().slice(0, max);

/** Translation state of a draft lesson for the panel: complete, missing or outdated. */
export function translationState(
  lesson: Pick<LessonRow, 'title' | 'presentation' | 'document' | 'texts'>,
  locale: OverlayLocale,
): 'ok' | 'missing' | 'stale' {
  const texts = publishedTexts(lesson.texts, lesson.document);
  const complete = lessonLocales({
    title: lesson.title,
    presentation: lesson.presentation ?? undefined,
    texts,
    words: lesson.document.words,
    exercises: lesson.document.exercises,
  }).includes(locale);
  if (!complete) return 'missing';
  const hash = lesson.texts?.[locale]?.sourceHash;
  const current = baseTextsHash(lesson.title, lesson.presentation ?? null, lesson.document);
  return hash && hash !== current ? 'stale' : 'ok';
}

/** Whether a draft lesson still needs a translation into the locale (missing or outdated). */
export function lessonNeedsTexts(lesson: LessonRow, locale: OverlayLocale) {
  if (!lesson.document.exercises.length || !lesson.document.words.length) return false;
  return translationState(lesson, locale) !== 'ok';
}
/** The tasks a texts job for this set needs: lessons first, then the card and language name. */
export async function textsTasks(
  db: Db | Tx,
  course: CourseRow,
  locales: OverlayLocale[],
  force: boolean,
) {
  const rows = await db
    .select()
    .from(lessons)
    .where(eq(lessons.courseId, course.id))
    .orderBy(asc(lessons.position));
  const language = await db.query.languages.findFirst({
    where: eq(languages.code, course.languageCode),
  });
  const lessonTasks = rows
    .filter((l) => l.document.exercises.length && l.document.words.length)
    .filter((l) => force || locales.some((loc) => lessonNeedsTexts(l, loc)))
    .map((l) => ({ stage: 'lesson-texts' as const, targetId: l.id }));
  const cardMissing = locales.some(
    (loc) => !course.texts?.[loc]?.title?.trim() || !language?.titles?.[loc]?.trim(),
  );
  return [
    ...lessonTasks,
    ...(force || cardMissing ? [{ stage: 'course-texts' as const, targetId: 'course' }] : []),
  ];
}

/** Queues a texts job for the set; `nothing_to_generate` when everything is translated. */
export async function queueTextsJob(
  db: Db,
  input: {
    course: CourseRow;
    locales: OverlayLocale[];
    force: boolean;
    modelConfig: ModelConfig;
    idempotencyKey: string;
    requestedBy: string | null;
    costLimitUsd: number;
  },
) {
  return createAssetJob(db, {
    kind: 'texts',
    subjectId: input.course.id,
    courseId: input.course.id,
    brief: { topic: input.course.title, locales: input.locales, force: input.force },
    tasks: await textsTasks(db, input.course, input.locales, input.force),
    modelConfig: input.modelConfig,
    idempotencyKey: input.idempotencyKey,
    requestedBy: input.requestedBy,
    costLimitUsd: input.costLimitUsd,
  });
}

export async function runTextStage(
  ctx: StageContext,
  job: JobRow,
  task: TaskRow,
): Promise<StageResult> {
  const env: Env = {
    ctx,
    job,
    task,
    context: { jobId: job.id, stage: task.stage, targetId: task.targetId },
  };
  switch (task.stage) {
    case 'lesson-texts':
      return lessonTexts(env);
    case 'course-texts':
      return courseTexts(env);
    case 'mascot-texts':
      return wardrobeTexts(env, 'mascot');
    case 'item-texts':
      return wardrobeTexts(env, 'item');
    default:
      throw permanent(`Стадия ${task.stage} не относится к переводу текстов`);
  }
}

const briefLocales = (job: JobRow): OverlayLocale[] =>
  ((job.input as unknown as { locales?: OverlayLocale[] }).locales ?? ['en', 'he']).filter(
    (l): l is OverlayLocale => l === 'en' || l === 'he',
  );

async function structured<T>(
  env: Env,
  schemaName: string,
  schema: Record<string, unknown>,
  prompt: { system: string; user: string },
  payload: unknown,
  parse: (data: unknown) => T,
) {
  const result = await env.ctx.provider.generateText({
    context: env.context,
    model: env.job.modelConfig.text,
    schemaName,
    schema,
    system: prompt.system,
    user: prompt.user,
    payload,
  });
  if (!result.ok)
    throw new ProviderError(
      `Модель отказалась: ${result.refusal}`,
      'permanent',
      null,
      result.requestId,
    );
  const usage = await addUsage(env.ctx.db, env.job.id, {
    ...result.usage,
    estimatedUsd:
      ((result.usage.inputTokens + result.usage.outputTokens) / 1000) *
      env.ctx.rates.textPer1kTokensUsd,
  });
  if (usage && usage.estimatedUsd > env.job.costLimitUsd)
    throw permanent(`Превышен лимит стоимости работы (${usage.estimatedUsd.toFixed(2)} $)`);
  try {
    return { data: parse(result.data), requestId: result.requestId };
  } catch (error) {
    throw new ProviderError(
      `Ответ модели не соответствует схеме: ${(error as Error).message.slice(0, 200)}`,
      'retryable',
      null,
      result.requestId,
    );
  }
}

async function loadCourse(db: Db, id: string) {
  const course = await db.query.courses.findFirst({ where: eq(courses.id, id) });
  if (!course) throw permanent('Сет не найден');
  const language = await db.query.languages.findFirst({
    where: eq(languages.code, course.languageCode),
  });
  if (!language) throw permanent('Язык сета не найден');
  return { course, language };
}

async function lessonTexts(env: Env): Promise<StageResult> {
  const { db } = env.ctx;
  const lesson = await db.query.lessons.findFirst({ where: eq(lessons.id, env.task.targetId) });
  if (!lesson) throw permanent('Урок не найден');
  const { language } = await loadCourse(db, lesson.courseId);
  const locales = briefLocales(env.job);
  const doc = lesson.document;
  const payload = {
    learningLanguageTitle: `${language.title} (${language.code})`,
    locales,
    lesson: {
      title: lesson.title,
      presentation: lesson.presentation ?? null,
      words: doc.words.map((w) => ({ id: w.id, text: w.text, translation: w.translation })),
      exercises: doc.exercises.map((e) => ({
        id: e.id,
        type: e.type,
        prompt: e.prompt,
        hint: e.hint,
      })),
    },
  };
  const { data, requestId } = await structured(
    env,
    'lesson_texts',
    toJsonSchema(lessonTextsDtoSchema),
    lessonTextsPrompt(payload),
    payload,
    (raw) => lessonTextsDtoSchema.parse(raw),
  );
  const hash = baseTextsHash(lesson.title, lesson.presentation ?? null, doc);
  const translated: Partial<Record<OverlayLocale, DraftLessonTexts>> = {};
  for (const locale of locales) {
    const t = data.locales.find((x) => x.locale === locale);
    if (!t) throw retryable(`В ответе нет перевода на ${locale}`);
    const exercises = Object.fromEntries(t.exercises.map((e) => [e.id, e]));
    const words = Object.fromEntries(t.words.map((w) => [w.id, w]));
    const missing = [
      ...doc.exercises
        .filter((e) => !exercises[e.id]?.prompt.trim() || !exercises[e.id]?.hint.trim())
        .map((e) => e.id),
      ...doc.words.filter((w) => !words[w.id]?.translation.trim()).map((w) => w.id),
    ];
    if (!t.title.trim() || missing.length || (lesson.presentation && !t.presentation))
      throw retryable(
        `Перевод на ${locale} неполный${missing.length ? `: ${missing.join(', ')}` : ''}`,
      );
    translated[locale] = {
      title: clip(t.title, 100),
      ...(lesson.presentation && t.presentation
        ? {
            presentation: {
              intro: clip(t.presentation.intro, 300),
              completionTitle: clip(t.presentation.completionTitle, 100),
              completionMessage: clip(t.presentation.completionMessage, 400),
            },
          }
        : {}),
      exercises: Object.fromEntries(
        doc.exercises.map((e) => [
          e.id,
          { prompt: clip(exercises[e.id]!.prompt, 200), hint: clip(exercises[e.id]!.hint, 300) },
        ]),
      ),
      words: Object.fromEntries(
        doc.words.map((w) => [w.id, { translation: clip(words[w.id]!.translation, 100) }]),
      ),
      sourceHash: hash,
    };
  }
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(lessons)
      .where(eq(lessons.id, lesson.id))
      .for('update');
    if (!current) throw permanent('Урок удалён во время перевода');
    // The Russian changed while the model was translating: translate the new text instead.
    if (baseTextsHash(current.title, current.presentation ?? null, current.document) !== hash)
      throw retryable('Русский текст урока изменился во время перевода');
    await tx
      .update(lessons)
      .set({
        texts: { ...current.texts, ...translated },
        editRevision: sql`${lessons.editRevision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(lessons.id, lesson.id));
  });
  return { output: { locales }, requestId };
}

async function courseTexts(env: Env): Promise<StageResult> {
  const { db } = env.ctx;
  const { course, language } = await loadCourse(db, env.job.subjectId ?? '');
  const locales = briefLocales(env.job);
  const payload = {
    locales,
    title: course.title,
    description: course.description,
    languageTitle: language.title,
  };
  const { data, requestId } = await structured(
    env,
    'course_texts',
    toJsonSchema(courseTextsDtoSchema),
    courseTextsPrompt(payload),
    payload,
    (raw) => courseTextsDtoSchema.parse(raw),
  );
  await db.transaction(async (tx) => {
    const [currentCourse] = await tx
      .select()
      .from(courses)
      .where(eq(courses.id, course.id))
      .for('update');
    const [currentLanguage] = await tx
      .select()
      .from(languages)
      .where(eq(languages.code, language.code))
      .for('update');
    const texts = { ...currentCourse!.texts };
    const titles = { ...currentLanguage!.titles };
    for (const locale of locales) {
      const t = data.locales.find((x) => x.locale === locale);
      if (!t?.title.trim()) throw retryable(`В ответе нет названия сета на ${locale}`);
      texts[locale] = {
        title: clip(t.title, 100),
        description: currentCourse!.description && t.description ? clip(t.description, 200) : null,
      };
      // A language name an admin typed stays; only a missing one is filled.
      if (!titles[locale]?.trim() && t.languageTitle.trim())
        titles[locale] = clip(t.languageTitle, 100);
    }
    await tx
      .update(courses)
      .set({ texts, editRevision: sql`${courses.editRevision} + 1`, updatedAt: new Date() })
      .where(eq(courses.id, course.id));
    await tx
      .update(languages)
      .set({ titles, updatedAt: new Date() })
      .where(eq(languages.code, language.code));
  });
  return { output: { locales }, requestId };
}

/* --- Mascots and shop items («Маскоты», «Магазин») --- */

type MascotRow = typeof mascots.$inferSelect;
type ItemRow = typeof shopItems.$inferSelect;
type WardrobeKind = 'mascot' | 'item';
const MASCOT_LIMITS = { name: 40, withName: 40, trait: 60, perk: 80 } as const;
const ITEM_LIMITS = { name: 40, description: 120 } as const;

/** The Russian texts a translation is made from. */
export function wardrobeSource(
  kind: WardrobeKind,
  row: MascotRow | ItemRow,
): Record<string, string> {
  return kind === 'mascot'
    ? {
        name: row.name,
        withName: (row as MascotRow).withName,
        trait: (row as MascotRow).trait,
        perk: (row as MascotRow).perk,
      }
    : { name: row.name, description: (row as ItemRow).description };
}
/** Fingerprint of the Russian texts: a changed one makes the translation outdated. */
export const wardrobeHash = (source: Record<string, string>) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        Object.keys(source)
          .sort()
          .map((k) => [k, source[k]]),
      ),
    )
    .digest('hex')
    .slice(0, 16);

/** Translation state of a mascot or an item for the panel. */
export function wardrobeTextsState(
  kind: WardrobeKind,
  row: MascotRow | ItemRow,
  locale: OverlayLocale,
): 'ok' | 'missing' | 'stale' {
  const source = wardrobeSource(kind, row);
  const t = row.texts?.[locale] as Record<string, string | undefined> | undefined;
  if (!t || Object.keys(source).some((k) => !t[k]?.trim())) return 'missing';
  return t.sourceHash && t.sourceHash !== wardrobeHash(source) ? 'stale' : 'ok';
}
export const wardrobeTranslations = (kind: WardrobeKind, row: MascotRow | ItemRow) => ({
  en: wardrobeTextsState(kind, row, 'en'),
  he: wardrobeTextsState(kind, row, 'he'),
});

/** Queues one job translating every mascot and item that lacks (or has an outdated) text. */
export async function queueWardrobeTextsJob(
  db: Db,
  input: {
    locales: OverlayLocale[];
    force: boolean;
    modelConfig: ModelConfig;
    idempotencyKey: string;
    requestedBy: string | null;
    costLimitUsd: number;
  },
) {
  const needs = (kind: WardrobeKind, row: MascotRow | ItemRow) =>
    input.force || input.locales.some((l) => wardrobeTextsState(kind, row, l) !== 'ok');
  const tasks = [
    ...(await db.select().from(mascots).orderBy(asc(mascots.position)))
      .filter((m) => needs('mascot', m))
      .map((m) => ({ stage: 'mascot-texts' as const, targetId: m.id })),
    ...(await db.select().from(shopItems).orderBy(asc(shopItems.position)))
      .filter((i) => needs('item', i))
      .map((i) => ({ stage: 'item-texts' as const, targetId: i.id })),
  ];
  return createAssetJob(db, {
    kind: 'texts',
    subjectId: 'wardrobe',
    brief: { topic: 'wardrobe', locales: input.locales, force: input.force },
    tasks,
    modelConfig: input.modelConfig,
    idempotencyKey: input.idempotencyKey,
    requestedBy: input.requestedBy,
    costLimitUsd: input.costLimitUsd,
  });
}

async function wardrobeTexts(env: Env, kind: WardrobeKind): Promise<StageResult> {
  const { db } = env.ctx;
  const table = kind === 'mascot' ? mascots : shopItems;
  const load = async (tx: Db | Tx, lock = false) => {
    const query = tx.select().from(table).where(eq(table.id, env.task.targetId));
    const [row] = lock ? await query.for('update') : await query;
    return row as MascotRow | ItemRow | undefined;
  };
  const row = await load(db);
  if (!row) throw permanent(kind === 'mascot' ? 'Маскот не найден' : 'Вещь не найдена');
  const source = wardrobeSource(kind, row);
  const hash = wardrobeHash(source);
  const locales = briefLocales(env.job);
  const payload: WardrobeTextsPayload = { locales, kind, fields: source };
  const dto = kind === 'mascot' ? mascotTextsDtoSchema : itemTextsDtoSchema;
  const { data, requestId } = await structured(
    env,
    `${kind}_texts`,
    toJsonSchema(dto),
    wardrobeTextsPrompt(payload),
    payload,
    (raw) => dto.parse(raw) as { locales: ({ locale: OverlayLocale } & Record<string, string>)[] },
  );
  const limits: Record<string, number> = kind === 'mascot' ? MASCOT_LIMITS : ITEM_LIMITS;
  const translated: Record<string, Record<string, string>> = {};
  for (const locale of locales) {
    const t = data.locales.find((x) => x.locale === locale);
    const missing = Object.keys(source).filter((k) => !t?.[k]?.trim());
    if (!t || missing.length)
      throw retryable(`Перевод на ${locale} неполный: ${missing.join(', ') || 'нет записи'}`);
    translated[locale] = {
      ...Object.fromEntries(Object.keys(source).map((k) => [k, clip(t[k]!, limits[k]!)])),
      sourceHash: hash,
    };
  }
  await db.transaction(async (tx) => {
    const current = await load(tx, true);
    if (!current) throw permanent('Удалено во время перевода');
    const now = wardrobeSource(kind, current);
    if (wardrobeHash(now) !== hash) throw retryable('Русский текст изменился во время перевода');
    await tx
      .update(table)
      .set({ texts: { ...current.texts, ...translated }, updatedAt: new Date() })
      .where(eq(table.id, current.id));
  });
  return { output: { locales }, requestId };
}
