import type { Locale } from '@lingvohero/contracts';

/** Plural forms of one phrase; each locale uses the categories its grammar has. */
export type PluralForms = { one: string; two?: string; few?: string; many?: string; other: string };

/**
 * The plural category of `n` in the locale: Russian has one / few / many (1, 2–4, 5+ with
 * 11–14 as many), English one / other, Hebrew one / two / other (the dual «יומיים»).
 */
export function pluralForm(locale: Locale, n: number, forms: PluralForms): string {
  const abs = Math.abs(n);
  if (locale === 'ru') {
    const tens = abs % 100;
    const units = tens % 10;
    if (tens > 10 && tens < 20) return forms.many ?? forms.other;
    if (units === 1) return forms.one;
    if (units >= 2 && units <= 4) return forms.few ?? forms.other;
    return forms.many ?? forms.other;
  }
  if (locale === 'he') {
    if (abs === 1) return forms.one;
    if (abs === 2) return forms.two ?? forms.other;
    return forms.other;
  }
  return abs === 1 ? forms.one : forms.other;
}
