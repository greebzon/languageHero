import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  TROPHIES,
  hoursUntilMidnight,
  learningRewards,
  questProgress,
  trophyProgress,
} from '@lingvohero/learning-core';
import { Screen } from '../../src/components/Screen';
import { Heading, Icon, Label } from '../../src/components/ui';
import { mascotOf } from '../../src/components/MascotPicker';
import { MascotStage } from '../../src/components/MascotStage';
import { useAccount } from '../../src/account/context';
import { useDemo } from '../../src/state/DemoProvider';
import { ShopSection } from '../../src/components/ShopSection';
import { Toast, type ToastMessage } from '../../src/components/Toast';
import { colors, fonts } from '../../src/theme';
import { fraction, useT } from '../../src/i18n';
import { mascotText, questTitle, trophyText } from '../../src/i18n/content';

/* «Playful Tactile Wonder» tokens used by this screen (shop/DESIGN.md). */
const tone = {
  secondary: '#855300',
  secondaryInk: '#684000',
  tertiary: '#006591',
  muted: '#3D4A3D',
  well: '#EFF4FF',
  wellHigh: '#DCE9FF',
  wellTop: '#D5E3FC',
  edge: '#BCCBB9',
  vault: '#FFC661',
  vaultEdge: '#C77A0E',
  ink: '#0D1C2E',
  inverse: '#233144',
};
const SECTIONS = [
  { id: 'rewards', emoji: '🏆' },
  { id: 'shop', emoji: '🛍️' },
  { id: 'leagues', emoji: '👑' },
] as const;

function Tile({
  emoji,
  value,
  label,
  color,
  testID,
}: {
  emoji: string;
  value: number;
  label: string;
  color: string;
  testID?: string;
}) {
  const { locale } = useT();
  return (
    <View style={s.tile}>
      <View style={s.tileRow}>
        <Label style={s.tileEmoji}>{emoji}</Label>
        <Label testID={testID} style={[s.tileValue, { color }]}>
          {value.toLocaleString(locale)}
        </Label>
      </View>
      <Label style={s.tileLabel}>{label}</Label>
    </View>
  );
}
/* Recessed track with a rounded fill and a highlight dot at its edge. */
function Bar({ value, color }: { value: number; color: string }) {
  const width = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(width * 100) }}
      style={s.track}
    >
      {width > 0 && (
        <View style={[s.fill, { width: `${width * 100}%`, backgroundColor: color }]}>
          <View style={s.dot} />
        </View>
      )}
    </View>
  );
}
export default function RewardsScreen() {
  const { account } = useAccount();
  const { state, journal, coins, wordsTotal, claimQuest, outfit } = useDemo();
  const { locale, t, tn, isRTL } = useT();
  const rewards = learningRewards(state);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  /* «Сегодня» must be fresh when the tab opens: a quest done at 23:59 is gone at 00:00. */
  useFocusEffect(useCallback(() => setNow(new Date()), []));
  const [section, setSection] = useState<'rewards' | 'shop'>('rewards');
  const [toast, setToast] = useState<ToastMessage | null>(null);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(timer);
  }, [toast]);
  const claim = async (questId: string, reward: number) => {
    const fresh = new Date();
    setNow(fresh);
    const entry = questProgress(journal, fresh).find((q) => q.quest.id === questId);
    if (!entry?.done)
      return setToast({
        title: t('rewards.newDay.title'),
        text: t('rewards.newDay.text'),
        tone: 'warn',
      });
    try {
      await claimQuest(questId);
      setToast({ title: tn('rewards.claimed.title', reward), text: t('rewards.claimed.text') });
    } catch (e) {
      setToast({
        title: t('rewards.claimFailed'),
        text: e instanceof Error ? e.message : t('common.tryAgain'),
        tone: 'warn',
      });
    }
  };
  const quests = questProgress(journal, now);
  const trophies = trophyProgress(journal, now, wordsTotal);
  const earned = trophies.filter((entry) => entry.earned).length;
  const mascot = mascotText(mascotOf(account!.profile.avatar), locale);
  return (
    <Screen overlay={toast && <Toast message={toast} />}>
      <View style={s.page}>
        <View style={s.segments}>
          {SECTIONS.map((item) => {
            const active = item.id === section;
            const title = t(`rewards.sections.${item.id}`);
            return (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={title}
                accessibilityState={{ selected: active }}
                onPress={() => {
                  if (item.id === 'leagues')
                    setToast({ title: t('rewards.soon', { name: title }) });
                  else {
                    setToast(null);
                    setSection(item.id);
                  }
                }}
                style={({ pressed }) => [
                  s.segment,
                  active && s.segmentOn,
                  pressed && { transform: [{ translateY: 1 }] },
                ]}
              >
                <Label style={s.segmentEmoji}>{item.emoji}</Label>
                <Label style={[s.segmentText, active && s.segmentTextOn]}>{title}</Label>
              </Pressable>
            );
          })}
        </View>
        {section === 'shop' ? (
          <ShopSection onEarn={() => setSection('rewards')} notify={setToast} />
        ) : (
          <>
            <View style={s.vault}>
              <View style={s.vaultGlow} />
              <View style={s.between}>
                <View style={s.titleRow}>
                  <Label style={s.sparkle}>✨</Label>
                  <Label
                    style={s.vaultTitle}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {t('rewards.vault')}
                  </Label>
                </View>
                <View style={s.levelPill}>
                  <Label style={s.levelText}>
                    {t('rewards.level', { level: account!.profile.level })}
                  </Label>
                </View>
              </View>
              <View style={s.tiles}>
                <Tile
                  emoji="🪙"
                  value={coins}
                  label={t('rewards.tiles.coins')}
                  color={tone.secondary}
                  testID="coins-value"
                />
                <Tile
                  emoji="🌟"
                  value={rewards.stars}
                  label={t('rewards.tiles.stars')}
                  color={colors.amberDark}
                />
                <Tile
                  emoji="⚡"
                  value={rewards.xp}
                  label={t('rewards.tiles.xp')}
                  color={tone.tertiary}
                />
              </View>
            </View>
            <View style={s.card}>
              <View style={s.between}>
                <View style={s.titleRow}>
                  <Icon name="calendar" size={24} color={colors.amber} />
                  <Heading style={s.cardTitle}>{t('rewards.quests')}</Heading>
                </View>
                <View style={s.timePill}>
                  <Label style={s.timeText}>
                    {tn('rewards.hoursLeft', hoursUntilMidnight(now))}
                  </Label>
                </View>
              </View>
              {quests.map(({ quest, value, done, claimed }) => (
                <View key={quest.id} style={s.quest}>
                  <View style={s.questRow}>
                    <View style={[s.questIcon, done && s.questIconDone]}>
                      <Icon
                        name={
                          done
                            ? 'checkmark-circle'
                            : quest.metric === 'perfect'
                              ? 'school-outline'
                              : quest.metric === 'words'
                                ? 'book-outline'
                                : 'game-controller-outline'
                        }
                        size={20}
                        color={done ? colors.greenInk : tone.secondary}
                      />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Label style={s.questTitle} numberOfLines={1}>
                        {questTitle(quest, locale)}
                      </Label>
                      <Label style={[s.meta, done && s.metaDone]}>
                        {t(done ? 'rewards.questDone' : 'rewards.questProgress', {
                          value,
                          target: quest.target,
                        })}
                      </Label>
                    </View>
                    {!done && (
                      <View style={s.rewardPill}>
                        <Label style={s.rewardText}>+{quest.reward} 🪙</Label>
                      </View>
                    )}
                  </View>
                  {done ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={
                        claimed ? t('rewards.claimedLabel') : tn('rewards.claim', quest.reward)
                      }
                      accessibilityState={{ disabled: claimed }}
                      disabled={claimed}
                      onPress={() => void claim(quest.id, quest.reward)}
                      style={({ pressed }) => [
                        s.claim,
                        claimed && s.claimDone,
                        pressed &&
                          !claimed && { transform: [{ translateY: 3 }], borderBottomWidth: 1 },
                      ]}
                    >
                      <Icon
                        name={claimed ? 'checkmark' : 'star'}
                        size={20}
                        color={claimed ? tone.muted : '#FDE047'}
                      />
                      <Label style={[s.claimText, claimed && { color: tone.muted }]}>
                        {claimed
                          ? t('rewards.claimedButton')
                          : t('rewards.claimButton', { n: quest.reward })}
                      </Label>
                    </Pressable>
                  ) : (
                    <Bar value={value / quest.target} color={colors.amber} />
                  )}
                </View>
              ))}
            </View>
            <View style={[s.between, { paddingHorizontal: 4 }]}>
              <View style={s.titleRow}>
                <Icon name="medal" size={24} color={colors.amber} />
                <Heading style={s.cardTitle}>{t('rewards.trophies')}</Heading>
              </View>
              <Label style={s.meta}>
                {t('rewards.trophiesEarned', { earned, total: TROPHIES.length })}
              </Label>
            </View>
            <View style={s.grid}>
              {trophies.map(({ trophy, value, earned }) => {
                const locked = !earned && value === 0;
                const percent = Math.round((value / trophy.target) * 100);
                const text = trophyText(trophy, locale);
                return (
                  <View key={trophy.id} style={[s.trophy, locked && s.trophyLocked]}>
                    <View
                      style={[
                        s.medal,
                        earned ? s.medalDone : locked ? s.medalLocked : s.medalProgress,
                      ]}
                    >
                      <Label style={[s.medalEmoji, locked && { opacity: 0.45 }]}>
                        {trophy.icon}
                      </Label>
                      {earned && (
                        <View style={s.medalBadge}>
                          <Label style={s.medalBadgeText}>{t('rewards.trophyDone')}</Label>
                        </View>
                      )}
                      {locked && (
                        <View style={s.lockOverlay}>
                          <Icon name="lock-closed" size={20} color="#FFFFFF" />
                        </View>
                      )}
                    </View>
                    <Heading style={[s.trophyTitle, locked && { color: tone.muted }]}>
                      {text.title}
                    </Heading>
                    <Label style={s.trophyText}>{text.description}</Label>
                    {earned ? (
                      <View style={s.gotPill}>
                        <Icon name="checkmark-circle" size={14} color={colors.greenInk} />
                        <Label style={s.gotText}>
                          {t('rewards.trophyReward', { n: trophy.reward })}
                        </Label>
                      </View>
                    ) : locked ? (
                      <View style={s.lockedPill}>
                        <Icon name="lock-closed" size={13} color={tone.muted} />
                        <Label style={s.lockedText}>{t('rewards.locked')}</Label>
                      </View>
                    ) : (
                      <View style={s.trophyProgress}>
                        <View style={s.between}>
                          <Label style={s.small}>{fraction(value, trophy.target, isRTL)}</Label>
                          <Label
                            style={[s.small, { color: tone.tertiary, fontFamily: fonts.bold }]}
                          >
                            {percent}%
                          </Label>
                        </View>
                        <Bar value={value / trophy.target} color={colors.sky} />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
            <View style={s.card}>
              <View style={s.between}>
                <View style={s.titleRow}>
                  <Icon name="shirt" size={24} color={colors.sky} />
                  <Heading style={s.cardTitle}>{t('rewards.wardrobe')}</Heading>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('rewards.openFitting')}
                  onPress={() => router.push('/wardrobe')}
                  style={({ pressed }) => [s.soonPill, pressed && { opacity: 0.7 }]}
                >
                  <Label style={s.soonText}>{t('rewards.fitting')}</Label>
                </Pressable>
              </View>
              <View style={s.heroRow}>
                <View style={s.heroWell}>
                  <MascotStage mascotId={mascot.id} outfit={outfit} width={64} pedestal={false} />
                  <View style={s.heroTag}>
                    <Label style={s.heroTagText}>{t('rewards.heroTag')}</Label>
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Heading style={s.cardTitle}>{mascot.name}</Heading>
                  <Label style={s.meta}>
                    {journal.inventory.items.length
                      ? tn('rewards.closet', journal.inventory.items.length)
                      : t('rewards.closetEmpty')}
                  </Label>
                </View>
              </View>
            </View>
            <Label style={s.note}>{t('rewards.note')}</Label>
          </>
        )}
      </View>
    </Screen>
  );
}
const s = StyleSheet.create({
  page: { padding: 16, gap: 16 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  segments: {
    flexDirection: 'row',
    backgroundColor: tone.wellHigh,
    borderRadius: 999,
    padding: 5,
    gap: 3,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 4,
  },
  segmentOn: { backgroundColor: '#FFFFFF', borderBottomWidth: 3, borderBottomColor: tone.wellTop },
  segmentEmoji: { fontSize: 15, lineHeight: 20 },
  segmentText: { fontFamily: fonts.heading, fontSize: 13, lineHeight: 18, color: tone.muted },
  segmentTextOn: { color: colors.greenInk },
  vault: {
    backgroundColor: tone.vault,
    borderRadius: 28,
    borderBottomWidth: 6,
    borderBottomColor: tone.vaultEdge,
    padding: 16,
    gap: 12,
    overflow: 'hidden',
  },
  vaultGlow: {
    position: 'absolute',
    end: -28,
    bottom: -28,
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  sparkle: { fontSize: 22, lineHeight: 28 },
  vaultTitle: {
    fontFamily: fonts.heavy,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.6,
    color: tone.secondaryInk,
    flexShrink: 1,
  },
  levelPill: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  levelText: { fontFamily: fonts.heading, fontSize: 12, lineHeight: 16, color: '#2A1700' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 16,
    borderBottomWidth: 3,
    borderBottomColor: '#FFB95F',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tileEmoji: { fontSize: 17, lineHeight: 24 },
  tileValue: { fontFamily: fonts.heavy, fontSize: 19, lineHeight: 24 },
  tileLabel: { fontFamily: fonts.heading, fontSize: 12, lineHeight: 16, color: tone.muted },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderBottomWidth: 4,
    borderBottomColor: tone.wellTop,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 19, lineHeight: 24, flexShrink: 1 },
  timePill: {
    backgroundColor: '#D6FFE0',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  timeText: { fontFamily: fonts.heading, fontSize: 13, lineHeight: 16, color: colors.greenInk },
  quest: { backgroundColor: tone.well, borderRadius: 18, padding: 12, gap: 10 },
  questRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  questIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFEED6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questIconDone: { backgroundColor: '#D6FFE0' },
  questTitle: { fontSize: 16, lineHeight: 22, color: tone.ink },
  meta: { fontFamily: fonts.heading, fontSize: 13, lineHeight: 18, color: tone.muted },
  metaDone: { color: colors.greenInk },
  rewardPill: {
    backgroundColor: tone.wellTop,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  rewardText: { fontFamily: fonts.heading, fontSize: 13, lineHeight: 16, color: tone.muted },
  claim: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colors.green,
    borderBottomWidth: 4,
    borderBottomColor: colors.greenInk,
  },
  claimDone: { backgroundColor: tone.wellTop, borderBottomColor: tone.edge, borderBottomWidth: 2 },
  claimText: {
    fontFamily: fonts.heavy,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: 0.6,
    color: '#004B1E',
  },
  track: {
    height: 16,
    borderRadius: 999,
    backgroundColor: tone.wellTop,
    padding: 2,
    justifyContent: 'center',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingEnd: 3,
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  trophy: {
    width: '48%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderBottomWidth: 4,
    borderBottomColor: tone.wellTop,
    padding: 12,
    gap: 6,
  },
  trophyLocked: { backgroundColor: '#E6EEFF', borderBottomColor: '#CCDBF3', opacity: 0.8 },
  medal: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 6,
  },
  medalDone: {
    backgroundColor: '#FFD166',
    borderBottomWidth: 4,
    borderBottomColor: tone.secondaryInk,
  },
  medalProgress: {
    backgroundColor: '#D6F0FF',
    borderBottomWidth: 4,
    borderBottomColor: tone.wellTop,
  },
  medalLocked: {
    backgroundColor: tone.wellTop,
    borderBottomWidth: 4,
    borderBottomColor: tone.edge,
  },
  medalEmoji: { fontSize: 30, lineHeight: 38 },
  medalBadge: {
    position: 'absolute',
    bottom: -8,
    backgroundColor: colors.greenInk,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  medalBadgeText: { fontFamily: fonts.heavy, fontSize: 9, lineHeight: 12, color: '#FFFFFF' },
  lockOverlay: {
    position: 'absolute',
    inset: 0,
    borderRadius: 32,
    backgroundColor: 'rgba(35,49,68,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyTitle: { fontSize: 18, lineHeight: 22, textAlign: 'center' },
  trophyText: { fontSize: 13, lineHeight: 17, color: tone.muted, textAlign: 'center' },
  gotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'stretch',
    backgroundColor: '#DDFDE5',
    borderRadius: 999,
    paddingVertical: 5,
    marginTop: 'auto',
  },
  gotText: { fontFamily: fonts.heading, fontSize: 12, lineHeight: 16, color: '#004B1E' },
  lockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    alignSelf: 'stretch',
    backgroundColor: tone.wellTop,
    borderRadius: 999,
    paddingVertical: 5,
    marginTop: 'auto',
  },
  lockedText: { fontFamily: fonts.heading, fontSize: 12, lineHeight: 16, color: tone.muted },
  trophyProgress: { alignSelf: 'stretch', gap: 4, marginTop: 'auto' },
  small: { fontFamily: fonts.heading, fontSize: 12, lineHeight: 16, color: tone.muted },
  soonPill: {
    backgroundColor: tone.wellHigh,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  soonText: { fontFamily: fonts.heading, fontSize: 13, lineHeight: 16, color: tone.tertiary },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: tone.well,
    borderRadius: 18,
    padding: 12,
  },
  heroWell: {
    width: 80,
    height: 104,
    borderRadius: 18,
    backgroundColor: '#DDFDE5',
    borderBottomWidth: 3,
    borderBottomColor: '#4AE176',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroTag: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,110,47,0.85)',
    paddingVertical: 2,
    alignItems: 'center',
  },
  heroTagText: { fontFamily: fonts.heavy, fontSize: 8, lineHeight: 10, color: '#FFFFFF' },
  note: { fontSize: 11, lineHeight: 16, color: colors.muted, textAlign: 'center' },
});
