import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { courseCards, learningRewards, resumableSession } from '@lingvohero/learning-core';
import { localizeLesson, type Media } from '@lingvohero/contracts';
import { Screen } from '../../src/components/Screen';
import { MenuButton } from '../../src/components/MenuButton';
import { FriendProgress } from '../../src/components/FriendProgress';
import { MascotFace } from '../../src/components/MascotPicker';
import { Forest } from '../../src/components/Forest';
import { Badge, Heading, Icon, Label, Progress, Tim, ToyButton } from '../../src/components/ui';
import { coverSource } from '../../src/content/client';
import { useDemo } from '../../src/state/DemoProvider';
import { useAccount } from '../../src/account/AccountProvider';
import { fonts } from '../../src/theme';
import { fraction, useT } from '../../src/i18n';
import { languageName, refTitle } from '../../src/i18n/content';

export default function WorldsScreen() {
  const { account } = useAccount();
  const {
    state,
    journal,
    catalog,
    fullCatalog,
    language,
    chooseLanguage,
    refresh,
    refreshing,
    catalogStatus,
    startLesson,
    loadingLesson,
    lessonError,
  } = useDemo();
  const { t, tn, locale, isRTL } = useT();
  const [message, setMessage] = useState<string | null>(null);
  const cards = courseCards(catalog, state, language, journal.stars);
  const previews = (catalog.previews ?? []).filter((c) => c.language === language);
  const current = cards.find((c) => c.unlocked && !c.complete) ?? cards.find((c) => c.unlocked);
  const resume = resumableSession(state, fullCatalog);
  const rewards = learningRewards(state);
  // A lesson started in another learning language waits there; switching takes the child back.
  const elsewhere = resume && resume.lesson.language !== language ? resume.lesson.language : null;
  const next = elsewhere ? current?.next : (resume?.lesson ?? current?.next);
  const openCourse = (id: string) => router.push({ pathname: '/course', params: { id } });
  async function start(id: string) {
    if (resume && resume.lesson.id !== id) {
      setMessage(t('home.finishStarted'));
      return;
    }
    if (await startLesson(id)) router.push('/lesson');
  }
  return (
    <Screen
      background="#F8F9FF"
      header={
        <View style={s.header}>
          <View style={s.brand}>
            <MenuButton />
            <Tim size={32} />
            <View style={s.flexShrink}>
              <Heading style={s.brandName}>{t('common.appName')}</Heading>
              <Label style={s.brandSub}>{t('home.brandSub')}</Label>
            </View>
          </View>
          <View style={s.headerActions}>
            <Badge icon="star" value={journal.stars} />
          </View>
        </View>
      }
    >
      <View style={s.page}>
        <View style={s.welcome}>
          <View style={s.glow} />
          <View style={s.row}>
            <Pressable
              style={s.mascot}
              accessibilityRole="button"
              accessibilityLabel={t('friends.title')}
              onPress={() => router.push('/friends')}
            >
              <MascotFace id={account!.profile.avatar} size={72} />
            </Pressable>
            <View style={s.flex}>
              <Heading style={s.welcomeTitle}>
                {t('home.hello', { name: account!.profile.name })}
              </Heading>
              <Label style={s.copy}>{t('home.whereToday')}</Label>
            </View>
          </View>
          <FriendProgress />
          <View style={s.ribbon}>
            <Icon name="trophy-outline" size={21} color="#C67A08" />
            <Label style={s.small}>
              {t('home.lessonsDone')} <Label style={s.bold}>{rewards.lessons}</Label>
            </Label>
            <View style={s.flex} />
            <Label style={s.small}>{rewards.xp} XP</Label>
          </View>
          {resume && !elsewhere && (
            <Label style={s.copy}>
              {t('home.resume', { title: localizeLesson(resume.lesson, locale).title })}
            </Label>
          )}
          {elsewhere && (
            <View style={s.elsewhere}>
              <Icon name="bookmark-outline" size={20} color="#855300" />
              <Label style={[s.small, s.flex]}>
                {t('home.otherLanguage', {
                  language: languageName(fullCatalog, elsewhere, locale),
                })}
              </Label>
              <Pressable
                testID="resume-elsewhere"
                accessibilityRole="button"
                onPress={() => void chooseLanguage(elsewhere)}
                style={s.refresh}
              >
                <Label style={s.detailsText}>{t('home.switchLanguage')}</Label>
                <Icon name="arrow-forward" size={16} color="#006E2F" />
              </Pressable>
            </View>
          )}
          {next && (
            <ToyButton
              testID={resume && !elsewhere ? 'resume-lesson' : 'quick-start'}
              title={
                loadingLesson
                  ? t('common.preparingLesson')
                  : resume && !elsewhere
                    ? t('home.continueLesson')
                    : current?.complete
                      ? t('home.repeatLesson')
                      : rewards.lessons
                        ? t('home.playOn')
                        : t('home.startAdventure')
              }
              icon="play-circle-outline"
              disabled={loadingLesson}
              onPress={() => void start(next.id)}
              style={s.quickButton}
            />
          )}
        </View>

        {lessonError && (
          <Label accessibilityLiveRegion="polite" style={s.error}>
            {t('app.errors.lesson')}
          </Label>
        )}
        <View style={s.sectionTitle}>
          <Icon name="book-outline" size={24} color="#006E2F" />
          <Heading style={s.sectionHeading}>{t('home.setsTitle')}</Heading>
          <View style={s.counter}>
            <Label style={s.small}>{cards.length + previews.length}</Label>
          </View>
        </View>
        {cards.map((card, index) => {
          const { course, completed, complete, unlocked, stars } = card;
          const percent = Math.round((completed / course.lessons.length) * 100);
          const isCurrent = current?.course.id === course.id && !complete;
          const previous = cards.slice(0, index).find((c) => !c.complete);
          const lockedMessage =
            course.unlockStars === undefined
              ? t('home.lockedMessage', {
                  title: previous?.course.title ?? t('home.previousAdventure'),
                })
              : t('home.starsMessage', { total: course.unlockStars, need: card.starsNeeded });
          const caption = (
            <View style={[s.coverCopy, course.cover && { backgroundColor: '#235F43' }]}>
              <Label style={s.eyebrow}>{t('common.yourAdventure')}</Label>
              <Heading style={s.coverTitle}>{course.title}</Heading>
              <Label style={s.coverDescription}>
                {course.description ?? t('home.defaultDescription')}
              </Label>
            </View>
          );
          return (
            <View
              key={course.id}
              testID={`course-${course.id}`}
              style={[s.card, isCurrent && s.activeCard]}
            >
              {(!complete || course.cover) && (
                <View style={[s.cover, course.cover && s.illustratedCover]}>
                  <Cover cover={course.cover} />
                  {(!course.cover || !unlocked) && <View style={s.coverShade} />}
                  <View style={[s.coverBadges, course.cover && s.illustratedBadges]}>
                    <View style={[s.tag, !unlocked && s.lockedTag]}>
                      <Icon
                        name={complete ? 'checkmark-circle' : unlocked ? 'flash' : 'lock-closed'}
                        size={14}
                        color={unlocked ? '#004B1E' : '#FFFFFF'}
                      />
                      <Label style={[s.tagText, !unlocked && { color: '#FFFFFF' }]}>
                        {complete
                          ? t('home.setDone')
                          : isCurrent
                            ? t('home.currentSet')
                            : unlocked
                              ? t('home.canPlay')
                              : course.unlockStars === undefined
                                ? t('home.closed')
                                : t('home.closedStars', { total: course.unlockStars })}
                      </Label>
                    </View>
                    <Badge icon="star" value={fraction(stars, course.lessons.length * 3, isRTL)} />
                  </View>
                  {!course.cover && caption}
                </View>
              )}
              {course.cover && caption}
              {complete && !course.cover && (
                <View style={s.completedHeader}>
                  <View style={s.between}>
                    <Badge
                      icon="checkmark-circle"
                      value={t('home.setDone')}
                      tint="#DBF6E6"
                      color="#006E2F"
                    />
                    <Badge icon="star" value={fraction(stars, course.lessons.length * 3, isRTL)} />
                  </View>
                  <Heading style={s.cardTitle}>{course.title}</Heading>
                  {course.description && <Label style={s.copy}>{course.description}</Label>}
                </View>
              )}
              <View style={s.cardBody}>
                {!complete && unlocked && (
                  <View style={s.next}>
                    <View style={s.nextIcon}>
                      <Icon name="leaf-outline" color="#FFFFFF" size={22} />
                    </View>
                    <View style={s.flex}>
                      <Label style={s.nextLabel}>{t('home.nextLabel')}</Label>
                      <Label style={s.nextTitle}>
                        {t('home.nextLesson', {
                          index: course.lessons.indexOf(card.next) + 1,
                          title: refTitle(card.next, locale),
                        })}
                      </Label>
                    </View>
                  </View>
                )}
                <View style={s.between}>
                  <Label style={s.small}>
                    {tn('home.progress', course.lessons.length, { done: completed })}
                  </Label>
                  <Label style={s.percent}>{percent}%</Label>
                </View>
                <Progress value={completed / course.lessons.length} color="#22C55E" />
                {unlocked ? (
                  <>
                    <ToyButton
                      testID={isCurrent ? 'start-lesson' : `open-${course.id}`}
                      title={
                        loadingLesson
                          ? t('common.preparingLesson')
                          : complete
                            ? t('home.repeatSet')
                            : t('home.playLesson', {
                                index: course.lessons.indexOf(card.next) + 1,
                              })
                      }
                      icon={complete ? 'refresh' : 'play'}
                      tone={complete ? 'light' : 'green'}
                      disabled={loadingLesson}
                      onPress={() => (complete ? openCourse(course.id) : void start(card.next.id))}
                      style={s.playButton}
                    />
                    {!complete && (
                      <Pressable
                        testID={`open-${course.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={t('home.setLessonsA11y', { title: course.title })}
                        onPress={() => openCourse(course.id)}
                        style={s.details}
                      >
                        <Label style={s.detailsText}>{t('home.allLessons')}</Label>
                        <Icon name="arrow-forward" size={16} color="#006E2F" />
                      </Pressable>
                    )}
                  </>
                ) : (
                  <ToyButton
                    testID={`locked-${course.id}`}
                    title={t('home.howToOpen')}
                    icon="lock-closed"
                    tone="light"
                    onPress={() => setMessage(lockedMessage)}
                  />
                )}
              </View>
            </View>
          );
        })}
        {previews.map((preview) => (
          <View key={preview.id} style={s.card} testID={`preview-${preview.id}`}>
            <View style={s.previewCover}>
              <Cover cover={preview.cover} />
              <View style={s.previewShade}>
                <View style={s.lockCircle}>
                  <Icon name="lock-closed-outline" size={28} color="#855300" />
                </View>
                <View style={s.soon}>
                  <Label style={s.bold}>{t('home.soon')}</Label>
                </View>
              </View>
            </View>
            <View style={s.previewBody}>
              <Heading style={s.cardTitle}>{preview.title}</Heading>
              <Label style={s.copy}>{preview.description}</Label>
              <View style={s.previewNotice}>
                <Icon name="sparkles-outline" color="#68788E" size={18} />
                <Label style={[s.small, s.flex]}>{t('home.timPreparing')}</Label>
              </View>
            </View>
          </View>
        ))}
        {cards.length === 0 && <Label style={s.copy}>{t('home.noLessons')}</Label>}
        <View style={s.tip}>
          <View style={s.tipIcon}>
            <Icon name="bulb-outline" size={24} color="#FFFFFF" />
          </View>
          <View style={s.flex}>
            <Label style={s.bold}>{t('home.tipTitle')}</Label>
            <Label style={s.copy}>{t('home.tip')}</Label>
          </View>
        </View>
        <View style={s.refreshRow}>
          <Label style={[s.small, s.flex]}>
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
            <Icon name="refresh" size={19} color="#006E2F" />
            <Label style={s.small}>{t('app.refresh.button')}</Label>
          </Pressable>
        </View>
      </View>
      <Modal
        transparent
        visible={!!message}
        animationType="fade"
        onRequestClose={() => setMessage(null)}
      >
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Heading>{t('common.stepByStep')}</Heading>
            <Label>{message}</Label>
            <ToyButton title={t('common.ok')} tone="light" onPress={() => setMessage(null)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function Cover({ cover }: { cover?: Media }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <View style={StyleSheet.absoluteFill}>
      {cover && failed !== cover.path ? (
        <Image
          testID={`cover-${cover.id}`}
          source={coverSource(cover.path)}
          resizeMode="cover"
          style={{ width: '100%', height: '100%' }}
          onError={() => setFailed(cover.path)}
        />
      ) : (
        <View style={s.forest}>
          <Forest width={240} height={210} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    paddingVertical: 16,
    paddingStart: 6,
    paddingEnd: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  brandName: { fontSize: 14, lineHeight: 19, color: '#006E2F' },
  brandSub: { fontSize: 11, lineHeight: 15, color: '#0D1C2E' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flexShrink: { flexShrink: 1 },
  elsewhere: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF0D5',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  page: { paddingHorizontal: 16, gap: 22, paddingTop: 2 },
  welcome: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 16,
    gap: 14,
    overflow: 'hidden',
    boxShadow: '0 6px 20px rgba(13,28,46,0.05)',
  },
  glow: {
    position: 'absolute',
    end: -20,
    top: -40,
    width: 170,
    height: 150,
    borderRadius: 100,
    backgroundColor: '#E4FFED',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  mascot: { padding: 4, backgroundColor: '#FFF0D5', borderRadius: 32 },
  welcomeTitle: { fontSize: 21, lineHeight: 27, color: '#0D1C2E' },
  copy: { fontSize: 14, lineHeight: 21, color: '#475569' },
  ribbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E6EEFF',
    borderRadius: 16,
    padding: 12,
  },
  small: { fontSize: 12, lineHeight: 18, color: '#475569' },
  bold: { fontFamily: fonts.bold, fontSize: 13, color: '#0D1C2E' },
  quickButton: { backgroundColor: '#006E2F', borderBottomColor: '#004B1E', borderRadius: 30 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeading: { flex: 1, fontSize: 24, color: '#0D1C2E' },
  counter: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 18,
    backgroundColor: '#E6EEFF',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    overflow: 'hidden',
    boxShadow: '0 5px 18px rgba(13,28,46,0.06)',
  },
  activeCard: { boxShadow: '0 9px 24px rgba(34,197,94,0.16)' },
  cover: { minHeight: 230, justifyContent: 'space-between', backgroundColor: '#235F43' },
  illustratedCover: { minHeight: 0, aspectRatio: 1.79 },
  illustratedBadges: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  forest: { position: 'absolute', end: -15, bottom: -10 },
  coverShade: { position: 'absolute', inset: 0, backgroundColor: '#102D2538' },
  coverBadges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
    padding: 12,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: '#4AE176',
    borderRadius: 20,
  },
  lockedTag: { backgroundColor: '#233144' },
  tagText: { fontFamily: fonts.bold, fontSize: 10, color: '#004B1E' },
  coverCopy: { padding: 18, backgroundColor: '#10322388' },
  eyebrow: { fontSize: 9, fontFamily: fonts.bold, color: '#9DF2B6', letterSpacing: 1 },
  coverTitle: { fontSize: 27, lineHeight: 33, color: '#FFFFFF', marginTop: 3 },
  coverDescription: { fontSize: 13, lineHeight: 19, color: '#E1F0E7', marginTop: 4 },
  cardBody: { padding: 16, gap: 12 },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E1FFEB',
    padding: 11,
    borderRadius: 17,
  },
  nextIcon: {
    width: 36,
    height: 36,
    borderRadius: 20,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextLabel: { fontSize: 11, lineHeight: 16, color: '#005321', fontFamily: fonts.bold },
  nextTitle: { fontSize: 13, lineHeight: 19, color: '#0D1C2E', fontFamily: fonts.bold },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  percent: { fontSize: 13, color: '#006E2F', fontFamily: fonts.bold },
  playButton: { borderRadius: 30 },
  details: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  detailsText: { fontFamily: fonts.bold, fontSize: 13, color: '#006E2F' },
  completedHeader: { padding: 16, gap: 10, backgroundColor: '#EAF2FF' },
  cardTitle: { fontSize: 20, lineHeight: 27, color: '#0D1C2E' },
  previewCover: { aspectRatio: 1.79, backgroundColor: '#235F43' },
  previewShade: {
    position: 'absolute',
    inset: 0,
    backgroundColor: '#23314488',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  lockCircle: {
    width: 55,
    height: 55,
    borderRadius: 30,
    backgroundColor: '#FFFFFFE8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soon: { backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 3, borderRadius: 15 },
  previewBody: { padding: 17, gap: 7, backgroundColor: '#EFF4FF' },
  previewNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E6EEFF',
    padding: 12,
    borderRadius: 16,
    marginTop: 6,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 26,
    backgroundColor: '#C9E6FF',
    borderBottomWidth: 2,
    borderBottomColor: '#89CEFF',
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 22,
    backgroundColor: '#36B6FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  refresh: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 5 },
  error: { color: '#A03B18', fontSize: 13 },
  overlay: { flex: 1, backgroundColor: '#12342588', justifyContent: 'center', padding: 24 },
  dialog: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 28,
    gap: 20,
  },
});
