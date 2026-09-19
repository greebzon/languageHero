import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { courseCards } from '@lingvohero/learning-core';
import { useDemo } from '../state/DemoProvider';
import { useT } from '../i18n';
import { languageName } from '../i18n/content';
import { Heading, Icon, Label, Tim } from './ui';
import { colors, fonts } from '../theme';

export type PickerMode = 'first' | 'launch' | 'screen';

/**
 * Choosing the learning language. `first`: nothing learned yet (after the sign-up);
 * `launch`: several languages, asked at every start; `screen`: the «Языки» screen of the menu,
 * where another language can be added. Only languages with sets visible in the interface
 * language can be added.
 */
export function LanguagePicker({
  mode,
  onPicked,
}: {
  mode: PickerMode;
  onPicked: (code: string) => void;
}) {
  const { t, tn, locale } = useT();
  const { catalog, fullCatalog, state, language, languages, chooseLanguage } = useDemo();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(false);
  const mine = mode === 'first' ? [] : languages;
  const available = fullCatalog.languages
    .map((l) => l.code)
    .filter((code) => !mine.includes(code) && catalog.courses.some((c) => c.language === code));
  async function pick(code: string) {
    if (busy) return;
    setBusy(true);
    const saved = await chooseLanguage(code);
    setBusy(false);
    // Offline the language still switches here; on the screen the child sees why it may not
    // reach other devices yet, at the start the game simply goes on.
    if (!saved && mode === 'screen') setNotice(true);
    else onPicked(code);
  }
  const row = (code: string, own: boolean) => {
    const cards = courseCards(catalog, state, code);
    const current = own && mode === 'screen' && code === language;
    const name = languageName(fullCatalog, code, locale);
    return (
      <Pressable
        key={code}
        testID={`language-${code}`}
        accessibilityRole="button"
        accessibilityLabel={t('languages.pick', { language: name })}
        accessibilityState={{ selected: current, disabled: busy }}
        disabled={busy}
        onPress={() => void pick(code)}
        style={({ pressed }) => [s.row, current && s.rowOn, pressed && { opacity: 0.75 }]}
      >
        <View style={[s.flag, current && s.flagOn]}>
          <Label style={[s.code, current && { color: '#FFFFFF' }]}>{code.toUpperCase()}</Label>
        </View>
        <View style={s.flex}>
          <Heading style={s.name}>{name}</Heading>
          {own && cards.length > 0 && (
            <Label style={s.meta}>
              {tn('languages.sets', cards.length, {
                done: cards.filter((c) => c.complete).length,
              })}
            </Label>
          )}
        </View>
        {current ? (
          <View style={s.badge}>
            <Label style={s.badgeText}>{t('languages.current')}</Label>
          </View>
        ) : (
          <Icon name={own ? 'arrow-forward' : 'add-circle-outline'} size={24} />
        )}
      </Pressable>
    );
  };
  const content = (
    <View style={s.page}>
      {mode !== 'screen' && (
        <View style={s.intro}>
          <Tim size={84} />
          <Heading style={s.title}>
            {mode === 'first' ? t('languages.firstTitle') : t('languages.launchTitle')}
          </Heading>
          <Label style={s.hint}>
            {mode === 'first' ? t('languages.firstHint') : t('languages.launchHint')}
          </Label>
        </View>
      )}
      {mode === 'screen' && <Label style={s.hint}>{t('languages.hint')}</Label>}
      {mine.length > 0 && (
        <View style={s.section}>
          {mode === 'screen' && <Heading style={s.sectionTitle}>{t('languages.mine')}</Heading>}
          {mine.map((code) => row(code, true))}
        </View>
      )}
      {mode !== 'launch' && available.length > 0 && (
        <View style={s.section}>
          {mode === 'screen' && <Heading style={s.sectionTitle}>{t('languages.add')}</Heading>}
          {available.map((code) => row(code, false))}
        </View>
      )}
      {mode === 'first' && available.length === 0 && (
        <Label style={s.hint}>{t('languages.none')}</Label>
      )}
      {notice && (
        <View accessibilityLiveRegion="polite" style={s.notice}>
          <Icon name="cloud-offline-outline" size={18} color={colors.amberDark} />
          <Label style={s.noticeText}>{t('languages.saveFailed')}</Label>
        </View>
      )}
    </View>
  );
  if (mode === 'screen') return content;
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>{content}</ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  page: { width: '100%', maxWidth: 500, alignSelf: 'center', gap: 18 },
  flex: { flex: 1 },
  intro: { alignItems: 'center', gap: 8 },
  title: { fontSize: 26, lineHeight: 32, textAlign: 'center', marginTop: 6 },
  hint: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  section: { gap: 10 },
  sectionTitle: { fontSize: 19, lineHeight: 25 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 76,
    padding: 14,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 5,
    borderBottomColor: '#D5E3FC',
  },
  rowOn: { backgroundColor: colors.mint, borderBottomColor: '#A8E6B8' },
  flag: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#E6EEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagOn: { backgroundColor: colors.green },
  code: { fontFamily: fonts.heavy, fontSize: 15, color: '#004564' },
  name: { fontSize: 19, lineHeight: 25 },
  meta: { fontSize: 13, lineHeight: 18, color: colors.muted },
  badge: {
    backgroundColor: colors.green,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontFamily: fonts.bold, fontSize: 12, color: '#FFFFFF' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.cream,
    borderRadius: 16,
    padding: 12,
  },
  noticeText: { fontSize: 13, lineHeight: 18, flex: 1 },
});
