import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, describeError } from '../../app/api';
import type { GenerationView, ShopItem, ShopItemDetail } from '../../app/types';
import { Badge, Crumbs, Notice, formatDate } from '../../components/ui';
import { ShopItemForm } from './ShopItemsPage';
import { RARITY_LABELS, SLOT_LABELS, Stage, StatusBadges } from './shared';
import { WardrobeTranslations } from './WardrobeTexts';

export function ShopItemPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['shop-item', id],
    queryFn: () => api<ShopItemDetail>(`/shop-items/${id}`),
    refetchInterval: (q) => (q.state.data?.item.activeJobId ? 3_000 : false),
  });
  const [editing, setEditing] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['shop-item', id] });
  const generate = useMutation({
    mutationFn: (input: { scope: 'all' | 'layers'; targetId?: string }) =>
      api<GenerationView>(`/shop-items/${id}/generate`, {
        body: { ...input, idempotencyKey: crypto.randomUUID() },
      }),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: (published: boolean) =>
      api<{ item: ShopItem }>(`/shop-items/${id}`, { method: 'PATCH', body: { published } }),
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['shop-items'] });
    },
  });
  const saveTexts = useMutation({
    mutationFn: (texts: ShopItem['texts']) =>
      api<{ item: ShopItem }>(`/shop-items/${id}`, { method: 'PATCH', body: { texts } }),
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['shop-items'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/shop-items/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['shop-items'] });
      navigate('/shop');
    },
  });
  if (query.isLoading) return <p className="muted">Загрузка…</p>;
  if (query.error || !query.data) return <Notice tone="error">{describeError(query.error)}</Notice>;
  const { item, mascots, jobs } = query.data;
  const busy = !!item.activeJobId;
  const actionError = generate.error ?? publish.error ?? remove.error;
  return (
    <>
      <Crumbs items={[{ to: '/shop', label: 'Магазин' }, { label: item.name }]} />
      <div className="page-head">
        <h1>
          {item.name} <StatusBadges entity={item} />
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
            disabled={busy || generate.isPending || !item.ready}
            onClick={() => generate.mutate({ scope: 'layers' })}
          >
            Перерисовать примерки
          </button>
          <button
            className={`btn ${item.published ? 'light' : 'amber'}`}
            type="button"
            disabled={publish.isPending || (!item.published && !item.ready)}
            onClick={() => publish.mutate(!item.published)}
          >
            {item.published ? 'Снять с публикации' : 'Опубликовать'}
          </button>
        </span>
      </div>
      <p className="muted small">
        {SLOT_LABELS[item.slot]} · {RARITY_LABELS[item.rarity]} · {item.price} 🪙 · создана{' '}
        {formatDate(item.createdAt)}
        {busy && (
          <>
            {' '}
            · <Link to={`/generations/${item.activeJobId}`}>идёт генерация</Link>
          </>
        )}
      </p>
      {actionError && <Notice tone="error">{describeError(actionError)}</Notice>}

      <div className="grid-2">
        <div className="panel">
          <h2>Иконка</h2>
          {item.iconUrl ? (
            <img className="thumb xl" src={item.iconUrl} alt="" />
          ) : (
            <p className="muted small">Иконка ещё не нарисована.</p>
          )}
          {item.sourceUrl && (
            <p className="muted small">
              Исходник: <a href={item.sourceUrl}>картинка</a>
            </p>
          )}
        </div>
        <div className="panel">
          <div className="page-head">
            <h2>Описание</h2>
            <button className="btn light sm" type="button" onClick={() => setEditing(!editing)}>
              {editing ? 'Скрыть' : 'Изменить'}
            </button>
          </div>
          {editing ? (
            <ShopItemForm item={item} onDone={() => setEditing(false)} />
          ) : (
            <>
              <p className="small">{item.description}</p>
              <p className="small">{item.prompt}</p>
              <p className="muted small">
                <code>{item.id}</code>
              </p>
            </>
          )}
          <button
            className="link danger"
            type="button"
            disabled={item.published || remove.isPending}
            onClick={() => {
              if (confirm(`Удалить вещь «${item.name}» и её примерки?`)) remove.mutate();
            }}
          >
            Удалить вещь
          </button>
        </div>
      </div>

      <WardrobeTranslations
        fields={[
          { key: 'name', label: 'Название', max: 40 },
          { key: 'description', label: 'Описание', max: 120 },
        ]}
        source={item}
        texts={item.texts}
        translations={item.translations}
        saving={saveTexts.isPending}
        error={saveTexts.error}
        onSave={(texts) => saveTexts.mutate(texts)}
      />

      <div className="panel">
        <div className="page-head">
          <h2>На маскотах</h2>
          <span className="muted small">
            {mascots.filter((m) => m.layer).length} из {mascots.length} примерено
          </span>
        </div>
        <div className="media-grid">
          {mascots.map(({ mascot, layer }) => (
            <div key={mascot.id} className="media-tile static">
              <Stage
                bodyUrl={mascot.bodyUrl}
                layer={
                  layer && { url: layer.url!, box: layer.box, replaces: item.slot === 'outfit' }
                }
                width={140}
              />
              <span className="small">
                <Link to={`/mascots/${mascot.id}`}>{mascot.name}</Link>
              </span>
              {layer ? (
                <button
                  className="link"
                  type="button"
                  disabled={busy || generate.isPending}
                  onClick={() => generate.mutate({ scope: 'layers', targetId: mascot.id })}
                >
                  Перерисовать
                </button>
              ) : (
                <span className="muted small">
                  {mascot.ready ? 'Ещё не примерено' : 'Маскот не готов'}
                </span>
              )}
            </div>
          ))}
          {mascots.length === 0 && <p className="muted">Пока нет маскотов.</p>}
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
