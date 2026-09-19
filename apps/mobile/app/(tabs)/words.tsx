import { memo, useMemo } from 'react';
import { localizeLesson } from '@lingvohero/contracts';
import { FlatList, StyleSheet, View } from 'react-native';
import type { CourseLesson } from '@lingvohero/contracts';
import { Screen } from '../../src/components/Screen';
import { Heading, Icon, Label } from '../../src/components/ui';
import { LessonImage } from '../../src/components/LessonImage';
import { AudioControl } from '../../src/components/AudioControl';
import { useDemo } from '../../src/state/DemoProvider';
import { colors, fonts } from '../../src/theme';
import { useT } from '../../src/i18n';
import { languageName, showTranslation, wordDirection } from '../../src/i18n/content';

type Entry = { word: CourseLesson['words'][number]; lesson: CourseLesson };
/* Cards are memoized so a playing-state change in one button does not redraw the whole grid. */
const WordCard = memo(function WordCard({
  word,
  lesson,
  translated,
  direction,
}: Entry & { translated: boolean; direction: 'ltr' | 'rtl' }) {
  return (
    <View style={s.card}>
      <View style={s.picture}>
        <LessonImage lesson={lesson} id={word.imageId} size={100} />
      </View>
      <Heading style={[s.word, { direction }]}>{word.text}</Heading>
      {translated && <Label style={s.translation}>{word.translation}</Label>}
      <AudioControl compact lesson={lesson} audioId={word.audioId} />
    </View>
  );
});
export default function WordsScreen() {
  const { library, catalog, fullCatalog, language } = useDemo();
  const { t, locale } = useT();
  const words = useMemo(() => {
    const refs = catalog.courses.filter((c) => c.language === language).flatMap((c) => c.lessons);
    const lessons = library.filter((l) =>
      refs.some((r) => r.id === l.id && r.version === l.version),
    );
    return [
      ...new Map(
        lessons.flatMap((lesson) => {
          // Meanings in the interface language; the audio and pictures stay the package's.
          const local = localizeLesson(lesson, locale);
          return local.words.map((word) => [word.id, { word, lesson }] as const);
        }),
      ).values(),
    ];
  }, [library, catalog, language, locale]);
  const translated = showTranslation(language, locale);
  const direction = wordDirection(fullCatalog, language);
  return (
    <Screen scroll={false}>
      <FlatList
        data={words}
        keyExtractor={(e) => e.word.id}
        numColumns={2}
        renderItem={({ item }) => (
          <WordCard
            word={item.word}
            lesson={item.lesson}
            translated={translated}
            direction={direction}
          />
        )}
        columnWrapperStyle={s.row}
        contentContainerStyle={s.page}
        style={s.list}
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={5}
        removeClippedSubviews
        ListHeaderComponent={
          <View>
            <Label style={s.eyebrow}>{t('words.eyebrow')}</Label>
            <Heading style={s.title}>{t('words.title')}</Heading>
            <Label style={s.subtitle}>{t('words.subtitle')}</Label>
            <View style={s.topic}>
              <Icon name="leaf-outline" size={18} />
              <Label style={s.topicText}>{languageName(fullCatalog, language, locale)}</Label>
              <Label style={s.count}>{t('words.count', { n: words.length })}</Label>
            </View>
          </View>
        }
        ListEmptyComponent={<Label>{t('words.empty')}</Label>}
        ListFooterComponent={
          <View style={s.tip}>
            <Icon name="bulb-outline" color={colors.amberDark} size={24} />
            <Label style={s.tipText}>{t('words.tip')}</Label>
          </View>
        }
      />
    </Screen>
  );
}
const s = StyleSheet.create({
  list: { flex: 1 },
  page: { padding: 22, paddingBottom: 28, width: '100%', maxWidth: 600, alignSelf: 'center' },
  row: { gap: 12, marginBottom: 12 },
  eyebrow: { fontSize: 10, color: colors.muted, letterSpacing: 1.5, fontFamily: fonts.bold },
  title: { fontSize: 27, marginTop: 8 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 8 },
  topic: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, marginBottom: 16 },
  topicText: { flex: 1, fontFamily: fonts.heading, fontSize: 15 },
  count: { color: colors.muted, fontSize: 12 },
  card: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 23,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderColor: colors.line,
    padding: 10,
    gap: 5,
  },
  picture: {
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: colors.cream,
    overflow: 'hidden',
  },
  word: { fontSize: 19, textAlign: 'center', marginTop: 3 },
  translation: { textAlign: 'center', color: colors.muted, fontSize: 12, marginBottom: 6 },
  tip: {
    flexDirection: 'row',
    backgroundColor: colors.cream,
    padding: 18,
    borderRadius: 20,
    gap: 11,
    alignItems: 'center',
    marginTop: 12,
  },
  tipText: { flex: 1, fontSize: 12, color: colors.muted, lineHeight: 20 },
});
