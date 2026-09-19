import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import {
  createAudioPlayer,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
} from 'expo-audio';
import type { CourseLesson } from '@lingvohero/contracts';
import { mediaSource, seed } from '../content/client';
import { useDemo } from '../state/DemoProvider';
import { useT } from '../i18n';
import { Icon, Label } from './ui';
import { colors, fonts } from '../theme';

/* Word lists show dozens of compact buttons at once; a player per button would load every
   clip on mount and make scrolling stutter, so they share one lazily created player. */
let shared: AudioPlayer | null = null;
let sharedId: string | null = null;
const listeners = new Set<() => void>();
function setShared(id: string | null) {
  sharedId = id;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
function CompactSpeaker({
  audioId,
  source,
  word,
}: {
  audioId: string;
  source: string | number;
  /* The spoken word, for screen readers. */
  word: string;
}) {
  if (!shared) shared = createAudioPlayer(null);
  const player = shared;
  const status = useAudioPlayerStatus(player);
  const current = useSyncExternalStore(subscribe, () => sharedId);
  const { state, dispatch } = useDemo();
  const { t } = useT();
  const playing = current === audioId && status.playing;
  async function play() {
    if (!state.soundEnabled) dispatch({ type: 'sound', enabled: true });
    try {
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
      if (current !== audioId) {
        setShared(audioId);
        player.replace(source);
      } else await player.seekTo(0);
      player.play();
    } catch {
      setShared(null);
    }
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('audio.listenTo', { word })}
      onPress={() => void play()}
      style={s.compact}
    >
      <Icon name={playing ? 'volume-high' : 'volume-medium-outline'} color={colors.blueInk} />
      <Label style={s.compactText}>{t('audio.listen')}</Label>
    </Pressable>
  );
}
export function AudioControl({
  audioId,
  compact = false,
  lesson = seed.lessons[0],
}: {
  audioId: string;
  compact?: boolean;
  lesson?: CourseLesson;
}) {
  const source = mediaSource(lesson, audioId);
  if (compact)
    return (
      <CompactSpeaker
        audioId={audioId}
        source={source}
        word={lesson.words.find((w) => w.audioId === audioId)?.text ?? ''}
      />
    );
  return <FullControl audioId={audioId} source={source} />;
}
function FullControl({ audioId, source }: { audioId: string; source: string | number }) {
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const { state, dispatch } = useDemo();
  const { t } = useT();
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (status.isLoaded) {
      setError(false);
      return;
    }
    const timer = setTimeout(() => setError(true), 10000);
    return () => clearTimeout(timer);
  }, [status.isLoaded, audioId]);
  async function play() {
    if (!state.soundEnabled) dispatch({ type: 'sound', enabled: true });
    try {
      if (error) {
        player.replace(source);
        setError(false);
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
      player.setPlaybackRate(slow ? 0.7 : 1);
      await player.seekTo(0);
      player.play();
    } catch {
      setError(true);
    }
  }
  return (
    <View>
      <View style={s.row}>
        <Pressable
          accessibilityRole="button"
          testID="play-audio"
          accessibilityLabel={t('audio.playWord')}
          onPress={() => void play()}
          style={({ pressed }) => [s.play, pressed && { opacity: 0.8 }]}
        >
          <View style={s.speaker}>
            <Icon
              name={error ? 'refresh' : status.playing ? 'volume-high' : 'volume-medium'}
              size={28}
              color={colors.blueInk}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Label style={s.caption}>
              {status.playing ? t('audio.listening') : t('audio.question')}
            </Label>
            <Label style={s.title}>
              {error
                ? t('audio.reload')
                : !state.soundEnabled
                  ? t('audio.enable')
                  : status.playing
                    ? t('audio.playing')
                    : t('audio.tap')}
            </Label>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('audio.slow')}
          accessibilityState={{ selected: slow }}
          onPress={() => {
            setSlow(!slow);
            player.setPlaybackRate(!slow ? 0.7 : 1);
          }}
          style={[s.slow, slow && { backgroundColor: '#D5EDF9' }]}
        >
          <Icon name="speedometer-outline" size={23} color={colors.blueInk} />
          <Label style={s.speed}>{slow ? '0.7×' : '1×'}</Label>
        </Pressable>
      </View>
      {error && (
        <Label accessibilityLiveRegion="polite" style={s.error}>
          {t('audio.error')}
        </Label>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  play: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.blueLight,
    borderRadius: 22,
    padding: 14,
    borderBottomWidth: 4,
    borderBottomColor: '#CBDFEE',
    minHeight: 85,
  },
  speaker: {
    width: 46,
    height: 46,
    backgroundColor: '#FFFFFF',
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caption: {
    fontSize: 8,
    lineHeight: 14,
    letterSpacing: 0.7,
    fontFamily: fonts.bold,
    color: colors.blueInk,
  },
  title: { fontSize: 14, lineHeight: 21, fontFamily: fonts.heading, color: colors.blueInk },
  slow: {
    minWidth: 58,
    minHeight: 72,
    backgroundColor: '#EDF3FA',
    borderRadius: 20,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  speed: { fontSize: 13, fontFamily: fonts.heading, color: colors.blueInk },
  error: { marginTop: 8, fontSize: 12, color: colors.coral },
  compact: {
    minHeight: 56,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    borderRadius: 14,
    backgroundColor: colors.blueLight,
  },
  compactText: { fontSize: 12, color: colors.blueInk, fontFamily: fonts.bold },
});
