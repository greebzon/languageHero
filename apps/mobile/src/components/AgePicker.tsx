import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Heading, Label, Tim } from './ui';
import { useT } from '../i18n';
import { colors, fonts } from '../theme';

/* The children the app is for are 6–9; younger and older brothers and sisters play too. */
export const AGES = [4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Big number buttons: a child who cannot read yet still knows the digits of their age. */
export function AgePicker({
  selected,
  onPick,
  disabled,
  compact,
}: {
  selected: number | null;
  onPick: (age: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { tn } = useT();
  return (
    <View style={[s.grid, !compact && s.square]} accessibilityRole="radiogroup">
      {AGES.map((age) => (
        <Pressable
          key={age}
          testID={`age-${age}`}
          accessibilityRole="radio"
          accessibilityLabel={tn('welcome.age.years', age)}
          // aria-* rather than accessibilityState: react-native-web drops `checked` from the latter.
          aria-checked={selected === age}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={() => onPick(age)}
          style={({ pressed }) => [
            s.age,
            compact && s.compact,
            selected === age && s.selected,
            pressed && { opacity: 0.75 },
          ]}
        >
          <Label style={[s.number, compact && s.compactNumber, selected === age && s.on]}>
            {age}
          </Label>
        </Pressable>
      ))}
    </View>
  );
}

/** «Сколько тебе лет?» before the sets: after the sign-up, and once for older accounts. */
export function AgeQuestion({ onPick }: { onPick: (age: number) => Promise<void> }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.page}>
          <View style={s.intro}>
            <Tim size={84} />
            <Heading style={s.title}>{t('welcome.age.title')}</Heading>
            <Label style={s.hint}>{t('welcome.age.hint')}</Label>
          </View>
          <AgePicker
            selected={null}
            disabled={busy}
            onPick={(age) => {
              setBusy(true);
              void onPick(age).finally(() => setBusy(false));
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  page: { width: '100%', maxWidth: 500, alignSelf: 'center', gap: 22 },
  intro: { alignItems: 'center', gap: 8 },
  title: { fontSize: 26, lineHeight: 32, textAlign: 'center', marginTop: 6 },
  hint: { fontSize: 15, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 },
  // Three rows of three: the numbers read like a phone keypad.
  square: { maxWidth: 3 * 84 + 2 * 12, alignSelf: 'center' },
  age: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderBottomWidth: 6,
    borderColor: '#D5E3FC',
  },
  compact: { width: 56, height: 56, borderRadius: 28, borderBottomWidth: 4 },
  selected: { backgroundColor: colors.green, borderColor: colors.greenDark },
  number: { fontFamily: fonts.heavy, fontSize: 34, lineHeight: 42, color: colors.ink },
  compactNumber: { fontSize: 22, lineHeight: 28 },
  on: { color: '#FFFFFF' },
});
