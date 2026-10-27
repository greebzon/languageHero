import { Pressable, StyleSheet, View } from 'react-native';
import { Heading, Label } from '../components/ui';
import { LessonImage } from '../components/LessonImage';
import { AudioControl } from '../components/AudioControl';
import { colors } from '../theme';
import { kit, useExerciseKit } from './kit';
import type { MechanicProps, MobileMechanic } from './types';

/* The sentence with a gap; the chosen word appears in it. Options of lesson words carry their
   picture, so a child who reads slowly still knows which word is which. */
function FillGap({ lesson, exercise, draft, correct, onChange }: MechanicProps<'fill-gap'>) {
  const { t, word, direction } = useExerciseKit(lesson);
  const chosen = draft && 'choiceId' in draft ? draft.choiceId : null;
  const filled = exercise.options.find((o) => o.id === chosen);
  return (
    <>
      <Label style={kit.instructions}>{t('exercise.gap')}</Label>
      {exercise.audioId && (
        <AudioControl
          lesson={lesson}
          audioId={exercise.audioId}
          caption="audio.sentence"
          autoPlay
        />
      )}
      <View
        style={[s.sentence, direction]}
        accessible
        accessibilityLabel={t('exercise.gapSentence', {
          sentence: [exercise.before, filled?.text ?? '…', exercise.after].join(' ').trim(),
        })}
      >
        {!!exercise.before && <Heading style={s.text}>{exercise.before}</Heading>}
        <View style={[s.gap, filled && s.filled, correct && kit.correct]}>
          <Heading style={[s.text, !filled && { color: colors.muted }]}>
            {filled?.text ?? '   ?   '}
          </Heading>
        </View>
        {!!exercise.after && <Heading style={s.text}>{exercise.after}</Heading>}
      </View>
      <View style={[kit.tiles, direction]}>
        {exercise.options.map((o) => (
          <Pressable
            key={o.id}
            testID={`gap-option-${o.id}`}
            accessibilityRole="button"
            accessibilityLabel={t('exercise.wordTile', { word: o.text })}
            accessibilityState={{ selected: chosen === o.id, disabled: correct }}
            disabled={correct}
            onPress={() => onChange({ choiceId: o.id })}
            style={[s.option, chosen === o.id && kit.selected]}
          >
            {o.wordId && <LessonImage lesson={lesson} id={word(o.wordId).imageId} size={48} />}
            <Heading style={s.text}>{o.text}</Heading>
          </Pressable>
        ))}
      </View>
    </>
  );
}
export const fillGap: MobileMechanic<'fill-gap'> = { View: FillGap };

const s = StyleSheet.create({
  sentence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: colors.line,
  },
  gap: {
    minWidth: 70,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.sky,
    alignItems: 'center',
  },
  filled: { borderStyle: 'solid', backgroundColor: '#EDF8FF' },
  option: { ...StyleSheet.flatten(kit.tile), paddingVertical: 6, gap: 2 },
  text: { fontSize: 22, lineHeight: 30 },
});
