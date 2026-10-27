import { Pressable, StyleSheet, View } from 'react-native';
import { Heading, Label, ToyButton } from '../components/ui';
import { LessonImage } from '../components/LessonImage';
import { AudioControl } from '../components/AudioControl';
import { colors, fonts } from '../theme';
import { kit, useExerciseKit } from './kit';
import type { MechanicProps, MobileMechanic } from './types';

function BuildWord({ lesson, exercise, draft, correct, onChange }: MechanicProps<'build-word'>) {
  const { t, word, direction, translated } = useExerciseKit(lesson);
  const chosen = draft && 'tileIds' in draft ? draft.tileIds : [];
  const letter = (id: string) => exercise.tiles.find((tile) => tile.id === id)!.letter;
  return (
    <>
      <Label style={kit.instructions}>{t('exercise.build')}</Label>
      <View style={{ alignItems: 'center' }}>
        <LessonImage lesson={lesson} id={word(exercise.wordId).imageId} size={110} />
        {translated && <Label>{word(exercise.wordId).translation}</Label>}
      </View>
      <AudioControl lesson={lesson} audioId={word(exercise.wordId).audioId} />
      <View style={[s.answer, direction]} accessibilityLabel={t('exercise.built')}>
        {chosen.length === 0 && (
          <Label style={{ color: colors.muted }}>{t('exercise.placeholder')}</Label>
        )}
        {chosen.map((id, index) => (
          <Pressable
            key={id}
            testID={`chosen-${id}`}
            accessibilityRole="button"
            accessibilityLabel={t('exercise.removeLetter', {
              letter: letter(id),
              position: index + 1,
            })}
            disabled={correct}
            onPress={() => onChange({ tileIds: chosen.filter((t) => t !== id) })}
            style={[kit.tile, kit.selected]}
          >
            <Heading>{letter(id)}</Heading>
          </Pressable>
        ))}
      </View>
      <View style={[kit.tiles, direction]}>
        {exercise.tiles.map((tile) => (
          <Pressable
            key={tile.id}
            testID={`letter-${tile.id}`}
            accessibilityRole="button"
            accessibilityLabel={t('exercise.letter', { letter: tile.letter })}
            accessibilityState={{ disabled: correct || chosen.includes(tile.id) }}
            disabled={correct || chosen.includes(tile.id)}
            onPress={() => onChange({ tileIds: [...chosen, tile.id] })}
            style={[kit.tile, chosen.includes(tile.id) && { opacity: 0.25 }]}
          >
            <Heading>{tile.letter}</Heading>
          </Pressable>
        ))}
      </View>
      {!correct && (
        <ToyButton title={t('exercise.restart')} tone="light" onPress={() => onChange(null)} />
      )}
    </>
  );
}

/* The hint also shows how the word is written, letter by letter (from the lesson's words, so
   every set gets it without regeneration). */
function SpellingHint({
  lesson,
  exercise,
}: Pick<MechanicProps<'build-word'>, 'lesson' | 'exercise'>) {
  const { t, word, direction } = useExerciseKit(lesson);
  const spelling = Array.from((word(exercise.wordId)?.spelling ?? '').normalize('NFC'));
  if (!spelling.length) return null;
  return (
    <View
      style={s.spelling}
      accessible
      accessibilityLabel={t('lesson.spelledA11y', { letters: spelling.join(' ') })}
    >
      <Label style={s.spellingCaption}>{t('lesson.spelled')}</Label>
      <View style={[s.spellingRow, direction]} testID="hint-spelling">
        {spelling.map((letter, i) => (
          <Label key={i} style={s.spellingLetter}>
            {letter}
          </Label>
        ))}
      </View>
    </View>
  );
}
export const buildWord: MobileMechanic<'build-word'> = { View: BuildWord, Hint: SpellingHint };

const s = StyleSheet.create({
  answer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    minHeight: 75,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
    padding: 10,
    borderRadius: 18,
    backgroundColor: colors.mint,
  },
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
});
