import { StyleSheet, useWindowDimensions } from 'react-native';
import type { CourseLesson } from '@lingvohero/contracts';
import { useDemo } from '../state/DemoProvider';
import { useT } from '../i18n';
import { showTranslation, wordDirection } from '../i18n/content';
import { colors } from '../theme';

/** What every mechanic's view needs about the lesson and the screen. */
export function useExerciseKit(lesson: CourseLesson) {
  const { width } = useWindowDimensions();
  const { fullCatalog } = useDemo();
  const { t, locale } = useT();
  return {
    t,
    word: (id: string) => lesson.words.find((w) => w.id === id)!,
    size: Math.min(120, (Math.min(width, 600) - 100) / 2),
    // Words keep their own writing direction whatever the interface is.
    direction: { direction: wordDirection(fullCatalog, lesson.language) },
    // A translation into the language being learned would only repeat the word.
    translated: showTranslation(lesson.language, locale),
  };
}

export const kit = StyleSheet.create({
  instructions: { fontSize: 13, color: colors.muted, marginVertical: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  card: {
    width: '47%',
    flexGrow: 1,
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 2,
    borderBottomWidth: 5,
    borderColor: colors.line,
  },
  selected: { borderColor: colors.sky, backgroundColor: '#EDF8FF' },
  correct: { borderColor: colors.green, backgroundColor: colors.mint },
  word: { fontSize: 18, lineHeight: 26 },
  translation: { fontSize: 12, color: colors.muted },
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginVertical: 18,
  },
  tile: {
    minWidth: 44,
    minHeight: 52,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
});
