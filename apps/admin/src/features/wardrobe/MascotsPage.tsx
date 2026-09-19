import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, describeError } from '../../app/api';
import type { GenerationJob, Mascot } from '../../app/types';
import { Field, GeneralErrors, Notice, randomSuffix, slugify } from '../../components/ui';
import { AssetPicker } from '../media/AssetPicker';
import { StatusBadges, useMascots } from './shared';
import { TranslationChips, WardrobeTextsGenerator } from './WardrobeTexts';

export function MascotsPage() {
  const mascots = useMascots();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="page-head">
        <h1>Маскоты</h1>
        <button className="btn" type="button" onClick={() => setCreating(true)}>
          + Новый маскот
        </button>
      </div>
      <p className="muted">
        Спутники ребёнка. Для нового маскота достаточно описания — тело, портрет, разметка зон и
        примерка всех вещей магазина рисуются автоматически. Можно приложить свою картинку: тогда
        персонаж будет вырезан из неё.
      </p>
      {mascots.data && !mascots.data.providerReady && (
        <Notice tone="warn">{mascots.data.unavailableReason}</Notice>
      )}
      {mascots.error && <Notice tone="error">{describeError(mascots.error)}</Notice>}
      <WardrobeTextsGenerator />
      {creating && <MascotForm onDone={() => setCreating(false)} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>Маскот</th>
              <th>Характер</th>
              <th>Примерок</th>
              <th>Переводы</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(mascots.data?.items ?? []).map((m) => (
              <tr key={m.id}>
                <td>
                  {m.portraitUrl ? (
                    <img className="thumb" src={m.portraitUrl} alt="" />
                  ) : (
                    <span className="thumb placeholder" />
                  )}
                </td>
                <td>
                  <Link to={`/mascots/${m.id}`}>{m.name}</Link>
                  <div className="muted small">
                    <code>{m.id}</code>
                  </div>
                </td>
                <td className="small">{m.trait}</td>
                <td>{m.layers}</td>
                <td>
                  <TranslationChips translations={m.translations} />
                </td>
                <td>
                  <StatusBadges entity={m} />
                </td>
                <td>
                  <Link to={`/mascots/${m.id}`}>Открыть</Link>
                </td>
              </tr>
            ))}
            {mascots.data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Пока нет маскотов. Импортировать четырёх встроенных:{' '}
                  <code>pnpm admin:import-wardrobe</code>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function MascotForm({ mascot, onDone }: { mascot?: Mascot; onDone: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    unlockLevel: mascot?.unlockLevel ?? 1,
    id: mascot?.id ?? '',
    name: mascot?.name ?? '',
    withName: mascot?.withName ?? '',
    trait: mascot?.trait ?? '',
    perk: mascot?.perk ?? '',
    description: mascot?.description ?? '',
    sourceAssetId: mascot?.sourceAssetId ?? null,
  });
  const [touchedId, setTouchedId] = useState(!!mascot);
  const mutation = useMutation({
    mutationFn: () =>
      mascot
        ? api<{ mascot: Mascot }>(`/mascots/${mascot.id}`, {
            method: 'PATCH',
            body: { ...form, id: undefined },
          })
        : api<{ mascot: Mascot; job: GenerationJob | null }>('/mascots', {
            body: { ...form, idempotencyKey: crypto.randomUUID() },
          }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['mascots'] });
      await queryClient.invalidateQueries({ queryKey: ['mascot', form.id] });
      onDone();
      if (!mascot) navigate(`/mascots/${result.mascot.id}`);
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
      <h2>{mascot ? `Маскот «${mascot.name}»` : 'Новый маскот'}</h2>
      {mutation.error && !Object.keys(errors).length && (
        <Notice tone="error">{describeError(mutation.error)}</Notice>
      )}
      <GeneralErrors
        errors={errors}
        known={[
          'unlockLevel',
          'id',
          'name',
          'withName',
          'trait',
          'perk',
          'description',
          'sourceAssetId',
        ]}
      />
      <div className="grid-2">
        <Field
          label="Уровень открытия"
          hint="Уже открытые персонажи остаются доступны. Тим всегда доступен с уровня 1."
          error={errors.unlockLevel}
        >
          <input
            type="number"
            min={1}
            max={1000}
            required
            disabled={form.id === 'fox'}
            value={form.id === 'fox' ? 1 : form.unlockLevel}
            onChange={(e) => setForm({ ...form, unlockLevel: Number(e.target.value) })}
          />
        </Field>
        <Field label="Имя" hint="как увидит ребёнок, например «Лисёнок Тим»" error={errors.name}>
          <input type="text" value={form.name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Идентификатор" hint="латиница, цифры, дефис; постоянный" error={errors.id}>
          <input
            type="text"
            value={form.id}
            disabled={!!mascot}
            onChange={(e) => {
              setTouchedId(true);
              setForm({ ...form, id: e.target.value });
            }}
            required
          />
        </Field>
        <Field label="Имя в творительном падеже" hint="«вместе с …»" error={errors.withName}>
          <input
            type="text"
            value={form.withName}
            onChange={(e) => setForm({ ...form, withName: e.target.value })}
            required
          />
        </Field>
        <Field
          label="Черта характера"
          hint="например «Любознательный следопыт»"
          error={errors.trait}
        >
          <input
            type="text"
            value={form.trait}
            onChange={(e) => setForm({ ...form, trait: e.target.value })}
            required
          />
        </Field>
        <Field label="Чем помогает" hint="коротко, показывается на карточке" error={errors.perk}>
          <input
            type="text"
            value={form.perk}
            onChange={(e) => setForm({ ...form, perk: e.target.value })}
            required
          />
        </Field>
      </div>
      <Field
        label="Описание внешности"
        hint="по нему рисуется персонаж, если нет картинки; лучше по-английски"
        error={errors.description}
      >
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          required
        />
      </Field>
      <Field
        label="Своя картинка (необязательно)"
        hint="PNG с персонажем в полный рост; фон уберём"
      >
        <AssetPicker
          kind="image"
          value={form.sourceAssetId}
          onChange={(asset) => setForm({ ...form, sourceAssetId: asset?.id ?? null })}
        />
      </Field>
      <div className="row">
        <button className="btn" type="submit" disabled={mutation.isPending}>
          {mascot ? 'Сохранить' : 'Создать и нарисовать'}
        </button>
        <button className="btn light" type="button" onClick={onDone}>
          Отмена
        </button>
      </div>
    </form>
  );
}
