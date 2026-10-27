import { Field } from '../components/ui';
import { AudioButtons, Sprite, WordSelect } from './shared';
import type { AdminMechanic, EditorProps, PreviewProps } from './types';

/** Letter tiles from the word's spelling (code points, as the engine checks them). */
export const tilesFor = (spelling: string, existing: { id: string }[] = []) =>
  Array.from(spelling.normalize('NFC')).map((letter, index) => ({
    id: `t${existing.length + index + 1}`,
    letter,
  }));

function Editor({ exercise, words, errors, onChange }: EditorProps<'build-word'>) {
  return (
    <>
      <WordSelect
        value={exercise.wordId}
        words={words}
        error={errors('wordId')}
        onSelect={(wordId) => {
          const word = words.find((w) => w.id === wordId);
          onChange({
            ...exercise,
            wordId,
            tiles: exercise.tiles.length || !word ? exercise.tiles : tilesFor(word.spelling),
          });
        }}
      />
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
  );
}

function Preview({
  lesson,
  exercise,
  draft,
  correct,
  mediaUrls,
  onChange,
}: PreviewProps<'build-word'>) {
  const word = lesson.words.find((w) => w.id === exercise.wordId)!;
  const chosen = draft && 'tileIds' in draft ? draft.tileIds : [];
  const tile = (id: string) => exercise.tiles.find((t) => t.id === id)!;
  return (
    <>
      <p className="muted small">Собери слово без артикля. Нажми на буквы по порядку.</p>
      <div style={{ textAlign: 'center' }}>
        <Sprite lesson={lesson} id={word.imageId} size={110} mediaUrls={mediaUrls} />
        <div>{word.translation}</div>
      </div>
      <AudioButtons src={mediaUrls[word.audioId]!} />
      <div className="answer-box" aria-label="Собранное слово">
        {chosen.length === 0 && <span className="muted">Здесь появится слово</span>}
        {chosen.map((id) => (
          <button
            key={id}
            type="button"
            className="letter chosen"
            disabled={correct}
            onClick={() => onChange({ tileIds: chosen.filter((t) => t !== id) })}
          >
            {tile(id).letter}
          </button>
        ))}
      </div>
      <div className="tiles" style={{ justifyContent: 'center', margin: '16px 0' }}>
        {exercise.tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`letter ${chosen.includes(t.id) ? 'used' : ''}`}
            disabled={correct || chosen.includes(t.id)}
            onClick={() => onChange({ tileIds: [...chosen, t.id] })}
          >
            {t.letter}
          </button>
        ))}
      </div>
      {!correct && (
        <button className="btn light" type="button" onClick={() => onChange(null)}>
          Начать слово заново
        </button>
      )}
    </>
  );
}

export const buildWord: AdminMechanic<'build-word'> = {
  label: 'Собери слово',
  create: (id) => ({ id, prompt: '', hint: '', type: 'build-word', wordId: '', tiles: [] }),
  Editor,
  Preview,
};
