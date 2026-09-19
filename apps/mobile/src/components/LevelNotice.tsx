import { useEffect, useRef, useState } from 'react';
import { Modal, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useAccount } from '../account/AccountProvider';
import { useShopCatalog } from '../content/shop';
import { useT } from '../i18n';
import { mascotText } from '../i18n/content';
import { Heading, Label, ToyButton } from './ui';

/** Celebrate server-confirmed changes, never an optimistic/offline grant. */
export function LevelNotice() {
  const pathname = usePathname();
  const { account } = useAccount();
  const profile = account!.profile;
  const previous = useRef(profile);
  const [notice, setNotice] = useState<{ level: number; ids: string[]; leveledUp: boolean } | null>(
    null,
  );
  const catalog = useShopCatalog();
  const { t, locale } = useT();
  useEffect(() => {
    const old = previous.current;
    const ids = (profile.unlockedMascotIds ?? []).filter(
      (id) => !(old.unlockedMascotIds ?? []).includes(id),
    );
    if (profile.id === old.id && (profile.level > old.level || ids.length))
      setNotice({ level: profile.level, ids, leveledUp: profile.level > old.level });
    previous.current = profile;
  }, [profile]);
  return (
    <Modal
      visible={!!notice && pathname !== '/lesson'}
      transparent
      animationType="fade"
      onRequestClose={() => setNotice(null)}
    >
      <View
        style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#00000066' }}
      >
        <View style={{ backgroundColor: '#FFFFFF', padding: 24, borderRadius: 24, gap: 16 }}>
          <Heading>
            {t(notice?.leveledUp ? 'friends.levelUp' : 'friends.unlocked', {
              level: notice?.level ?? profile.level,
            })}
          </Heading>
          {!!notice?.ids.length && (
            <>
              {notice.leveledUp && <Label>{t('friends.unlocked')}</Label>}
              {catalog.mascots
                .filter((m) => notice.ids.includes(m.id))
                .map((m) => (
                  <Label key={m.id}>{mascotText(m, locale).name}</Label>
                ))}
              <ToyButton
                title={t('friends.open')}
                onPress={() => {
                  setNotice(null);
                  router.push('/friends');
                }}
              />
            </>
          )}
          <ToyButton
            testID="level-continue"
            title={t('friends.continue')}
            tone="light"
            onPress={() => setNotice(null)}
          />
        </View>
      </View>
    </Modal>
  );
}
