import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, describeError } from '../../app/api';
import type { GenerationJob, MascotSlot, ShopItem, ShopRarity } from '../../app/types';
import { Field, GeneralErrors, Notice, randomSuffix, slugify } from '../../components/ui';
import { AssetPicker } from '../media/AssetPicker';
import { RARITY_LABELS, SLOT_LABELS, StatusBadges, useShopItems } from './shared';
import { TranslationChips, WardrobeTextsGenerator } from './WardrobeTexts';

export function ShopItemsPage() {
  const items = useShopItems();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="page-head">
        <h1>Магазин</h1>
        <button className="btn" type="button" onClick={() => setCreating(true)}>
          + Новая вещь
        </button>
      </div>
      <p className="muted">
        Вещи для гардероба маскота. Опишите вещь или приложите картинку, укажите тип, категорию и
        цену в монетах — иконка для магазина и примерка на каждого маскота нарисуются автоматически.
        В приложение попадают только опубликованные вещи.
      </p>
      {items.data && !items.data.providerReady && (
        <Notice tone="warn">{items.data.unavailableReason}</Notice>
      )}
      {items.error && <Notice tone="error">{describeError(items.error)}</Notice>}
      <WardrobeTextsGenerator />
      {creating && <ShopItemForm onDone={() => setCreating(false)} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Вещь</th>
              <th>Тип</th>
              <th>Категория</th>
              <th>Цена</th>
              <th>Примерок</th>
              <th>Переводы</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {(items.data?.items ?? []).map((item) => (
              <tr key={item.id}>
                <td>
                  {item.iconUrl ? (
                    <img className="thumb" src={item.iconUrl} alt="" />
                  ) : (
                    <span className="thumb placeholder" />
                  )}
                </td>
                <td>
                  <Link to={`/shop/${item.id}`}>{item.name}</Link>
                  <div className="muted small">{item.description}</div>
                </td>
                <td className="small">{SLOT_LABELS[item.slot]}</td>
                <td className="small">{RARITY_LABELS[item.rarity]}</td>
                <td>{item.price} 🪙</td>
                <td>{item.layers}</td>
                <td>
                  <TranslationChips translations={item.translations} />
                </td>
                <td>
                  <StatusBadges entity={item} />
                </td>
              </tr>
            ))}
            {items.data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  Пока нет вещей. Импортировать встроенные: <code>pnpm admin:import-wardrobe</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ShopItemForm({ item, onDone }: { item?: ShopItem; onDone: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    id: item?.id ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    slot: item?.slot ?? ('head' as MascotSlot),
    rarity: item?.rarity ?? ('common' as ShopRarity),
    price: item?.price ?? 150,
    prompt: item?.prompt ?? '',
    sourceAssetId: item?.sourceAssetId ?? null,
  });
  const [touchedId, setTouchedId] = useState(!!item);
  const mutation = useMutation({
    mutationFn: () =>
      item
        ? api<{ item: ShopItem }>(`/shop-items/${item.id}`, {
            method: 'PATCH',
            body: { ...form, id: undefined },
          })
        : api<{ item: ShopItem; job: GenerationJob | null }>('/shop-items', {
            body: { ...form, idempotencyKey: crypto.randomUUID() },
          }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['shop-items'] });
      await queryClient.invalidateQueries({ queryKey: ['shop-item', form.id] });
      onDone();
      if (!item) navigate(`/shop/${result.item.id}`);
    },
  });
  const errors = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {};
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  const setName = (name: string) =>
    setForm({ ...form, name, id: touchedId ? form.id : `${slugify(name)}-${randomSuffix()}` });
  return (
    <form className="panel" onSubmit={submit}>
      <h2>{item ? `Вещь «${item.name}»` : 'Новая вещь'}</h2>
      {mutation.error && !Object.keys(errors).length && (
        <Notice tone="error">{describeError(mutation.error)}</Notice>
      )}
      <GeneralErrors
        errors={errors}
        known={['id', 'name', 'description', 'slot', 'rarity', 'price', 'prompt', 'sourceAssetId']}
      />
      <div className="grid-2">
        <Field label="Название" hint="как увидит ребёнок" error={errors.name}>
          <input type="text" value={form.name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Идентификатор" hint="латиница, цифры, дефис; постоянный" error={errors.id}>
          <input
            type="text"
            value={form.id}
            disabled={!!item}
            onChange={(e) => {
              setTouchedId(true);
              setForm({ ...form, id: e.target.value });
            }}
            required
          />
        </Field>
        <Field label="Подпись на карточке" hint="одна строка" error={errors.description}>
          <input
            type="text"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            required
          />
        </Field>
        <Field
          label="Тип"
          hint="куда вещь надевается; смена типа стирает примерки"
          error={errors.slot}
        >
          <select
            value={form.slot}
            onChange={(e) => setForm({ ...form, slot: e.target.value as MascotSlot })}
          >
            {(Object.keys(SLOT_LABELS) as MascotSlot[]).map((slot) => (
              <option key={slot} value={slot}>
                {SLOT_LABELS[slot]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Категория" error={errors.rarity}>
          <select
            value={form.rarity}
            onChange={(e) => setForm({ ...form, rarity: e.target.value as ShopRarity })}
          >
            {(Object.keys(RARITY_LABELS) as ShopRarity[]).map((r) => (
              <option key={r} value={r}>
                {RARITY_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Цена в монетах" error={errors.price}>
          <input
            type="number"
            min={1}
            max={100000}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            required
          />
        </Field>
      </div>
      <Field
        label="Как выглядит вещь"
        hint="описание для генератора; лучше по-английски"
        error={errors.prompt}
      >
        <textarea
          rows={2}
          value={form.prompt}
          onChange={(e) => setForm({ ...form, prompt: e.target.value })}
          required
        />
      </Field>
      <Field label="Своя картинка (необязательно)" hint="PNG вещи; фон уберём">
        <AssetPicker
          kind="image"
          value={form.sourceAssetId}
          onChange={(asset) => setForm({ ...form, sourceAssetId: asset?.id ?? null })}
        />
      </Field>
      <div className="row">
        <button className="btn" type="submit" disabled={mutation.isPending}>
          {item ? 'Сохранить' : 'Создать и нарисовать'}
        </button>
        <button className="btn light" type="button" onClick={onDone}>
          Отмена
        </button>
      </div>
    </form>
  );
}
