import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, describeError } from '../../app/api';
import type { GenerationView, Mascot, MascotDetail, MascotSlot } from '../../app/types';
import { Badge, Crumbs, Notice, formatDate } from '../../components/ui';
import { MascotForm } from './MascotsPage';
import { RARITY_LABELS, SLOT_LABELS, Stage, StatusBadges } from './shared';
import { WardrobeTranslations } from './WardrobeTexts';

export function MascotPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['mascot', id],
    queryFn: () => api<MascotDetail>(`/mascots/${id}`),
    refetchInterval: (q) => (q.state.data?.mascot.activeJobId ? 3_000 : false),
  });
  const [editing, setEditing] = useState(false);
  const [highlight, setHighlight] = useState<MascotSlot | undefined>();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['mascot', id] });
  const generate = useMutation({
    mutationFn: (input: { scope: 'all' | 'layers'; targetId?: string }) =>
      api<GenerationView>(`/mascots/${id}/generate`, {
        body: { ...input, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: (published: boolean) =>
      api<{ mascot: Mascot }>(`/mascots/${id}`, { method: 'PATCH', body: { published } }),
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['mascots'] });
    },
  });
  const saveTexts = useMutation({
    mutationFn: (texts: Mascot['texts']) =>
      api<{ mascot: Mascot }>(`/mascots/${id}`, { method: 'PATCH', body: { texts } }),
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['mascots'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/mascots/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['mascots'] });
      navigate('/mascots');
    },
  });
  if (query.isLoading) return <p className="muted">Загрузка…</p>;
  if (query.error || !query.data) return <Notice tone="error">{describeError(query.error)}</Notice>;
  const { mascot, items, jobs } = query.data;
  const busy = !!mascot.activeJobId;
  const actionError = generate.error ?? publish.error ?? remove.error;
  return (
    <>
      <Crumbs items={[{ to: '/mascots', label: 'Маскоты' }, { label: mascot.name }]} />
      <div className="page-head">
        <h1>
          {mascot.name} <StatusBadges entity={mascot} />
        </h1>
        <span className="row">
          <button
            className="btn"
            type="button"
            disabled={busy || generate.isPending}
            onClick={() => generate.mutate({ scope: 'all' })}
          >
            Нарисовать всё заново
          </button>
          <button
            className="btn light"
            type="button"
            disabled={busy || generate.isPending || !mascot.ready}
            onClick={() => generate.mutate({ scope: 'layers' })}
          >
            Перерисовать примерки
          </button>
          <button
            className={`btn ${mascot.published ? 'light' : 'amber'}`}
            type="button"
            disabled={publish.isPending || (!mascot.published && !mascot.ready)}
            onClick={() => publish.mutate(!mascot.published)}
          >
            {mascot.published ? 'Снять с публикации' : 'Опубликовать'}
          </button>
        </span>
      </div>
      <p className="muted small">
        {mascot.trait} · {mascot.perk} · открывается на уровне {mascot.unlockLevel} · создан{' '}
        {formatDate(mascot.createdAt)}
        {busy && (
          <>
            {' '}
            · <Link to={`/generations/${mascot.activeJobId}`}>идёт генерация</Link>
          </>
        )}
      </p>
      {actionError && <Notice tone="error">{describeError(actionError)}</Notice>}
      {!mascot.ready && !busy && (
        <Notice tone="warn">
          У маскота нет тела, портрета или разметки зон. Нажмите «Нарисовать всё заново» — примерка
          вещей появится следом.
        </Notice>
      )}

      <div className="grid-2">
        <div className="panel">
          <h2>Тело и зоны</h2>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <Stage bodyUrl={mascot.bodyUrl} slots={mascot.slots} highlight={highlight} />
            <div className="stack">
              {mascot.portraitUrl && <img className="thumb lg" src={mascot.portraitUrl} alt="" />}
              {mascot.sourceUrl && (
                <span className="muted small">
                  Исходник: <a href={mascot.sourceUrl}>картинка</a>
                </span>
              )}
              {mascot.slots && (
                <ul className="small">
                  {(Object.keys(mascot.slots) as MascotSlot[]).map((slot) => (
                    <li
                      key={slot}
                      onMouseEnter={() => setHighlight(slot)}
                      onMouseLeave={() => setHighlight(undefined)}
                    >
                      {SLOT_LABELS[slot]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="page-head">
            <h2>Описание</h2>
            <button className="btn light sm" type="button" onClick={() => setEditing(!editing)}>
              {editing ? 'Скрыть' : 'Изменить'}
            </button>
          </div>
          {editing ? (
            <MascotForm mascot={mascot} onDone={() => setEditing(false)} />
          ) : (
            <>
              <p className="small">{mascot.description}</p>
              <p className="muted small">
                <code>{mascot.id}</code> · «вместе с {mascot.withName}»
              </p>
            </>
          )}
          <button
            className="link danger"
            type="button"
            disabled={mascot.published || remove.isPending}
            onClick={() => {
              if (confirm(`Удалить маскота «${mascot.name}» и его примерки?`)) remove.mutate();
            }}
          >
            Удалить маскота
          </button>
        </div>
      </div>

      <WardrobeTranslations
        fields={[
          { key: 'name', label: 'Имя', max: 40 },
          { key: 'withName', label: 'После «вместе с» / «with»', max: 40 },
          { key: 'trait', label: 'Характер', max: 60 },
          { key: 'perk', label: 'Особенность', max: 80 },
        ]}
        source={mascot}
        texts={mascot.texts}
        translations={mascot.translations}
        saving={saveTexts.isPending}
        error={saveTexts.error}
        onSave={(texts) => saveTexts.mutate(texts)}
      />

      <div className="panel">
        <div className="page-head">
          <h2>Примерка вещей</h2>
          <span className="muted small">
            {items.filter((i) => i.layer).length} из {items.length} вещей примерено
          </span>
        </div>
        <div className="media-grid">
          {items.map(({ item, layer }) => (
            <div key={item.id} className="media-tile static">
              <Stage
                bodyUrl={mascot.bodyUrl}
                layer={
                  layer && { url: layer.url!, box: layer.box, replaces: item.slot === 'outfit' }
                }
                width={140}
              />
              <span className="small">
                <Link to={`/shop/${item.id}`}>{item.name}</Link>
              </span>
              <span className="muted small">
                {SLOT_LABELS[item.slot]} · {RARITY_LABELS[item.rarity]}
              </span>
              {layer ? (
                <button
                  className="link"
                  type="button"
                  disabled={busy || generate.isPending}
                  onClick={() => generate.mutate({ scope: 'layers', targetId: item.id })}
                >
                  Перерисовать
                </button>
              ) : (
                <span className="muted small">
                  {item.ready ? 'Ещё не примерено' : 'У вещи нет иконки'}
                </span>
              )}
            </div>
          ))}
          {items.length === 0 && <p className="muted">В магазине пока нет вещей.</p>}
        </div>
      </div>

      {jobs.length > 0 && (
        <div className="panel">
          <h2>Генерации</h2>
          <ul className="small">
            {jobs.map((job) => (
              <li key={job.id}>
                <Link to={`/generations/${job.id}`}>{formatDate(job.createdAt)}</Link>{' '}
                <Badge value={job.status} /> · {job.usage.images} картинок · ≈{' '}
                {job.usage.estimatedUsd.toFixed(2)} $
                {job.error && <span className="error-text"> · {job.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
