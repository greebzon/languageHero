import { useRef } from 'react';
import type { CourseLesson, DraftWord } from '@lingvohero/contracts';
import { Field } from '../components/ui';

export const wordLabel = (w: DraftWord) => `${w.text || w.id} — ${w.translation || '…'}`;

export function WordSelect({
  value,
  words,
  onSelect,
  error,
  label = 'Слово',
}: {
  value: string;
  words: DraftWord[];
  onSelect: (id: string) => void;
  error?: string[];
  label?: string;
}) {
  return (
    <Field label={label} error={error}>
      <select value={value} onChange={(e) => onSelect(e.target.value)}>
        <option value="">— выберите —</option>
        {words.map((w) => (
          <option key={w.id} value={w.id}>
            {wordLabel(w)}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** A lesson picture (or its atlas cell) at the given size. */
export function Sprite({
  lesson,
  id,
  size,
  mediaUrls,
}: {
  lesson: CourseLesson;
  id: string;
  size: number;
  mediaUrls: Record<string, string>;
}) {
  const media = lesson.media.find((m) => m.id === id)!;
  const region = media.region ?? { columns: 1, rows: 1, column: 0, row: 0 };
  return (
    <span className="sprite" style={{ width: size, height: size }}>
      <img
        src={mediaUrls[id]}
        alt=""
        style={{
          width: size * region.columns,
          height: size * region.rows,
          left: -size * region.column,
          top: -size * region.row,
        }}
      />
    </span>
  );
}

export function AudioButtons({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const play = (rate: number) => {
    const audio = ref.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = rate;
    void audio.play();
  };
  return (
    <div className="audio-row">
      <audio ref={ref} src={src} preload="auto" />
      <button className="btn amber" type="button" onClick={() => play(1)}>
        🔊 Послушать
      </button>
      <button className="btn light" type="button" onClick={() => play(0.7)}>
        🐢 Медленно
      </button>
    </div>
  );
}
