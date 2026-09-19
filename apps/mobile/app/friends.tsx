import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { AccountSnapshot } from '@lingvohero/contracts';
import { useAccount } from '../src/account/AccountProvider';
import { accountRequest } from '../src/account/api';
import { Screen } from '../src/components/Screen';
import { FriendProgress } from '../src/components/FriendProgress';
import { MascotFace } from '../src/components/MascotPicker';
import { MascotStage } from '../src/components/MascotStage';
import { Heading, Icon, Label, ToyButton } from '../src/components/ui';
import { DEFAULT_CATALOG, useShopCatalog } from '../src/content/shop';
import { useT } from '../src/i18n';
import { mascotText } from '../src/i18n/content';
import { colors } from '../src/theme';

export default function FriendsScreen() {
  const auth = useAccount();
  const profile = auth.account!.profile;
  const catalog = useShopCatalog();
  const { t, locale } = useT();
  const [selected, setSelected] = useState(profile.avatar);
  const [inspecting, setInspecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const owned = new Set(profile.unlockedMascotIds ?? ['fox', profile.avatar]);
  owned.add(profile.avatar);
  const legacy = DEFAULT_CATALOG.mascots.filter(
    (m) => owned.has(m.id) && !catalog.mascots.some((c) => c.id === m.id),
  );
  const mascots = [...catalog.mascots, ...legacy].sort((a, b) => a.unlockLevel - b.unlockLevel);
  const mascot = mascots.find((m) => m.id === selected) ?? mascots[0]!;
  const text = mascotText(mascot, locale);
  const active = mascot.id === profile.avatar;
  const available = mascots.some((m) => m.id === mascot.id);
  const choose = async () => {
    if (busy || !owned.has(mascot.id) || !available) return;
    setBusy(true);
    setNotice('');
    try {
      const snapshot = await accountRequest<AccountSnapshot>('/me', { avatar: mascot.id }, 'PATCH');
      auth.update(snapshot);
      setNotice(t('friends.saved', { name: text.name }));
    } catch {
      setNotice(t('friends.failed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen>
      <View style={s.page}>
        <ToyButton
          style={{ minHeight: 40, paddingVertical: 6 }}
          title={t('friends.back')}
          tone="light"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
        <Heading testID="friends-title">{t('friends.title')}</Heading>
        <Label>{t('friends.intro')}</Label>
        <FriendProgress link={false} />
        <View style={s.grid}>
          {mascots.map((m) => (
            <Pressable
              key={m.id}
              testID={`friend-${m.id}`}
              accessibilityRole="button"
              accessibilityLabel={mascotText(m, locale).name}
              accessibilityState={{ selected: selected === m.id }}
              disabled={busy}
              onPress={() => {
                setInspecting(true);
                setSelected(m.id);
                setNotice('');
              }}
              style={[s.card, selected === m.id && s.selected]}
            >
              <MascotFace id={m.id} size={72} />
              <View style={{ gap: 6, alignItems: 'center' }}>
                <Heading style={{ fontSize: 16, lineHeight: 22, textAlign: 'center' }}>
                  {mascotText(m, locale).name}
                </Heading>
                <Label style={{ fontSize: 14, lineHeight: 20, textAlign: 'center' }}>
                  {m.id === profile.avatar
                    ? t('friends.active')
                    : owned.has(m.id)
                      ? t('friends.choose')
                      : t('friends.locked', { level: m.unlockLevel })}
                </Label>
              </View>
              <Icon name={owned.has(m.id) ? 'paw' : 'lock-closed'} />
            </Pressable>
          ))}
        </View>
        <Modal
          visible={inspecting}
          transparent
          animationType="fade"
          onRequestClose={() => setInspecting(false)}
        >
          <View style={s.overlay}>
            <ScrollView contentContainerStyle={s.sheet}>
              <ToyButton
                testID="close-friend-preview"
                title={t('common.close')}
                tone="light"
                onPress={() => setInspecting(false)}
              />
              <View style={s.preview}>
                <MascotStage mascotId={mascot.id} outfit={profile.outfit} width={150} />
                <Heading>{text.name}</Heading>
                <Label>{text.trait}</Label>
                <Label>{text.perk}</Label>
                <Label>{t('friends.preview')}</Label>
                {!available && <Label>{t('friends.unavailable')}</Label>}
                <ToyButton
                  testID="choose-friend"
                  title={t(
                    busy
                      ? 'friends.saving'
                      : active
                        ? 'friends.active'
                        : owned.has(mascot.id)
                          ? 'friends.choose'
                          : 'friends.locked',
                    { level: mascot.unlockLevel },
                  )}
                  disabled={busy || active || !owned.has(mascot.id) || !available}
                  onPress={() => void choose()}
                />
                {active && (
                  <ToyButton
                    title={t('friends.wardrobe')}
                    tone="light"
                    onPress={() => {
                      setInspecting(false);
                      router.push('/wardrobe');
                    }}
                  />
                )}
              </View>
              {!!notice && <Label accessibilityLiveRegion="polite">{notice}</Label>}
            </ScrollView>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({
  page: { padding: 20, gap: 16 },
  preview: {
    alignItems: 'center',
    gap: 12,
    padding: 18,
    backgroundColor: colors.mint,
    borderRadius: 24,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  overlay: {
    flex: 1,
    padding: 20,
    paddingVertical: 40,
    justifyContent: 'center',
    backgroundColor: '#00000066',
  },
  sheet: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 12, gap: 12 },
  card: {
    width: '47%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 12,
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.line,
  },
  selected: { borderColor: colors.green },
});
