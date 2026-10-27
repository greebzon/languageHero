import { catchProgress } from '@lingvohero/contracts';
import { Field } from '../components/ui';
import { AudioButtons, Sprite, wordLabel } from './shared';
import type { AdminMechanic, EditorProps, PreviewProps } from './types';

const shuffled = <T,>(items: T[]) => [...items].sort(() => Math.random() - 0.5);

function Editor({ exercise, words, errors, onChange }: EditorProps<'catch-word'>) {
  // A round per chosen word; its bubbles are the word and two other words of the lesson.
  const roundsFor = (targets: string[]) =>
    targets.map((wordId) => ({
      wordId,
      choices: shuffled([
        wordId,
        ...shuffled(words.map((w) => w.id).filter((x) => x !== wordId)).slice(0, 2),
      ]),
    }));
  const targets = exercise.rounds.map((r) => r.wordId);
  return (
    <Field
      label="Раунды"
      hint="слово каждого раунда, по порядку выбора; пузыри — это слово и два других слова урока"
      error={errors('rounds')}
    >
      <span className="checks">
        {words.map((w) => (
          <label key={w.id}>
            <input
              type="checkbox"
              checked={targets.includes(w.id)}
              onChange={(e) =>
                onChange({
                  ...exercise,
                  rounds: roundsFor(
                    e.target.checked ? [...targets, w.id] : targets.filter((x) => x !== w.id),
                  ),
                })
              }
            />
            {wordLabel(w)}
          </label>
        ))}
      </span>
      <span className="row">
        {exercise.rounds.map((r, i) => (
          <span key={i} className="badge">
            {i + 1}. {words.find((w) => w.id === r.wordId)?.text ?? r.wordId} из {r.choices.length}
          </span>
        ))}
        <button
          className="btn light sm"
          type="button"
          onClick={() => onChange({ ...exercise, rounds: roundsFor(targets) })}
        >
          Перемешать пузыри
        </button>
      </span>
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
}: PreviewProps<'catch-word'>) {
  const taps = draft && 'taps' in draft ? draft.taps : [];
  const { round, misses } = catchProgress(exercise.rounds, taps);
  const current = exercise.rounds[round];
  const word = (id: string) => lesson.words.find((w) => w.id === id)!;
  return (
    <>
      <p className="muted small">
        Послушай слово и лопни пузырь с его картинкой!{' '}
        {current ? `Раунд ${round + 1} из ${exercise.rounds.length}` : 'Все слова пойманы!'}
        {misses ? ` · промахов: ${misses}` : ''}
      </p>
      {current && (
        <>
          <AudioButtons key={round} src={mediaUrls[word(current.wordId).audioId]!} />
          <div className="choice-grid">
            {current.choices.map((id) => (
              <button
                key={`${round}-${id}`}
                type="button"
                className="choice"
                style={{ borderRadius: 999 }}
                disabled={correct}
                onClick={() => onChange({ taps: [...taps, id] })}
              >
                <Sprite lesson={lesson} id={word(id).imageId} size={90} mediaUrls={mediaUrls} />
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export const catchWord: AdminMechanic<'catch-word'> = {
  label: 'Поймай слово',
  create: (id) => ({ id, prompt: '', hint: '', type: 'catch-word', rounds: [] }),
  Editor,
  Preview,
};
