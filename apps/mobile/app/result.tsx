import { useAccount } from '../src/account/AccountProvider';
import { MascotFace } from '../src/components/MascotPicker';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { starsFor, learningRewards } from '@lingvohero/learning-core';
import { useDemo } from '../src/state/DemoProvider';
import { Animal, Appear, Heading, Icon, Label, ToyButton } from '../src/components/ui';
import { useT } from '../src/i18n';
import { useLocalizedLesson } from '../src/i18n/content';
import { colors, fonts } from '../src/theme';

export default function ResultScreen() {
  const { account } = useAccount();
  const { state, dispatch, storageError, coins } = useDemo();
  const { t } = useT();
  const lesson = useLocalizedLesson(state.session?.lesson);
  if (!state.session?.finished || !lesson) return <Redirect href="/" />;
  const stars = starsFor(state.session.mistakes);
  const rewards = learningRewards(state);
  // Replaying starts from the package itself, not its translated view.
  const original = state.session.lesson;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.page}>
          <Appear>
            <View style={s.art}>
              <View style={s.circle} />
              <View style={s.sparkLeft}>
                <Icon name="sparkles" color={colors.amber} size={36} />
              </View>
              <Animal id="fox" size={205} />
              <View style={s.sparkRight}>
                <Icon name="sparkles" color={colors.green} size={25} />
              </View>
            </View>
          </Appear>
          <View style={s.stars}>
            {[1, 2, 3].map((value) => (
              <View key={value} style={{ transform: [{ translateY: value === 2 ? -12 : 0 }] }}>
                <Icon
                  name="star"
                  color={value <= stars ? colors.amber : '#DDE7DE'}
                  size={value === 2 ? 50 : 39}
                />
              </View>
            ))}
          </View>
          <Label style={s.eyebrow}>
            {t('result.passed', { title: lesson.title.toUpperCase() })}
          </Label>
          <Heading style={s.title}>
            {lesson.presentation?.completionTitle ?? t('result.title')}
          </Heading>
          <Label style={s.subtitle}>
            {lesson.presentation?.completionMessage ?? t('result.message')}
          </Label>
          <View style={s.stats}>
            <Stat icon="flash" value={String(rewards.xp)} label={t('result.xp')} />
            <Stat icon="book" value={String(lesson.words.length)} label={t('result.words')} />
            <Stat icon="ellipse" value={String(coins)} label={t('result.coins')} />
          </View>
          <View style={s.note}>
            <Icon
              name={storageError ? 'alert-circle-outline' : 'checkmark-circle-outline'}
              color={colors.greenDark}
              size={18}
            />
            <Label style={s.noteText}>
              {storageError ? t('result.saveFailed') : t('result.saved')}
            </Label>
          </View>
          <ToyButton
            testID="back-to-map"
            title={t('common.backToMap')}
            icon="arrow-forward"
            onPress={() => router.dismissTo('/')}
          />
          <ToyButton
            title={t('result.repeat')}
            tone="light"
            onPress={() => {
              dispatch({ type: 'start', lesson: original });
              router.replace('/lesson');
            }}
            style={{ marginTop: 12 }}
          />
          <Label style={s.repeatNote}>{t('result.repeatNote')}</Label>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
function Stat({
  icon,
  value,
  label,
}: {
  icon: 'flash' | 'book' | 'ellipse';
  value: string;
  label: string;
}) {
  return (
    <View style={s.stat}>
      <Icon name={icon} color={colors.amberDark} size={22} />
      <Heading style={s.statValue}>{value}</Heading>
      <Label style={s.statLabel}>{label}</Label>
    </View>
  );
}
const s = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  page: { width: '100%', maxWidth: 500, alignSelf: 'center' },
  art: { alignItems: 'center', justifyContent: 'center', height: 220 },
  circle: {
    position: 'absolute',
    width: 195,
    height: 195,
    borderRadius: 100,
    backgroundColor: '#E8F3D9',
  },
  sparkLeft: { position: 'absolute', left: '12%', top: 40 },
  sparkRight: { position: 'absolute', right: '15%', top: 130 },
  stars: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 13,
    marginTop: 8,
    marginBottom: 23,
  },
  eyebrow: {
    textAlign: 'center',
    fontFamily: fonts.bold,
    color: colors.greenInk,
    fontSize: 9,
    letterSpacing: 1.5,
  },
  title: { fontSize: 32, lineHeight: 42, textAlign: 'center', marginTop: 8 },
  subtitle: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  stats: {
    flexDirection: 'row',
    marginTop: 27,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 18,
  },
  stat: { flex: 1, alignItems: 'center', gap: 3 },
  statValue: { fontSize: 26 },
  statLabel: { fontSize: 10, color: colors.muted },
  note: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 22 },
  noteText: { color: colors.muted, fontSize: 11 },
  repeatNote: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
    color: colors.muted,
    marginTop: 20,
  },
});
