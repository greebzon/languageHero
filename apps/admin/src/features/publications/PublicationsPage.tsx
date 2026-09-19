import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, describeError } from '../../app/api';
import type {
  BuildIssue,
  BuildWarning,
  CatalogDiff,
  PlanResponse,
  Publication,
} from '../../app/types';
import { Badge, Notice, formatDate } from '../../components/ui';
import { ValidationReport } from '../courses/CoursePage';

type ListResponse = { items: Publication[]; currentRevision: number; lockPresent: boolean };
type InvalidRelease = { errors: BuildIssue[]; warnings: BuildWarning[] };

export function PublicationsPage() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['publications'],
    queryFn: () => api<ListResponse>('/publications?limit=50'),
  });
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [invalid, setInvalid] = useState<InvalidRelease | null>(null);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['publications'] });
  const onPlanError = (error: unknown) => {
    setPlan(null);
    const body = error instanceof ApiError ? (error.body as Partial<InvalidRelease> | null) : null;
    setInvalid(body?.errors ? { errors: body.errors, warnings: body.warnings ?? [] } : null);
  };
  const prepare = useMutation({
    mutationFn: () => api<PlanResponse>('/publication-plans', { method: 'POST' }),
    onSuccess: (r) => {
      setPlan(r);
      setInvalid(null);
    },
    onError: onPlanError,
  });
  const restore = useMutation({
    mutationFn: (revision: number) =>
      api<PlanResponse>('/publication-plans/restore', { body: { revision } }),
    onSuccess: (r) => {
      setPlan(r);
      setInvalid(null);
    },
    onError: onPlanError,
  });
  const publish = useMutation({
    mutationFn: (planId: string) =>
      api<{ publication: Publication }>('/publications', { body: { planId } }),
    onSuccess: async () => {
      setPlan(null);
      await invalidate();
    },
    onError: () => void invalidate(),
  });
  const data = list.data;
  return (
    <>
      <div className="page-head">
        <h1>Выпуски</h1>
        <span className="row">
          <span className="muted small">Опубликована ревизия #{data?.currentRevision ?? '…'}</span>
          <button
            className="btn"
            type="button"
            disabled={prepare.isPending || publish.isPending}
            onClick={() => prepare.mutate()}
          >
            Подготовить выпуск
          </button>
        </span>
      </div>
      <p className="muted small">
        Выпуск собирает все активные языки, опубликованные сеты и анонсы целиком. Сначала план и
        список изменений, публикация — отдельной кнопкой. Каталог в приложении обновляется при
        запуске, возврате и по кнопке «Обновить».
      </p>
      {data?.lockPresent && (
        <Notice tone="warn">
          В хранилище есть файл <code>.publish.lock</code>: идёт публикация из консоли или она
          аварийно прервалась. Панель не удаляет его сама — проверьте процесс и удалите файл
          вручную.
        </Notice>
      )}
      {list.error && <Notice tone="error">{describeError(list.error)}</Notice>}
      {prepare.error && !invalid && <Notice tone="error">{describeError(prepare.error)}</Notice>}
      {restore.error && !invalid && <Notice tone="error">{describeError(restore.error)}</Notice>}
      {publish.error && <Notice tone="error">{describeError(publish.error)}</Notice>}
      {publish.isSuccess && (
        <Notice tone="success">
          Выпуск #{publish.data.publication.targetRevision} опубликован. В приложении нажмите
          «Обновить».
        </Notice>
      )}
      {invalid && (
        <ValidationReport ok={false} errors={invalid.errors} warnings={invalid.warnings} />
      )}
      {plan && (
        <div className="panel">
          <h2>
            План выпуска #{plan.publication.targetRevision}{' '}
            {plan.publication.kind === 'restore' && <Badge value="restore" />}
          </h2>
          <p className="muted small">
            На основе ревизии #{plan.publication.baseCatalogRevision} · языков{' '}
            {plan.publication.summary.languages}, сетов {plan.publication.summary.courses}, анонсов{' '}
            {plan.publication.summary.previews}, уроков {plan.publication.summary.lessons}
          </p>
          <DiffView diff={plan.diff} />
          {plan.warnings.length > 0 && (
            <Notice tone="warn">
              <ul>
                {plan.warnings.map((w, i) => (
                  <li key={i}>
                    {w.entity === 'course' ? <Link to={`/courses/${w.id}`}>{w.id}</Link> : w.id}:{' '}
                    {w.message}
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          <div className="row">
            <button
              className="btn amber"
              type="button"
              disabled={publish.isPending}
              onClick={() => publish.mutate(plan.publication.id)}
            >
              {publish.isPending ? 'Публикуем…' : 'Опубликовать'}
            </button>
            <button className="btn light" type="button" onClick={() => setPlan(null)}>
              Отменить план
            </button>
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ревизия</th>
              <th>Тип</th>
              <th>Статус</th>
              <th>Автор</th>
              <th>Когда</th>
              <th>Состав</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((p) => (
              <tr key={p.id}>
                <td>
                  #{p.targetRevision}{' '}
                  <span className="muted small">← #{p.baseCatalogRevision}</span>
                </td>
                <td>{p.kind === 'restore' ? 'откат' : 'выпуск'}</td>
                <td>
                  <Badge value={p.status} />
                  {p.error && <div className="error-text">{p.error}</div>}
                </td>
                <td>{p.actorLogin ?? '—'}</td>
                <td className="muted small">{formatDate(p.finishedAt ?? p.createdAt)}</td>
                <td className="small">
                  {p.summary.languages} яз. · {p.summary.courses} сет. · {p.summary.lessons} ур.
                </td>
                <td>
                  {p.status === 'published' && p.targetRevision !== data?.currentRevision && (
                    <button
                      className="link"
                      type="button"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(p.targetRevision)}
                    >
                      Восстановить
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Панель ещё ничего не публиковала.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function DiffView({ diff }: { diff: CatalogDiff }) {
  const rows: { label: string; items: string[] }[] = [
    { label: 'Новые языки', items: diff.languages.added },
    { label: 'Скрытые языки', items: diff.languages.removed },
    { label: 'Новые сеты', items: diff.courses.added },
    { label: 'Изменённые сеты', items: diff.courses.changed },
    { label: 'Скрытые сеты', items: diff.courses.removed },
    { label: 'Новые анонсы', items: diff.previews.added },
    { label: 'Снятые анонсы', items: diff.previews.removed },
  ].filter((r) => r.items.length);
  const empty = rows.length === 0 && diff.lessons.length === 0;
  return (
    <div className="stack" style={{ marginBottom: 14 }}>
      {empty && <p className="muted">Изменений по сравнению с текущим каталогом нет.</p>}
      {rows.map((r) => (
        <div key={r.label}>
          <strong>{r.label}:</strong> {r.items.join(', ')}
        </div>
      ))}
      {diff.lessons.length > 0 && (
        <div>
          <strong>Версии уроков:</strong>
          <ul className="diff-list">
            {diff.lessons.map((l) => (
              <li key={l.id}>
                <Link to={`/lessons/${l.id}`}>{l.title}</Link> —{' '}
                {l.from ? `v${l.from} → v${l.to}` : `новый, v${l.to}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
