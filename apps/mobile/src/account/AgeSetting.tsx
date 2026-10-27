import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { AccountSnapshot } from '@lingvohero/contracts';
import { ageFrom, birthYearFor } from '@lingvohero/learning-core';
import { useAccount } from './context';
import { accountRequest } from './api';
import { accountStyles } from './AccountWelcome';
import { AgePicker } from '../components/AgePicker';
import { Icon, Label } from '../components/ui';
import { useT } from '../i18n';
import { colors, fonts } from '../theme';

/**
 * «Возраст» among the child's own settings: an account from before the age question, or a
 * wrong tap at the start, gets the right «Собери слово» from the next exercise on.
 */
export function AgeSetting() {
  const { account, update } = useAccount();
  const { birthYear } = account!.profile;
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function pick(age: number) {
    setBusy(true);
    setError('');
    try {
      const body = { birthYear: birthYearFor(age, new Date()) };
      update(await accountRequest<AccountSnapshot>('/me', body, 'PATCH'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.tryLater'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.icon}>
          <Icon name="happy-outline" />
        </View>
        <View style={{ flex: 1 }}>
          <Label style={s.title}>{t('settings.age.title')}</Label>
          <Label style={s.hint}>{t('settings.age.hint')}</Label>
        </View>
      </View>
      <AgePicker
        compact
        selected={birthYear === null ? null : ageFrom(birthYear, new Date())}
        disabled={busy}
        onPick={(age) => void pick(age)}
      />
      {!!error && (
        <Label accessibilityLiveRegion="polite" style={accountStyles.error}>
          {error}
        </Label>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    gap: 14,
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 19,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { backgroundColor: colors.mint, padding: 10, borderRadius: 13 },
  title: { fontFamily: fonts.heading, fontSize: 14 },
  hint: { fontSize: 10, lineHeight: 16, color: colors.muted, marginTop: 3 },
});
