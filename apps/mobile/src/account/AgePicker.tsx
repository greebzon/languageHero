import { StyleSheet, View } from 'react-native';
import { ageFrom } from '@lingvohero/learning-core';
import { ToyButton } from '../components/ui';
import { useT } from '../i18n';

/* Ages the child picks from; 9 stands for «9 and older». */
const AGES = [6, 7, 8, 9] as const;

/** The age button that matches a stored birth year (older children land on 9+). */
export function ageChoice(birthYear: number | null | undefined): number | null {
  if (birthYear == null) return null;
  return Math.min(9, Math.max(6, ageFrom(birthYear)));
}

export function AgePicker({
  value,
  onSelect,
  disabled,
}: {
  value: number | null;
  onSelect: (age: number) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  return (
    <View style={s.row}>
      {AGES.map((age) => (
        <ToyButton
          key={age}
          testID={`age-${age}`}
          title={age === 9 ? '9+' : String(age)}
          accessibilityLabel={t(age === 9 ? 'welcome.ageOlder' : 'welcome.ageLabel', { age })}
          tone={value === age ? 'green' : 'light'}
          disabled={disabled}
          onPress={() => onSelect(age)}
          style={s.age}
        />
      ))}
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  age: { minWidth: 64 },
});
