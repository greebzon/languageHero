import {
  CHOICE_PRESET_KEYS,
  CHOICE_PRESETS,
  choicePresetOf,
  type ChoiceOptions,
  type ChoicePreset,
  type ChoiceView,
  type DraftExerciseOf,
} from '@lingvohero/contracts';
import { Field } from '../components/ui';
import { AudioButtons, Sprite, WordSelect, wordLabel } from './shared';
import type { AdminMechanic, EditorProps, PreviewProps } from './types';

type Draft = DraftExerciseOf<'choice'>;

const PRESET_LABELS: Record<ChoicePreset, string> = {
  'find-picture': 'Найди картинку по слову',
  'name-picture': 'Назови картинку',
  translate: 'Слово по переводу',
  'is-it': 'Это … ? (да / нет)',
  'first-sound': 'Первая буква',
  'odd-one-out': 'Что лишнее?',
};
const VIEW_LABELS: Record<ChoiceView, string> = {
  audio: 'звук',
  image: 'картинка',
  text: 'слово',
  translation: 'перевод',
};
const OPTION_LABELS: Record<ChoiceOptions, string> = {
  image: 'картинки',
  text: 'слова',
  letter: 'буквы',
  'yes-no': 'да / нет',
};

/** Options that fit the kind, keeping what still fits. */
function optionsFor(as: ChoiceOptions, current: Draft['options']): Draft['options'] {
  if (as === 'yes-no') return [{ id: 'yes' }, { id: 'no' }];
  if (as === 'letter') return current.filter((o) => o.letter !== undefined);
  return current.filter((o) => o.wordId !== undefined);
}

function Editor({ exercise, words, errors, onChange }: EditorProps<'choice'>) {
  const preset = choicePresetOf(exercise);
  const set = (patch: Partial<Draft>) => onChange({ ...exercise, ...patch });
  const applyPreset = (key: ChoicePreset) => {
    const { show, as } = CHOICE_PRESETS[key];
    const asked = exercise.show[0]?.wordId ?? '';
    const options = optionsFor(as, exercise.options);
    set({
      show: show.map((view) => ({ view, wordId: asked })),
      as,
      options,
      answerId: options.some((o) => o.id === exercise.answerId) ? exercise.answerId : '',
    });
  };
  const wordOptions = exercise.options.filter((o) => o.wordId !== undefined);
  return (
    <>
      <Field label="Вид задания" hint="готовая комбинация вопроса и вариантов">
        <select
          value={preset ?? ''}
          onChange={(e) => e.target.value && applyPreset(e.target.value as ChoicePreset)}
        >
          <option value="">своя комбинация</option>
          {CHOICE_PRESET_KEYS.map((key) => (
            <option key={key} value={key}>
              {PRESET_LABELS[key]}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Вопрос"
        hint="что ребёнок видит или слышит; пусто — только текст вопроса (лишнее)"
        error={errors('show')}
      >
        {exercise.show.map((piece, i) => (
          <span key={i} className="row">
            <select
              aria-label={`Часть вопроса ${i + 1}`}
              value={piece.view}
              onChange={(e) =>
                set({
                  show: exercise.show.map((p, j) =>
                    j === i ? { ...p, view: e.target.value as ChoiceView } : p,
                  ),
                })
              }
            >
              {(Object.keys(VIEW_LABELS) as ChoiceView[]).map((view) => (
                <option key={view} value={view}>
                  {VIEW_LABELS[view]}
                </option>
              ))}
            </select>
            <WordSelect
              label=""
              value={piece.wordId}
              words={words}
              onSelect={(wordId) =>
                set({ show: exercise.show.map((p, j) => (j === i ? { ...p, wordId } : p)) })
              }
            />
            <button
              className="link"
              type="button"
              aria-label="Убрать часть вопроса"
              onClick={() => set({ show: exercise.show.filter((_, j) => j !== i) })}
            >
              ×
            </button>
          </span>
        ))}
        {exercise.show.length < 3 && (
          <button
            className="btn light sm"
            type="button"
            onClick={() =>
              set({
                show: [...exercise.show, { view: 'image', wordId: exercise.show[0]?.wordId ?? '' }],
              })
            }
          >
            + Часть вопроса
          </button>
        )}
      </Field>
      <Field label="Варианты ответа" error={errors('options')}>
        <select
          aria-label="Вид вариантов"
          value={exercise.as}
          onChange={(e) => {
            const as = e.target.value as ChoiceOptions;
            set({ as, options: optionsFor(as, exercise.options), answerId: '' });
          }}
        >
          {(Object.keys(OPTION_LABELS) as ChoiceOptions[]).map((as) => (
            <option key={as} value={as}>
              {OPTION_LABELS[as]}
            </option>
          ))}
        </select>
        {(exercise.as === 'image' || exercise.as === 'text') && (
          <span className="checks">
            {words.map((w) => (
              <label key={w.id}>
                <input
                  type="checkbox"
                  checked={wordOptions.some((o) => o.wordId === w.id)}
                  onChange={(e) =>
                    set({
                      options: e.target.checked
                        ? [...exercise.options, { id: w.id, wordId: w.id }]
                        : exercise.options.filter((o) => o.wordId !== w.id),
                    })
                  }
                />
                {wordLabel(w)}
              </label>
            ))}
          </span>
        )}
        {exercise.as === 'letter' && (
          <span className="tiles">
            {exercise.options.map((o, i) => (
              <span key={o.id} className="row" style={{ gap: 2 }}>
                <input
                  className="tile-input"
                  type="text"
                  maxLength={4}
                  value={o.letter ?? ''}
                  aria-label={`Буква ${i + 1}`}
                  onChange={(e) =>
                    set({
                      options: exercise.options.map((x) =>
                        x.id === o.id ? { ...x, letter: e.target.value } : x,
                      ),
                    })
                  }
                />
                <button
                  className="link"
                  type="button"
                  aria-label="Убрать букву"
                  onClick={() => set({ options: exercise.options.filter((x) => x.id !== o.id) })}
                >
                  ×
                </button>
              </span>
            ))}
            {exercise.options.length < 6 && (
              <button
                className="btn light sm"
                type="button"
                onClick={() =>
                  set({
                    options: [
                      ...exercise.options,
                      { id: `l${Date.now().toString(36).slice(-4)}`, letter: '' },
                    ],
                  })
                }
              >
                + Буква
              </button>
            )}
          </span>
        )}
      </Field>
      <Field label="Правильный ответ" error={errors('answerId')}>
        <select value={exercise.answerId} onChange={(e) => set({ answerId: e.target.value })}>
          <option value="">— выберите —</option>
          {exercise.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.wordId
                ? (words.find((w) => w.id === o.wordId)?.text ?? o.wordId)
                : o.letter !== undefined
                  ? o.letter || '(пусто)'
                  : o.id === 'yes'
                    ? 'да'
                    : 'нет'}
            </option>
          ))}
        </select>
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
}: PreviewProps<'choice'>) {
  const word = (id: string) => lesson.words.find((w) => w.id === id)!;
  const chosen = draft && 'choiceId' in draft ? draft.choiceId : null;
  const state = (id: string) =>
    `${chosen === id ? 'selected' : ''} ${correct && id === exercise.answerId ? 'correct' : ''}`;
  return (
    <>
      <p className="muted small">
        {exercise.as === 'yes-no'
          ? 'Ответь: да или нет?'
          : `Выбери: ${OPTION_LABELS[exercise.as]}.`}
      </p>
      <div style={{ textAlign: 'center' }}>
        {exercise.show.map(({ view, wordId }, i) =>
          view === 'audio' ? (
            <AudioButtons key={i} src={mediaUrls[word(wordId).audioId]!} />
          ) : view === 'image' ? (
            <div key={i}>
              <Sprite lesson={lesson} id={word(wordId).imageId} size={130} mediaUrls={mediaUrls} />
            </div>
          ) : (
            <h2 key={i}>{view === 'text' ? word(wordId).text : word(wordId).translation}</h2>
          ),
        )}
      </div>
      {exercise.as === 'letter' ? (
        <div className="tiles" style={{ justifyContent: 'center', margin: '16px 0' }}>
          {exercise.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`letter ${state(o.id)}`}
              disabled={correct}
              onClick={() => onChange({ choiceId: o.id })}
            >
              {o.letter}
            </button>
          ))}
        </div>
      ) : (
        <div className="choice-grid">
          {exercise.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`choice ${state(o.id)}`}
              disabled={correct}
              onClick={() => onChange({ choiceId: o.id })}
            >
              {exercise.as === 'yes-no' ? (
                <span className="word">{o.id === 'yes' ? '✅ Да' : '❌ Нет'}</span>
              ) : exercise.as === 'image' ? (
                <>
                  <Sprite
                    lesson={lesson}
                    id={word(o.wordId!).imageId}
                    size={110}
                    mediaUrls={mediaUrls}
                  />
                  <span className="muted small">
                    {correct && o.id === exercise.answerId ? word(o.wordId!).text : ' '}
                  </span>
                </>
              ) : (
                <span className="word">{word(o.wordId!).text}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export const choice: AdminMechanic<'choice'> = {
  label: 'Выбор',
  create: (id) => ({
    id,
    prompt: '',
    hint: '',
    type: 'choice',
    show: [{ view: 'text', wordId: '' }],
    as: 'image',
    options: [],
    answerId: '',
  }),
  Editor,
  Preview,
};
