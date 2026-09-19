import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, describeError } from '../../app/api';
import type { Language } from '../../app/types';
import { Badge, Field, GeneralErrors, Notice } from '../../components/ui';

const statuses: { value: Language['status']; label: string }[] = [
  { value: 'draft', label: 'Черновик (не виден в приложении)' },
  { value: 'active', label: 'Активен (попадёт в выпуск)' },
  { value: 'archived', label: 'Архив (скрыт вместе с сетами)' },
];

export function useLanguages() {
  return useQuery({
    queryKey: ['languages'],
    queryFn: () => api<{ items: Language[] }>('/languages').then((r) => r.items),
  });
}

export function LanguagesPage() {
  const languages = useLanguages();
  const [editing, setEditing] = useState<Language | 'new' | null>(null);
  return (
    <>
      <div className="page-head">
        <h1>Языки</h1>
        <button className="btn" type="button" onClick={() => setEditing('new')}>
          + Новый язык
        </button>
      </div>
      <p className="muted">
        Код языка постоянный и совпадает с кодом в каталоге приложения (например <code>en</code>,{' '}
        <code>pt-br</code>). Изменение статуса попадает в приложение только со следующим выпуском.
      </p>
      {languages.error && <Notice tone="error">{describeError(languages.error)}</Notice>}
      {editing && (
        <LanguageForm
          language={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Код</th>
              <th>Название</th>
              <th>Статус</th>
              <th>Сетов</th>
              <th>Опубликован</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(languages.data ?? []).map((language) => (
              <tr key={language.code}>
                <td>
                  <code>{language.code}</code>
                </td>
                <td>{language.title}</td>
                <td>
                  <Badge value={language.status} />
                </td>
                <td>{language.courseCount}</td>
                <td className="muted small">{language.publishedAt ? 'да' : 'нет'}</td>
                <td>
                  <button className="link" type="button" onClick={() => setEditing(language)}>
                    Изменить
                  </button>
                </td>
              </tr>
            ))}
            {languages.data?.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Пока нет языков.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function LanguageForm({ language, onDone }: { language: Language | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: language?.code ?? '',
    title: language?.title ?? '',
    direction: language?.direction ?? 'ltr',
    locale: language?.locale ?? '',
    status: language?.status ?? 'draft',
    titles: language?.titles ?? {},
  });
  const mutation = useMutation({
    mutationFn: () => {
      const body = { ...form, locale: form.locale || null };
      return language
        ? api(`/languages/${language.code}`, {
            method: 'PATCH',
            body: { ...body, code: undefined },
          })
        : api('/languages', { body });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['languages'] });
      onDone();
    },
  });
  const errors = mutation.error instanceof ApiError ? mutation.error.fieldErrors : {};
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate();
  };
  return (
    <form className="panel" onSubmit={submit}>
      <h2>{language ? `Язык ${language.code}` : 'Новый язык'}</h2>
      {mutation.error && !Object.keys(errors).length && (
        <Notice tone="error">{describeError(mutation.error)}</Notice>
      )}
      <GeneralErrors errors={errors} known={['code', 'title', 'direction', 'locale', 'status']} />
      <div className="grid-2">
        <Field label="Код" hint="строчные латинские буквы, цифры, дефис" error={errors.code}>
          <input
            type="text"
            value={form.code}
            disabled={!!language}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            required
          />
        </Field>
        <Field label="Название" hint="как увидит ребёнок" error={errors.title}>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </Field>
        <Field label="Направление письма" error={errors.direction}>
          <select
            value={form.direction}
            onChange={(e) => setForm({ ...form, direction: e.target.value as 'ltr' | 'rtl' })}
          >
            <option value="ltr">Слева направо</option>
            <option value="rtl">Справа налево (RTL пока не проверен)</option>
          </select>
        </Field>
        <Field
          label="Название на других языках приложения"
          hint="как язык называется в английском и ивритском интерфейсе"
          group
        >
          <input
            type="text"
            placeholder="English: например German"
            value={form.titles.en ?? ''}
            onChange={(e) => setForm({ ...form, titles: { ...form.titles, en: e.target.value } })}
          />
          <input
            type="text"
            dir="rtl"
            placeholder="עברית: למשל גרמנית"
            value={form.titles.he ?? ''}
            onChange={(e) => setForm({ ...form, titles: { ...form.titles, he: e.target.value } })}
          />
        </Field>
        <Field label="Locale озвучки" hint="например en-US; пока справочно" error={errors.locale}>
          <input
            type="text"
            value={form.locale}
            onChange={(e) => setForm({ ...form, locale: e.target.value })}
          />
        </Field>
        <Field label="Статус" error={errors.status}>
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as Language['status'] })}
          >
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row">
        <button className="btn" type="submit" disabled={mutation.isPending}>
          Сохранить
        </button>
        <button className="btn light" type="button" onClick={onDone}>
          Отмена
        </button>
      </div>
    </form>
  );
}
