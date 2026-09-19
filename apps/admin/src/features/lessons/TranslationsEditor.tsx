import { useState } from 'react';
import type {
  DraftLessonTexts,
  DraftTexts,
  LessonDocument,
  LessonPresentation,
} from '@lingvohero/contracts';

export type OverlayLocale = 'en' | 'he';
export const OVERLAY: { code: OverlayLocale; label: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', dir: 'ltr' },
  { code: 'he', label: 'עברית', dir: 'rtl' },
];
export type TranslationState = 'ok' | 'missing' | 'stale';
const STATE_LABELS: Record<TranslationState, string> = {
  ok: 'переведено',
  missing: 'нет перевода',
  stale: 'перевод устарел',
};

/** «EN ✓ · HE —» chips: which interface locales a lesson is translated to. */
export function TranslationChips({
  translations,
}: {
  translations?: Record<OverlayLocale, TranslationState>;
}) {
  if (!translations) return null;
  return (
    <span className="row" style={{ gap: 4 }}>
      {OVERLAY.map(({ code }) => (
        <span
          key={code}
          className={`badge ${translations[code] === 'ok' ? 'published' : translations[code] === 'stale' ? 'draft' : 'archived'}`}
          title={STATE_LABELS[translations[code]]}
        >
          {code.toUpperCase()}{' '}
          {translations[code] === 'ok' ? '✓' : translations[code] === 'stale' ? '!' : '—'}
        </span>
      ))}
    </span>
  );
}

/**
 * «Переводы»: every child-facing text of the lesson next to its Russian original, one
 * interface locale at a time. The Russian stays in the fields above; this edits the overlay.
 */
export function TranslationsEditor({
  title,
  presentation,
  document,
  texts,
  states,
  onChange,
}: {
  title: string;
  presentation: LessonPresentation | null;
  document: LessonDocument;
  texts: DraftTexts;
  states?: Record<OverlayLocale, TranslationState>;
  onChange: (texts: DraftTexts) => void;
}) {
  const [locale, setLocale] = useState<OverlayLocale>('en');
  const meta = OVERLAY.find((l) => l.code === locale)!;
  const current: DraftLessonTexts = texts[locale] ?? {};
  const set = (patch: Partial<DraftLessonTexts>) =>
    onChange({ ...texts, [locale]: { ...current, ...patch } });
  const row = (original: string, value: string, change: (v: string) => void, long = false) => (
    <div className="translation-row">
      <div className="muted small translation-source">{original || '—'}</div>
      {long ? (
        <textarea dir={meta.dir} value={value} onChange={(e) => change(e.target.value)} />
      ) : (
        <input type="text" dir={meta.dir} value={value} onChange={(e) => change(e.target.value)} />
      )}
    </div>
  );
  return (
    <section className="panel">
      <div className="page-head">
        <h2>Переводы</h2>
        <span className="row">
          {OVERLAY.map((l) => (
            <button
              key={l.code}
              type="button"
              className={`btn sm ${locale === l.code ? '' : 'light'}`}
              aria-pressed={locale === l.code}
              onClick={() => setLocale(l.code)}
            >
              {l.label}
              {states ? ` · ${STATE_LABELS[states[l.code]]}` : ''}
            </button>
          ))}
        </span>
      </div>
      <p className="muted small">
        Тексты, которые видит ребёнок с языком приложения «{meta.label}». Слева — русский оригинал.
        Сет виден такому ребёнку, только когда переведены все уроки. Перевести разом — кнопка
        «Перевести тексты» на странице сета.
      </p>
      <div className="stack">
        <strong>Название урока</strong>
        {row(title, current.title ?? '', (v) => set({ title: v }))}
        {presentation && (
          <>
            <strong>Реплики Тима</strong>
            {(['intro', 'completionTitle', 'completionMessage'] as const).map((key) => (
              <div key={key}>
                {row(
                  presentation[key],
                  current.presentation?.[key] ?? '',
                  (v) =>
                    set({
                      presentation: {
                        intro: '',
                        completionTitle: '',
                        completionMessage: '',
                        ...current.presentation,
                        [key]: v,
                      },
                    }),
                  key !== 'completionTitle',
                )}
              </div>
            ))}
          </>
        )}
        <strong>Значения слов</strong>
        {document.words.map((w) => (
          <div key={w.id}>
            <span className="small">
              <code>{w.text}</code>
            </span>
            {row(w.translation, current.words?.[w.id]?.translation ?? '', (v) =>
              set({ words: { ...current.words, [w.id]: { translation: v } } }),
            )}
          </div>
        ))}
        <strong>Задания</strong>
        {document.exercises.map((e, i) => {
          const value = current.exercises?.[e.id] ?? { prompt: '', hint: '' };
          const change = (patch: Partial<typeof value>) =>
            set({ exercises: { ...current.exercises, [e.id]: { ...value, ...patch } } });
          return (
            <div key={e.id} className="stack" style={{ gap: 6 }}>
              <span className="small">
                {i + 1}. <code>{e.id}</code>
              </span>
              {row(e.prompt, value.prompt, (v) => change({ prompt: v }))}
              {row(e.hint, value.hint, (v) => change({ hint: v }), true)}
            </div>
          );
        })}
      </div>
    </section>
  );
}
