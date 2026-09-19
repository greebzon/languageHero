import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { levelStartXp } from '@lingvohero/learning-core';
import { useAccount } from '../account/AccountProvider';
import { useShopCatalog } from '../content/shop';
import { useT } from '../i18n';
import { mascotText } from '../i18n/content';
import { Heading, Label, Progress } from './ui';

export function FriendProgress({ link = true }: { link?: boolean }) {
  const { account } = useAccount();
  const profile = account!.profile;
  const catalog = useShopCatalog();
  const { t, locale } = useT();
  const unlocked = new Set(profile.unlockedMascotIds ?? ['fox', profile.avatar]);
  const next = [...catalog.mascots]
    .filter((m) => !unlocked.has(m.id))
    .sort((a, b) => a.unlockLevel - b.unlockLevel)[0];
  const progress = Math.max(0, profile.xp - profile.levelStartXp);
  const total = profile.nextLevelXp - Math.min(profile.xp, profile.levelStartXp);
  const content = (
    <View style={{ gap: 8 }}>
      <Heading style={{ fontSize: 19 }}>{t('friends.level', { level: profile.level })}</Heading>
      <Progress value={Math.min(1, progress / total)} />
      <Label style={{ fontSize: 14, lineHeight: 20 }}>
        {t('friends.progress', { xp: progress, total })}
      </Label>
      {next ? (
        <>
          <Label style={{ fontSize: 14, lineHeight: 20 }}>
            {t('friends.next', { name: mascotText(next, locale).name })}
          </Label>
          <Label style={{ fontSize: 14, lineHeight: 20 }}>
            {t('friends.locked', { level: next.unlockLevel })} ·{' '}
            {t('friends.remaining', {
              xp: Math.max(0, levelStartXp(next.unlockLevel) - profile.xp),
            })}
          </Label>
        </>
      ) : (
        <Label style={{ fontSize: 14, lineHeight: 20 }}>{t('friends.all')}</Label>
      )}
    </View>
  );
  return link ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('friends.title')}
      onPress={() => router.push('/friends')}
      style={{ paddingVertical: 16 }}
    >
      {content}
    </Pressable>
  ) : (
    content
  );
}
