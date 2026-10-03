import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, describeError } from '../../app/api';
import type { GenerationTask, GenerationView } from '../../app/types';
import { Badge, Crumbs, Notice, formatDate } from '../../components/ui';

const terminal = new Set(['awaiting-review', 'failed', 'cancelled']);
const statusLabels: Record<string, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  'awaiting-review': 'Готово к проверке',
  failed: 'Ошибка',
  cancelled: 'Отменено',
  pending: 'Ожидает',
  succeeded: 'Готово',
  'retry-wait': 'Повтор позже',
};

export function useGenerationJob(id: string) {
  const [hidden, setHidden] = useState(document.visibilityState === 'hidden');
  useEffect(() => {
    const onChange = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);
  return useQuery({
    queryKey: ['generation', id],
    queryFn: () => api<GenerationView>(`/generations/${id}`),
    // Polling: quick while the job runs, relaxed in a background tab, off when finished.
    refetchInterval: (query) =>
      query.state.data && terminal.has(query.state.data.job.status)
        ? false
        : hidden
          ? 10_000
          : 2_000,
  });
}

export function JobPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const query = useGenerationJob(id);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['generation', id] });
  const cancel = useMutation({
    mutationFn: () => api<GenerationView>(`/generations/${id}/cancel`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const retry = useMutation({
    mutationFn: (taskId: string) =>
      api<GenerationView>(`/generations/${id}/tasks/${taskId}/retry`, { method: 'POST' }),
    onSuccess: refresh,
  });
  const apply = useMutation({
    mutationFn: () => api<GenerationView>(`/generations/${id}/apply-conflicts`, { method: 'POST' }),
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['lesson'] });
    },
  });
  if (query.isLoading) return <p className="muted">Загрузка…</p>;
  if (query.error || !query.data) return <Notice tone="error">{describeError(query.error)}</Notice>;
  const { job, tasks, progress, stages, allowed } = query.data;
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const actionError = cancel.error ?? retry.error ?? apply.error;
  return (
    <>
      <Crumbs
        items={
          job.kind === 'course' || job.kind === 'cover' || job.kind === 'texts'
            ? [
                { to: '/courses', label: 'Сеты' },
                { to: `/courses/${job.courseId}`, label: job.courseId ?? '' },
                { label: 'Генерация' },
              ]
            : [
                job.kind === 'mascot'
                  ? { to: '/mascots', label: 'Маскоты' }
                  : { to: '/shop', label: 'Магазин' },
                {
                  to: `/${job.kind === 'mascot' ? 'mascots' : 'shop'}/${job.subjectId}`,
                  label: job.subjectId ?? '',
                },
                { label: 'Генерация' },
              ]
        }
      />
      <div className="page-head">
        <h1>
          {job.kind === 'course'
            ? `«${job.input.topic}»`
            : job.kind === 'cover'
              ? `Обложка «${job.input.topic}»`
              : job.kind === 'texts'
                ? `Переводы «${job.input.topic}»`
                : job.subjectId}{' '}
          <Badge
            value={
              job.status === 'awaiting-review' && job.kind !== 'course' ? 'succeeded' : job.status
            }
          />
        </h1>
        <span className="row">
          {allowed.cancel && (
            <button
              className="btn danger"
              type="button"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              Отменить
            </button>
          )}
          {job.status === 'awaiting-review' && job.kind === 'course' && (
            <Link className="btn" to={`/courses/${job.courseId}`}>
              К урокам сета
            </Link>
          )}
          {(job.kind === 'cover' || job.kind === 'texts') && (
            <Link className="btn" to={`/courses/${job.courseId}`}>
              К сету
            </Link>
          )}
          {job.status === 'awaiting-review' && (job.kind === 'mascot' || job.kind === 'item') && (
            <Link
              className="btn"
              to={`/${job.kind === 'mascot' ? 'mascots' : 'shop'}/${job.subjectId}`}
            >
              {job.kind === 'mascot' ? 'К маскоту' : 'К вещи'}
            </Link>
          )}
        </span>
      </div>
      <p className="muted small">
        {job.kind === 'course' &&
          `${job.input.totalExercises} заданий · уроков по ${job.input.lessonSize} · `}
        запустил {job.actorLogin ?? '—'} {formatDate(job.createdAt)}
        {job.finishedAt && ` · завершено ${formatDate(job.finishedAt)}`} · модели{' '}
        {job.modelConfig.text}, {job.modelConfig.image}, {job.modelConfig.tts} · промпт{' '}
        {job.promptVersion}
      </p>
      {actionError && <Notice tone="error">{describeError(actionError)}</Notice>}
      {job.error && <Notice tone="error">{job.error}</Notice>}
      {job.status === 'awaiting-review' && job.kind === 'course' && (
        <Notice tone="success">
          Черновик собран. Проверьте уроки, поправьте тексты и медиа, затем «Проверить сет» и
          выпуск. Ничего не опубликовано автоматически.
        </Notice>
      )}
      {job.status === 'awaiting-review' && job.kind === 'texts' && (
        <Notice tone="success">
          Тексты переведены на английский и иврит. Проверьте их во вкладках «Переводы» у уроков;
          дети с этими языками приложения увидят сет после следующего выпуска.
        </Notice>
      )}
      {job.status === 'awaiting-review' && job.kind === 'cover' && (
        <Notice tone="success">
          Обложка нарисована и уже стоит в сете; прежняя осталась в медиатеке. В приложение она
          попадёт со следующим выпуском.
        </Notice>
      )}
      {job.status === 'awaiting-review' && (job.kind === 'mascot' || job.kind === 'item') && (
        <Notice tone="success">
          Ассеты нарисованы. Посмотрите результат на странице{' '}
          {job.kind === 'mascot' ? 'маскота' : 'вещи'} и опубликуйте, когда всё устраивает.
        </Notice>
      )}
      {job.warnings.length > 0 && (
        <Notice tone="warn">
          <ul>
            {job.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          {allowed.applyConflicts && (
            <button
              className="btn amber sm"
              type="button"
              disabled={apply.isPending}
              onClick={() => apply.mutate()}
            >
              Применить варианты ИИ вместо ручных правок
            </button>
          )}
        </Notice>
      )}

      <div className="panel">
        <div className="page-head">
          <h2>Ход работы</h2>
          <span className="muted small">
            {progress.done} / {progress.total} шагов · расход ≈ {job.usage.estimatedUsd.toFixed(2)}{' '}
            $ из {job.costLimitUsd} $ · картинок {job.usage.images}, символов озвучки{' '}
            {job.usage.ttsChars}
          </span>
        </div>
        <div className="play-progress" aria-label={`${percent}%`} style={{ marginBottom: 14 }}>
          <div style={{ width: `${percent}%` }} />
        </div>
        <div className="grid-2">
          {stages
            .filter((s) => s.tasks > 0 || !terminal.has(job.status))
            .map((s) => (
              <div key={s.stage} className="row">
                <span
                  className={`badge ${s.failed ? 'failed' : s.tasks && s.done === s.tasks ? 'published' : s.done ? 'preview' : ''}`}
                >
                  {s.tasks ? `${s.done}/${s.tasks}` : '…'}
                </span>
                <span>{s.label}</span>
              </div>
            ))}
        </div>
      </div>

      {job.result && (
        <div className="panel">
          <h2>Результат</h2>
          <p className="small">
            Слова ({job.result.words.length}):{' '}
            {job.result.words.map((w) => `${w.text} — ${w.translation}`).join(', ')}
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Урок</th>
                  <th>Цель</th>
                  <th>Заданий</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {job.result.lessons.map((l) => (
                  <tr key={l.lessonId}>
                    <td>{l.title}</td>
                    <td className="small">{l.goal}</td>
                    <td>{l.exerciseCount}</td>
                    <td>
                      {job.status === 'awaiting-review' && (
                        <span className="row">
                          <Link to={`/lessons/${l.lessonId}`}>Редактор</Link>
                          <Link to={`/lessons/${l.lessonId}/preview`}>Пройти</Link>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Шаги</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Шаг</th>
                <th>Статус</th>
                <th>Попытки</th>
                <th>Подробности</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  canRetry={allowed.retryTaskIds.includes(task.id)}
                  retrying={retry.isPending}
                  onRetry={() => retry.mutate(task.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function TaskRow({
  task,
  canRetry,
  retrying,
  onRetry,
}: {
  task: GenerationTask;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <tr>
      <td>
        {task.stageLabel}
        {task.targetId !== task.stage && (
          <div className="muted small">
            <code>{task.targetId}</code>
          </div>
        )}
      </td>
      <td>
        <span
          className={`badge ${task.status === 'succeeded' ? 'published' : task.status === 'failed' ? 'failed' : task.status === 'running' ? 'preview' : 'draft'}`}
        >
          {statusLabels[task.status] ?? task.status}
        </span>
      </td>
      <td className="small">
        {task.attempts} / {task.maxAttempts}
        {task.nextAttemptAt && task.status === 'retry-wait' && (
          <div className="muted">повтор {formatDate(task.nextAttemptAt)}</div>
        )}
      </td>
      <td className="small">
        {task.lastError && <span className="error-text">{task.lastError}</span>}
        {task.output?.reusedFrom && <span className="muted">переиспользован готовый файл</span>}
        {task.output?.assetId && !task.output.reusedFrom && (
          <img
            className="thumb"
            src={`/v1/admin/assets/${task.output.assetId}/file?w=320`}
            alt=""
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        )}
        {task.output?.problems && <span className="muted">{task.output.problems}</span>}
        {task.requestId && <div className="muted">req {task.requestId}</div>}
      </td>
      <td>
        {canRetry && (
          <button className="btn light sm" type="button" disabled={retrying} onClick={onRetry}>
            Повторить шаг
          </button>
        )}
      </td>
    </tr>
  );
}
