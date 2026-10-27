import { Field } from '../components/ui';
import { AudioButtons, Sprite, WordSelect, wordLabel } from './shared';
import type { AdminMechanic } from './types';

export const listenAndSelect: AdminMechanic<'listen-and-select'> = {
  label: 'Послушай и выбери',
  create: (id) => ({
    id,
    prompt: '',
    hint: '',
    type: 'listen-and-select',
    wordId: '',
    choices: [],
  }),
  Editor: ({ exercise, words, errors, onChange }) => (
    <>
      <WordSelect
        value={exercise.wordId}
        words={words}
        error={errors('wordId')}
        onSelect={(wordId) =>
          onChange({
            ...exercise,
            wordId,
            choices: exercise.choices.includes(wordId)
              ? exercise.choices
              : [...exercise.choices, wordId].filter(Boolean),
          })
        }
      />
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
  ),
  Preview: ({ lesson, exercise, draft, correct, mediaUrls, onChange }) => {
    const word = (id: string) => lesson.words.find((w) => w.id === id)!;
    return (
      <>
        <p className="muted small">Послушай слово и выбери картинку.</p>
        <AudioButtons src={mediaUrls[word(exercise.wordId).audioId]!} />
        <div className="choice-grid">
          {exercise.choices.map((id) => {
            const selected = draft !== null && 'choiceId' in draft && draft.choiceId === id;
            return (
              <button
                key={id}
                type="button"
                className={`choice ${selected ? 'selected' : ''} ${correct && id === exercise.wordId ? 'correct' : ''}`}
                disabled={correct}
                onClick={() => onChange({ choiceId: id })}
              >
                <Sprite lesson={lesson} id={word(id).imageId} size={110} mediaUrls={mediaUrls} />
                <span className="word">{word(id).text}</span>
                <span className="muted small">{correct ? word(id).translation : ' '}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  },
};
