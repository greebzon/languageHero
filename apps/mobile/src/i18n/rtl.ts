import { DevSettings, I18nManager, Platform } from 'react-native';
import type { Locale } from '@lingvohero/contracts';

export const isRtlLocale = (locale: Locale) => locale === 'he';

/**
 * Lays the app out for the locale's writing direction. The web switches at once (CSS flex rows
 * follow `dir`); a native app only picks up a new direction after a restart, so this returns
 * whether one is needed.
 */
export function applyDirection(locale: Locale): boolean {
  const rtl = isRtlLocale(locale);
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = locale;
    }
    return false;
  }
  I18nManager.allowRTL(rtl);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.forceRTL(rtl);
  return true;
}

/** Restarts the app to apply a new writing direction (development builds and Expo Go). */
export function restartForDirection(): boolean {
  if (Platform.OS === 'web') {
    window.location.reload();
    return true;
  }
  if (__DEV__) {
    DevSettings.reload();
    return true;
  }
  // A release build needs expo-updates (`reloadAsync`); until then the child reopens the app.
  return false;
}
