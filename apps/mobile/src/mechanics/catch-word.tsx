import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { catchProgress } from '@lingvohero/contracts';
import { Heading, Label } from '../components/ui';
import { LessonImage } from '../components/LessonImage';
import { AudioControl } from '../components/AudioControl';
import { colors } from '../theme';
import { kit, useExerciseKit } from './kit';
import type { MechanicProps, MobileMechanic } from './types';

/** A bubble that bobs on its own rhythm and shakes when it was the wrong one. */
function Bubble({
  index,
  missed,
  children,
  ...props
}: {
  index: number;
  missed: boolean;
  children: ReactNode;
} & ComponentProps<typeof Pressable>) {
  const bob = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1300 + index * 350,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1300 + index * 350,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, index]);
  useEffect(() => {
    if (!missed) return;
    shake.setValue(0);
    Animated.timing(shake, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, [missed, shake]);
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const translateX = shake.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0, -8, 8, -5, 0],
  });
  return (
    <Animated.View style={{ transform: [{ translateY }, { translateX }] }}>
      <Pressable {...props}>{children}</Pressable>
    </Animated.View>
  );
}

/* Rounds: a word is heard, bubbles with pictures float, the child pops the right one. Every
   tap goes into the answer; the server replays them and counts the misses. */
function CatchWord({ lesson, exercise, draft, correct, onChange }: MechanicProps<'catch-word'>) {
  const { t, word, size } = useExerciseKit(lesson);
  const taps = draft && 'taps' in draft ? draft.taps : [];
  const { round, misses } = catchProgress(exercise.rounds, taps);
  const current = exercise.rounds[round];
  const last = taps[taps.length - 1];
  const missed = !!current && last !== undefined && last !== exercise.rounds[round - 1]?.wordId;
  return (
    <>
      <Label style={kit.instructions}>{t('exercise.catch')}</Label>
      <View style={s.status}>
        <Label style={s.round}>
          {current
            ? t('exercise.round', { n: round + 1, total: exercise.rounds.length })
            : t('exercise.caught')}
        </Label>
        {misses > 0 && <Label style={s.misses}>{t('exercise.misses', { n: misses })}</Label>}
      </View>
      {current ? (
        <>
          {/* A new round, a new player: the key makes it load the round's word. */}
          <AudioControl
            key={round}
            lesson={lesson}
            audioId={word(current.wordId).audioId}
            autoPlay
          />
          <View style={s.sky}>
            {current.choices.map((id, index) => (
              <Bubble
                key={`${round}-${id}`}
                index={index}
                missed={missed && last === id}
                testID={`bubble-${id}`}
                accessibilityRole="button"
                accessibilityLabel={t('exercise.bubble', { translation: word(id).translation })}
                disabled={correct}
                onPress={() => onChange({ taps: [...taps, id] })}
                style={s.bubble}
              >
                <LessonImage lesson={lesson} id={word(id).imageId} size={Math.min(size, 96)} />
              </Bubble>
            ))}
          </View>
        </>
      ) : (
        <View style={s.done}>
          <Heading style={{ color: colors.greenInk }}>🎉</Heading>
        </View>
      )}
    </>
  );
}
export const catchWord: MobileMechanic<'catch-word'> = { View: CatchWord };

const s = StyleSheet.create({
  status: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  round: { fontSize: 13, color: colors.greenInk },
  misses: { fontSize: 13, color: colors.amberDark },
  sky: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    gap: 14,
    marginTop: 22,
    paddingVertical: 18,
    borderRadius: 26,
    backgroundColor: '#E6F4FF',
  },
  bubble: {
    padding: 12,
    borderRadius: 999,
    backgroundColor: '#FFFFFFCC',
    borderWidth: 3,
    borderColor: '#9ED3FF',
  },
  done: { alignItems: 'center', marginTop: 24 },
});
