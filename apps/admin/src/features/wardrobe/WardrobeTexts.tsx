import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, describeError } from '../../app/api';
import type { GenerationJob } from '../../app/types';
import { OVERLAY, TranslationChips, type OverlayLocale } from '../lessons/TranslationsEditor';
import { useGenerationSettings } from '../generation/WizardPage';

export { TranslationChips };
type Texts = Partial<Record<OverlayLocale, Record<string, string | undefined>>>;
/* Jobs whose result has already been pulled into the page. */
const applied = new Set<string>();

/**
 * «Перевести тексты (EN, HE)» in «Маскоты» and «Магазин»: one job for every mascot and item
 * whose translation is missing or outdated. The two pages share the job.
 */
export function WardrobeTextsGenerator() {
  const queryClient = useQueryClient();
  const settings = useGenerationSettings();
  const jobs = useQuery({
    queryKey: ['wardrobe-texts-jobs'],
    queryFn: () => api<{ items: GenerationJob[] }>('/wardrobe/texts/jobs').then((r) => r.items),
    refetchInterval: (q) =>
      q.state.data?.some((j) => j.status === 'queued' || j.status === 'running') ? 3_000 : false,
  });
  const latest = jobs.data?.[0] ?? null;
  const running = !!latest && (latest.status === 'queued' || latest.status === 'running');
  const start = useMutation({
    mutationFn: (force: boolean) =>
      api('/wardrobe/texts/generate', { body: { force, idempotencyKey: crypto.randomUUID() } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wardrobe-texts-jobs'] }),
  });
  useEffect(() => {
    if (!latest || latest.status !== 'awaiting-review' || applied.has(latest.id)) return;
    applied.add(latest.id);
    for (const key of ['mascots', 'shop-items', 'mascot', 'shop-item'])
      void queryClient.invalidateQueries({ queryKey: [key] });
  }, [latest, queryClient]);
  const providerReady = settings.data?.providerReady ?? false;
  const nothing = start.error instanceof ApiError && start.error.code === 'nothing_to_generate';
  const recent =
    latest?.finishedAt && Date.now() - new Date(latest.finishedAt).getTime() < 10 * 60_000;
  return (
    <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
      <span className="row">
        <button
          className="btn light"
          type="button"
          disabled={!providerReady || running || start.isPending}
          title={
            providerReady
              ? 'Имена и описания маскотов и вещей на английском и иврите'
              : (settings.data?.unavailableReason ?? 'Генерация недоступна')
          }
          onClick={() => start.mutate(false)}
        >
          {running ? 'Переводим…' : '🌐 Перевести тексты (EN, HE)'}
        </button>
        {nothing && (
          <button className="link" type="button" onClick={() => start.mutate(true)}>
            Перевести заново всё
          </button>
        )}
      </span>
      {nothing ? (
        <span className="muted small">Все маскоты и вещи уже переведены.</span>
      ) : (
        start.error && <span className="error-text">{describeError(start.error)}</span>
      )}
      {running && (
        <span className="muted small">
          Переводим маскотов и вещи. <Link to={`/generations/${latest.id}`}>Ход работы</Link>
        </span>
      )}
      {latest?.status === 'awaiting-review' && recent && (
        <span className="small">
          ✅ Переведено. Приложение покажет переводы опубликованных маскотов и вещей сразу.
        </span>
      )}
      {latest?.status === 'failed' && recent && (
        <span className="error-text">
          Перевести не удалось: {latest.error ?? 'ошибка генерации'}.{' '}
          <Link to={`/generations/${latest.id}`}>Подробнее</Link>
        </span>
      )}
    </div>
  );
}

/** «Переводы» on a mascot's or item's page: each field next to its Russian original. */
export function WardrobeTranslations({
  fields,
  source,
  texts,
  translations,
  saving,
  error,
  onSave,
}: {
  fields: { key: string; label: string; max: number }[];
  source: Record<string, unknown>;
  texts: Texts;
  translations?: Record<OverlayLocale, 'ok' | 'missing' | 'stale'>;
  saving: boolean;
  error: unknown;
  onSave: (texts: Texts) => void;
}) {
  const [draft, setDraft] = useState<Texts>(texts);
  useEffect(() => setDraft(texts), [texts]);
  const changed = JSON.stringify(draft) !== JSON.stringify(texts);
  return (
    <div className="panel">
      <div className="page-head">
        <h2>Переводы</h2>
        <TranslationChips translations={translations} />
      </div>
      <p className="muted small">
        Имена и описания для детей с языком приложения English и עברית. Пустое поле — ребёнок увидит
        русский текст. Перевести разом — кнопка «Перевести тексты» в списке.
      </p>
      <div className="stack">
        {fields.map((field) => (
          <div key={field.key} className="stack" style={{ gap: 4 }}>
            <strong className="small">
              {field.label}: <span className="muted">{String(source[field.key] ?? '')}</span>
            </strong>
            <div className="grid-2">
              {OVERLAY.map(({ code, label, dir }) => (
                <input
                  key={code}
                  type="text"
                  dir={dir}
                  maxLength={field.max}
                  aria-label={`${field.label} — ${label}`}
                  placeholder={label}
                  value={draft[code]?.[field.key] ?? ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [code]: {
                        ...Object.fromEntries(fields.map((f) => [f.key, ''])),
                        ...draft[code],
                        [field.key]: e.target.value,
                      },
                    })
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {!!error && <p className="error-text">{describeError(error)}</p>}
      <button
        className="btn"
        type="button"
        disabled={!changed || saving}
        onClick={() => onSave(draft)}
        style={{ marginTop: 12 }}
      >
        Сохранить переводы
      </button>
    </div>
  );
}
