import { useEffect } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, describeError } from '../../app/api';
import type { GenerationJob } from '../../app/types';
import { useGenerationSettings } from '../generation/WizardPage';

/* Jobs whose result has already been pulled into the page. */
const applied = new Set<string>();

/**
 * «Перевести тексты»: translates every lesson, the card and the language name into English
 * and Hebrew (only what is missing or outdated). Progress comes from the set's job list.
 */
export function TextsGenerator({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const settings = useGenerationSettings();
  const jobs = useQuery({
    queryKey: ['course-generations', courseId],
    queryFn: () =>
      api<{ items: GenerationJob[] }>(`/courses/${courseId}/generations`).then((r) => r.items),
    refetchInterval: (q) =>
      q.state.data?.some((j) => j.status === 'queued' || j.status === 'running') ? 3_000 : false,
  });
  const latest = jobs.data?.find((j) => j.kind === 'texts') ?? null;
  const busy = jobs.data?.some((j) => j.status === 'queued' || j.status === 'running') ?? false;
  const running = latest && (latest.status === 'queued' || latest.status === 'running');
  const start = useMutation({
    mutationFn: (force: boolean) =>
      api(`/courses/${courseId}/texts/generate`, {
        body: { force, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['course-generations', courseId] }),
  });
  useEffect(() => {
    if (!latest || latest.status !== 'awaiting-review' || applied.has(latest.id)) return;
    applied.add(latest.id);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['course', courseId] }),
      queryClient.invalidateQueries({ queryKey: ['lesson'] }),
    ]);
  }, [latest, courseId, queryClient]);
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
          disabled={!providerReady || busy || start.isPending}
          title={
            !providerReady
              ? (settings.data?.unavailableReason ?? 'Генерация недоступна')
              : busy
                ? 'У сета уже идёт генерация'
                : 'Английский и иврит: уроки, название сета и название языка'
          }
          onClick={() => start.mutate(false)}
        >
          {running ? 'Переводим…' : '🌐 Перевести тексты (EN, HE)'}
        </button>
        {nothing && (
          <button
            className="link"
            type="button"
            disabled={busy || start.isPending}
            onClick={() => start.mutate(true)}
          >
            Перевести заново всё
          </button>
        )}
      </span>
      {nothing ? (
        <span className="muted small">Все тексты уже переведены и актуальны.</span>
      ) : (
        start.error && <span className="error-text">{describeError(start.error)}</span>
      )}
      {running && (
        <span className="muted small">
          Переводим тексты уроков — примерно по 10 секунд на урок.{' '}
          <Link to={`/generations/${latest.id}`}>Ход работы</Link>
        </span>
      )}
      {latest?.status === 'awaiting-review' && recent && (
        <span className="small">
          ✅ Тексты переведены. Проверьте их во вкладках «Переводы» у уроков; дети увидят их после
          следующего выпуска.
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
