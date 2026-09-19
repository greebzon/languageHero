import { useRef, type ComponentProps } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ShopMascot } from '@lingvohero/contracts';
import { Heading, Icon, Label } from './ui';
import { mascotOf, shopImage, useShopCatalog } from '../content/shop';
import { useT } from '../i18n';
import { mascotText } from '../i18n/content';
import { colors, fonts } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
export { mascotOf };
/* Palette of the «Playful Tactile Wonder» design system (chars/playful_tactile_wonder). */
const tone = {
  secondary: '#855300',
  secondaryInk: '#2A1700',
  secondaryTint: '#FFF2E3',
  tertiary: '#006591',
  tertiaryInk: '#001E2F',
  tertiaryTint: '#E4F3FF',
  primary: '#006E2F',
  primaryInk: '#002109',
  primaryTint: '#DDFDE5',
  muted: '#3D4A3D',
  well: '#DCE9FF',
  wellEdge: '#BCCBB9',
  cardEdge: '#D5E3FC',
  chip: '#E6EEFF',
  error: '#BA1A1A',
  greenEdge: '#004B1E',
  chipHighlight: '#6BFF8F',
  chipHighlightEdge: '#4AE176',
};
/* Mascots come from the catalog; their card colours and icons cycle through these looks. */
const looks: {
  traitIcon: IconName;
  traitColor: string;
  perkIcon: IconName;
  perkIconColor: string;
  perkTint: string;
  perkInk: string;
}[] = [
  {
    traitIcon: 'search',
    traitColor: tone.secondary,
    perkIcon: 'flash',
    perkIconColor: tone.secondary,
    perkTint: tone.secondaryTint,
    perkInk: tone.secondaryInk,
  },
  {
    traitIcon: 'book',
    traitColor: tone.tertiary,
    perkIcon: 'ear',
    perkIconColor: tone.tertiary,
    perkTint: tone.tertiaryTint,
    perkInk: tone.tertiaryInk,
  },
  {
    traitIcon: 'compass',
    traitColor: tone.primary,
    perkIcon: 'heart',
    perkIconColor: tone.error,
    perkTint: tone.primaryTint,
    perkInk: tone.primaryInk,
  },
  {
    traitIcon: 'sparkles',
    traitColor: tone.secondary,
    perkIcon: 'flame',
    perkIconColor: colors.amber,
    perkTint: tone.secondaryTint,
    perkInk: tone.secondaryInk,
  },
];
export function MascotFace({ id, size = 96 }: { id: string; size?: number }) {
  const catalog = useShopCatalog();
  const { locale } = useT();
  const mascot = mascotOf(id, catalog);
  return (
    <Image
      accessibilityLabel={mascotText(mascot, locale).name}
      source={shopImage(mascot.portrait)}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
function MascotCard({
  mascot,
  look,
  state,
  onPress,
  locked,
}: {
  mascot: ShopMascot;
  look: (typeof looks)[number];
  state: 'active' | 'selected' | 'idle';
  locked: boolean;
  onPress: () => void;
}) {
  const { t, locale } = useT();
  const text = mascotText(mascot, locale);
  const on = state !== 'idle';
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={text.name}
      accessibilityState={{ checked: on, disabled: locked }}
      disabled={locked}
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        on && s.cardOn,
        pressed && { transform: [{ translateY: 2 }], borderBottomWidth: 3 },
      ]}
    >
      <View style={s.well}>
        <MascotFace id={mascot.id} size={88} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Heading style={s.name} numberOfLines={2}>
          {text.name}
        </Heading>
        <View style={s.trait}>
          <Icon name={look.traitIcon} size={18} color={look.traitColor} />
          <Label style={[s.traitText, { color: look.traitColor }]}>{text.trait}</Label>
        </View>
        <View style={[s.perk, { backgroundColor: look.perkTint }]}>
          <Icon name={look.perkIcon} size={18} color={look.perkIconColor} />
          <Label style={[s.perkText, { color: look.perkInk }]} numberOfLines={2}>
            {text.perk}
          </Label>
        </View>
        <View style={s.badgeRow}>
          <View style={[s.badge, on && s.badgeOn]}>
            <Label style={[s.badgeText, on && { color: '#FFFFFF' }]}>
              {locked
                ? t('friends.locked', { level: mascot.unlockLevel })
                : t(
                    state === 'active'
                      ? 'welcome.picker.active'
                      : state === 'selected'
                        ? 'welcome.picker.selected'
                        : 'welcome.picker.choose',
                  )}
            </Label>
          </View>
        </View>
      </View>
    </Pressable>
  );
}
export function MascotPicker({
  selected,
  current,
  onSelect,
  confirm,
  hero = true,
  unlockedIds = ['fox'],
}: {
  selected: string;
  /* The companion saved in the profile; it is shown as «Активен» until another one is chosen. */
  current?: string;
  onSelect: (id: string) => void;
  confirm?: { onPress: () => void; disabled?: boolean };
  hero?: boolean;
  unlockedIds?: string[];
}) {
  const catalog = useShopCatalog();
  const { t, locale } = useT();
  const initial = useRef(selected).current;
  const changed = selected !== initial;
  return (
    <View style={s.stack}>
      {hero && (
        <View style={s.hero}>
          <View style={s.team}>
            <Icon name="paw" size={18} color={tone.primary} />
            <Label style={s.teamText}>{t('welcome.picker.team')}</Label>
          </View>
          <Heading style={s.heroTitle}>{t('welcome.picker.title')}</Heading>
          <Label style={s.heroText}>{t('welcome.picker.text')}</Label>
        </View>
      )}
      {catalog.mascots.map((m, index) => (
        <MascotCard
          key={m.id}
          mascot={m}
          locked={!unlockedIds.includes(m.id)}
          look={looks[index % looks.length]!}
          state={m.id !== selected ? 'idle' : current === m.id && !changed ? 'active' : 'selected'}
          onPress={() => onSelect(m.id)}
        />
      ))}
      {confirm && (
        <View style={s.dock}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('welcome.picker.confirmLabel')}
            accessibilityState={{ disabled: !!confirm.disabled }}
            disabled={confirm.disabled}
            onPress={confirm.onPress}
            style={({ pressed }) => [
              s.confirm,
              confirm.disabled && { opacity: 0.45 },
              pressed && { transform: [{ translateY: 5 }], borderBottomWidth: 1 },
            ]}
          >
            <Icon name="star" size={28} color="#FFFFFF" />
            <Label style={s.confirmText}>
              {changed
                ? t('welcome.picker.confirmName', {
                    name: mascotText(mascotOf(selected, catalog), locale).name.toUpperCase(),
                  })
                : t('welcome.picker.confirmThis')}
            </Label>
          </Pressable>
          <View style={s.note}>
            <Icon name="swap-horizontal" size={16} color={tone.primary} />
            <Label style={s.noteText}>{t('welcome.picker.note')}</Label>
          </View>
        </View>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  stack: { gap: 14 },
  hero: { alignItems: 'center', gap: 6, paddingHorizontal: 4, marginBottom: 6 },
  team: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: tone.chipHighlight,
    borderBottomWidth: 2,
    borderBottomColor: tone.chipHighlightEdge,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 4,
  },
  teamText: {
    fontFamily: fonts.heading,
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: 1,
    color: tone.primaryInk,
  },
  heroTitle: { fontFamily: fonts.heavy, fontSize: 26, lineHeight: 32, textAlign: 'center' },
  heroText: { textAlign: 'center', color: tone.muted, maxWidth: 320, lineHeight: 24 },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderWidth: 4,
    borderColor: 'transparent',
    borderBottomWidth: 6,
    borderBottomColor: tone.cardEdge,
    padding: 12,
  },
  cardOn: { borderColor: colors.green, borderBottomColor: colors.green },
  well: {
    width: 96,
    height: 96,
    borderRadius: 16,
    backgroundColor: tone.well,
    borderBottomWidth: 4,
    borderBottomColor: tone.wellEdge,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  name: { fontFamily: fonts.heavy, fontSize: 21, lineHeight: 27 },
  badgeRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  badge: {
    backgroundColor: tone.chip,
    borderBottomWidth: 2,
    borderBottomColor: tone.wellEdge,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeOn: { backgroundColor: colors.green, borderBottomColor: tone.greenEdge },
  badgeText: { fontFamily: fonts.heading, fontSize: 13, lineHeight: 16, color: tone.muted },
  trait: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  traitText: { fontFamily: fonts.heading, fontSize: 15, lineHeight: 20, flexShrink: 1 },
  perk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  perkText: { flex: 1, fontSize: 15, lineHeight: 20 },
  dock: { paddingTop: 4, gap: 10 },
  confirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.green,
    borderRadius: 999,
    borderBottomWidth: 6,
    borderBottomColor: tone.greenEdge,
    minHeight: 64,
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  confirmText: {
    fontFamily: fonts.heavy,
    fontSize: 20,
    lineHeight: 26,
    color: '#FFFFFF',
    textAlign: 'center',
    flexShrink: 1,
  },
  note: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  noteText: { fontSize: 13, lineHeight: 16, color: tone.muted, textAlign: 'center' },
});
