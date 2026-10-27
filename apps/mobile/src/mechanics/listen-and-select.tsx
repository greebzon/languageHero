import { Pressable, View } from 'react-native';
import { Heading, Label } from '../components/ui';
import { LessonImage } from '../components/LessonImage';
import { AudioControl } from '../components/AudioControl';
import { kit, useExerciseKit } from './kit';
import type { MechanicProps, MobileMechanic } from './types';

function ListenAndSelect({
  lesson,
  exercise,
  draft,
  correct,
  onChange,
}: MechanicProps<'listen-and-select'>) {
  const { t, word, size, translated } = useExerciseKit(lesson);
  return (
    <>
      <Label style={kit.instructions}>{t('exercise.listen')}</Label>
      <AudioControl lesson={lesson} audioId={word(exercise.wordId).audioId} />
      <View style={kit.grid}>
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
              kit.card,
              draft && 'choiceId' in draft && draft.choiceId === id && kit.selected,
              correct && id === exercise.wordId && kit.correct,
            ]}
          >
            <LessonImage lesson={lesson} id={word(id).imageId} size={size} />
            <Heading style={kit.word}>{word(id).text}</Heading>
            <Label style={kit.translation}>
              {correct && translated ? word(id).translation : ' '}
            </Label>
          </Pressable>
        ))}
      </View>
    </>
  );
}
export const listenAndSelect: MobileMechanic<'listen-and-select'> = { View: ListenAndSelect };
