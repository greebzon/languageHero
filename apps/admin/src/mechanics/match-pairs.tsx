import { useState } from 'react';
import { Field } from '../components/ui';
import { Sprite, wordLabel } from './shared';
import type { AdminMechanic, EditorProps, PreviewProps } from './types';

function Editor({ exercise, words, errors, onChange }: EditorProps<'match-pairs'>) {
  return (
    <>
      <Field label="Слова для пар" hint="2–4 слова" error={errors('wordIds')}>
        <span className="checks">
          {words.map((w) => (
            <label key={w.id}>
              <input
                type="checkbox"
                checked={exercise.wordIds.includes(w.id)}
                onChange={(e) => {
                  const wordIds = e.target.checked
                    ? [...exercise.wordIds, w.id]
                    : exercise.wordIds.filter((c) => c !== w.id);
                  const imageOrder = [
                    ...exercise.imageOrder.filter((id) => wordIds.includes(id)),
                    ...wordIds.filter((id) => !exercise.imageOrder.includes(id)),
                  ];
                  onChange({ ...exercise, wordIds, imageOrder });
                }}
              />
              {wordLabel(w)}
            </label>
          ))}
        </span>
      </Field>
      <Field
        label="Порядок картинок"
        hint="картинки показываются в этом порядке, слова — в порядке выбора"
        error={errors('imageOrder')}
      >
        <span className="row">
          {exercise.imageOrder.map((id, i) => (
            <span key={id} className="row">
              <span className="badge">{words.find((w) => w.id === id)?.text ?? id}</span>
              <button
                className="link"
                type="button"
                disabled={i === 0}
                onClick={() => {
                  const order = [...exercise.imageOrder];
                  [order[i - 1], order[i]] = [order[i]!, order[i - 1]!];
                  onChange({ ...exercise, imageOrder: order });
                }}
              >
                ←
              </button>
            </span>
          ))}
          <button
            className="btn light sm"
            type="button"
            onClick={() =>
              onChange({
                ...exercise,
                imageOrder: [...exercise.imageOrder].sort(() => Math.random() - 0.5),
              })
            }
          >
            Перемешать
          </button>
        </span>
      </Field>
    </>
  );
}

function Preview({
  lesson,
  exercise,
  draft,
  correct,
  mediaUrls,
  onChange,
}: PreviewProps<'match-pairs'>) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const word = (id: string) => lesson.words.find((w) => w.id === id)!;
  const pairs = draft && 'pairs' in draft ? draft.pairs : {};
  return (
    <>
      <p className="muted small">Сначала слово, потом картинка. Номера покажут твои пары.</p>
      <div className="pairs">
        <div className="col">
          {exercise.wordIds.map((id, index) => (
            <button
              key={id}
              type="button"
              className={`pair ${pairs[id] ? 'paired' : ''} ${selectedWord === id ? 'selected' : ''} ${correct ? 'correct' : ''}`}
              disabled={correct}
              onClick={() => setSelectedWord(id)}
            >
              <span className="word">
                {index + 1}. {word(id).text}
              </span>
            </button>
          ))}
        </div>
        <div className="col">
          {exercise.imageOrder.map((id) => {
            const owner = exercise.wordIds.find((w) => pairs[w] === id);
            return (
              <button
                key={id}
                type="button"
                className={`pair ${owner ? 'paired' : ''} ${correct ? 'correct' : ''}`}
                disabled={correct || !selectedWord}
                onClick={() => {
                  if (!selectedWord) return;
                  const next = { ...pairs };
                  if (owner) delete next[owner];
                  next[selectedWord] = id;
                  onChange({ pairs: next });
                  setSelectedWord(null);
                }}
              >
                <Sprite lesson={lesson} id={word(id).imageId} size={62} mediaUrls={mediaUrls} />
                <span className="n">{owner ? exercise.wordIds.indexOf(owner) + 1 : '?'}</span>
              </button>
            );
          })}
        </div>
      </div>
      {!correct && (
        <button
          className="btn light"
          type="button"
          onClick={() => {
            onChange(null);
            setSelectedWord(null);
          }}
        >
          Сбросить пары
        </button>
      )}
    </>
  );
}

export const matchPairs: AdminMechanic<'match-pairs'> = {
  label: 'Найди пары',
  create: (id) => ({ id, prompt: '', hint: '', type: 'match-pairs', wordIds: [], imageOrder: [] }),
  Editor,
  Preview,
};
