import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { childStats } from '@lingvohero/learning-core';
import { Screen } from '../../src/components/Screen';
import { Heading, Icon, Label } from '../../src/components/ui';
import { mascotOf } from '../../src/components/MascotPicker';
import { MascotStage } from '../../src/components/MascotStage';
import { FriendProgress } from '../../src/components/FriendProgress';
import { StatsCard } from '../../src/components/StatsCard';
import { useAccount } from '../../src/account/AccountProvider';
import { AccountSettings } from '../../src/account/AccountSettings';
import { useDemo } from '../../src/state/DemoProvider';
import { useT } from '../../src/i18n';
import { languageName, mascotText } from '../../src/i18n/content';
import { colors, fonts } from '../../src/theme';

export default function ProfileScreen() {
  const { account } = useAccount();
  const profile = account!.profile;
  const { state, dispatch, catalog, language, outfit, journal, wordsTotal } = useDemo();
  const { t, locale } = useT();
  const stats = childStats(catalog, state, journal, language, new Date(), wordsTotal);
  return (
    <Screen>
      <View style={s.page}>
        <View style={s.profile}>
          <Pressable
            style={s.avatar}
            accessibilityRole="button"
            accessibilityLabel={t('friends.title')}
            onPress={() => router.push('/friends')}
          >
            <MascotStage mascotId={profile.avatar} outfit={outfit} width={96} pedestal={false} />
          </Pressable>
          <Label style={s.tag}>{t('profile.level', { level: profile.level })}</Label>
          <Heading>{profile.name}</Heading>
          <Label style={s.subtitle}>
            {t('profile.subtitle', {
              language: languageName(catalog, language, locale),
              mascot: mascotText(mascotOf(profile.avatar), locale).withName,
            })}
          </Label>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('profile.wardrobe')}
            onPress={() => router.push('/wardrobe')}
            style={({ pressed }) => [s.wardrobe, pressed && { opacity: 0.7 }]}
          >
            <Icon name="shirt-outline" size={16} color={colors.greenInk} />
            <Label style={s.wardrobeText}>{t('profile.wardrobe')}</Label>
          </Pressable>
        </View>
        <FriendProgress />
        <Label style={s.settingDescription}>{t('profile.levelNote')}</Label>
        <StatsCard stats={stats} />
        <Heading style={s.section}>{t('profile.comfort')}</Heading>
        <View style={s.setting}>
          <View style={s.settingIcon}>
            <Icon name="volume-medium-outline" />
          </View>
          <View style={{ flex: 1 }}>
            <Label style={s.settingTitle}>{t('profile.sound')}</Label>
            <Label style={s.settingDescription}>{t('profile.soundHint')}</Label>
          </View>
          <Switch
            accessibilityLabel={t('profile.sound')}
            value={state.soundEnabled}
            onValueChange={(enabled) => dispatch({ type: 'sound', enabled })}
            trackColor={{ false: '#D8E1DA', true: colors.green }}
            thumbColor="#FFFFFF"
          />
        </View>
        <View style={s.setting}>
          <View style={s.settingIcon}>
            <Icon name="download-outline" />
          </View>
          <View style={{ flex: 1 }}>
            <Label style={s.settingTitle}>{t('profile.offline')}</Label>
            <Label style={s.settingDescription}>{t('profile.offlineHint')}</Label>
          </View>
          <Icon name="checkmark-circle" color={colors.greenDark} />
        </View>
        <AccountSettings />
        <Label style={s.version}>
          {t('common.appName')} · {t('profile.version', { version: '0.2.0' })}
          {'\n'}
          {t('profile.motto')}
        </Label>
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({
  page: { padding: 22 },
  profile: { alignItems: 'center', paddingTop: 12 },
  avatar: { marginBottom: 12 },
  wardrobe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: colors.mint,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  wardrobeText: { fontFamily: fonts.bold, fontSize: 13, color: colors.greenInk },
  tag: {
    fontSize: 9,
    color: colors.greenInk,
    letterSpacing: 1.1,
    fontFamily: fonts.bold,
    marginBottom: 5,
  },
  subtitle: { color: colors.muted, fontSize: 13, marginTop: 6 },
  section: { fontSize: 19, marginBottom: 12 },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderRadius: 19,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  settingIcon: { backgroundColor: colors.mint, padding: 10, borderRadius: 13 },
  settingTitle: { fontFamily: fonts.heading, fontSize: 14 },
  settingDescription: { fontSize: 10, lineHeight: 16, color: colors.muted, marginTop: 3 },
  parent: { backgroundColor: colors.blueLight, borderRadius: 22, padding: 20, marginTop: 15 },
  parentTitle: { fontSize: 18, marginTop: 10, color: colors.blueInk },
  parentText: { fontSize: 12, lineHeight: 20, color: '#577A8B', marginTop: 8 },
  version: {
    textAlign: 'center',
    marginTop: 27,
    fontSize: 10,
    lineHeight: 18,
    color: colors.muted,
  },
});
