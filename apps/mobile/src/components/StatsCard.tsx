import { StyleSheet, View } from 'react-native';
import type { ChildStats } from '@lingvohero/learning-core';
import { Heading, Label } from './ui';
import { useT } from '../i18n';
import { weekdayLabel } from '../i18n/content';
import { colors, fonts } from '../theme';

const tone = { ink: '#0D1C2E', well: '#EFF4FF', wellTop: '#D5E3FC', bar: '#BFE8CD' };

function Tile({
  emoji,
  value,
  label,
  note,
  testID,
}: {
  emoji: string;
  value: string;
  label: string;
  note?: string;
  testID?: string;
}) {
  return (
    <View
      style={s.tile}
      accessible
      accessibilityLabel={`${value} ${label}${note ? `, ${note}` : ''}`}
    >
      <Label style={s.emoji}>{emoji}</Label>
      <Heading style={s.value} testID={testID}>
        {value}
      </Heading>
      <Label style={s.label}>{label}</Label>
      {note ? <Label style={s.note}>{note}</Label> : null}
    </View>
  );
}

/** «Моя статистика»: six tiles and this week's lessons as bars. */
export function StatsCard({ stats }: { stats: ChildStats }) {
  const peak = Math.max(3, ...stats.week.map((d) => d.lessons));
  const activeThisWeek = stats.week.filter((d) => d.lessons > 0).length;
  const { current, best } = stats.streak;
  const { t, tn, locale } = useT();
  const outOf = (done: number, total: number) => t('stats.outOf', { done, total });
  return (
    <View style={s.card}>
      <Heading style={s.title}>{t('stats.title')}</Heading>
      <View style={s.grid}>
        <Tile
          emoji="📚"
          value={String(stats.words)}
          label={tn('stats.words', stats.words)}
          testID="stat-words"
        />
        <Tile
          emoji="✅"
          value={outOf(stats.lessons.done, stats.lessons.total)}
          label={t('stats.lessons')}
          note={stats.perfect ? t('stats.perfect', { n: stats.perfect }) : undefined}
          testID="stat-lessons"
        />
        <Tile
          emoji="⭐"
          value={outOf(stats.stars.earned, stats.stars.max)}
          label={t('stats.stars')}
        />
        <Tile emoji="🗺️" value={outOf(stats.sets.done, stats.sets.total)} label={t('stats.sets')} />
        <Tile
          emoji="🔥"
          value={String(current)}
          label={tn('stats.streak', current)}
          note={best > current ? tn('stats.record', best) : undefined}
          testID="stat-streak"
        />
        <Tile
          emoji="🏆"
          value={outOf(stats.trophies.earned, stats.trophies.total)}
          label={t('stats.trophies')}
        />
      </View>
      <View
        style={s.week}
        accessible
        accessibilityLabel={t('stats.weekA11y', {
          days: stats.week.map((d, i) => `${weekdayLabel(i, locale)} ${d.lessons}`).join(', '),
        })}
      >
        <View style={s.weekHead}>
          <Label style={s.weekTitle}>{t('stats.week')}</Label>
          <Label style={s.weekNote}>
            {activeThisWeek ? tn('stats.activeDays', activeThisWeek) : t('stats.empty')}
          </Label>
        </View>
        <View style={s.bars}>
          {stats.week.map((d, i) => (
            <View key={d.key} style={s.barColumn}>
              <Label style={s.barCount}>{d.lessons ? d.lessons : d.frozen ? '❄️' : ''}</Label>
              <View style={s.barTrack}>
                <View
                  style={[
                    s.bar,
                    { height: `${Math.max(d.lessons ? 12 : 0, (d.lessons / peak) * 100)}%` },
                    d.today && { backgroundColor: colors.green },
                  ]}
                />
              </View>
              <Label style={[s.barLabel, d.today && s.barToday]}>{weekdayLabel(i, locale)}</Label>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginVertical: 22,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 14,
  },
  title: { fontSize: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '30%',
    flexGrow: 1,
    minWidth: 96,
    backgroundColor: tone.well,
    borderRadius: 18,
    borderBottomWidth: 3,
    borderBottomColor: tone.wellTop,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  emoji: { fontSize: 20, lineHeight: 26 },
  value: { fontSize: 18, lineHeight: 24, color: tone.ink },
  label: { fontSize: 11, lineHeight: 14, color: colors.muted, textAlign: 'center' },
  note: { fontSize: 10, lineHeight: 13, color: colors.greenInk, marginTop: 2, textAlign: 'center' },
  week: { backgroundColor: tone.well, borderRadius: 18, padding: 12, gap: 8 },
  weekHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 8,
  },
  weekTitle: { fontFamily: fonts.heading, fontSize: 14, color: tone.ink },
  weekNote: { fontSize: 11, color: colors.muted, flexShrink: 1, textAlign: 'right' },
  bars: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, height: 104 },
  barColumn: { flex: 1, alignItems: 'center', gap: 4 },
  barCount: { fontSize: 11, lineHeight: 14, height: 14, color: tone.ink, fontFamily: fonts.bold },
  barTrack: {
    flex: 1,
    width: '70%',
    maxWidth: 26,
    justifyContent: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    overflow: 'hidden',
  },
  bar: { width: '100%', backgroundColor: tone.bar, borderRadius: 8 },
  barLabel: { fontSize: 11, lineHeight: 14, color: colors.muted },
  barToday: { color: colors.greenInk, fontFamily: fonts.bold },
});
