import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, describeError } from '../../app/api';
import type { GenerationJob } from '../../app/types';
import { useGenerationSettings } from '../generation/WizardPage';

/* Jobs whose result has already been pulled into the page (the form remounts on every new
   edit revision, so this cannot live in component state). */
const applied = new Set<string>();

/**
 * «Сгенерировать обложку»: queues a cover job for the set. Its progress comes from the set's
 * job list, so it survives the form remounting when the finished job moves the set's revision.
 */
export function CoverGenerator({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient();
  const settings = useGenerationSettings();
  const [hint, setHint] = useState('');
  const jobs = useQuery({
    queryKey: ['course-generations', courseId],
    queryFn: () =>
      api<{ items: GenerationJob[] }>(`/courses/${courseId}/generations`).then((r) => r.items),
    refetchInterval: (q) =>
      q.state.data?.some((j) => j.status === 'queued' || j.status === 'running') ? 3_000 : false,
  });
  const latest = jobs.data?.find((j) => j.kind === 'cover') ?? null;
  const busy = jobs.data?.some((j) => j.status === 'queued' || j.status === 'running') ?? false;
  const coverRunning = latest && (latest.status === 'queued' || latest.status === 'running');
  const start = useMutation({
    mutationFn: () =>
      api(`/courses/${courseId}/cover/generate`, {
        body: { hint, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['course-generations', courseId] }),
  });
  useEffect(() => {
    if (!latest || latest.status !== 'awaiting-review' || applied.has(latest.id)) return;
    applied.add(latest.id);
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['course', courseId] }),
      queryClient.invalidateQueries({ queryKey: ['courses'] }),
      queryClient.invalidateQueries({ queryKey: ['assets'] }),
    ]);
  }, [latest, courseId, queryClient]);
  const providerReady = settings.data?.providerReady ?? false;
  const recent =
    latest?.finishedAt && Date.now() - new Date(latest.finishedAt).getTime() < 10 * 60_000;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <input
          type="text"
          value={hint}
          maxLength={300}
          placeholder="Что нарисовать (необязательно): например, рассвет над фермой и трактор"
          onChange={(e) => setHint(e.target.value)}
          style={{ flex: 1, minWidth: 220 }}
          disabled={!!coverRunning}
        />
        <button
          className="btn amber sm"
          type="button"
          disabled={!providerReady || busy || start.isPending}
          title={
            !providerReady
              ? (settings.data?.unavailableReason ?? 'Генерация недоступна')
              : busy
                ? 'У сета уже идёт генерация'
                : undefined
          }
          onClick={() => start.mutate()}
        >
          {coverRunning ? 'Рисуем…' : '✨ Сгенерировать обложку'}
        </button>
      </div>
      {start.error && <span className="error-text">{describeError(start.error)}</span>}
      {coverRunning && (
        <span className="muted small">
          Рисуем новую обложку по теме сета — обычно это 30–60 секунд. Можно не ждать на странице.{' '}
          <Link to={`/generations/${latest.id}`}>Ход работы</Link>
        </span>
      )}
      {latest?.status === 'awaiting-review' && recent && (
        <span className="small">
          ✅ Новая обложка готова и уже стоит в сете (прежняя осталась в медиатеке). В приложение
          она попадёт со следующим выпуском.
        </span>
      )}
      {latest?.status === 'failed' && recent && (
        <span className="error-text">
          Обложку нарисовать не удалось: {latest.error ?? 'ошибка генерации'}.{' '}
          <Link to={`/generations/${latest.id}`}>Подробнее</Link>
        </span>
      )}
    </div>
  );
}
