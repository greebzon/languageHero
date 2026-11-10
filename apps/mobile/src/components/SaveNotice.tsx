import { Pressable, View } from 'react-native';
import { useAccount } from '../account/context';
import { Icon, Label } from './ui';
import { colors, fonts } from '../theme';
import { useT } from '../i18n';

/* The sign-in has ended: the game goes on, but results only wait on the device until the
   email is confirmed, so this stays in sight on every screen outside a lesson. */
export function SaveNotice() {
  const { expired, loginScreen } = useAccount();
  const { t } = useT();
  if (!expired) return null;
  return (
    <Pressable
      testID="confirm-email"
      accessibilityRole="button"
      accessibilityLabel={t('app.sync.waiting')}
      onPress={loginScreen}
      style={{
        minHeight: 48,
        backgroundColor: colors.cream,
        paddingHorizontal: 18,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Icon name="mail-outline" color={colors.amberDark} size={20} />
      <Label style={{ fontSize: 13, lineHeight: 18, flex: 1 }}>{t('app.sync.waiting')}</Label>
      <View style={{ backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 12 }}>
        <Label style={{ fontSize: 12, lineHeight: 28, fontFamily: fonts.bold }}>
          {t('settings.confirmEmail')}
        </Label>
      </View>
    </Pressable>
  );
}
