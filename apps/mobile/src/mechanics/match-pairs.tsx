import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Heading, Label, ToyButton } from '../components/ui';
import { LessonImage } from '../components/LessonImage';
import { colors } from '../theme';
import { kit, useExerciseKit } from './kit';
import type { MechanicProps, MobileMechanic } from './types';

function MatchPairs({ lesson, exercise, draft, correct, onChange }: MechanicProps<'match-pairs'>) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const { t, word, direction } = useExerciseKit(lesson);
  const pairs = draft && 'pairs' in draft ? draft.pairs : {};
  return (
    <>
      <Label style={kit.instructions}>{t('exercise.pairs')}</Label>
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
                selectedWord === id && kit.selected,
                correct && kit.correct,
              ]}
            >
              <Heading style={[kit.word, direction]}>
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
                style={[s.pairCard, owner && s.paired, correct && kit.correct]}
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
export const matchPairs: MobileMechanic<'match-pairs'> = { View: MatchPairs };

const s = StyleSheet.create({
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
});
