import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Heading, Icon, Label } from '../components/ui';
import { LessonImage } from '../components/LessonImage';
import { colors } from '../theme';
import { kit, useExerciseKit } from './kit';
import type { MechanicProps, MobileMechanic } from './types';

const cardWord = (card: string) => card.replace(/-(image|text)$/, '');

/* Cards are turned two at a time; a picture and its word stay open, anything else turns back.
   Only the pairs found go into the answer, so the game ends when the last one is found. */
function Memory({ lesson, exercise, draft, correct, onChange }: MechanicProps<'memory'>) {
  const { t, word, direction } = useExerciseKit(lesson);
  const found = draft && 'pairs' in draft ? draft.pairs : {};
  const [open, setOpen] = useState<string[]>([]);
  // Two cards that do not match stay visible for a moment, then turn back.
  useEffect(() => {
    if (open.length < 2) return;
    const timer = setTimeout(() => setOpen([]), 900);
    return () => clearTimeout(timer);
  }, [open]);
  const turn = (card: string) => {
    if (correct || open.length >= 2 || open.includes(card) || found[cardWord(card)]) return;
    const next = [...open, card];
    if (next.length === 2 && cardWord(next[0]!) === cardWord(card)) {
      onChange({ pairs: { ...found, [cardWord(card)]: cardWord(card) } });
      setOpen([]);
    } else setOpen(next);
  };
  return (
    <>
      <Label style={kit.instructions}>{t('exercise.memory')}</Label>
      <View style={s.table}>
        {exercise.order.map((card, index) => {
          const id = cardWord(card);
          const shown = open.includes(card) || !!found[id];
          const picture = card.endsWith('-image');
          return (
            <Pressable
              key={card}
              testID={`card-${card}`}
              accessibilityRole="button"
              accessibilityLabel={
                shown
                  ? picture
                    ? t('exercise.pairImage', { translation: word(id).translation })
                    : t('exercise.pairWord', { word: word(id).text })
                  : t('exercise.cardHidden', { n: index + 1 })
              }
              accessibilityState={{ disabled: correct || !!found[id] }}
              onPress={() => turn(card)}
              style={[s.card, shown && s.open, !!found[id] && kit.correct]}
            >
              {!shown ? (
                <Icon name="help" size={34} color="#FFFFFF" />
              ) : picture ? (
                <LessonImage lesson={lesson} id={word(id).imageId} size={64} />
              ) : (
                <Heading style={[s.word, direction]}>{word(id).text}</Heading>
              )}
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
export const memory: MobileMechanic<'memory'> = { View: Memory };

const s = StyleSheet.create({
  table: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  card: {
    width: '30%',
    aspectRatio: 0.85,
    borderRadius: 18,
    borderBottomWidth: 4,
    borderColor: '#4E2C93',
    backgroundColor: '#7A4FD0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
  },
  open: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: colors.line },
  word: { fontSize: 16, lineHeight: 22, textAlign: 'center' },
});
