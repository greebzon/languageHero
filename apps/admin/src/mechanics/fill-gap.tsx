import { Field } from '../components/ui';
import { AudioButtons, Sprite, WordSelect, wordLabel } from './shared';
import type { AdminMechanic, EditorProps, PreviewProps } from './types';

function Editor({ exercise, words, media, errors, onChange }: EditorProps<'fill-gap'>) {
  const optionWords = exercise.options.flatMap((o) => (o.wordId ? [o.wordId] : []));
  // Options are lesson words written as spelled («cat», not «A cat»): they go into the gap.
  const optionFor = (id: string) => {
    const word = words.find((w) => w.id === id);
    return { id, text: word?.spelling || word?.text || id, wordId: id };
  };
  return (
    <>
      <div className="grid-2">
        <Field label="Текст до пропуска" hint="на изучаемом языке" error={errors('before')}>
          <input
            type="text"
            value={exercise.before}
            onChange={(e) => onChange({ ...exercise, before: e.target.value })}
          />
        </Field>
        <Field label="Текст после пропуска" error={errors('after')}>
          <input
            type="text"
            value={exercise.after}
            onChange={(e) => onChange({ ...exercise, after: e.target.value })}
          />
        </Field>
      </div>
      <WordSelect
        label="Пропущенное слово"
        value={exercise.answerId}
        words={words}
        error={errors('answerId')}
        onSelect={(answerId) =>
          onChange({
            ...exercise,
            answerId,
            options: optionWords.includes(answerId)
              ? exercise.options
              : [...exercise.options, optionFor(answerId)].filter((o) => o.id),
          })
        }
      />
      <Field label="Варианты" hint="2–4 слова урока, верное среди них" error={errors('options')}>
        <span className="checks">
          {words.map((w) => (
            <label key={w.id}>
              <input
                type="checkbox"
                checked={optionWords.includes(w.id)}
                onChange={(e) =>
                  onChange({
                    ...exercise,
                    options: e.target.checked
                      ? [...exercise.options, optionFor(w.id)]
                      : exercise.options.filter((o) => o.wordId !== w.id),
                  })
                }
              />
              {wordLabel(w)}
            </label>
          ))}
        </span>
      </Field>
      <Field label="Звук фразы" hint="не обязательно" error={errors('audioId')}>
        <select
          value={exercise.audioId ?? ''}
          onChange={(e) => {
            const { audioId: _old, ...rest } = exercise;
            onChange(e.target.value ? { ...rest, audioId: e.target.value } : rest);
          }}
        >
          <option value="">— без звука —</option>
          {media
            .filter((m) => m.kind === 'audio')
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
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
}: PreviewProps<'fill-gap'>) {
  const chosen = draft && 'choiceId' in draft ? draft.choiceId : null;
  const filled = exercise.options.find((o) => o.id === chosen);
  const word = (id: string) => lesson.words.find((w) => w.id === id)!;
  return (
    <>
      <p className="muted small">Какое слово пропущено? Выбери его.</p>
      {exercise.audioId && <AudioButtons src={mediaUrls[exercise.audioId]!} />}
      <h2 style={{ textAlign: 'center' }}>
        {exercise.before} <u>{filled?.text ?? '   ?   '}</u> {exercise.after}
      </h2>
      <div className="tiles" style={{ justifyContent: 'center', margin: '16px 0' }}>
        {exercise.options.map((o) => (
          <button
            key={o.id}
            type="button"
            className={`letter ${chosen === o.id ? 'selected' : ''} ${correct && o.id === exercise.answerId ? 'correct' : ''}`}
            disabled={correct}
            onClick={() => onChange({ choiceId: o.id })}
          >
            {o.wordId && (
              <Sprite lesson={lesson} id={word(o.wordId).imageId} size={32} mediaUrls={mediaUrls} />
            )}
            {o.text}
          </button>
        ))}
      </div>
    </>
  );
}

export const fillGap: AdminMechanic<'fill-gap'> = {
  label: 'Вставь слово',
  create: (id) => ({
    id,
    prompt: '',
    hint: '',
    type: 'fill-gap',
    before: '',
    after: '',
    options: [],
    answerId: '',
  }),
  Editor,
  Preview,
};
