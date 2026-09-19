import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import type { MascotSlot, Outfit } from '@lingvohero/contracts';
import {
  equip,
  isEquipped,
  ownsItem,
  priceFor,
  unequip,
  wornCount,
  type ShopItem,
} from '@lingvohero/learning-core';
import { useAccount } from '../src/account/context';
import { MascotStage } from '../src/components/MascotStage';
import { Toast, type ToastMessage } from '../src/components/Toast';
import { Heading, Icon, Label } from '../src/components/ui';
import { itemIcon, mascotOf, shopImage, shopItemsOf, useShopCatalog } from '../src/content/shop';
import { useDemo } from '../src/state/DemoProvider';
import { colors, fonts } from '../src/theme';
import { useT } from '../src/i18n';
import { itemText, mascotText, rarityLabel } from '../src/i18n/content';

const tone = {
  muted: '#3D4A3D',
  well: '#EFF4FF',
  wellHigh: '#DCE9FF',
  wellTop: '#D5E3FC',
  ink: '#0D1C2E',
  greenEdge: '#004B1E',
  amberEdge: '#684000',
};
/* Titles are `wardrobe.chips.<id>`: short plural chip names, not the slot labels. */
const CATEGORIES: { id: MascotSlot | 'all'; emoji: string }[] = [
  { id: 'all', emoji: '✨' },
  { id: 'head', emoji: '👑' },
  { id: 'eyes', emoji: '👓' },
  { id: 'outfit', emoji: '🦸' },
  { id: 'back', emoji: '🧣' },
  { id: 'companion', emoji: '🌟' },
];
const rarityTint: Record<ShopItem['rarity'], { bg: string; ink: string }> = {
  common: { bg: '#DCE9FF', ink: '#3D4A3D' },
  magic: { bg: '#EAD9FF', ink: '#3B1F6E' },
  legendary: { bg: '#FFDDB8', ink: '#2A1700' },
};

export default function WardrobeScreen() {
  const { account } = useAccount();
  const { journal, coins, outfit, saveOutfit, buy } = useDemo();
  const catalog = useShopCatalog();
  const { item: paramItem } = useLocalSearchParams<{ item?: string }>();
  const { width: screen } = useWindowDimensions();
  const { locale, t, tn } = useT();
  const mascot = mascotOf(account!.profile.avatar, catalog);
  const mascotName = mascotText(mascot, locale).name;
  const text = (item: ShopItem) => itemText(item, locale);
  const wardrobe = useMemo(
    () => shopItemsOf(catalog).filter((i) => i.kind === 'wardrobe' && i.slot),
    [catalog],
  );
  const [draft, setDraft] = useState<Outfit>(outfit);
  const [preview, setPreview] = useState<ShopItem | null>(null);
  const [category, setCategory] = useState<MascotSlot | 'all'>('all');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);
  // Opened from the shop with an item: wear it if owned, otherwise try it on.
  useEffect(() => {
    const item = wardrobe.find((i) => i.id === paramItem);
    if (!item) return;
    if (ownsItem(journal, item.id)) setDraft((d) => equip(d, { id: item.id, slot: item.slot! }));
    else setPreview(item);
    // Only on arrival; later taps are the user's own choices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramItem, wardrobe.length]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(outfit);
  const now = new Date();
  const toggle = (item: ShopItem) => {
    const slot = item.slot!;
    if (!ownsItem(journal, item.id)) {
      setPreview(preview?.id === item.id ? null : item);
      return;
    }
    setPreview(null);
    setDraft(
      isEquipped(draft, item.id) ? unequip(draft, slot) : equip(draft, { id: item.id, slot }),
    );
  };
  const purchase = async (item: ShopItem) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await buy(item.id);
      if (result.outcome === 'ok') {
        setPreview(null);
        setDraft((d) => equip(d, { id: item.id, slot: item.slot! }));
        setToast({
          title: t('shop.bought', { name: text(item).name }),
          text: t('wardrobe.boughtText'),
        });
      } else if (result.outcome === 'poor')
        setToast({ title: t('shop.poor.title'), text: t('shop.poor.text'), tone: 'warn' });
      else
        setToast({
          title: t('shop.alreadyOwned.title'),
          text: t('shop.alreadyOwned.text'),
          tone: 'warn',
        });
    } catch (e) {
      setToast({
        title: t('wardrobe.unavailable'),
        text: e instanceof Error ? e.message : '',
        tone: 'warn',
      });
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveOutfit(draft);
      setToast({
        title: t('wardrobe.saved.title'),
        text: t('wardrobe.saved.text', { name: mascotName }),
      });
    } catch (e) {
      setToast({
        title: t('wardrobe.saveFailed'),
        text: e instanceof Error ? e.message : '',
        tone: 'warn',
      });
    } finally {
      setBusy(false);
    }
  };
  const visible = wardrobe.filter((i) => category === 'all' || i.slot === category);
  const stageWidth = Math.min(280, Math.round(screen * 0.62));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            onPress={() => router.back()}
            style={({ pressed }) => [s.back, pressed && { opacity: 0.7 }]}
          >
            <Icon name="arrow-back" size={22} color={colors.greenInk} />
          </Pressable>
          <Heading accessibilityRole="header" style={s.title}>
            {t('wardrobe.title')}
          </Heading>
          <View style={s.coins}>
            <Label style={s.coinsText}>🪙 {coins.toLocaleString(locale)}</Label>
          </View>
        </View>
        <View style={s.stageCard}>
          <View style={s.nameBadge}>
            <MascotFaceDot id={mascot.id} />
            <Label style={s.nameText}>{mascotName}</Label>
            <Label style={s.levelText}>
              {t('wardrobe.level', { level: account!.profile.level })}
            </Label>
          </View>
          <View style={s.stageWrap}>
            <MascotStage
              mascotId={mascot.id}
              outfit={draft}
              preview={preview ? { id: preview.id, slot: preview.slot! } : null}
              width={stageWidth}
            />
          </View>
          {preview && (
            <View style={s.previewRow}>
              <Label style={s.previewText}>
                {t('wardrobe.preview', { name: text(preview).name })}
              </Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={tn('shop.buyFor', priceFor(preview, now, shopItemsOf(catalog)))}
                disabled={busy}
                onPress={() => void purchase(preview)}
                style={({ pressed }) => [s.buy, pressed && { transform: [{ translateY: 2 }] }]}
              >
                <Label style={s.buyText}>
                  {t('wardrobe.buyButton', { n: priceFor(preview, now, shopItemsOf(catalog)) })}
                </Label>
              </Pressable>
            </View>
          )}
        </View>
        <View style={s.between}>
          <View style={s.row}>
            <Heading style={s.section}>{t('wardrobe.section')}</Heading>
            <View style={s.countPill}>
              <Label style={s.countText}>{tn('wardrobe.worn', wornCount(draft))}</Label>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('wardrobe.clearAll')}
            disabled={!wornCount(draft)}
            onPress={() => {
              setDraft({});
              setPreview(null);
            }}
            style={({ pressed }) => [
              s.clear,
              !wornCount(draft) && { opacity: 0.4 },
              pressed && { opacity: 0.7 },
            ]}
          >
            <Icon name="refresh" size={16} color={tone.ink} />
            <Label style={s.clearText}>{t('wardrobe.clearAll')}</Label>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
          style={{ marginHorizontal: -16 }}
        >
          {CATEGORIES.map((c) => {
            const on = category === c.id;
            const count =
              c.id === 'all' ? wardrobe.length : wardrobe.filter((i) => i.slot === c.id).length;
            if (c.id !== 'all' && !count) return null;
            const title = t(`wardrobe.chips.${c.id}`);
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={title}
                accessibilityState={{ selected: on }}
                onPress={() => setCategory(c.id)}
                style={[s.chip, on && s.chipOn]}
              >
                <Label style={[s.chipText, on && { color: '#FFFFFF' }]}>
                  {c.emoji} {title} ({count})
                </Label>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={s.grid}>
          {visible.map((item) => {
            const owned = ownsItem(journal, item.id);
            const worn = isEquipped(draft, item.id);
            const trying = preview?.id === item.id;
            const { name, description } = text(item);
            return (
              <Pressable
                key={item.id}
                testID={`wear-${item.id}`}
                accessibilityRole="checkbox"
                accessibilityLabel={owned ? name : t('wardrobe.notBought', { name })}
                accessibilityState={{ checked: worn }}
                onPress={() => toggle(item)}
                style={({ pressed }) => [
                  s.tile,
                  (worn || trying) && s.tileOn,
                  pressed && { transform: [{ translateY: 2 }], borderBottomWidth: 2 },
                ]}
              >
                <View style={s.tileHead}>
                  <View style={[s.rarity, { backgroundColor: rarityTint[item.rarity].bg }]}>
                    <Label style={[s.rarityText, { color: rarityTint[item.rarity].ink }]}>
                      {rarityLabel(item.rarity, locale)}
                    </Label>
                  </View>
                  <View style={[s.check, worn && s.checkOn]}>
                    <Icon
                      name={owned ? 'checkmark' : 'lock-closed'}
                      size={14}
                      color={worn ? '#FFFFFF' : tone.muted}
                    />
                  </View>
                </View>
                <Image
                  source={itemIcon(item.id, catalog)}
                  style={s.tileIcon}
                  resizeMode="contain"
                />
                <Heading style={s.tileTitle} numberOfLines={2}>
                  {name}
                </Heading>
                <Label style={s.tileText} numberOfLines={1}>
                  {description}
                </Label>
                <View style={[s.tileButton, worn && s.tileButtonOn, !owned && s.tileButtonLocked]}>
                  <Label style={[s.tileButtonText, worn && { color: '#FFFFFF' }]}>
                    {worn
                      ? t('wardrobe.tileWorn')
                      : owned
                        ? t('wardrobe.tileWear')
                        : trying
                          ? t('wardrobe.trying')
                          : t('wardrobe.tryFor', {
                              n: priceFor(item, now, shopItemsOf(catalog)),
                            })}
                  </Label>
                </View>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          testID="save-outfit"
          accessibilityRole="button"
          accessibilityLabel={t('wardrobe.save')}
          accessibilityState={{ disabled: !dirty || busy }}
          disabled={!dirty || busy}
          onPress={() => void save()}
          style={({ pressed }) => [
            s.save,
            (!dirty || busy) && { opacity: 0.45 },
            pressed && { transform: [{ translateY: 4 }], borderBottomWidth: 2 },
          ]}
        >
          <Icon name="color-wand" size={24} color="#FFFFFF" />
          <Label style={s.saveText}>{t('wardrobe.saveButton')}</Label>
        </Pressable>
      </ScrollView>
      {toast && (
        <View pointerEvents="box-none" style={s.toast}>
          <Toast message={toast} />
        </View>
      )}
    </SafeAreaView>
  );
}
function MascotFaceDot({ id }: { id: string }) {
  const catalog = useShopCatalog();
  const mascot = mascotOf(id, catalog);
  return <Image source={shopImage(mascot.portrait)} style={{ width: 26, height: 26 }} />;
}
const s = StyleSheet.create({
  page: {
    padding: 16,
    gap: 14,
    paddingBottom: 48,
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 3,
    borderBottomColor: tone.wellTop,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 24, lineHeight: 30 },
  coins: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 2,
    borderBottomColor: tone.wellTop,
  },
  coinsText: { fontFamily: fonts.heading, fontSize: 15, color: tone.ink },
  stageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderBottomWidth: 6,
    borderBottomColor: tone.wellTop,
    padding: 14,
    gap: 10,
    alignItems: 'center',
  },
  nameBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tone.well,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  nameText: { fontFamily: fonts.heavy, fontSize: 16, color: tone.ink },
  levelText: { fontFamily: fonts.heading, fontSize: 12, color: colors.greenInk },
  stageWrap: { alignItems: 'center', paddingVertical: 4 },
  previewRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#FFF2E3',
    borderRadius: 18,
    padding: 10,
  },
  previewText: { flex: 1, fontFamily: fonts.heading, fontSize: 14, color: '#684000' },
  buy: {
    backgroundColor: colors.amber,
    borderRadius: 999,
    borderBottomWidth: 3,
    borderBottomColor: tone.amberEdge,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  buyText: { fontFamily: fonts.heading, fontSize: 14, color: '#2A1700' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  section: { fontSize: 22, lineHeight: 28 },
  countPill: {
    backgroundColor: colors.greenInk,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countText: { fontFamily: fonts.heading, fontSize: 12, color: '#FFFFFF' },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tone.wellHigh,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearText: { fontFamily: fonts.heading, fontSize: 13, color: tone.ink },
  chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  chip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    borderBottomWidth: 3,
    borderBottomColor: tone.wellTop,
    paddingHorizontal: 14,
    minHeight: 42,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: tone.ink, borderBottomColor: '#000000' },
  chipText: { fontFamily: fonts.heading, fontSize: 13, color: tone.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 3,
    borderColor: 'transparent',
    borderBottomWidth: 5,
    borderBottomColor: tone.wellTop,
    padding: 12,
    gap: 6,
    alignItems: 'center',
  },
  tileOn: { borderColor: colors.green, borderBottomColor: colors.green },
  tileHead: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rarity: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  rarityText: { fontFamily: fonts.heading, fontSize: 10, lineHeight: 13 },
  check: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: tone.well,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.green },
  tileIcon: { width: 72, height: 72, marginVertical: 4 },
  tileTitle: { fontSize: 17, lineHeight: 21, textAlign: 'center' },
  tileText: { fontSize: 12, color: tone.muted, textAlign: 'center' },
  tileButton: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: tone.well,
    borderRadius: 14,
    paddingVertical: 8,
    marginTop: 4,
  },
  tileButtonOn: { backgroundColor: colors.green },
  tileButtonLocked: { backgroundColor: '#FFF2E3' },
  tileButtonText: { fontFamily: fonts.heading, fontSize: 13, color: tone.ink },
  save: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 64,
    backgroundColor: colors.green,
    borderRadius: 999,
    borderBottomWidth: 6,
    borderBottomColor: tone.greenEdge,
    marginTop: 6,
  },
  saveText: { fontFamily: fonts.heavy, fontSize: 20, color: '#FFFFFF' },
  toast: { position: 'absolute', left: 16, right: 16, bottom: 16 },
});
