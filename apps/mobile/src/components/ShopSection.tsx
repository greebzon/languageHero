import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import {
  SHOP_CATEGORIES,
  dailyDeal,
  equip,
  isEquipped,
  ownsItem,
  priceFor,
  type PurchaseOutcome,
  type ShopCategory,
  type ShopItem,
} from '@lingvohero/learning-core';
import { Heading, Icon, Label } from './ui';
import type { ToastMessage } from './Toast';
import { itemIcon, shopItemsOf, useShopCatalog } from '../content/shop';
import { useDemo } from '../state/DemoProvider';
import { colors, fonts } from '../theme';
import { useT } from '../i18n';
import { categoryTitle, itemText, rarityLabel } from '../i18n/content';
/* «Playful Tactile Wonder» tokens (shop2/DESIGN.md). */
const tone = {
  secondary: '#855300',
  secondaryInk: '#684000',
  amberEdge: '#684000',
  tertiary: '#006591',
  tertiaryInk: '#004564',
  tertiaryTint: '#C9E6FF',
  muted: '#3D4A3D',
  well: '#EFF4FF',
  wellHigh: '#DCE9FF',
  wellTop: '#D5E3FC',
  ink: '#0D1C2E',
  greenEdge: '#004B1E',
};
const rarityTint: Record<ShopItem['rarity'], { bg: string; ink: string }> = {
  common: { bg: tone.wellHigh, ink: tone.muted },
  magic: { bg: '#EAD9FF', ink: '#3B1F6E' },
  legendary: { bg: '#FFDDB8', ink: '#2A1700' },
};
function countdown(now: Date) {
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  const left = Math.max(0, Math.floor((midnight.getTime() - now.getTime()) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(left / 3600))}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}`;
}
function PriceButton({
  price,
  owned,
  worn,
  onWear,
  name,
  open,
  onPress,
  testID,
}: {
  price: number;
  owned?: boolean;
  /* Owned wearables: «Надеть» puts the item on right away, «Надето» shows it is on. */
  worn?: boolean;
  onWear?: () => void;
  /* The item's name for «Надеть …». */
  name?: string;
  /* A chest: «Открыть за …» instead of «Купить за …». */
  open?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t, tn } = useT();
  const wearable = owned && onWear;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={
        wearable
          ? worn
            ? t('shop.worn')
            : t('shop.wear', { name: name ?? '' }).trim()
          : owned
            ? t('shop.owned')
            : tn(open ? 'shop.openFor' : 'shop.buyFor', price)
      }
      accessibilityState={{ disabled: !!owned && (!wearable || !!worn) }}
      disabled={!!owned && (!wearable || !!worn)}
      onPress={wearable ? onWear : onPress}
      style={({ pressed }) => [
        s.price,
        owned && !wearable && s.priceOwned,
        wearable && (worn ? s.priceWorn : s.priceWear),
        pressed &&
          !(owned && (!wearable || worn)) && {
            transform: [{ translateY: 2 }],
            borderBottomWidth: 1,
          },
      ]}
    >
      {wearable ? (
        <>
          <Icon name={worn ? 'checkmark-circle' : 'shirt'} size={18} color="#FFFFFF" />
          <Label style={[s.priceText, { color: '#FFFFFF' }]}>
            {t(worn ? 'shop.wornButton' : 'shop.wearButton')}
          </Label>
        </>
      ) : owned ? (
        <>
          <Icon name="checkmark-circle" size={18} color={colors.greenInk} />
          <Label style={[s.priceText, { color: tone.muted }]}>{t('shop.ownedButton')}</Label>
        </>
      ) : (
        <>
          <Label style={s.priceText}>
            {open ? t('shop.openForButton', { n: price }) : String(price)}
          </Label>
          <Label style={s.coin}>🪙</Label>
        </>
      )}
    </Pressable>
  );
}
export function ShopSection({
  onEarn,
  notify,
}: {
  onEarn: () => void;
  notify: (message: ToastMessage) => void;
}) {
  const { journal, coins, buy, outfit, saveOutfit } = useDemo();
  const { locale, t, tn } = useT();
  /* Names and descriptions in the interface language; ids, prices and slots stay as they are. */
  const text = (item: ShopItem) => itemText(item, locale);
  const wear = async (item: ShopItem) => {
    if (!item.slot) return;
    try {
      await saveOutfit(equip(outfit, { id: item.id, slot: item.slot }));
      notify({
        title: t('shop.wore.title', { name: text(item).name }),
        text: t('shop.wore.text'),
      });
    } catch (e) {
      notify({
        title: t('shop.wearFailed'),
        text: e instanceof Error ? e.message : t('shop.checkConnection'),
        tone: 'warn',
      });
    }
  };
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [category, setCategory] = useState<ShopCategory | 'all'>('all');
  const catalog = useShopCatalog();
  const items = useMemo(() => shopItemsOf(catalog), [catalog]);
  const deal = dailyDeal(now, items);
  const [busy, setBusy] = useState(false);
  const purchase = async (item: ShopItem) => {
    if (busy) return;
    setBusy(true);
    let result: Awaited<ReturnType<typeof buy>>;
    try {
      result = await buy(item.id);
    } catch (e) {
      notify({
        title: t('shop.unavailable'),
        text: e instanceof Error ? e.message : t('shop.checkConnection'),
        tone: 'warn',
      });
      return;
    } finally {
      setBusy(false);
    }
    const spent = priceFor(item, now, items);
    const messages: Record<PurchaseOutcome, ToastMessage> = {
      ok:
        item.kind === 'chest'
          ? {
              title: t('shop.chestDrop', {
                name: result.granted ? text(result.granted).name : t('shop.surprise'),
              }),
              text: t('shop.chestSpent', { n: spent }),
            }
          : item.kind === 'booster'
            ? {
                title: t('shop.bought', { name: text(item).name }),
                text: t('shop.boosterText'),
              }
            : {
                title: t('shop.bought', { name: text(item).name }),
                text: t('shop.boughtText', { n: spent }),
              },
      owned: {
        title: t('shop.alreadyOwned.title'),
        text: t('shop.alreadyOwned.text'),
        tone: 'warn',
      },
      poor: { title: t('shop.poor.title'), text: t('shop.poor.text'), tone: 'warn' },
      nothing: { title: t('shop.empty.title'), text: t('shop.empty.text'), tone: 'warn' },
    };
    notify(messages[result.outcome]);
  };
  const show = (c: ShopCategory) => category === 'all' || category === c;
  const wardrobe = items.filter(
    (i) => i.kind === 'wardrobe' && (category === 'all' || i.category === category),
  );
  const chest = items.find((i) => i.kind === 'chest')!;
  const freeze = items.find((i) => i.id === 'freeze')!;
  const dealOwned = !!deal && ownsItem(journal, deal.item.id);
  return (
    <View style={s.stack}>
      <View style={s.walletCard}>
        <View style={s.wallet}>
          <View style={s.coinBadge}>
            <Label style={s.coinBadgeText}>🪙</Label>
          </View>
          <View>
            <Label testID="shop-coins" style={s.walletValue}>
              {coins.toLocaleString(locale)}
            </Label>
            <Label style={s.walletLabel}>{t('shop.coins')}</Label>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('shop.earn')}
          onPress={onEarn}
          style={({ pressed }) => [s.earn, pressed && { opacity: 0.7 }]}
        >
          <Icon name="star" size={20} color={colors.amber} />
          <Label style={s.earnText} numberOfLines={1}>
            {t('shop.earn')}
          </Label>
          <Label style={s.earnLink}>{t('shop.earnLink')}</Label>
          <Icon name="chevron-forward" size={16} color={colors.greenInk} />
        </Pressable>
      </View>
      {deal && (
        <View style={s.deal}>
          <View style={s.dealGlow} />
          <View style={s.between}>
            <View style={s.dealChip}>
              <Icon name="flame" size={15} color={tone.secondaryInk} />
              <Label style={s.dealChipText}>{t('shop.dealChip')}</Label>
            </View>
            <View style={s.timer}>
              <Icon name="time-outline" size={14} color="#F8F9FF" />
              <Label style={s.timerText}>{countdown(now)}</Label>
            </View>
          </View>
          <View style={s.dealRow}>
            <View style={s.dealArt}>
              <Image
                source={itemIcon(deal.item.id, catalog)}
                style={s.dealImage}
                resizeMode="contain"
              />
              <View style={s.top}>
                <Label style={s.topText}>{t('shop.top')}</Label>
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Label style={s.dealKicker}>
                {t(deal.item.category === 'clothes' ? 'shop.kickerSet' : 'shop.kickerItem', {
                  rarity: rarityLabel(deal.item.rarity, locale).toUpperCase(),
                })}
              </Label>
              <Heading style={s.dealTitle} numberOfLines={1}>
                {text(deal.item).name}
              </Heading>
              <Label style={s.dealText} numberOfLines={1}>
                {text(deal.item).description}
              </Label>
              <View style={s.dealPrices}>
                <Label style={s.oldPrice}>{deal.item.price} 🪙</Label>
                <Label style={s.newPrice}>{deal.price} 🪙</Label>
              </View>
            </View>
          </View>
          <Pressable
            testID="deal-buy"
            accessibilityRole="button"
            accessibilityLabel={dealOwned ? t('shop.inCloset') : tn('shop.buyFor', deal.price)}
            accessibilityState={{ disabled: dealOwned }}
            disabled={dealOwned}
            onPress={() => void purchase(deal.item)}
            style={({ pressed }) => [
              s.dealButton,
              dealOwned && s.priceOwned,
              pressed && !dealOwned && { transform: [{ translateY: 4 }], borderBottomWidth: 1 },
            ]}
          >
            <Icon
              name={dealOwned ? 'checkmark-circle' : 'bag-handle'}
              size={22}
              color={dealOwned ? colors.greenInk : tone.secondaryInk}
            />
            <Label style={[s.dealButtonText, dealOwned && { color: tone.muted }]}>
              {dealOwned ? t('shop.inClosetButton') : t('shop.buyForButton', { n: deal.price })}
            </Label>
          </Pressable>
        </View>
      )}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.categories}
        style={{ marginHorizontal: -16 }}
      >
        {SHOP_CATEGORIES.map((c) => {
          const on = category === c.id;
          const title = categoryTitle(c.id, locale);
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={title}
              accessibilityState={{ selected: on }}
              onPress={() => setCategory(c.id)}
              style={({ pressed }) => [
                s.category,
                on && s.categoryOn,
                pressed && { transform: [{ translateY: 1 }] },
              ]}
            >
              <Label style={[s.categoryText, on && { color: '#004B1E' }]}>{title}</Label>
            </Pressable>
          );
        })}
      </ScrollView>
      {show('chests') && (
        <View style={s.section}>
          <View style={s.titleRow}>
            <Icon name="cube" size={24} color={colors.amber} />
            <Heading style={s.sectionTitle}>{t('shop.chests')}</Heading>
          </View>
          <View style={s.grid}>
            <View style={s.card}>
              <View style={s.cardArt}>
                <Image
                  source={itemIcon('chest', catalog)}
                  style={s.cardImage}
                  resizeMode="contain"
                />
              </View>
              <Label style={[s.rarity, { color: tone.secondary }]}>
                {rarityLabel(chest.rarity, locale).toUpperCase()}
              </Label>
              <Heading style={s.cardTitle} numberOfLines={1}>
                {text(chest).name}
              </Heading>
              <Label style={s.cardText}>{text(chest).description}</Label>
              <PriceButton
                testID="buy-chest"
                open
                price={priceFor(chest, now, items)}
                onPress={() => void purchase(chest)}
              />
            </View>
            <View style={[s.card, s.cardHint]}>
              <Label style={s.hintEmoji}>🎁</Label>
              <Label style={s.cardText}>
                {t('shop.chestHint', {
                  got: journal.inventory.items.length,
                  total: items.filter((i) => i.kind === 'wardrobe').length,
                })}
              </Label>
            </View>
          </View>
        </View>
      )}
      {show('boosters') && (
        <View style={s.section}>
          <View style={s.titleRow}>
            <Icon name="flash" size={24} color={colors.greenInk} />
            <Heading style={s.sectionTitle}>{t('shop.boosters')}</Heading>
          </View>
          <View style={s.booster}>
            <View style={s.boosterIcon}>
              <Icon name="snow" size={30} color={tone.tertiary} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Heading style={s.cardTitle} numberOfLines={1}>
                {text(freeze).name}
              </Heading>
              <Label style={s.cardText} numberOfLines={2}>
                {text(freeze).description}
              </Label>
              {journal.inventory.freezes > 0 && (
                <Label style={s.owned}>{t('shop.freezes', { n: journal.inventory.freezes })}</Label>
              )}
            </View>
            <PriceButton
              testID="buy-freeze"
              price={priceFor(freeze, now, items)}
              onPress={() => void purchase(freeze)}
            />
          </View>
        </View>
      )}
      {(show('clothes') || show('hats')) && wardrobe.length > 0 && (
        <View style={s.section}>
          <View style={s.titleRow}>
            <Icon name="shirt" size={24} color={colors.amber} />
            <Heading style={s.sectionTitle}>{t('shop.wardrobe')}</Heading>
          </View>
          <View style={s.grid}>
            {wardrobe.map((item) => {
              const owned = ownsItem(journal, item.id);
              const price = priceFor(item, now, items);
              const { name, description } = text(item);
              return (
                <View key={item.id} style={s.card}>
                  <View style={s.cardArt}>
                    <View style={[s.rarityPill, { backgroundColor: rarityTint[item.rarity].bg }]}>
                      <Label style={[s.rarityPillText, { color: rarityTint[item.rarity].ink }]}>
                        {rarityLabel(item.rarity, locale)}
                      </Label>
                    </View>
                    <Image
                      source={itemIcon(item.id, catalog)}
                      style={s.cardImage}
                      resizeMode="contain"
                    />
                  </View>
                  <Heading style={s.cardTitle} numberOfLines={1}>
                    {name}
                  </Heading>
                  <Label style={[s.cardText, owned && s.owned]} numberOfLines={2}>
                    {owned ? t('shop.ownedText') : description}
                  </Label>
                  {price !== item.price && !owned && (
                    <Label style={s.wasPrice}>{t('shop.wasPrice', { n: item.price })}</Label>
                  )}
                  <PriceButton
                    testID={`buy-${item.id}`}
                    price={price}
                    owned={owned}
                    worn={isEquipped(outfit, item.id)}
                    onWear={() => void wear(item)}
                    name={name}
                    onPress={() => void purchase(item)}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('shop.tryOnLabel', { name })}
                    onPress={() => router.push(`/wardrobe?item=${item.id}`)}
                    style={({ pressed }) => [s.tryLink, pressed && { opacity: 0.6 }]}
                  >
                    <Icon name="eye-outline" size={14} color={tone.tertiary} />
                    <Label style={s.tryText}>{t('shop.tryOn')}</Label>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      )}
      <View style={s.fair}>
        <View style={s.fairIcon}>
          <Icon name="shield-checkmark" size={24} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <Heading style={s.fairTitle}>{t('shop.fair.title')}</Heading>
          <Label style={s.fairText}>{t('shop.fair.text')}</Label>
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  stack: { gap: 16 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  walletCard: { gap: 10 },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderBottomWidth: 4,
    borderBottomColor: tone.wellTop,
    padding: 14,
  },
  coinBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.amber,
    borderBottomWidth: 3,
    borderBottomColor: tone.amberEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinBadgeText: { fontSize: 20, lineHeight: 26 },
  walletValue: { fontFamily: fonts.heavy, fontSize: 24, lineHeight: 28, color: tone.ink },
  walletLabel: {
    fontFamily: fonts.heading,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1,
    color: tone.secondary,
  },
  earn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tone.wellHigh,
    borderRadius: 18,
    paddingHorizontal: 14,
    minHeight: 46,
  },
  earnText: { flex: 1, fontFamily: fonts.heading, fontSize: 14, lineHeight: 18, color: tone.ink },
  earnLink: { fontFamily: fonts.heading, fontSize: 12, lineHeight: 16, color: colors.greenInk },
  deal: {
    backgroundColor: tone.tertiary,
    borderRadius: 28,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
  },
  dealGlow: {
    position: 'absolute',
    end: -30,
    bottom: -30,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dealChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.amber,
    borderBottomWidth: 2,
    borderBottomColor: tone.amberEdge,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  dealChipText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.6,
    color: tone.secondaryInk,
  },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,69,100,0.6)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  timerText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 0.8,
    color: '#F8F9FF',
  },
  dealRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dealArt: {
    width: 96,
    height: 96,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealImage: { width: 84, height: 84 },
  top: {
    position: 'absolute',
    top: -6,
    start: -6,
    backgroundColor: colors.green,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  topText: { fontFamily: fonts.heavy, fontSize: 10, lineHeight: 12, color: tone.greenEdge },
  dealKicker: {
    fontFamily: fonts.heading,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    color: tone.tertiaryTint,
  },
  dealTitle: { fontSize: 22, lineHeight: 28, color: '#FFFFFF' },
  dealText: { fontSize: 13, lineHeight: 18, color: tone.tertiaryTint },
  dealPrices: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  oldPrice: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: '#89CEFF',
    textDecorationLine: 'line-through',
  },
  newPrice: { fontFamily: fonts.heavy, fontSize: 24, lineHeight: 28, color: '#FFDDB8' },
  dealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 54,
    backgroundColor: colors.amber,
    borderRadius: 999,
    borderBottomWidth: 5,
    borderBottomColor: tone.amberEdge,
  },
  dealButtonText: {
    fontFamily: fonts.heavy,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0.5,
    color: tone.secondaryInk,
  },
  categories: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  category: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderBottomWidth: 3,
    borderBottomColor: tone.wellTop,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  categoryOn: { backgroundColor: colors.green, borderBottomColor: tone.greenEdge },
  categoryText: { fontFamily: fonts.heading, fontSize: 14, lineHeight: 18, color: tone.muted },
  section: { gap: 12 },
  sectionTitle: { fontSize: 19, lineHeight: 24, flexShrink: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderBottomWidth: 4,
    borderBottomColor: tone.wellTop,
    padding: 12,
    gap: 4,
    alignItems: 'center',
  },
  cardHint: { justifyContent: 'center', backgroundColor: tone.well },
  hintEmoji: { fontSize: 34, lineHeight: 42 },
  cardArt: {
    alignSelf: 'stretch',
    height: 96,
    borderRadius: 18,
    backgroundColor: tone.well,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  cardImage: { width: 76, height: 76 },
  rarity: { fontFamily: fonts.heading, fontSize: 11, lineHeight: 14, letterSpacing: 0.6 },
  rarityPill: {
    position: 'absolute',
    top: 6,
    start: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    zIndex: 1,
  },
  rarityPillText: { fontFamily: fonts.heading, fontSize: 10, lineHeight: 13 },
  cardTitle: { fontSize: 16, lineHeight: 20, textAlign: 'center' },
  cardText: { fontSize: 12, lineHeight: 16, color: tone.muted, textAlign: 'center' },
  wasPrice: { fontFamily: fonts.bold, fontSize: 11, lineHeight: 14, color: tone.secondary },
  owned: { fontFamily: fonts.bold, color: colors.greenInk },
  price: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'stretch',
    minHeight: 42,
    marginTop: 'auto',
    backgroundColor: colors.amber,
    borderRadius: 16,
    borderBottomWidth: 3,
    borderBottomColor: tone.amberEdge,
    paddingHorizontal: 12,
  },
  priceOwned: { backgroundColor: tone.wellHigh, borderBottomColor: tone.wellTop },
  priceWear: { backgroundColor: colors.green, borderBottomColor: tone.greenEdge },
  priceWorn: { backgroundColor: colors.greenInk, borderBottomColor: '#002109' },
  tryLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  tryText: { fontFamily: fonts.bold, fontSize: 12, color: tone.tertiary },
  priceText: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 20, color: tone.secondaryInk },
  coin: { fontSize: 15, lineHeight: 20 },
  booster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderBottomWidth: 4,
    borderBottomColor: tone.wellTop,
    padding: 12,
  },
  boosterIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: tone.tertiaryTint,
    borderBottomWidth: 3,
    borderBottomColor: '#89CEFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tone.well,
    borderRadius: 24,
    padding: 16,
  },
  fairIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: colors.green,
    borderBottomWidth: 3,
    borderBottomColor: tone.greenEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fairTitle: { fontSize: 15, lineHeight: 20 },
  fairText: { fontSize: 12, lineHeight: 16, color: tone.muted },
});
