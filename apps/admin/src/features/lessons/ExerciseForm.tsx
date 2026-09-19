import type { DraftExercise, DraftWord } from '@lingvohero/contracts';
import { Field } from '../../components/ui';

const typeLabels: Record<DraftExercise['type'], string> = {
  'listen-and-select': 'Послушай и выбери',
  'match-pairs': 'Найди пары',
  'build-word': 'Собери слово',
};

export function newExercise(type: DraftExercise['type'], id: string): DraftExercise {
  const base = { id, prompt: '', hint: '' };
  if (type === 'listen-and-select') return { ...base, type, wordId: '', choices: [] };
  if (type === 'match-pairs') return { ...base, type, wordIds: [], imageOrder: [] };
  return { ...base, type, wordId: '', tiles: [] };
}

/** Letter tiles from the word's spelling (code points, as the engine checks them). */
export const tilesFor = (spelling: string, existing: { id: string }[] = []) =>
  Array.from(spelling.normalize('NFC')).map((letter, index) => ({
    id: `t${existing.length + index + 1}`,
    letter,
  }));

export function ExerciseForm({
  exercise,
  index,
  total,
  words,
  errors,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: {
  exercise: DraftExercise;
  index: number;
  total: number;
  words: DraftWord[];
  errors: (path: string) => string[] | undefined;
  onChange: (exercise: DraftExercise) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (delta: number) => void;
}) {
  const wordLabel = (w: DraftWord) => `${w.text || w.id} — ${w.translation || '…'}`;
  const wordSelect = (value: string, onSelect: (id: string) => void, error?: string[]) => (
    <Field label="Слово" error={error}>
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
  return (
    <div className="exercise">
      <div className="exercise-head">
        <strong>
          {index + 1}. {typeLabels[exercise.type]} <code>{exercise.id}</code>
        </strong>
        <span className="row">
          <button
            className="btn light sm"
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            ↑
          </button>
          <button
            className="btn light sm"
            type="button"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
          >
            ↓
          </button>
          <button className="btn light sm" type="button" onClick={onDuplicate}>
            Дублировать
          </button>
          <button className="btn danger sm" type="button" onClick={onRemove}>
            Удалить
          </button>
        </span>
      </div>
      <div className="grid-2">
        <Field label="Вопрос ребёнку" hint="до 200 символов" error={errors('prompt')}>
          <input
            type="text"
            value={exercise.prompt}
            onChange={(e) => onChange({ ...exercise, prompt: e.target.value })}
          />
        </Field>
        <Field label="Подсказка Тима" hint="до 300 символов" error={errors('hint')}>
          <input
            type="text"
            value={exercise.hint}
            onChange={(e) => onChange({ ...exercise, hint: e.target.value })}
          />
        </Field>
      </div>

      {exercise.type === 'listen-and-select' && (
        <>
          {wordSelect(
            exercise.wordId,
            (wordId) =>
              onChange({
                ...exercise,
                wordId,
                choices: exercise.choices.includes(wordId)
                  ? exercise.choices
                  : [...exercise.choices, wordId].filter(Boolean),
              }),
            errors('wordId'),
          )}
          <Field label="Варианты" hint="2–6 слов, правильное среди них" error={errors('choices')}>
            <span className="checks">
              {words.map((w) => (
                <label key={w.id}>
                  <input
                    type="checkbox"
                    checked={exercise.choices.includes(w.id)}
                    onChange={(e) =>
                      onChange({
                        ...exercise,
                        choices: e.target.checked
                          ? [...exercise.choices, w.id]
                          : exercise.choices.filter((c) => c !== w.id),
                      })
                    }
                  />
                  {wordLabel(w)}
                </label>
              ))}
            </span>
          </Field>
        </>
      )}

      {exercise.type === 'match-pairs' && (
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
      )}

      {exercise.type === 'build-word' && (
        <>
          {wordSelect(
            exercise.wordId,
            (wordId) => {
              const word = words.find((w) => w.id === wordId);
              onChange({
                ...exercise,
                wordId,
                tiles: exercise.tiles.length || !word ? exercise.tiles : tilesFor(word.spelling),
              });
            },
            errors('wordId'),
          )}
          <Field
            label="Буквы-плитки"
            hint="из них должно собираться слово; лишние буквы — отвлекающие"
            error={errors('tiles')}
          >
            <span className="tiles">
              {exercise.tiles.map((tile, i) => (
                <span key={tile.id} className="row" style={{ gap: 2 }}>
                  <input
                    className="tile-input"
                    type="text"
                    maxLength={4}
                    value={tile.letter}
                    aria-label={`Плитка ${i + 1}`}
                    onChange={(e) =>
                      onChange({
                        ...exercise,
                        tiles: exercise.tiles.map((t) =>
                          t.id === tile.id ? { ...t, letter: e.target.value } : t,
                        ),
                      })
                    }
                  />
                  <button
                    className="link"
                    type="button"
                    aria-label="Убрать плитку"
                    onClick={() =>
                      onChange({
                        ...exercise,
                        tiles: exercise.tiles.filter((t) => t.id !== tile.id),
                      })
                    }
                  >
                    ×
                  </button>
                </span>
              ))}
            </span>
            <span className="row">
              <button
                className="btn light sm"
                type="button"
                onClick={() =>
                  onChange({
                    ...exercise,
                    tiles: [
                      ...exercise.tiles,
                      {
                        id: `t${exercise.tiles.length + 1}-${Date.now().toString(36).slice(-3)}`,
                        letter: '',
                      },
                    ],
                  })
                }
              >
                + Плитка
              </button>
              <button
                className="btn light sm"
                type="button"
                disabled={!exercise.wordId}
                onClick={() => {
                  const word = words.find((w) => w.id === exercise.wordId);
                  if (word) onChange({ ...exercise, tiles: tilesFor(word.spelling) });
                }}
              >
                Собрать из слова
              </button>
              <button
                className="btn light sm"
                type="button"
                onClick={() =>
                  onChange({
                    ...exercise,
                    tiles: [...exercise.tiles].sort(() => Math.random() - 0.5),
                  })
                }
              >
                Перемешать
              </button>
            </span>
          </Field>
        </>
      )}
    </div>
  );
}
