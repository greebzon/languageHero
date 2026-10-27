import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ChoiceOptions } from '@lingvohero/contracts';
import { Heading, Icon, Label } from '../components/ui';
import { LessonImage } from '../components/LessonImage';
import { AudioControl } from '../components/AudioControl';
import type { TextKey } from '../i18n';
import { colors } from '../theme';
import { kit, useExerciseKit } from './kit';
import type { MechanicProps, MobileMechanic } from './types';

const instructions: Record<ChoiceOptions, TextKey> = {
  image: 'exercise.choosePicture',
  text: 'exercise.chooseWord',
  letter: 'exercise.chooseLetter',
  'yes-no': 'exercise.chooseYesNo',
};

/* «Выбор»: the question is made of `show` pieces, the options look the way `as` says. */
function Choice({ lesson, exercise, draft, correct, onChange }: MechanicProps<'choice'>) {
  const { t, word, size, direction, translated } = useExerciseKit(lesson);
  const chosen = draft && 'choiceId' in draft ? draft.choiceId : null;
  const option = (id: string, label: string, content: ReactNode, style?: object) => (
    <Pressable
      key={id}
      testID={`option-${id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: chosen === id, disabled: correct }}
      disabled={correct}
      onPress={() => onChange({ choiceId: id })}
      style={[
        style ?? kit.card,
        chosen === id && kit.selected,
        correct && id === exercise.answerId && kit.correct,
      ]}
    >
      {content}
    </Pressable>
  );
  return (
    <>
      <Label style={kit.instructions}>{t(instructions[exercise.as])}</Label>
      {exercise.show.length > 0 && (
        <View style={s.question}>
          {exercise.show.map(({ view, wordId }, i) => {
            const w = word(wordId);
            if (view === 'audio')
              return (
                <View key={i} style={s.audio}>
                  <AudioControl lesson={lesson} audioId={w.audioId} caption="audio.word" autoPlay />
                </View>
              );
            if (view === 'image')
              return <LessonImage key={i} lesson={lesson} id={w.imageId} size={130} />;
            return (
              <Heading key={i} style={[s.questionText, view === 'text' && direction]}>
                {view === 'text' ? w.text : w.translation}
              </Heading>
            );
          })}
        </View>
      )}
      {exercise.as === 'yes-no' ? (
        <View style={s.yesNo}>
          {(['yes', 'no'] as const).map((id) =>
            option(
              id,
              t(id === 'yes' ? 'exercise.yes' : 'exercise.no'),
              <>
                <Icon
                  name={id === 'yes' ? 'checkmark-circle' : 'close-circle'}
                  color={id === 'yes' ? colors.green : colors.amberDark}
                  size={44}
                />
                <Heading style={kit.word}>
                  {t(id === 'yes' ? 'exercise.yes' : 'exercise.no')}
                </Heading>
              </>,
            ),
          )}
        </View>
      ) : exercise.as === 'letter' ? (
        <View style={[kit.tiles, direction]}>
          {exercise.options.map((o) =>
            option(
              o.id,
              t('exercise.letter', { letter: o.letter ?? '' }),
              <Heading>{o.letter}</Heading>,
              kit.tile,
            ),
          )}
        </View>
      ) : (
        <View style={kit.grid}>
          {exercise.options.map((o) => {
            const w = word(o.wordId!);
            // Under a picture the word appears only once solved: before, it would be the answer.
            const caption =
              correct && o.id === exercise.answerId
                ? exercise.as === 'image'
                  ? w.text
                  : translated
                    ? w.translation
                    : ' '
                : ' ';
            return option(
              o.id,
              exercise.as === 'image'
                ? t('exercise.optionPicture', { number: exercise.options.indexOf(o) + 1 })
                : w.text,
              <>
                {exercise.as === 'image' ? (
                  <LessonImage lesson={lesson} id={w.imageId} size={size} />
                ) : (
                  <Heading style={[s.optionWord, direction]}>{w.text}</Heading>
                )}
                <Label style={kit.translation}>{caption}</Label>
              </>,
            );
          })}
        </View>
      )}
    </>
  );
}
export const choice: MobileMechanic<'choice'> = { View: Choice };

const s = StyleSheet.create({
  question: { alignItems: 'center', gap: 10 },
  audio: { alignSelf: 'stretch' },
  questionText: { fontSize: 30, lineHeight: 38, textAlign: 'center' },
  optionWord: { fontSize: 22, lineHeight: 30, paddingVertical: 14 },
  yesNo: { flexDirection: 'row', gap: 12, marginTop: 18 },
});
