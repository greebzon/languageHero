import { useState } from 'react';
import { sentenceKey, type DraftWord } from '@lingvohero/contracts';
import { Field } from '../components/ui';
import { AudioButtons, Sprite } from './shared';
import type { AdminMechanic, EditorProps, PreviewProps } from './types';

const split = (text: string) => text.split(/\s+/).filter(Boolean);

/** Tiles for the sentence plus extra words, shuffled; tiles of lesson words link to them. */
function tilesFor(answer: string[], extras: string[], words: DraftWord[]) {
  const linked = (text: string) =>
    words.find((w) => sentenceKey(w.spelling) === sentenceKey(text))?.id;
  return [...answer, ...extras]
    .map((text, i) => {
      const wordId = linked(text);
      return { id: `w${i + 1}`, text, ...(wordId ? { wordId } : {}) };
    })
    .sort(() => Math.random() - 0.5);
}

/** The tiles that are not used by the sentence. */
function extrasOf(tokens: { text: string }[], answer: string[]) {
  const left = answer.map(sentenceKey);
  return tokens
    .filter((t) => {
      const i = left.indexOf(sentenceKey(t.text));
      if (i < 0) return true;
      left.splice(i, 1);
      return false;
    })
    .map((t) => t.text);
}

function Editor({ exercise, words, media, errors, onChange }: EditorProps<'build-sentence'>) {
  const [extras, setExtras] = useState(extrasOf(exercise.tokens, exercise.answer).join(' '));
  const audios = media.filter((m) => m.kind === 'audio');
  return (
    <>
      <Field
        label="Фраза"
        hint="слова через пробел, без точки; первое слово с маленькой буквы (кроме «I»)"
        error={errors('answer')}
      >
        <input
          type="text"
          value={exercise.answer.join(' ')}
          onChange={(e) => onChange({ ...exercise, answer: split(e.target.value) })}
        />
      </Field>
      <Field label="Лишние слова" hint="неверные плитки, через пробел">
        <input type="text" value={extras} onChange={(e) => setExtras(e.target.value)} />
      </Field>
      <Field
        label="Плитки"
        hint="показываются в этом порядке; слова урока — с картинкой"
        error={errors('tokens')}
      >
        <span className="row">
          {exercise.tokens.map((t) => (
            <span key={t.id} className="badge">
              {t.text}
              {t.wordId ? ' 🖼' : ''}
            </span>
          ))}
          <button
            className="btn light sm"
            type="button"
            disabled={!exercise.answer.length}
            onClick={() =>
              onChange({ ...exercise, tokens: tilesFor(exercise.answer, split(extras), words) })
            }
          >
            Собрать плитки
          </button>
        </span>
      </Field>
      <Field
        label="Другой верный порядок"
        hint="по одному на строку, если фразу можно сказать иначе"
        error={errors('alternatives')}
      >
        <textarea
          rows={2}
          value={(exercise.alternatives ?? []).map((a) => a.join(' ')).join('\n')}
          onChange={(e) => {
            const alternatives = e.target.value
              .split('\n')
              .map(split)
              .filter((a) => a.length);
            onChange({ ...exercise, alternatives: alternatives.length ? alternatives : undefined });
          }}
        />
      </Field>
      <Field label="Звук фразы" hint="добавьте звук в «Медиа» урока" error={errors('audioId')}>
        <select
          value={exercise.audioId}
          onChange={(e) => onChange({ ...exercise, audioId: e.target.value })}
        >
          <option value="">— выберите —</option>
          {audios.map((m) => (
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
}: PreviewProps<'build-sentence'>) {
  const chosen = draft && 'tileIds' in draft ? draft.tileIds : [];
  const token = (id: string) => exercise.tokens.find((t) => t.id === id)!;
  const word = (id: string) => lesson.words.find((w) => w.id === id)!;
  return (
    <>
      <p className="muted small">Собери фразу. Нажимай на слова по порядку.</p>
      <AudioButtons src={mediaUrls[exercise.audioId]!} />
      <div className="answer-box" aria-label="Собранная фраза">
        {chosen.length === 0 && <span className="muted">Здесь появится фраза</span>}
        {chosen.map((id, i) => (
          <button
            key={id}
            type="button"
            className="letter chosen"
            disabled={correct}
            onClick={() => onChange({ tileIds: chosen.filter((t) => t !== id) })}
          >
            {i === 0
              ? token(id).text.charAt(0).toUpperCase() + token(id).text.slice(1)
              : token(id).text}
          </button>
        ))}
      </div>
      <div className="tiles" style={{ justifyContent: 'center', margin: '16px 0' }}>
        {exercise.tokens.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`letter ${chosen.includes(t.id) ? 'used' : ''}`}
            disabled={correct || chosen.includes(t.id)}
            onClick={() => onChange({ tileIds: [...chosen, t.id] })}
          >
            {t.wordId && (
              <Sprite lesson={lesson} id={word(t.wordId).imageId} size={32} mediaUrls={mediaUrls} />
            )}
            {t.text}
          </button>
        ))}
      </div>
      {!correct && (
        <button className="btn light" type="button" onClick={() => onChange(null)}>
          Собрать фразу заново
        </button>
      )}
    </>
  );
}

export const buildSentence: AdminMechanic<'build-sentence'> = {
  label: 'Собери фразу',
  create: (id) => ({
    id,
    prompt: '',
    hint: '',
    type: 'build-sentence',
    tokens: [],
    answer: [],
    audioId: '',
  }),
  Editor,
  Preview,
};
