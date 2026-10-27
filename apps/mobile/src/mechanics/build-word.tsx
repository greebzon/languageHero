import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { spellingHelp, spellingTiles } from '@lingvohero/learning-core';
import { useAccount } from '../account/AccountProvider';
import { Heading, Label, ToyButton } from '../components/ui';
import { LessonImage } from '../components/LessonImage';
import { AudioControl } from '../components/AudioControl';
import { colors, fonts } from '../theme';
import { kit, useExerciseKit } from './kit';
import type { MechanicProps, MobileMechanic } from './types';

function BuildWord(props: MechanicProps<'build-word'>) {
  const { account } = useAccount();
  // A child who cannot read yet builds the word from a model (`spellingHelp`, by age).
  return spellingHelp(account?.profile.birthYear ?? null, new Date()) === 'model' ? (
    <ModelWord {...props} />
  ) : (
    <PlainWord {...props} />
  );
}

/** The picture, its translation and the word's recording, above both kinds of the task. */
function Prompt({ lesson, exercise }: Pick<MechanicProps<'build-word'>, 'lesson' | 'exercise'>) {
  const { word, translated } = useExerciseKit(lesson);
  const target = word(exercise.wordId);
  return (
    <>
      <View style={{ alignItems: 'center' }}>
        <LessonImage lesson={lesson} id={target.imageId} size={110} />
        {translated && <Label>{target.translation}</Label>}
      </View>
      <AudioControl lesson={lesson} audioId={target.audioId} />
    </>
  );
}

/* «По образцу»: the word stands in faded letters, one slot each; only its own tiles are
   offered and a tile lands only on the slot that shows the same letter. The answer is the
   same `tileIds`, so grading and the server's replay need nothing new. */
function ModelWord({ lesson, exercise, draft, correct, onChange }: MechanicProps<'build-word'>) {
  const { t, word, direction } = useExerciseKit(lesson);
  const chosen = draft && 'tileIds' in draft ? draft.tileIds : [];
  const letterOf = (id: string) => exercise.tiles.find((tile) => tile.id === id)!.letter;
  // The tile that did not fit flashes instead of landing in the word.
  const [miss, setMiss] = useState<string | null>(null);
  useEffect(() => {
    if (!miss) return;
    const timer = setTimeout(() => setMiss(null), 1500);
    return () => clearTimeout(timer);
  }, [miss]);
  const spelling = word(exercise.wordId).spelling;
  const letters = Array.from(spelling.normalize('NFC'));
  const next = letters[chosen.length];
  return (
    <>
      <Label style={kit.instructions}>{t('exercise.buildModel')}</Label>
      <Prompt lesson={lesson} exercise={exercise} />
      <View style={[s.answer, direction]} accessibilityLabel={t('exercise.built')}>
        {letters.map((letter, index) => {
          const placed = chosen[index];
          return (
            <View
              key={index}
              testID={`slot-${index}`}
              accessible
              accessibilityLabel={t('exercise.modelSlot', {
                position: index + 1,
                letter: placed ? letterOf(placed) : letter,
              })}
              style={[
                kit.tile,
                s.slot,
                placed ? s.placed : index === chosen.length && !correct && s.nextSlot,
              ]}
            >
              <Heading style={!placed && s.ghost}>{placed ? letterOf(placed) : letter}</Heading>
            </View>
          );
        })}
      </View>
      <Label accessibilityLiveRegion="polite" style={s.miss}>
        {miss ? t('exercise.otherLetter') : ' '}
      </Label>
      <View style={[kit.tiles, direction]}>
        {spellingTiles(exercise, spelling).map((tile) => (
          <Pressable
            key={tile.id}
            testID={`letter-${tile.id}`}
            accessibilityRole="button"
            accessibilityLabel={t('exercise.letter', { letter: tile.letter })}
            accessibilityState={{ disabled: correct || chosen.includes(tile.id) }}
            disabled={correct || chosen.includes(tile.id)}
            onPress={() => {
              if (tile.letter.normalize('NFC') !== next) return setMiss(tile.id);
              setMiss(null);
              onChange({ tileIds: [...chosen, tile.id] });
            }}
            style={[
              kit.tile,
              chosen.includes(tile.id) && { opacity: 0.25 },
              miss === tile.id && s.missed,
            ]}
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

function PlainWord({ lesson, exercise, draft, correct, onChange }: MechanicProps<'build-word'>) {
  const { t, direction } = useExerciseKit(lesson);
  const chosen = draft && 'tileIds' in draft ? draft.tileIds : [];
  const letter = (id: string) => exercise.tiles.find((tile) => tile.id === id)!.letter;
  return (
    <>
      <Label style={kit.instructions}>{t('exercise.build')}</Label>
      <Prompt lesson={lesson} exercise={exercise} />
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
  slot: { borderBottomWidth: 2, borderStyle: 'dashed', borderColor: '#B9C6D6' },
  nextSlot: { borderColor: colors.sky, borderStyle: 'solid', backgroundColor: '#EDF8FF' },
  placed: { borderColor: colors.green, borderStyle: 'solid', borderBottomWidth: 4 },
  ghost: { color: '#B9C6D6' },
  miss: { textAlign: 'center', fontSize: 13, color: colors.coral, marginTop: 8 },
  missed: { borderColor: colors.coral, backgroundColor: colors.cream },
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
