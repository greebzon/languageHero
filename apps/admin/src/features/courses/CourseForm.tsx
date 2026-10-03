import { useState, type FormEvent } from 'react';
import type { CourseTexts, CourseVisibility } from '@lingvohero/contracts';
import { ApiError, describeError } from '../../app/api';
import type { Asset, Course } from '../../app/types';
import { Field, GeneralErrors, Notice, prefixedId, randomSuffix } from '../../components/ui';
import { AssetPicker, previewUrl } from '../media/AssetPicker';
import { CoverGenerator } from './CoverGenerator';
import { useLanguages } from '../languages/LanguagesPage';

export type CourseFormValue = {
  id: string;
  languageCode: string;
  topic: string;
  title: string;
  description: string;
  coverAssetId: string | null;
  visibility: CourseVisibility;
  /* The card in the other interface languages (filled by «Перевести тексты» or by hand). */
  texts: CourseTexts;
};

const visibilities: { value: CourseVisibility; label: string; hint: string }[] = [
  { value: 'draft', label: 'Черновик', hint: 'не попадает в выпуск' },
  { value: 'preview', label: 'Анонс «Скоро»', hint: 'карточка без уроков, нужна обложка' },
  { value: 'published', label: 'Опубликован', hint: 'нужен хотя бы один урок' },
  { value: 'archived', label: 'Архив', hint: 'скрыт из следующего выпуска' },
];

export function CourseForm({
  course,
  cover,
  onSubmit,
  error,
  busy,
}: {
  course: Course | null;
  cover?: Asset | null;
  onSubmit: (value: CourseFormValue) => void;
  error: unknown;
  busy: boolean;
}) {
  const languages = useLanguages();
  const [form, setForm] = useState<CourseFormValue>({
    id: course?.id ?? '',
    languageCode: course?.languageCode ?? '',
    topic: course?.topic ?? '',
    title: course?.title ?? '',
    description: course?.description ?? '',
    coverAssetId: course?.coverAssetId ?? null,
    visibility: course?.visibility ?? 'draft',
    texts: course?.texts ?? {},
  });
  const [coverAsset, setCoverAsset] = useState<Asset | null>(cover ?? null);
  const [idTouched, setIdTouched] = useState(!!course);
  // Stable while the form is open, so the id only follows the title and language.
  const [suffix] = useState(randomSuffix);
  const errors = error instanceof ApiError ? error.fieldErrors : {};
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(form);
  };
  const set = <K extends keyof CourseFormValue>(key: K, value: CourseFormValue[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <form className="panel" onSubmit={submit}>
      {error instanceof ApiError && error.status === 409 && (
        <Notice tone="error">{error.message}</Notice>
      )}
      {Boolean(error) &&
        !(error instanceof ApiError && (error.status === 409 || Object.keys(errors).length)) && (
          <Notice tone="error">{describeError(error)}</Notice>
        )}
      <GeneralErrors
        errors={errors}
        known={[
          'id',
          'languageCode',
          'topic',
          'title',
          'description',
          'coverAssetId',
          'visibility',
        ]}
      />
      <div className="grid-2">
        <Field label="Язык" error={errors.languageCode}>
          <select
            value={form.languageCode}
            disabled={!!course}
            required
            onChange={(e) => {
              set('languageCode', e.target.value);
              if (!idTouched) set('id', prefixedId(e.target.value, form.title, 'set', suffix));
            }}
          >
            <option value="">— выберите —</option>
            {(languages.data ?? []).map((l) => (
              <option key={l.code} value={l.code}>
                {l.title} ({l.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Название" hint="до 100 символов" error={errors.title}>
          <input
            type="text"
            value={form.title}
            required
            onChange={(e) => {
              set('title', e.target.value);
              if (!idTouched)
                set('id', prefixedId(form.languageCode, e.target.value, 'set', suffix));
            }}
          />
        </Field>
        <Field
          label="ID сета"
          hint="постоянный, латиница; нельзя менять после публикации"
          error={errors.id}
        >
          <input
            type="text"
            value={form.id}
            disabled={!!course}
            required
            pattern="[a-z0-9][a-z0-9\-]{0,79}"
            onChange={(e) => {
              setIdTouched(true);
              set('id', e.target.value);
            }}
          />
        </Field>
        <Field label="Тема" hint="для редакторов и будущей генерации" error={errors.topic}>
          <input type="text" value={form.topic} onChange={(e) => set('topic', e.target.value)} />
        </Field>
      </div>
      <Field label="Описание на карточке" hint="до 200 символов" error={errors.description}>
        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div className="grid-2">
        {(
          [
            ['en', 'English', 'ltr'],
            ['he', 'עברית', 'rtl'],
          ] as const
        ).map(([code, label, dir]) => (
          <Field
            key={code}
            label={`Карточка — ${label}`}
            hint="для детей с этим языком приложения"
            error={errors[`texts.${code}.title`]}
            group
          >
            <input
              type="text"
              dir={dir}
              placeholder={form.title}
              maxLength={100}
              value={form.texts[code]?.title ?? ''}
              onChange={(e) =>
                set('texts', {
                  ...form.texts,
                  [code]: { ...form.texts[code], title: e.target.value },
                })
              }
            />
            <textarea
              dir={dir}
              placeholder={form.description}
              maxLength={200}
              value={form.texts[code]?.description ?? ''}
              onChange={(e) =>
                set('texts', {
                  ...form.texts,
                  [code]: {
                    title: form.texts[code]?.title ?? '',
                    description: e.target.value || null,
                  },
                })
              }
            />
          </Field>
        ))}
      </div>
      <Field
        label="Обложка"
        hint="PNG без текста — название рисует приложение; «Убрать» и «Сохранить» снимают обложку"
        error={errors.coverAssetId}
        group
      >
        <AssetPicker
          kind="image"
          value={form.coverAssetId}
          selected={coverAsset}
          onChange={(asset) => {
            setCoverAsset(asset);
            set('coverAssetId', asset?.id ?? null);
          }}
        />
        {course && <CoverGenerator courseId={course.id} />}
      </Field>
      <Field label="Видимость" error={errors.visibility}>
        <select
          value={form.visibility}
          onChange={(e) => set('visibility', e.target.value as CourseVisibility)}
        >
          {visibilities.map((v) => (
            <option key={v.value} value={v.value}>
              {v.label} — {v.hint}
            </option>
          ))}
        </select>
      </Field>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div>
          <button className="btn" type="submit" disabled={busy}>
            {course ? 'Сохранить' : 'Создать сет'}
          </button>
        </div>
        <CourseCard
          title={form.title || 'Название сета'}
          description={form.description}
          coverUrl={coverAsset ? previewUrl(coverAsset.url, 640) : null}
          lessonCount={course?.lessonCount ?? 0}
          visibility={form.visibility}
        />
      </div>
    </form>
  );
}

/** The card as the child's home screen draws it. */
export function CourseCard({
  title,
  description,
  coverUrl,
  lessonCount,
  visibility,
}: {
  title: string;
  description: string;
  coverUrl: string | null;
  lessonCount: number;
  visibility: CourseVisibility;
}) {
  return (
    <div className="course-card" aria-label="Предпросмотр карточки">
      <div className="cover">{coverUrl ? <img src={coverUrl} alt="" /> : '🌲'}</div>
      <div className="body">
        <div className="title">{title}</div>
        {description && <div className="muted small">{description}</div>}
        <div className="small" style={{ marginTop: 6 }}>
          {visibility === 'preview' ? '🔒 Скоро' : `${lessonCount} ур. · ⭐ 0 / ${lessonCount * 3}`}
        </div>
      </div>
    </div>
  );
}
