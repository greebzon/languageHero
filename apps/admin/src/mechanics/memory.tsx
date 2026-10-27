import { useState } from 'react';
import { memoryCards } from '@lingvohero/contracts';
import { Field } from '../components/ui';
import { Sprite, wordLabel } from './shared';
import type { AdminMechanic, EditorProps, PreviewProps } from './types';

const shuffled = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);
const cardWord = (card: string) => card.replace(/-(image|text)$/, '');

function Editor({ exercise, words, errors, onChange }: EditorProps<'memory'>) {
  return (
    <Field
      label="Слова"
      hint="2–4 слова (до 6); у каждого карточка с картинкой и карточка со словом"
      error={errors('wordIds') ?? errors('order')}
    >
      <span className="checks">
        {words.map((w) => (
          <label key={w.id}>
            <input
              type="checkbox"
              checked={exercise.wordIds.includes(w.id)}
              onChange={(e) => {
                const wordIds = e.target.checked
                  ? [...exercise.wordIds, w.id]
                  : exercise.wordIds.filter((x) => x !== w.id);
                onChange({ ...exercise, wordIds, order: shuffled(memoryCards(wordIds)) });
              }}
            />
            {wordLabel(w)}
          </label>
        ))}
      </span>
      <button
        className="btn light sm"
        type="button"
        onClick={() => onChange({ ...exercise, order: shuffled(exercise.order) })}
      >
        Перемешать карточки
      </button>
    </Field>
  );
}

function Preview({
  lesson,
  exercise,
  draft,
  correct,
  mediaUrls,
  onChange,
}: PreviewProps<'memory'>) {
  const [open, setOpen] = useState<string[]>([]);
  const found = draft && 'pairs' in draft ? draft.pairs : {};
  const word = (id: string) => lesson.words.find((w) => w.id === id)!;
  const turn = (card: string) => {
    if (correct || open.includes(card) || found[cardWord(card)]) return;
    const next = open.length >= 2 ? [card] : [...open, card];
    if (next.length === 2 && cardWord(next[0]!) === cardWord(card)) {
      onChange({ pairs: { ...found, [cardWord(card)]: cardWord(card) } });
      setOpen([]);
    } else setOpen(next);
  };
  return (
    <>
      <p className="muted small">Открывай по две карточки и найди слово к каждой картинке.</p>
      <div className="choice-grid">
        {exercise.order.map((card) => {
          const id = cardWord(card);
          const shown = open.includes(card) || !!found[id];
          return (
            <button
              key={card}
              type="button"
              className={`choice ${found[id] ? 'correct' : ''}`}
              onClick={() => turn(card)}
            >
              {!shown ? (
                <span className="word">❓</span>
              ) : card.endsWith('-image') ? (
                <Sprite lesson={lesson} id={word(id).imageId} size={80} mediaUrls={mediaUrls} />
              ) : (
                <span className="word">{word(id).text}</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

export const memory: AdminMechanic<'memory'> = {
  label: 'Мемори',
  create: (id) => ({ id, prompt: '', hint: '', type: 'memory', wordIds: [], order: [] }),
  Editor,
  Preview,
};
