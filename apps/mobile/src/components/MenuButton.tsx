import { Pressable, StyleSheet } from 'react-native';
import { Icon } from './ui';
import { useDrawer } from '../navigation/DrawerContext';
import { useT } from '../i18n';

/** ☰ in the headers: opens the side menu (a swipe from the edge does the same). */
export function MenuButton({ color = '#0D1C2E' }: { color?: string }) {
  const { open } = useDrawer();
  const { t } = useT();
  return (
    <Pressable
      testID="open-menu"
      accessibilityRole="button"
      accessibilityLabel={t('menu.open')}
      onPress={open}
      hitSlop={6}
      style={({ pressed }) => [s.button, pressed && { opacity: 0.6 }]}
    >
      <Icon name="menu" size={26} color={color} />
    </Pressable>
  );
}
const s = StyleSheet.create({
  button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
