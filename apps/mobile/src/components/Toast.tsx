import { StyleSheet, View } from 'react-native';
import { Heading, Icon, Label } from './ui';
import { colors } from '../theme';

export type ToastMessage = { title: string; text?: string; tone?: 'good' | 'warn' };
/* Bottom-pinned notice: it must stay visible however far the list is scrolled. */
export function Toast({ message }: { message: ToastMessage }) {
  const warn = message.tone === 'warn';
  return (
    <View accessibilityLiveRegion="polite" style={s.card}>
      <View style={[s.icon, warn && s.iconWarn]}>
        <Icon name={warn ? 'alert-circle' : 'sparkles'} size={26} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Heading style={s.title}>{message.title}</Heading>
        {!!message.text && <Label style={s.text}>{message.text}</Label>}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderBottomWidth: 4,
    borderBottomColor: '#D5E3FC',
    padding: 14,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.green,
    borderBottomWidth: 3,
    borderBottomColor: '#004B1E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWarn: { backgroundColor: colors.amber, borderBottomColor: '#684000' },
  title: { fontSize: 15, lineHeight: 20 },
  text: { fontSize: 12, lineHeight: 16, color: '#3D4A3D', marginTop: 2 },
});
