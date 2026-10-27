import { Pressable, StyleSheet, View } from 'react-native';
import { Heading, Label, ToyButton } from '../components/ui';
import { LessonImage } from '../components/LessonImage';
import { AudioControl } from '../components/AudioControl';
import { colors } from '../theme';
import { kit, useExerciseKit } from './kit';
import type { MechanicProps, MobileMechanic } from './types';

/** «i see a fox» → «I see a fox»: tiles are lowercase so the first one is not given away. */
const capitalised = (text: string, first: boolean) =>
  first ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;

function BuildSentence({
  lesson,
  exercise,
  draft,
  correct,
  onChange,
}: MechanicProps<'build-sentence'>) {
  const { t, word, direction } = useExerciseKit(lesson);
  const chosen = draft && 'tileIds' in draft ? draft.tileIds : [];
  const token = (id: string) => exercise.tokens.find((x) => x.id === id)!;
  return (
    <>
      <Label style={kit.instructions}>{t('exercise.sentence')}</Label>
      <AudioControl lesson={lesson} audioId={exercise.audioId} caption="audio.sentence" autoPlay />
      <View style={[s.answer, direction]} accessibilityLabel={t('exercise.sentenceBuilt')}>
        {chosen.length === 0 && (
          <Label style={{ color: colors.muted }}>{t('exercise.sentencePlaceholder')}</Label>
        )}
        {chosen.map((id, index) => (
          <Pressable
            key={id}
            testID={`placed-${id}`}
            accessibilityRole="button"
            accessibilityLabel={t('exercise.removeWord', {
              word: token(id).text,
              position: index + 1,
            })}
            disabled={correct}
            onPress={() => onChange({ tileIds: chosen.filter((x) => x !== id) })}
            style={[s.tile, kit.selected]}
          >
            <Heading style={s.text}>
              {capitalised(token(id).text, index === 0)}
              {correct && index === chosen.length - 1 ? '.' : ''}
            </Heading>
          </Pressable>
        ))}
      </View>
      <View style={[kit.tiles, direction]}>
        {exercise.tokens.map((tile) => {
          const used = chosen.includes(tile.id);
          return (
            <Pressable
              key={tile.id}
              testID={`token-${tile.id}`}
              accessibilityRole="button"
              accessibilityLabel={t('exercise.wordTile', { word: tile.text })}
              accessibilityState={{ disabled: correct || used }}
              disabled={correct || used}
              onPress={() => onChange({ tileIds: [...chosen, tile.id] })}
              style={[s.tile, used && { opacity: 0.25 }]}
            >
              {/* A word the child learned with a picture keeps it on its tile. */}
              {tile.wordId && (
                <LessonImage lesson={lesson} id={word(tile.wordId).imageId} size={40} />
              )}
              <Heading style={s.text}>{tile.text}</Heading>
            </Pressable>
          );
        })}
      </View>
      {!correct && (
        <ToyButton
          title={t('exercise.restartSentence')}
          tone="light"
          onPress={() => onChange(null)}
        />
      )}
    </>
  );
}
export const buildSentence: MobileMechanic<'build-sentence'> = { View: BuildSentence };

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
  tile: { ...StyleSheet.flatten(kit.tile), paddingVertical: 6, gap: 2 },
  text: { fontSize: 20, lineHeight: 26 },
});
