import { useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { Answer, CourseExercise, CourseLesson } from '@lingvohero/contracts';
import { Heading, Label, ToyButton } from './ui';
import { LessonImage } from './LessonImage';
import { AudioControl } from './AudioControl';
import { useDemo } from '../state/DemoProvider';
import { useT } from '../i18n';
import { showTranslation, wordDirection } from '../i18n/content';
import { colors } from '../theme';

export function ExerciseView({
  lesson,
  exercise,
  draft,
  correct,
  onChange,
}: {
  lesson: CourseLesson;
  exercise: CourseExercise;
  draft: Answer | null;
  correct: boolean;
  onChange: (answer: Answer | null) => void;
}) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const { fullCatalog } = useDemo();
  const { t, locale } = useT();
  const word = (id: string) => lesson.words.find((w) => w.id === id)!;
  const size = Math.min(120, (Math.min(width, 600) - 100) / 2);
  // Words keep their own writing direction whatever the interface is.
  const direction = { direction: wordDirection(fullCatalog, lesson.language) };
  // A translation into the language being learned would only repeat the word.
  const translated = showTranslation(lesson.language, locale);
  if (exercise.type === 'listen-and-select')
    return (
      <>
        <Label style={s.instructions}>{t('exercise.listen')}</Label>
        <AudioControl lesson={lesson} audioId={word(exercise.wordId).audioId} />
        <View style={s.grid}>
          {exercise.choices.map((id) => (
            <Pressable
              key={id}
              testID={`choice-${id}`}
              accessibilityRole="button"
              accessibilityLabel={word(id).text}
              accessibilityState={{
                selected: draft !== null && 'choiceId' in draft && draft.choiceId === id,
                disabled: correct,
              }}
              disabled={correct}
              onPress={() => onChange({ choiceId: id })}
              style={[
                s.card,
                draft && 'choiceId' in draft && draft.choiceId === id && s.selected,
                correct && id === exercise.wordId && s.correct,
              ]}
            >
              <LessonImage lesson={lesson} id={word(id).imageId} size={size} />
              <Heading style={s.word}>{word(id).text}</Heading>
              <Label style={s.translation}>
                {correct && translated ? word(id).translation : ' '}
              </Label>
            </Pressable>
          ))}
        </View>
      </>
    );
  if (exercise.type === 'match-pairs') {
    const pairs = draft && 'pairs' in draft ? draft.pairs : {};
    return (
      <>
        <Label style={s.instructions}>{t('exercise.pairs')}</Label>
        {/* The columns follow the interface (hints say «слева / справа»); only the words keep
            their own writing direction. */}
        <View style={s.pairs}>
          <View style={s.column}>
            {exercise.wordIds.map((id, index) => (
              <Pressable
                key={id}
                testID={`pair-word-${id}`}
                accessibilityRole="button"
                accessibilityLabel={t('exercise.pairWord', { word: word(id).text })}
                accessibilityState={{ selected: selectedWord === id, disabled: correct }}
                disabled={correct}
                onPress={() => setSelectedWord(id)}
                style={[
                  s.pairCard,
                  pairs[id] && s.paired,
                  selectedWord === id && s.selected,
                  correct && s.correct,
                ]}
              >
                <Heading style={[s.word, direction]}>
                  {index + 1}. {word(id).text}
                </Heading>
              </Pressable>
            ))}
          </View>
          <View style={s.column}>
            {exercise.imageOrder.map((id) => {
              const owner = exercise.wordIds.find((w) => pairs[w] === id);
              return (
                <Pressable
                  key={id}
                  testID={`pair-image-${id}`}
                  accessibilityRole="button"
                  accessibilityLabel={t('exercise.pairImage', {
                    translation: word(id).translation,
                  })}
                  accessibilityState={{ disabled: correct || !selectedWord }}
                  disabled={correct || !selectedWord}
                  onPress={() => {
                    if (!selectedWord) return;
                    const next = { ...pairs };
                    if (owner) delete next[owner];
                    next[selectedWord] = id;
                    onChange({ pairs: next });
                    setSelectedWord(null);
                  }}
                  style={[s.pairCard, owner && s.paired, correct && s.correct]}
                >
                  <LessonImage lesson={lesson} id={word(id).imageId} size={62} />
                  <Label style={s.pairNumber}>
                    {owner ? exercise.wordIds.indexOf(owner) + 1 : '?'}
                  </Label>
                </Pressable>
              );
            })}
          </View>
        </View>
        {!correct && (
          <ToyButton
            title={t('exercise.resetPairs')}
            tone="light"
            onPress={() => {
              onChange(null);
              setSelectedWord(null);
            }}
          />
        )}
      </>
    );
  }
  const chosen = draft && 'tileIds' in draft ? draft.tileIds : [];
  return (
    <>
      <Label style={s.instructions}>{t('exercise.build')}</Label>
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
              letter: exercise.tiles.find((tile) => tile.id === id)!.letter,
              position: index + 1,
            })}
            disabled={correct}
            onPress={() => onChange({ tileIds: chosen.filter((t) => t !== id) })}
            style={[s.tile, s.selected]}
          >
            <Heading>{exercise.tiles.find((tile) => tile.id === id)!.letter}</Heading>
          </Pressable>
        ))}
      </View>
      <View style={[s.tiles, direction]}>
        {exercise.tiles.map((tile) => (
          <Pressable
            key={tile.id}
            testID={`letter-${tile.id}`}
            accessibilityRole="button"
            accessibilityLabel={t('exercise.letter', { letter: tile.letter })}
            accessibilityState={{ disabled: correct || chosen.includes(tile.id) }}
            disabled={correct || chosen.includes(tile.id)}
            onPress={() => onChange({ tileIds: [...chosen, tile.id] })}
            style={[s.tile, chosen.includes(tile.id) && { opacity: 0.25 }]}
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
const s = StyleSheet.create({
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
  pairs: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  column: { flex: 1, gap: 12 },
  pairCard: {
    minHeight: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: colors.line,
    borderRadius: 18,
    padding: 6,
  },
  paired: { backgroundColor: colors.cream, borderColor: '#DFC786' },
  pairNumber: { fontSize: 18, color: colors.amberDark },
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
