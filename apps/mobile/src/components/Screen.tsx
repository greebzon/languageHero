import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { learningRewards } from '@lingvohero/learning-core';
import { useDemo } from '../state/DemoProvider';
import { Badge, Heading, Label, Tim } from './ui';
import { NetworkNotice } from './NetworkNotice';
import { MenuButton } from './MenuButton';
import { colors, fonts } from '../theme';
import { useT } from '../i18n';

export function Header() {
  const { state } = useDemo();
  const { t } = useT();
  const rewards = learningRewards(state);
  return (
    <View style={styles.header}>
      <View style={styles.brand}>
        <MenuButton color={colors.ink} />
        <Tim size={38} />
        <View style={{ flexShrink: 1 }}>
          <Heading style={styles.brandTitle}>{t('common.appName')}</Heading>
          <Label style={styles.brandSub}>{t('common.tagline')}</Label>
        </View>
      </View>
      <Badge icon="star" value={rewards.stars} />
    </View>
  );
}
export function Screen({
  children,
  header,
  background,
  scroll = true,
  overlay,
}: {
  children: ReactNode;
  header?: ReactNode;
  background?: string;
  /* false: the screen brings its own virtualized list instead of the ScrollView. */
  scroll?: boolean;
  /* Pinned above the content near the bottom edge (toasts), independent of scrolling. */
  overlay?: ReactNode;
}) {
  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safe, background ? { backgroundColor: background } : undefined]}
    >
      <View style={styles.width}>
        {header ?? <Header />}
        <NetworkNotice />
      </View>
      {/* Edge-to-edge Android does not shrink the window for the keyboard, so pad for it here. */}
      <KeyboardAvoidingView style={styles.safe} behavior="padding">
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.width}>{children}</View>
          </ScrollView>
        ) : (
          children
        )}
      </KeyboardAvoidingView>
      {overlay && (
        <View pointerEvents="box-none" style={styles.overlay}>
          <View style={styles.width}>{overlay}</View>
        </View>
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  width: { width: '100%', maxWidth: 600, alignSelf: 'center' },
  scroll: { paddingBottom: 28 },
  overlay: { position: 'absolute', left: 16, right: 16, bottom: 16 },
  header: {
    paddingStart: 8,
    paddingEnd: 20,
    paddingVertical: 16,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  brandTitle: { fontSize: 19, lineHeight: 23, letterSpacing: -0.5 },
  brandSub: {
    fontSize: 7,
    lineHeight: 13,
    letterSpacing: 1.1,
    fontFamily: fonts.bold,
    color: colors.muted,
  },
});
