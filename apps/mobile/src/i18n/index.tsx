/* The app's interface language: the current locale, `t()` and counted phrases.
   Texts live in `texts/` (one file per section, every locale side by side); Russian is the
   source of the keys. The locale is the child's choice, else the device language, else Russian. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { LOCALES, type Locale } from '@lingvohero/contracts';
import { DICTIONARIES, type RuDictionary } from './texts';
import { pluralForm, type PluralForms } from './plural';
import { applyDirection, isRtlLocale } from './rtl';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${P}${K}`
    : T[K] extends { other: string }
      ? never
      : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
type PluralLeaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? never
    : T[K] extends { other: string }
      ? `${P}${K}`
      : PluralLeaves<T[K], `${P}${K}.`>;
}[keyof T & string];
/** A key of a plain text, such as `'home.hello'`. */
export type TextKey = Leaves<RuDictionary>;
/** A key of a counted phrase, such as `'course.exercises'`. */
export type PluralKey = PluralLeaves<RuDictionary>;
export type Params = Record<string, string | number>;

export const LOCALE_KEY = 'lingvohero.locale';
/** Each interface language in its own script, for the language switcher. */
export const LOCALE_NAMES: Record<Locale, string> = { ru: 'Русский', en: 'English', he: 'עברית' };
export { isRtlLocale, restartForDirection } from './rtl';

const lookup = (dict: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], dict);
const fill = (text: string, params?: Params) =>
  params ? text.replace(/\{(\w+)\}/g, (all, name: string) => String(params[name] ?? all)) : text;

/**
 * «3 / 15» that stays in that order inside right-to-left text: Android otherwise reorders the
 * numbers around a spaced slash («15 / 3»). Isolated only in RTL, other texts stay untouched.
 */
export const fraction = (done: number, total: number, rtl: boolean) =>
  rtl ? `\u2066${done} / ${total}\u2069` : `${done} / ${total}`;

/** A text in the locale (Russian if a dictionary somehow lacks it). */
export function translate(locale: Locale, key: TextKey, params?: Params): string {
  const text = lookup(DICTIONARIES[locale], key) ?? lookup(DICTIONARIES.ru, key);
  return fill(typeof text === 'string' ? text : key, params);
}
/** A counted phrase in the locale's plural form; `{n}` is the count. */
export function translatePlural(locale: Locale, key: PluralKey, n: number, params?: Params) {
  const forms = (lookup(DICTIONARIES[locale], key) ?? lookup(DICTIONARIES.ru, key)) as PluralForms;
  return fill(pluralForm(locale, n, forms), { n, ...params });
}
/** A text by a key built at run time (ids from data); undefined when the dictionary has none. */
export function translateOptional(locale: Locale, key: string, params?: Params) {
  const text = lookup(DICTIONARIES[locale], key);
  return typeof text === 'string' ? fill(text, params) : undefined;
}

let active: Locale = 'ru';
/** The interface language right now, for code outside React (request errors). */
export const currentLocale = () => active;

const isLocale = (value: unknown): value is Locale =>
  (LOCALES as readonly unknown[]).includes(value);
/** The device's language when the app speaks it, else Russian. */
export function deviceLocale(): Locale {
  for (const { languageCode } of getLocales()) if (isLocale(languageCode)) return languageCode;
  return 'ru';
}

type LocaleContext = {
  locale: Locale;
  isRTL: boolean;
  /** True once the child picked a language (here or on another device); false = device language. */
  chosen: boolean;
  /** Saves the choice; resolves true when the app must restart for a new writing direction. */
  setLocale: (locale: Locale) => Promise<boolean>;
};
const Context = createContext<LocaleContext | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ locale: Locale; chosen: boolean } | null>(null);
  useEffect(() => {
    let mounted = true;
    void (async () => {
      let saved: string | null = null;
      try {
        saved = await AsyncStorage.getItem(LOCALE_KEY);
      } catch {
        // Storage is unavailable: fall back to the device language.
      }
      const next = isLocale(saved)
        ? { locale: saved, chosen: true }
        : { locale: deviceLocale(), chosen: false };
      applyDirection(next.locale);
      if (mounted) setState(next);
    })();
    return () => {
      mounted = false;
    };
  }, []);
  const setLocale = useCallback(async (locale: Locale) => {
    // Saved before any restart, so the app comes back with the same words and direction.
    try {
      await AsyncStorage.setItem(LOCALE_KEY, locale);
    } catch {
      // The choice still applies for this run.
    }
    setState({ locale, chosen: true });
    return applyDirection(locale);
  }, []);
  if (state) active = state.locale;
  const value = useMemo(
    () => (state ? { ...state, isRTL: isRtlLocale(state.locale), setLocale } : null),
    [state, setLocale],
  );
  if (!value) return null;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLocale(): LocaleContext {
  const value = useContext(Context);
  if (!value) throw new Error('useLocale outside LocaleProvider');
  return value;
}

/** `t('home.hello', { name })`, `tn('course.exercises', 5)` in the interface language. */
export function useT() {
  const { locale, isRTL } = useLocale();
  return useMemo(
    () => ({
      locale,
      isRTL,
      t: (key: TextKey, params?: Params) => translate(locale, key, params),
      tn: (key: PluralKey, n: number, params?: Params) => translatePlural(locale, key, n, params),
    }),
    [locale, isRTL],
  );
}
