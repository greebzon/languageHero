import { courseCards, resumableSession } from '@lingvohero/learning-core';
import { localizeLesson } from '@lingvohero/contracts';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Screen } from '../src/components/Screen';
import { Forest } from '../src/components/Forest';
import { Animal, Badge, Heading, Icon, Label, Progress, ToyButton } from '../src/components/ui';
import { colors, fonts } from '../src/theme';
import { useDemo } from '../src/state/DemoProvider';
import { fraction, useT } from '../src/i18n';
import { refTitle } from '../src/i18n/content';

export default function MapScreen() {
  const {
    state,
    catalog,
    fullCatalog,
    refresh,
    refreshing,
    catalogStatus,
    startLesson,
    loadingLesson,
    lessonError,
  } = useDemo();
  const { t, tn, locale, isRTL } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const card = catalog.courses.find((c) => c.id === id);
  const access = card && courseCards(catalog, state, card.language).find((c) => c.course.id === id);
  const [locked, setLocked] = useState(false);
  const resume = resumableSession(state, fullCatalog);
  async function start(id: string) {
    if (await startLesson(id)) router.push('/lesson');
  }
  return (
    <Screen>
      <View style={s.intro}>
        <ToyButton
          title={t('course.allWorlds')}
          tone="light"
          icon="arrow-back"
          onPress={() => router.dismissTo('/')}
        />
      </View>
      <View style={s.hero}>
        <View style={s.heroCopy}>
          <Label style={s.worldTag}>{t('common.yourAdventure')}</Label>
          <Heading style={s.heroTitle}>{card?.title ?? t('course.notFound')}</Heading>
          <Label style={s.heroSub}>{t('course.heroSub')}</Label>
        </View>
        <View style={s.forest}>
          <Forest width={180} height={170} />
        </View>
      </View>
      <View style={s.refreshRow}>
        <Label style={s.status}>
          {refreshing
            ? t('app.refresh.searching')
            : catalogStatus === 'live'
              ? t('app.refresh.live')
              : t('app.refresh.saved')}
        </Label>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('app.refresh.label')}
          disabled={refreshing}
          onPress={() => void refresh()}
          style={s.refresh}
        >
          <Icon name="refresh" />
          <Label style={s.status}>{t('app.refresh.button')}</Label>
        </Pressable>
      </View>
      {resume && (
        <View style={s.resume}>
          <Heading style={s.lessonTitle}>
            {t('home.resume', { title: localizeLesson(resume.lesson, locale).title })}
          </Heading>
          <Progress value={resume.exerciseIndex / resume.queue.length} />
          <ToyButton
            testID="resume-lesson"
            title={t('home.continueLesson')}
            disabled={loadingLesson}
            onPress={() => void start(resume.lesson.id)}
          />
        </View>
      )}
      {lessonError && (
        <Label accessibilityLiveRegion="polite" style={s.error}>
          {t('app.errors.lesson')}
        </Label>
      )}
      {catalog.courses
        .filter((c) => c.id === id && access?.unlocked)
        .map((course) => {
          const nextIndex = course.lessons.findIndex((l) => !state.progress[l.id]);
          return (
            <View key={course.id} style={s.course}>
              <View style={s.chapterRow}>
                <Heading style={s.chapter}>{course.title}</Heading>
                <Badge
                  icon="flag-outline"
                  value={fraction(
                    course.lessons.filter((l) => state.progress[l.id]).length,
                    course.lessons.length,
                    isRTL,
                  )}
                  tint={colors.mint}
                  color={colors.greenInk}
                />
              </View>
              {course.lessons.map((lesson, index) => {
                const unlocked =
                  !!state.progress[lesson.id] ||
                  course.lessons.slice(0, index).every((l) => state.progress[l.id]);
                const done = state.progress[lesson.id];
                const next = index === (nextIndex < 0 ? 0 : nextIndex);
                return (
                  <View key={lesson.id} style={s.trailRow}>
                    <View style={s.trail}>
                      <View style={s.line} />
                      <Pressable
                        testID={`level-${index + 1}`}
                        accessibilityRole="button"
                        accessibilityLabel={
                          unlocked
                            ? t('course.startA11y', { title: refTitle(lesson, locale) })
                            : t('course.lockedA11y', { title: refTitle(lesson, locale) })
                        }
                        onPress={() => {
                          if (!unlocked || (resume && resume.lesson.id !== lesson.id))
                            setLocked(true);
                          else void start(lesson.id);
                        }}
                        disabled={loadingLesson}
                        style={[s.node, unlocked ? s.activeNode : s.lockedNode]}
                      >
                        <Icon
                          name={done ? 'checkmark' : unlocked ? 'play' : 'lock-closed'}
                          size={27}
                          color={unlocked ? '#FFFFFF' : '#91A596'}
                        />
                      </Pressable>
                    </View>
                    <View style={[s.lessonCard, !unlocked && { backgroundColor: '#EFF3EB' }]}>
                      <Label style={s.eyebrow}>
                        {t('course.lessonN', { index: index + 1 })}
                        {done ? t('course.passed') : ''}
                      </Label>
                      <Heading style={s.lessonTitle}>{refTitle(lesson, locale)}</Heading>
                      <Label style={s.lessonMeta}>
                        {tn('course.exercises', lesson.exerciseCount)} ·{' '}
                        {t(
                          lesson.requiredTypes.length === 1
                            ? `common.mechanics.${lesson.requiredTypes[0]!}`
                            : 'common.mechanics.mixed',
                        )}
                      </Label>
                      {done && (
                        <Label style={{ color: colors.amberDark }}>
                          {'★'.repeat(done.bestStars)}
                        </Label>
                      )}
                      {unlocked && (
                        <ToyButton
                          testID={next ? 'start-lesson' : `start-${lesson.id}`}
                          title={
                            loadingLesson
                              ? t('common.preparingLesson')
                              : done
                                ? t('home.repeatLesson')
                                : t('course.play')
                          }
                          tone={next ? 'green' : 'light'}
                          disabled={loadingLesson}
                          onPress={() => {
                            if (resume && resume.lesson.id !== lesson.id) setLocked(true);
                            else void start(lesson.id);
                          }}
                          style={{ marginTop: 12 }}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}
      {catalog.courses.filter((c) => c.id === id && access?.unlocked).length === 0 && (
        <Label style={s.error}>{t('course.unavailable')}</Label>
      )}
      <View style={s.tip}>
        <Animal id="fox" size={74} />
        <Label style={s.tipText}>{t('course.tip')}</Label>
      </View>
      <Modal
        transparent
        visible={locked}
        animationType="fade"
        onRequestClose={() => setLocked(false)}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Icon name="leaf-outline" size={38} />
            <Heading>{t('common.stepByStep')}</Heading>
            <Label style={{ textAlign: 'center' }}>
              {resume ? t('course.finishStarted') : t('course.previousFirst')}
            </Label>
            <ToyButton title={t('common.ok')} onPress={() => setLocked(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
const s = StyleSheet.create({
  intro: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 20, gap: 12 },
  eyebrow: { fontFamily: fonts.bold, letterSpacing: 1, fontSize: 10, color: colors.muted },
  hero: {
    backgroundColor: '#235F43',
    borderRadius: 26,
    marginHorizontal: 20,
    minHeight: 195,
    overflow: 'hidden',
  },
  heroCopy: { padding: 23, zIndex: 1, maxWidth: '68%' },
  worldTag: { color: '#D3EBCA', fontSize: 9, letterSpacing: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 30, lineHeight: 35, marginTop: 8 },
  heroSub: { color: '#D2E4D0', fontSize: 12, lineHeight: 18, marginTop: 8, maxWidth: 120 },
  forest: { position: 'absolute', right: -22, bottom: 0 },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    gap: 12,
    marginTop: 8,
  },
  refresh: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 },
  status: { fontSize: 11, color: colors.muted, flexShrink: 1 },
  resume: { backgroundColor: colors.cream, borderRadius: 22, padding: 18, margin: 20, gap: 12 },
  error: { margin: 22, fontSize: 13, color: colors.amberDark },
  course: { paddingHorizontal: 20 },
  chapterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 20 },
  chapter: { flex: 1, fontSize: 20 },
  trailRow: { flexDirection: 'row', gap: 14 },
  trail: { width: 58, alignItems: 'center' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 5, backgroundColor: '#DAE6DA' },
  node: {
    width: 58,
    height: 62,
    marginTop: 22,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 5,
  },
  activeNode: { backgroundColor: colors.green, borderBottomColor: colors.greenDark },
  lockedNode: { backgroundColor: '#E0E9DD', borderBottomColor: '#CBD6C7' },
  lessonCard: {
    flex: 1,
    marginBottom: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: colors.line,
  },
  lessonTitle: { fontSize: 19, lineHeight: 26, marginTop: 4 },
  lessonMeta: { fontSize: 11, color: colors.muted, marginTop: 5 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 22 },
  tipText: { flex: 1, fontSize: 12, color: colors.muted },
  overlay: { flex: 1, backgroundColor: '#12342588', justifyContent: 'center', padding: 24 },
  dialog: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 28,
    gap: 20,
    alignItems: 'center',
  },
});
