/* Game data in the interface language. Lessons and sets carry their own translations (published
   by the panel); built-in things (quests, trophies, shop goods, bundled mascots) are translated
   by id in `texts/catalog.ts`, and anything unknown there is shown as it came. */
import { useMemo } from 'react';
import {
  languageTitle,
  localizeLesson,
  type Catalog,
  type CourseLesson,
  type Locale,
  type MascotSlot,
  type ShopMascot,
  type ShopRarity,
} from '@lingvohero/contracts';
import { translate, translateOptional, useLocale, type TextKey } from './index';
import { shopCatalog } from '../content/shop';

type Named = { id: string; name: string; description: string };

export const questTitle = (quest: { id: string; title: string }, locale: Locale) =>
  translateOptional(locale, `catalog.quests.${quest.id}`) ?? quest.title;

export const trophyText = (
  trophy: { id: string; title: string; description: string },
  locale: Locale,
) => ({
  title: translateOptional(locale, `catalog.trophies.${trophy.id}.title`) ?? trophy.title,
  description:
    translateOptional(locale, `catalog.trophies.${trophy.id}.description`) ?? trophy.description,
});

export const slotLabel = (slot: MascotSlot, locale: Locale) =>
  translate(locale, `catalog.slots.${slot}` as TextKey);
export const rarityLabel = (rarity: ShopRarity, locale: Locale) =>
  translate(locale, `catalog.rarity.${rarity}` as TextKey);
export const categoryTitle = (category: string, locale: Locale) =>
  translateOptional(locale, `catalog.categories.${category}`) ?? category;

const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
/** Short weekday name; 0 is Monday (the order of `childStats().week`). */
export const weekdayLabel = (index: number, locale: Locale) =>
  translate(locale, `catalog.weekdays.${WEEKDAYS[index % 7]}` as TextKey);

/** A shop item's name and description: the panel's translation, else the built-in one. */
export function itemText<T extends Named>(item: T, locale: Locale): T {
  if (locale === 'ru') return item;
  const published = shopCatalog().items.find((i) => i.id === item.id)?.texts?.[locale];
  if (published) return { ...item, ...published };
  return {
    ...item,
    name: translateOptional(locale, `catalog.items.${item.id}.name`) ?? item.name,
    description:
      translateOptional(locale, `catalog.items.${item.id}.description`) ?? item.description,
  };
}

/** A mascot's texts (`withName` completes «… вместе с {withName}»). */
export function mascotText(mascot: ShopMascot, locale: Locale): ShopMascot {
  if (locale === 'ru') return mascot;
  const published =
    mascot.texts?.[locale] ??
    shopCatalog().mascots.find((m) => m.id === mascot.id)?.texts?.[locale];
  if (published) return { ...mascot, ...published };
  const text = (field: 'name' | 'withName' | 'trait' | 'perk') =>
    translateOptional(locale, `catalog.mascots.${mascot.id}.${field}`) ?? mascot[field];
  return {
    ...mascot,
    name: text('name'),
    withName: text('withName'),
    trait: text('trait'),
    perk: text('perk'),
  };
}

/** A lesson reference's title in the catalog (the set map lists them). */
export const refTitle = (
  ref: { title: string; titles?: Partial<Record<Locale, string>> },
  locale: Locale,
) => (locale === 'ru' ? ref.title : (ref.titles?.[locale] ?? ref.title));

/** The name of a learning language, «Английский» / «English» / «אנגלית». */
export function languageName(catalog: Catalog, code: string, locale: Locale): string {
  const language = catalog.languages.find((l) => l.code === code);
  return language ? languageTitle(language, locale) : code;
}

/** The lesson with its texts in the interface language (the same package otherwise). */
export function useLocalizedLesson(lesson: CourseLesson): CourseLesson;
export function useLocalizedLesson(lesson: CourseLesson | undefined): CourseLesson | undefined;
export function useLocalizedLesson(lesson: CourseLesson | undefined) {
  const { locale } = useLocale();
  return useMemo(() => lesson && localizeLesson(lesson, locale), [lesson, locale]);
}

/**
 * Writing direction of the learned language's words (tiles, spelling, answer slots). They keep
 * it whatever the interface is: an English word stays left-to-right in the Hebrew interface.
 */
export function wordDirection(catalog: Catalog, code: string): 'ltr' | 'rtl' {
  return catalog.languages.find((l) => l.code === code)?.direction === 'rtl' ? 'rtl' : 'ltr';
}

/** Whether to show a word's translation: not when it would just repeat the word itself. */
export const showTranslation = (lessonLanguage: string, locale: Locale) =>
  lessonLanguage.split('-')[0] !== locale;
