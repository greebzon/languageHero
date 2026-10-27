/* Showing content in the child's interface locale. Pure: the app and the server use the same
   rules, so both agree on which sets exist (hidden sets do not count for unlocking). */
import {
  BASE_LOCALE,
  catalogForMechanics,
  lessonLocales,
  type Catalog,
  type CourseLesson,
  type Locale,
} from './course';

/** The lesson with the locale's texts in its base fields; untouched for the base locale. */
export function localizeLesson(lesson: CourseLesson, locale: Locale): CourseLesson {
  if (locale === BASE_LOCALE) return lesson;
  const t = lesson.texts?.[locale as Exclude<Locale, 'ru'>];
  if (!t || !lessonLocales(lesson).includes(locale)) return lesson;
  return {
    ...lesson,
    title: t.title ?? lesson.title,
    presentation: t.presentation ?? lesson.presentation,
    words: lesson.words.map((w) => ({ ...w, ...t.words?.[w.id] })),
    exercises: lesson.exercises.map((e) => ({ ...e, ...t.exercises?.[e.id] })),
  };
}

type Card = {
  title: string;
  description?: string;
  texts?: Partial<Record<string, { title: string; description?: string }>>;
};
/** A set or preview card with its title and description in the locale (base as fallback). */
export function localizeCard<T extends Card>(card: T, locale: Locale): T {
  const t = locale === BASE_LOCALE ? undefined : card.texts?.[locale];
  return t ? { ...card, title: t.title, description: t.description ?? card.description } : card;
}

/** A learning language's name in the interface locale. */
export function languageTitle(language: Catalog['languages'][number], locale: Locale): string {
  return (locale === BASE_LOCALE ? undefined : language.titles?.[locale]) ?? language.title;
}

/**
 * The catalog a child with this interface locale sees: sets translated to it (catalogs from
 * before translations had no `locales` and count as Russian only), previews with its texts,
 * every title in the locale. Lesson refs keep their base titles: they are checked against
 * the packages. With `mechanics`, lessons the client cannot show are left out as well.
 */
export function visibleCatalog(
  full: Catalog,
  locale: Locale,
  mechanics?: readonly string[],
): Catalog {
  const catalog = mechanics ? catalogForMechanics(full, mechanics) : full;
  if (locale === BASE_LOCALE) return catalog;
  return {
    ...catalog,
    courses: catalog.courses
      .filter((c) => (c.locales ?? [BASE_LOCALE]).includes(locale))
      .map((c) => localizeCard(c, locale)),
    previews: (catalog.previews ?? [])
      .filter((p) => !!p.texts?.[locale as Exclude<Locale, 'ru'>])
      .map((p) => localizeCard(p, locale)),
  };
}
