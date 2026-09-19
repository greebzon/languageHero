import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, usePathname, type Href } from 'expo-router';
import type Ionicons from '@expo/vector-icons/Ionicons';
import { useAccount } from '../account/AccountProvider';
import { useDemo } from '../state/DemoProvider';
import { LOCALE_NAMES, useT, type TextKey } from '../i18n';
import { languageName } from '../i18n/content';
import { MascotFace } from './MascotPicker';
import { Heading, Icon, Label } from './ui';
import { colors, fonts } from '../theme';

type Item = {
  id: string;
  title: TextKey;
  icon: ComponentProps<typeof Ionicons>['name'];
  href: Href;
  path: string;
};
const ITEMS: Item[] = [
  {
    id: 'friends',
    title: 'friends.title',
    icon: 'paw-outline',
    href: '/friends',
    path: '/friends',
  },
  { id: 'worlds', title: 'menu.worlds', icon: 'map-outline', href: '/', path: '/' },
  {
    id: 'languages',
    title: 'menu.languages',
    icon: 'language-outline',
    href: '/languages',
    path: '/languages',
  },
  {
    id: 'wardrobe',
    title: 'menu.wardrobe',
    icon: 'shirt-outline',
    href: '/wardrobe',
    path: '/wardrobe',
  },
  {
    id: 'profile',
    title: 'menu.profile',
    icon: 'person-outline',
    href: '/profile',
    path: '/profile',
  },
];

/** From the menu a screen opens right over the tabs: whatever was stacked is closed first, so
    going back never lands on a second copy of the map. */
export function goTo(href: Href) {
  if (router.canDismiss()) router.dismissAll();
  router.navigate(href);
}

/** The side menu: where to go, which language is learned and which one the app speaks. */
export function SideMenu({ onClose }: { onClose: () => void }) {
  const { t, locale } = useT();
  const { account } = useAccount();
  const { fullCatalog, language } = useDemo();
  const pathname = usePathname();
  const profile = account!.profile;
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.head}>
          <View style={s.face}>
            <MascotFace id={profile.avatar} size={64} />
          </View>
          <View style={s.flex}>
            <Heading style={s.name} numberOfLines={1}>
              {profile.name}
            </Heading>
            <Label style={s.brand}>{t('common.appName')}</Label>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('menu.close')}
            onPress={onClose}
            hitSlop={6}
            style={s.close}
          >
            <Icon name="close" size={24} color={colors.muted} />
          </Pressable>
        </View>
        {ITEMS.map((item) => {
          const active = pathname === item.path;
          return (
            <Pressable
              key={item.id}
              testID={`menu-${item.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                onClose();
                if (!active) goTo(item.href);
              }}
              style={({ pressed }) => [s.item, active && s.itemOn, pressed && { opacity: 0.7 }]}
            >
              <View style={[s.itemIcon, active && s.itemIconOn]}>
                <Icon name={item.icon} size={22} color={active ? '#FFFFFF' : colors.greenInk} />
              </View>
              <Label style={[s.itemText, active && s.itemTextOn]}>{t(item.title)}</Label>
            </Pressable>
          );
        })}
        <View style={s.footer}>
          {!!language && (
            <View style={s.fact}>
              <Icon name="book-outline" size={17} color={colors.muted} />
              <Label style={s.factText}>
                {t('menu.learning', { language: languageName(fullCatalog, language, locale) })}
              </Label>
            </View>
          )}
          <View style={s.fact}>
            <Icon name="globe-outline" size={17} color={colors.muted} />
            <Label style={s.factText}>
              {t('menu.appLanguage', { locale: LOCALE_NAMES[locale] })}
            </Label>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, gap: 8 },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  face: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF0D5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  name: { fontSize: 20, lineHeight: 26 },
  brand: { fontSize: 12, lineHeight: 16, color: colors.muted, fontFamily: fonts.bold },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 10,
    borderRadius: 18,
  },
  itemOn: { backgroundColor: colors.mint },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconOn: { backgroundColor: colors.green },
  itemText: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  itemTextOn: { color: colors.greenInk },
  footer: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 10,
  },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  factText: { fontSize: 13, lineHeight: 18, color: colors.muted, flex: 1 },
});
