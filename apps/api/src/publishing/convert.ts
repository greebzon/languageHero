import {
  OVERLAY_LOCALES,
  courseLessonSchema,
  type CourseLesson,
  type DraftTexts,
  type LessonDocument,
  type LessonPresentation,
  type LessonTexts,
} from '@lingvohero/contracts';
import { fieldErrorsFromZod, type FieldErrors } from '../admin/errors.js';
import { extFromPath, mediaPath, shaFromPath } from '../admin/media.js';
import { canonicalJson, sha256 } from './hash.js';

type OverlayLocale = (typeof OVERLAY_LOCALES)[number];

/**
 * Fingerprint of a lesson's Russian texts (title, Tim's lines, prompts, hints, translations).
 * A translation stores the fingerprint it was made from; a different one now means the
 * Russian changed since and the translation is outdated.
 */
export function baseTextsHash(
  title: string,
  presentation: LessonPresentation | null,
  document: Pick<LessonDocument, 'words' | 'exercises'>,
) {
  return sha256(
    canonicalJson({
      title,
      presentation,
      exercises: document.exercises.map((e) => [e.id, e.prompt, e.hint]),
      words: document.words.map((w) => [w.id, w.translation]),
    }),
  ).slice(0, 16);
}

/**
 * Draft translations -> the package overlay: only filled texts for exercises and words that
 * still exist, a presentation only when all three lines are there, no draft bookkeeping.
 */
export function publishedTexts(
  texts: DraftTexts | null | undefined,
  document: Pick<LessonDocument, 'words' | 'exercises'>,
): Partial<Record<OverlayLocale, LessonTexts>> | undefined {
  const out: Partial<Record<OverlayLocale, LessonTexts>> = {};
  for (const locale of OVERLAY_LOCALES) {
    const t = texts?.[locale];
    if (!t) continue;
    const exercises: NonNullable<LessonTexts['exercises']> = {};
    for (const e of document.exercises) {
      const x = t.exercises?.[e.id];
      if (x?.prompt.trim() && x.hint.trim())
        exercises[e.id] = { prompt: x.prompt.trim(), hint: x.hint.trim() };
    }
    const words: NonNullable<LessonTexts['words']> = {};
    for (const w of document.words) {
      const translation = t.words?.[w.id]?.translation.trim();
      if (translation) words[w.id] = { translation };
    }
    const p = t.presentation;
    const entry: LessonTexts = {
      ...(t.title?.trim() ? { title: t.title.trim() } : {}),
      ...(p && p.intro.trim() && p.completionTitle.trim() && p.completionMessage.trim()
        ? {
            presentation: {
              intro: p.intro.trim(),
              completionTitle: p.completionTitle.trim(),
              completionMessage: p.completionMessage.trim(),
            },
          }
        : {}),
      ...(Object.keys(exercises).length ? { exercises } : {}),
      ...(Object.keys(words).length ? { words } : {}),
    };
    if (Object.keys(entry).length) out[locale] = entry;
  }
  return Object.keys(out).length ? out : undefined;
}

export type AssetRef = { id: string; sha256: string; ext: 'png' | 'wav' };

/** Published package → editable draft document (media paths become asset references). */
export function toLessonDocument(
  lesson: CourseLesson,
  assetIdBySha: ReadonlyMap<string, string>,
): LessonDocument {
  return {
    words: lesson.words,
    media: lesson.media.map(({ path, ...media }) => {
      const assetId = assetIdBySha.get(shaFromPath(path));
      if (!assetId) throw new Error(`Unknown media for ${media.id}: ${path}`);
      return { ...media, assetId };
    }),
    exercises: lesson.exercises,
  };
}

export type LessonMeta = {
  id: string;
  version: number;
  language: string;
  title: string;
  presentation: LessonPresentation | null;
  texts?: DraftTexts | null;
};

/**
 * Draft → strict package. Every reference and solvability rule of `courseLessonSchema` applies,
 * so the result is exactly what the mobile client will receive.
 */
export function toCourseLesson(
  document: LessonDocument,
  meta: LessonMeta,
  assetsById: ReadonlyMap<string, AssetRef>,
):
  | { lesson: CourseLesson; fieldErrors?: undefined }
  | { lesson?: undefined; fieldErrors: FieldErrors } {
  const fieldErrors: FieldErrors = {};
  const media = document.media.map((item, index) => {
    const asset = assetsById.get(item.assetId);
    if (!asset) fieldErrors[`media.${index}.assetId`] = ['Файл не найден'];
    const { assetId: _assetId, ...rest } = item;
    return { ...rest, path: asset ? mediaPath(asset.sha256, asset.ext) : '/v1/media/missing' };
  });
  if (Object.keys(fieldErrors).length) return { fieldErrors };
  const texts = publishedTexts(meta.texts, document);
  const result = courseLessonSchema.safeParse({
    schemaVersion: 2,
    id: meta.id,
    version: meta.version,
    language: meta.language,
    title: meta.title,
    ...(meta.presentation ? { presentation: meta.presentation } : {}),
    ...(texts ? { texts } : {}),
    words: document.words,
    media,
    exercises: document.exercises,
  });
  if (!result.success) return { fieldErrors: fieldErrorsFromZod(result.error) };
  return { lesson: result.data };
}

export const assetExt = (path: string) => extFromPath(path);
