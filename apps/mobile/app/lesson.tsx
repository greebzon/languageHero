import { useAccount } from '../src/account/AccountProvider';
import { MascotFace } from '../src/components/MascotPicker';
import { useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { assess } from '@lingvohero/learning-core';
import { useDemo } from '../src/state/DemoProvider';
import { Heading, Icon, Label, Progress, ToyButton } from '../src/components/ui';
import { ExerciseView } from '../src/components/ExerciseView';
import { NetworkNotice } from '../src/components/NetworkNotice';
import { fraction, useT } from '../src/i18n';
import { useLocalizedLesson, wordDirection } from '../src/i18n/content';
import { colors, fonts } from '../src/theme';

export default function LessonScreen() {
  const { account } = useAccount();
  const { state, dispatch, fullCatalog } = useDemo();
  const { t, isRTL } = useT();
  const localized = useLocalizedLesson(state.session?.lesson);
  const [wrong, setWrong] = useState(false);
  const [hint, setHint] = useState(false);
  const [exit, setExit] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const session = state.session;
  // The hint opens under the exercise: bring it into view, the child may not scroll by themselves.
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [hint]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setExit(true);
      return true;
    });
    return () => subscription.remove();
  }, []);
  if (!session || !localized) return <Redirect href="/" />;
  if (session.finished) return <Redirect href="/result" />;
  const lesson = localized;
  const exercise = lesson.exercises[session.queue[session.exerciseIndex]];
  const correct = session.correct;
  const assessment = session.draft ? assess(exercise, session.draft, lesson) : 'invalid';
  const review = session.exerciseIndex >= lesson.exercises.length;
  // «Собери слово»: the hint also shows how the word is written, letter by letter.
  const spelling =
    exercise.type === 'build-word'
      ? Array.from(
          (lesson.words.find((w) => w.id === exercise.wordId)?.spelling ?? '').normalize('NFC'),
        )
      : [];
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.container}>
        <View style={s.top}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('lesson.exit')}
            onPress={() => setExit(true)}
            style={s.close}
          >
            <Icon name="close" color={colors.muted} size={25} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={s.progressLabel}>
              <Label style={s.caption}>{lesson.title}</Label>
              <Label testID="question-counter" style={s.caption}>
                {fraction(session.exerciseIndex + 1, session.queue.length, isRTL)}
              </Label>
            </View>
            <Progress value={(session.exerciseIndex + (correct ? 1 : 0)) / session.queue.length} />
          </View>
          <Icon name="star" color={colors.amber} size={25} />
        </View>
        <NetworkNotice />
        <ScrollView
          ref={scroll}
          key={`${lesson.id}-${session.exerciseIndex}`}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={s.mascotRow}>
            <MascotFace id={account!.profile.avatar} size={49} />
            <Label style={s.bubble}>
              {review ? t('lesson.review') : (lesson.presentation?.intro ?? t('lesson.intro'))}
            </Label>
          </View>
          {review && (
            <Label testID="review-notice" style={{ color: colors.greenInk, marginBottom: 8 }}>
              {t('lesson.reviewNotice')}
            </Label>
          )}
          <Heading style={s.title}>{exercise.prompt}</Heading>
          <ExerciseView
            key={`${lesson.id}-${session.exerciseIndex}`}
            lesson={lesson}
            exercise={exercise}
            draft={session.draft}
            correct={correct}
            onChange={(answer) => {
              dispatch({ type: 'draft', answer });
              setWrong(false);
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('lesson.hint')}
            onPress={() => setHint(!hint)}
            style={s.hintButton}
          >
            <Icon name="bulb-outline" color={colors.amberDark} />
            <Label>{t('lesson.hint')}</Label>
          </Pressable>
          {hint && (
            <View accessibilityLiveRegion="polite" style={s.hint}>
              <Label style={s.hintText}>{exercise.hint}</Label>
              {spelling.length > 0 && (
                <View
                  style={s.spelling}
                  accessible
                  accessibilityLabel={t('lesson.spelledA11y', { letters: spelling.join(' ') })}
                >
                  <Label style={s.spellingCaption}>{t('lesson.spelled')}</Label>
                  <View
                    style={[
                      s.spellingRow,
                      { direction: wordDirection(fullCatalog, lesson.language) },
                    ]}
                    testID="hint-spelling"
                  >
                    {spelling.map((letter, i) => (
                      <Label key={i} style={s.spellingLetter}>
                        {letter}
                      </Label>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>
        <View
          style={[
            s.dock,
            correct && { backgroundColor: colors.mint },
            wrong && { backgroundColor: colors.cream },
          ]}
        >
          {(correct || wrong) && (
            <View accessibilityLiveRegion="polite" style={s.feedback}>
              <Icon
                name={correct ? 'checkmark-circle' : 'heart'}
                color={correct ? colors.greenDark : colors.coral}
              />
              <View style={{ flex: 1 }}>
                <Heading style={s.feedbackTitle}>
                  {correct ? t('lesson.correctTitle') : t('lesson.wrongTitle')}
                </Heading>
                <Label style={s.caption}>
                  {correct ? t('lesson.correctText') : t('lesson.wrongText')}
                </Label>
              </View>
            </View>
          )}
          <ToyButton
            testID={correct ? 'next-question' : 'check-answer'}
            title={
              correct
                ? session.exerciseIndex === session.queue.length - 1
                  ? t('lesson.claim')
                  : t('lesson.continue')
                : t('lesson.check')
            }
            icon={correct ? 'arrow-forward' : 'checkmark'}
            disabled={!correct && (assessment === 'invalid' || wrong)}
            onPress={() => {
              if (correct) {
                dispatch({ type: 'next' });
                setWrong(false);
                setHint(false);
              } else {
                dispatch({ type: 'answer' });
                setWrong(assessment === 'wrong');
              }
            }}
          />
        </View>
      </View>
      <Modal transparent visible={exit} animationType="fade" onRequestClose={() => setExit(false)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <MascotFace id={account!.profile.avatar} size={75} />
            <Heading>{t('lesson.pauseTitle')}</Heading>
            <Label>{t('lesson.pauseText')}</Label>
            <ToyButton title={t('lesson.keepPlaying')} onPress={() => setExit(false)} />
            <ToyButton
              title={t('common.backToMap')}
              tone="light"
              onPress={() => router.dismissTo('/')}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  container: { width: '100%', maxWidth: 600, alignSelf: 'center', flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  close: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  progressLabel: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7, gap: 8 },
  caption: { fontSize: 11, color: colors.muted, flexShrink: 1 },
  content: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 16 },
  mascotRow: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 20 },
  bubble: { flex: 1, backgroundColor: '#FFFFFF', padding: 12, borderRadius: 18, fontSize: 13 },
  title: { fontSize: 25, lineHeight: 32 },
  hintButton: {
    minHeight: 56,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  hint: { backgroundColor: colors.cream, padding: 15, borderRadius: 14, gap: 10 },
  hintText: { textAlign: 'center', fontSize: 13 },
  spelling: { alignItems: 'center', gap: 6 },
  spellingCaption: { fontSize: 11, color: colors.muted },
  spellingRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  spellingLetter: {
    minWidth: 30,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 2,
    borderBottomColor: colors.line,
    textAlign: 'center',
    fontFamily: fonts.heading,
    fontSize: 20,
    lineHeight: 26,
    color: colors.greenInk,
  },
  dock: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: '#FFFFFF' },
  feedback: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 13 },
  feedbackTitle: { fontSize: 17, lineHeight: 24 },
  overlay: { flex: 1, backgroundColor: '#12342588', justifyContent: 'center', padding: 24 },
  dialog: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 28,
    gap: 18,
  },
});
