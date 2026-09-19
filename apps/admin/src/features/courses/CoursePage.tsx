import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, describeError } from '../../app/api';
import type {
  BuildIssue,
  BuildWarning,
  Course,
  GenerationJob,
  Lesson,
  LessonSummary,
} from '../../app/types';
import {
  Badge,
  Crumbs,
  Field,
  Notice,
  formatDate,
  prefixedId,
  randomSuffix,
  slugify,
} from '../../components/ui';
import { useLanguages } from '../languages/LanguagesPage';
import { useGenerationSettings } from '../generation/WizardPage';
import { CourseForm, type CourseFormValue } from './CourseForm';
import { TextsGenerator } from './TextsGenerator';
import { TranslationChips } from '../lessons/TranslationsEditor';

type CourseResponse = { course: Course; lessons: LessonSummary[] };

export function useCourse(id: string) {
  return useQuery({
    queryKey: ['course', id],
    queryFn: () => api<CourseResponse>(`/courses/${id}`),
  });
}

export function CoursePage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const query = useCourse(id);
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['course', id] }),
      queryClient.invalidateQueries({ queryKey: ['courses'] }),
    ]);
  const save = useMutation({
    mutationFn: (value: CourseFormValue) =>
      api<{ course: Course }>(`/courses/${id}`, {
        method: 'PATCH',
        body: {
          topic: value.topic || null,
          title: value.title,
          description: value.description || null,
          coverAssetId: value.coverAssetId,
          visibility: value.visibility,
          texts: value.texts,
          editRevision: query.data!.course.editRevision,
        },
      }),
    onSuccess: invalidate,
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api(`/courses/${id}/lesson-order`, {
        method: 'PUT',
        body: { ids, editRevision: query.data!.course.editRevision },
      }),
    onSuccess: invalidate,
  });
  const jobs = useQuery({
    queryKey: ['course-generations', id],
    queryFn: () =>
      api<{ items: GenerationJob[] }>(`/courses/${id}/generations`).then((r) => r.items),
    refetchInterval: (q) =>
      q.state.data?.some((j) => j.status === 'queued' || j.status === 'running') ? 3_000 : false,
  });
  const validate = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; errors: BuildIssue[]; warnings: BuildWarning[] }>(
        `/courses/${id}/validate`,
        { method: 'POST' },
      ),
  });
  if (query.isLoading) return <p className="muted">Загрузка…</p>;
  if (query.error || !query.data) return <Notice tone="error">{describeError(query.error)}</Notice>;
  const { course, lessons } = query.data;
  const stale = (error: unknown) => error instanceof ApiError && error.status === 409;
  const move = (index: number, delta: number) => {
    const ids = lessons.map((l) => l.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  };
  return (
    <>
      <Crumbs items={[{ to: '/courses', label: 'Сеты' }, { label: course.title }]} />
      <div className="page-head">
        <h1>
          {course.title} <Badge value={course.visibility} />
        </h1>
        <span className="muted small">
          <code>{course.id}</code> · язык <code>{course.languageCode}</code>
          {course.publishedRevision && ` · в выпуске #${course.publishedRevision}`}
        </span>
      </div>
      {(stale(save.error) || stale(reorder.error)) && (
        <Notice tone="error">
          Сет изменили в другом окне.{' '}
          <button className="link" type="button" onClick={() => void invalidate()}>
            Обновить данные
          </button>{' '}
          и повторите правку.
        </Notice>
      )}
      {save.isSuccess && <Notice tone="success">Сохранено.</Notice>}
      {jobs.data?.find((j) => j.kind === 'course') && (
        <JobBanner job={jobs.data.find((j) => j.kind === 'course')!} />
      )}
      <CourseForm
        key={course.editRevision}
        course={course}
        cover={course.cover}
        onSubmit={(value) => save.mutate(value)}
        error={stale(save.error) ? null : save.error}
        busy={save.isPending}
      />

      <div className="panel">
        <div className="page-head">
          <h2>Уроки</h2>
          <span className="row">
            <button
              className="btn light"
              type="button"
              disabled={validate.isPending}
              onClick={() => validate.mutate()}
            >
              Проверить сет
            </button>
            <NewLessonButton course={course} onCreated={invalidate} />
            <Link className="btn amber" to={`/courses/${course.id}/generate`}>
              ✨ Черновик с ИИ
            </Link>
          </span>
        </div>
        <CloneForm course={course} lessons={lessons} />
        <TextsGenerator courseId={course.id} />
        {validate.data && (
          <ValidationReport
            ok={validate.data.ok}
            errors={validate.data.errors}
            warnings={validate.data.warnings}
          />
        )}
        {reorder.error && !stale(reorder.error) && (
          <Notice tone="error">{describeError(reorder.error)}</Notice>
        )}
        {course.visibility === 'published' && course.publishedRevision && (
          <p className="muted small">
            Добавление или удаление уроков в опубликованном сете меняет дробь прогресса у детей:
            заработанный доступ и награды сохраняются, но проценты пересчитываются по новому
            составу.
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Порядок</th>
                <th>Урок</th>
                <th>Заданий</th>
                <th>Слов</th>
                <th>Переводы</th>
                <th>Версия</th>
                <th>Изменён</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson, index) => (
                <tr key={lesson.id}>
                  <td>
                    <span className="row">
                      <button
                        className="btn light sm"
                        type="button"
                        aria-label="Выше"
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        className="btn light sm"
                        type="button"
                        aria-label="Ниже"
                        disabled={index === lessons.length - 1 || reorder.isPending}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  </td>
                  <td>
                    <Link to={`/lessons/${lesson.id}`}>{lesson.title}</Link>
                    <div className="muted small">
                      <code>{lesson.id}</code>
                    </div>
                  </td>
                  <td>{lesson.exerciseCount}</td>
                  <td>{lesson.wordCount}</td>
                  <td>
                    <TranslationChips translations={lesson.translations} />
                  </td>
                  <td className="muted small">
                    {lesson.lastPublishedVersion ? `v${lesson.lastPublishedVersion}` : 'не издан'}
                  </td>
                  <td className="muted small">{formatDate(lesson.updatedAt)}</td>
                </tr>
              ))}
              {lessons.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted">
                    Уроков пока нет. Опубликованному сету нужен хотя бы один.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Copy the set into another language as is, or translate it with AI keeping the pictures. */
function CloneForm({ course, lessons }: { course: Course; lessons: LessonSummary[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const languages = useLanguages();
  const settings = useGenerationSettings();
  const [open, setOpen] = useState(false);
  const [suffix] = useState(randomSuffix);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const others = (languages.data ?? []).filter((l) => l.code !== course.languageCode);
  const [form, setForm] = useState({
    languageCode: '',
    title: course.title,
    id: '',
    idTouched: false,
    mode: 'translate' as 'translate' | 'copy',
  });
  const languageCode = form.languageCode || others[0]?.code || '';
  const id = form.idTouched ? form.id : prefixedId(languageCode, form.title, 'set', suffix);
  const providerReady = settings.data?.providerReady ?? false;
  const mode = form.mode === 'translate' && !providerReady ? 'copy' : form.mode;
  const clone = useMutation({
    mutationFn: () =>
      api<{ course: Course; job: { job: { id: string } } | null }>(`/courses/${course.id}/clone`, {
        body: { languageCode, id, title: form.title, mode, idempotencyKey },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
      navigate(result.job ? `/generations/${result.job.job.id}` : `/courses/${result.course.id}`);
    },
    // A rejected request did not create anything: the next attempt may use a fresh key.
    onError: () => setIdempotencyKey(crypto.randomUUID()),
  });
  const errors = clone.error instanceof ApiError ? clone.error.fieldErrors : {};
  const words = lessons.reduce((sum, l) => sum + l.wordCount, 0);
  if (!open)
    return (
      <p>
        <button
          className="btn light"
          type="button"
          disabled={!lessons.length}
          title={lessons.length ? undefined : 'В сете нет уроков'}
          onClick={() => setOpen(true)}
        >
          🌍 Клонировать на другой язык
        </button>
      </p>
    );
  return (
    <form
      className="panel"
      style={{ background: 'var(--blue-light)' }}
      onSubmit={(e) => {
        e.preventDefault();
        clone.mutate();
      }}
    >
      <h3>Клонировать сет на другой язык</h3>
      {others.length === 0 && (
        <Notice tone="warn">
          Других языков нет — сначала создайте язык на странице <Link to="/languages">Языки</Link>.
        </Notice>
      )}
      {clone.error && !Object.keys(errors).length && (
        <Notice tone="error">{describeError(clone.error)}</Notice>
      )}
      <div className="grid-2">
        <Field label="Язык" error={errors.languageCode}>
          <select
            value={languageCode}
            onChange={(e) => setForm({ ...form, languageCode: e.target.value })}
          >
            {others.map((l) => (
              <option key={l.code} value={l.code}>
                {l.title} ({l.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Название нового сета" error={errors.title}>
          <input
            type="text"
            value={form.title}
            required
            maxLength={100}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <Field label="ID нового сета" hint="постоянный; можно поправить" error={errors.id}>
          <input
            type="text"
            value={id}
            required
            pattern="[a-z0-9][a-z0-9\-]{0,79}"
            onChange={(e) => setForm({ ...form, id: e.target.value, idTouched: true })}
          />
        </Field>
      </div>
      <div className="stack" style={{ marginBottom: 12 }}>
        <label className="row">
          <input
            type="radio"
            name="clone-mode"
            checked={mode === 'translate'}
            disabled={!providerReady}
            onChange={() => setForm({ ...form, mode: 'translate' })}
          />
          <span>
            <strong>Перевести с ИИ</strong> — слова, написание и озвучка на новом языке; картинки,
            порядок и механики заданий сохраняются. Озвучка — по одной на каждое уникальное слово
            (не больше {words}), картинки не генерируются.
            {!providerReady && (
              <span className="muted"> Недоступно: {settings.data?.unavailableReason}</span>
            )}
          </span>
        </label>
        <label className="row">
          <input
            type="radio"
            name="clone-mode"
            checked={mode === 'copy'}
            onChange={() => setForm({ ...form, mode: 'copy' })}
          />
          <span>
            <strong>Копия как есть</strong> — мгновенно и бесплатно; слова, озвучку и плитки нужно
            будет заменить вручную в редакторе урока.
          </span>
        </label>
      </div>
      <p className="muted small">
        Будет создан черновик: {lessons.length} ур., обложка и описание скопируются. Исходный сет не
        меняется.
      </p>
      <div className="row">
        <button
          className="btn"
          type="submit"
          disabled={clone.isPending || !languageCode || !form.title.trim()}
        >
          {clone.isPending ? 'Создаём…' : mode === 'translate' ? 'Перевести' : 'Скопировать'}
        </button>
        <button className="btn light" type="button" onClick={() => setOpen(false)}>
          Отмена
        </button>
      </div>
    </form>
  );
}

function JobBanner({ job }: { job: GenerationJob }) {
  const active = job.status === 'queued' || job.status === 'running';
  return (
    <Notice
      tone={
        job.status === 'failed'
          ? 'error'
          : active
            ? 'info'
            : job.status === 'awaiting-review'
              ? 'success'
              : 'warn'
      }
    >
      Генерация «{job.input.topic}»: <Badge value={job.status} />{' '}
      {job.status === 'awaiting-review' && 'черновик готов — проверьте уроки ниже. '}
      {job.error && `${job.error} `}
      <Link to={`/generations/${job.id}`}>Открыть работу</Link>
    </Notice>
  );
}

function NewLessonButton({
  course,
  onCreated,
}: {
  course: Course;
  onCreated: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [lessonId, setLessonId] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api<{ lesson: Lesson }>(`/courses/${course.id}/lessons`, { body: { id: lessonId, title } }),
    onSuccess: async () => {
      await onCreated();
      setOpen(false);
      setTitle('');
      setLessonId('');
    },
  });
  const errors = create.error instanceof ApiError ? create.error.fieldErrors : {};
  if (!open)
    return (
      <button className="btn" type="button" onClick={() => setOpen(true)}>
        + Новый урок
      </button>
    );
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <Field label="Название" error={errors.title}>
        <input
          type="text"
          value={title}
          required
          onChange={(e) => {
            setTitle(e.target.value);
            setLessonId(`${course.id}-${slugify(e.target.value) || String(Date.now()).slice(-4)}`);
          }}
        />
      </Field>
      <Field label="ID урока" error={errors.id}>
        <input
          type="text"
          value={lessonId}
          required
          pattern="[a-z0-9][a-z0-9\-]{0,79}"
          onChange={(e) => setLessonId(e.target.value)}
        />
      </Field>
      <button className="btn" type="submit" disabled={create.isPending}>
        Создать
      </button>
      <button className="btn light" type="button" onClick={() => setOpen(false)}>
        Отмена
      </button>
      {create.error && !Object.keys(errors).length && (
        <span className="error-text">{describeError(create.error)}</span>
      )}
    </form>
  );
}

export function ValidationReport({
  ok,
  errors,
  warnings,
}: {
  ok: boolean;
  errors: BuildIssue[];
  warnings: BuildWarning[];
}) {
  return (
    <>
      {ok ? (
        <Notice tone="success">Сет собирается в выпуск без ошибок.</Notice>
      ) : (
        <Notice tone="error">
          Выпуск с этим сетом невозможен:
          <ul>
            {errors.map((issue, i) => (
              <li key={i}>
                <IssueLink issue={issue} />:{' '}
                {Object.entries(issue.fieldErrors)
                  .map(
                    ([key, messages]) => `${key === '_' ? '' : key + ': '}${messages.join('; ')}`,
                  )
                  .join(' · ')}
              </li>
            ))}
          </ul>
        </Notice>
      )}
      {warnings.length > 0 && (
        <Notice tone="warn">
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>
                <IssueLink issue={w} />: {w.message}
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </>
  );
}

function IssueLink({ issue }: { issue: { entity: string; id: string } }) {
  if (issue.entity === 'lesson') return <Link to={`/lessons/${issue.id}`}>урок {issue.id}</Link>;
  if (issue.entity === 'course') return <Link to={`/courses/${issue.id}`}>сет {issue.id}</Link>;
  if (issue.entity === 'language') return <Link to="/languages">язык {issue.id}</Link>;
  return <span>каталог</span>;
}
