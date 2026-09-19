import {
  OVERLAY_LOCALES,
  courseLocales,
  lessonLocales,
  releaseSchema,
  type Catalog,
  type CourseLesson,
  type Release,
} from '@lingvohero/contracts';
import { fieldErrorsFromZod, type FieldErrors } from '../admin/errors.js';
import { mediaPath } from '../admin/media.js';
import type { PlanLesson, courses, languages, lessons } from '../db/schema.js';
import { baseTextsHash, toCourseLesson, type AssetRef } from './convert.js';
import { lessonHash } from './hash.js';

export type LanguageRow = typeof languages.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type LessonRow = typeof lessons.$inferSelect;

export type BuildEntity = 'language' | 'course' | 'lesson' | 'catalog';
export type BuildIssue = { entity: BuildEntity; id: string; fieldErrors: FieldErrors };
export type BuildWarning = { entity: BuildEntity; id: string; message: string };
export type BuildInput = {
  languages: LanguageRow[];
  courses: CourseRow[];
  lessons: LessonRow[];
  assets: ReadonlyMap<string, AssetRef>;
  revision: number;
};
export type BuildOutput = {
  release: Release | null;
  plan: PlanLesson[];
  errors: BuildIssue[];
  warnings: BuildWarning[];
};

const byOrder = <T extends { position: number; id?: string; code?: string }>(a: T, b: T) =>
  a.position - b.position || (a.id ?? a.code ?? '').localeCompare(b.id ?? b.code ?? '');

/** Same convention as the seed (`en-forest` → `forest-cover`), so re-publishing keeps ids stable. */
export const coverId = (course: Pick<CourseRow, 'id' | 'languageCode'>) => {
  const stem = course.id.startsWith(`${course.languageCode}-`)
    ? course.id.slice(course.languageCode.length + 1)
    : course.id;
  return `${stem || course.id}-cover`;
};

/** A set's translated title and description, only the filled ones. */
function cardTexts(course: CourseRow): Pick<Catalog['courses'][number], 'texts'> {
  const texts: NonNullable<Catalog['courses'][number]['texts']> = {};
  for (const l of OVERLAY_LOCALES) {
    const t = course.texts?.[l];
    const title = t?.title?.trim();
    if (!title) continue;
    const description = t?.description?.trim();
    texts[l] = { title, ...(description ? { description } : {}) };
  }
  return Object.keys(texts).length ? { texts } : {};
}

/**
 * Turns the editorial rows into the complete next release. Pure and deterministic: the same
 * rows always produce the same release, so a plan can be hashed, diffed and re-checked later.
 *
 * Rules: only `active` languages; `published` sets with at least one lesson become courses,
 * `preview` sets with a cover become announcements; drafts never leave the database. A lesson
 * keeps its published version while its content hash is unchanged, otherwise the version bumps.
 * Catalog references (title, exercise count, required types) are derived from the package.
 */
export function buildRelease(input: BuildInput): BuildOutput {
  const errors: BuildIssue[] = [];
  const warnings: BuildWarning[] = [];
  const plan: PlanLesson[] = [];
  const active = input.languages.filter((l) => l.status === 'active').sort(byOrder);
  const activeCodes = new Set(active.map((l) => l.code));
  const catalog: Catalog = {
    schemaVersion: 2,
    revision: input.revision,
    languages: active.map(({ code, title, direction, titles }) => {
      const named = Object.fromEntries(
        Object.entries(titles ?? {}).filter(([, value]) => value?.trim()),
      );
      return { code, title, direction, ...(Object.keys(named).length ? { titles: named } : {}) };
    }),
    courses: [],
    previews: [],
  };
  const packages: CourseLesson[] = [];

  const coverFor = (course: CourseRow, required: boolean) => {
    if (!course.coverAssetId) {
      if (required)
        errors.push({
          entity: 'course',
          id: course.id,
          fieldErrors: { coverAssetId: ['Анонсу нужна обложка'] },
        });
      else
        warnings.push({
          entity: 'course',
          id: course.id,
          message: 'У сета нет обложки — приложение покажет стандартную иллюстрацию',
        });
      return undefined;
    }
    const asset = input.assets.get(course.coverAssetId);
    if (!asset || asset.ext !== 'png') {
      errors.push({
        entity: 'course',
        id: course.id,
        fieldErrors: { coverAssetId: ['Обложка должна быть загруженным PNG'] },
      });
      return undefined;
    }
    return { id: coverId(course), kind: 'image' as const, path: mediaPath(asset.sha256, 'png') };
  };

  for (const course of [...input.courses].sort(byOrder)) {
    if (!activeCodes.has(course.languageCode)) continue;
    if (course.visibility === 'preview') {
      const cover = coverFor(course, true);
      if (!course.description)
        errors.push({
          entity: 'course',
          id: course.id,
          fieldErrors: { description: ['Анонсу нужно описание'] },
        });
      if (cover && course.description)
        catalog.previews!.push({
          id: course.id,
          language: course.languageCode,
          title: course.title,
          description: course.description,
          cover,
          ...cardTexts(course),
        });
      continue;
    }
    if (course.visibility !== 'published') continue;
    const courseLessons = input.lessons.filter((l) => l.courseId === course.id).sort(byOrder);
    if (!courseLessons.length) {
      errors.push({
        entity: 'course',
        id: course.id,
        fieldErrors: { lessons: ['Опубликованному сету нужен хотя бы один урок'] },
      });
      continue;
    }
    const refs: Catalog['courses'][number]['lessons'] = [];
    const courseLessonsBuilt: CourseLesson[] = [];
    for (const lesson of courseLessons) {
      const built = toCourseLesson(
        lesson.document,
        {
          id: lesson.id,
          version: lesson.lastPublishedVersion ?? 1,
          language: course.languageCode,
          title: lesson.title,
          presentation: lesson.presentation ?? null,
          texts: lesson.texts,
        },
        input.assets,
      );
      if (!built.lesson) {
        errors.push({ entity: 'lesson', id: lesson.id, fieldErrors: built.fieldErrors });
        continue;
      }
      const hash = lessonHash(built.lesson);
      const unchanged = lesson.lastPublishedVersion && lesson.lastPublishedHash === hash;
      const version = unchanged
        ? lesson.lastPublishedVersion!
        : (lesson.lastPublishedVersion ?? 0) + 1;
      const pkg: CourseLesson = { ...built.lesson, version };
      packages.push(pkg);
      courseLessonsBuilt.push(pkg);
      // A translation made from Russian texts that changed since is still published (better
      // than nothing), but the admin is told to refresh it.
      const current = baseTextsHash(lesson.title, lesson.presentation ?? null, lesson.document);
      const stale = OVERLAY_LOCALES.filter(
        (l) => lesson.texts?.[l]?.sourceHash && lesson.texts[l]!.sourceHash !== current,
      );
      if (stale.length)
        warnings.push({
          entity: 'lesson',
          id: lesson.id,
          message: `Перевод устарел (${stale.join(', ')}): русский текст урока изменился после перевода`,
        });
      plan.push({ lessonId: lesson.id, version, hash, editRevision: lesson.editRevision });
      const titles = Object.fromEntries(
        OVERLAY_LOCALES.filter((l) => pkg.texts?.[l]?.title).map((l) => [l, pkg.texts![l]!.title!]),
      );
      refs.push({
        id: pkg.id,
        version,
        title: pkg.title,
        ...(Object.keys(titles).length ? { titles } : {}),
        exerciseCount: pkg.exercises.length,
        requiredTypes: [...new Set(pkg.exercises.map((e) => e.type))].sort(),
      });
    }
    const cover = coverFor(course, false);
    const locales = courseLocales(courseLessonsBuilt);
    // Children see only sets translated to their interface language: say which are missing.
    for (const locale of OVERLAY_LOCALES.filter((l) => !locales.includes(l))) {
      const missing = courseLessonsBuilt.filter((l) => !lessonLocales(l).includes(locale));
      warnings.push({
        entity: 'course',
        id: course.id,
        message: `Сет не виден детям с языком интерфейса ${locale}: нет полного перевода у ${missing.length} из ${courseLessonsBuilt.length} уроков`,
      });
    }
    const texts = cardTexts(course);
    if (locales.some((l) => l !== 'ru' && !texts.texts?.[l]))
      warnings.push({
        entity: 'course',
        id: course.id,
        message: 'Название сета не переведено — в приложении будет показано по-русски',
      });
    catalog.courses.push({
      id: course.id,
      language: course.languageCode,
      title: course.title,
      ...(course.description ? { description: course.description } : {}),
      ...(cover ? { cover } : {}),
      ...texts,
      locales,
      lessons: refs,
    });
  }
  if (!catalog.previews!.length) delete catalog.previews;
  if (errors.length) return { release: null, plan, errors, warnings };
  const parsed = releaseSchema.safeParse({ catalog, lessons: packages });
  if (!parsed.success)
    errors.push({
      entity: 'catalog',
      id: String(input.revision),
      fieldErrors: fieldErrorsFromZod(parsed.error),
    });
  return { release: parsed.success ? parsed.data : null, plan, errors, warnings };
}
