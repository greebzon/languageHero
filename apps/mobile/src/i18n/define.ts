import type { PluralForms } from './plural';

/** A dictionary shape with any strings: what a translation of Russian texts must look like. */
export type Widen<T> = T extends string
  ? string
  : T extends { other: string }
    ? PluralForms
    : { [K in keyof T]: Widen<T[K]> };

/**
 * One section of the interface texts in every locale. Russian is the source: English and
 * Hebrew must have exactly its keys (tsc reports a missing one). `{name}` is a parameter; an
 * object with `one`/`few`/`many`/`two`/`other` is a counted phrase where `{n}` is the count
 * (Russian uses one/few/many, English one/other, Hebrew one/two/other).
 */
export function defineTexts<const T>(texts: { ru: T; en: Widen<T>; he: Widen<T> }) {
  return texts;
}
