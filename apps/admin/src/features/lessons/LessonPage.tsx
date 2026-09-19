import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DraftExercise,
  DraftMedia,
  DraftTexts,
  DraftWord,
  LessonDocument,
  LessonPresentation,
} from '@lingvohero/contracts';
import { ApiError, api, describeError, type FieldErrors } from '../../app/api';
import type { BuildIssue, BuildWarning, Lesson } from '../../app/types';
import { Crumbs, Field, GeneralErrors, Notice, slugify } from '../../components/ui';
import { AssetPicker } from '../media/AssetPicker';
import { ExerciseForm, newExercise } from './ExerciseForm';
import { TranslationsEditor } from './TranslationsEditor';

type Editor = {
  title: string;
  presentation: LessonPresentation | null;
  document: LessonDocument;
  texts: DraftTexts;
};

const nextId = (prefix: string, taken: { id: string }[]) => {
  let n = taken.length + 1;
  while (taken.some((x) => x.id === `${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
};

export function LessonPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['lesson', id],
    queryFn: () => api<{ lesson: Lesson }>(`/lessons/${id}`).then((r) => r.lesson),
  });
  const [editor, setEditor] = useState<Editor | null>(null);
  const [dirty, setDirty] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [warnings, setWarnings] = useState<BuildWarning[]>([]);
  useEffect(() => {
    // Adopt server data only while the local draft is untouched (or after a save).
    if (query.data && !dirty)
      setEditor({
        title: query.data.title,
        presentation: query.data.presentation,
        document: query.data.document,
        texts: query.data.texts ?? {},
      });
  }, [query.data, dirty]);
  const update = (patch: Partial<Editor>) => {
    setEditor((e) => (e ? { ...e, ...patch } : e));
    setDirty(true);
  };
  const updateDoc = (patch: Partial<LessonDocument>) =>
    editor && update({ document: { ...editor.document, ...patch } });

  const save = useMutation({
    mutationFn: () =>
      api<{ lesson: Lesson }>(`/lessons/${id}`, {
        method: 'PATCH',
        body: { ...editor, editRevision: query.data!.editRevision },
      }),
    onSuccess: async (r) => {
      queryClient.setQueryData(['lesson', id], r.lesson);
      setDirty(false);
      setServerErrors({});
      await queryClient.invalidateQueries({ queryKey: ['course', r.lesson.courseId] });
    },
    onError: (error) => {
      if (error instanceof ApiError)
        setServerErrors(
          Object.fromEntries(
            Object.entries(error.fieldErrors).map(([k, v]) => [k.replace(/^document\./, ''), v]),
          ),
        );
    },
  });
  const validate = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; errors: BuildIssue[]; warnings: BuildWarning[] }>(
        `/courses/${query.data!.courseId}/validate`,
        { method: 'POST' },
      ),
    onSuccess: (r) => {
      const mine = r.errors.filter((e) => e.entity === 'lesson' && e.id === id);
      setServerErrors(Object.assign({}, ...mine.map((e) => e.fieldErrors)));
      setWarnings(r.warnings.filter((w) => w.entity === 'lesson' && w.id === id));
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/lessons/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['course', query.data!.courseId] });
      navigate(`/courses/${query.data!.courseId}`);
    },
  });
  const duplicate = useMutation({
    mutationFn: (newId: string) =>
      api<{ lesson: Lesson }>(`/lessons/${id}/duplicate`, { body: { id: newId } }),
    onSuccess: async (r) => {
      await queryClient.invalidateQueries({ queryKey: ['course', r.lesson.courseId] });
      navigate(`/lessons/${r.lesson.id}`);
    },
  });

  if (query.isLoading || !editor) return <p className="muted">Загрузка…</p>;
  if (query.error || !query.data) return <Notice tone="error">{describeError(query.error)}</Notice>;
  const lesson = query.data;
  const doc = editor.document;
  const err = (path: string) => serverErrors[path];
  const stale = save.error instanceof ApiError && save.error.status === 409;
  const images = doc.media.filter((m) => m.kind === 'image');
  const audios = doc.media.filter((m) => m.kind === 'audio');
  const setWord = (index: number, word: DraftWord) =>
    updateDoc({ words: doc.words.map((w, i) => (i === index ? word : w)) });
  const setMedia = (index: number, media: DraftMedia) =>
    updateDoc({ media: doc.media.map((m, i) => (i === index ? media : m)) });
  const setExercise = (index: number, exercise: DraftExercise) =>
    updateDoc({ exercises: doc.exercises.map((e, i) => (i === index ? exercise : e)) });
  const moveExercise = (index: number, delta: number) => {
    const list = [...doc.exercises];
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target]!, list[index]!];
    updateDoc({ exercises: list });
  };
  const knownKeys = ['title', 'presentation'];

  return (
    <>
      <Crumbs
        items={[
          { to: '/courses', label: 'Сеты' },
          { to: `/courses/${lesson.courseId}`, label: lesson.courseId },
          { label: lesson.title },
        ]}
      />
      <div className="page-head">
        <h1>{lesson.title}</h1>
        <span className="row">
          <button
            className="btn light"
            type="button"
            disabled={validate.isPending || dirty}
            title={dirty ? 'Сначала сохраните' : undefined}
            onClick={() => validate.mutate()}
          >
            Проверить
          </button>
          <Link
            className={`btn light ${dirty ? 'disabled' : ''}`}
            to={`/lessons/${id}/preview`}
            onClick={(e) => dirty && e.preventDefault()}
            title={dirty ? 'Сначала сохраните' : undefined}
          >
            Пройти как ребёнок
          </Link>
          <button
            className="btn"
            type="button"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </span>
      </div>
      <p className="muted small">
        <code>{lesson.id}</code> ·{' '}
        {lesson.lastPublishedVersion
          ? `опубликована версия v${lesson.lastPublishedVersion}; изменения выйдут как v${lesson.lastPublishedVersion + 1}`
          : 'ещё не публиковался'}
        {dirty && ' · есть несохранённые изменения'}
      </p>
      {stale && (
        <Notice tone="error">
          Урок изменили в другом окне. Ваши правки остались на экране —{' '}
          <button
            className="link"
            type="button"
            onClick={() => queryClient.invalidateQueries({ queryKey: ['lesson', id] })}
          >
            обновите ревизию
          </button>{' '}
          и сохраните снова (или скопируйте правки вручную).
        </Notice>
      )}
      {save.error &&
        !stale &&
        !(save.error instanceof ApiError && Object.keys(save.error.fieldErrors).length) && (
          <Notice tone="error">{describeError(save.error)}</Notice>
        )}
      {save.isSuccess && !dirty && <Notice tone="success">Сохранено.</Notice>}
      {validate.data?.ok && !dirty && (
        <Notice tone="success">Урок проходит проверку и попадёт в следующий выпуск.</Notice>
      )}
      {warnings.length > 0 && (
        <Notice tone="warn">
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>{w.message}</li>
            ))}
          </ul>
        </Notice>
      )}
      <GeneralErrors
        errors={serverErrors}
        known={[
          ...knownKeys,
          ...Object.keys(serverErrors).filter((k) => /^(words|media|exercises)\.\d+\./.test(k)),
        ]}
      />

      <section className="panel">
        <h2>Урок</h2>
        <Field label="Название" hint="до 100 символов" error={err('title')}>
          <input
            type="text"
            value={editor.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </Field>
        <label className="row">
          <input
            type="checkbox"
            checked={!!editor.presentation}
            onChange={(e) =>
              update({
                presentation: e.target.checked
                  ? { intro: '', completionTitle: '', completionMessage: '' }
                  : null,
              })
            }
          />
          Свои реплики Тима (вступление и финал)
        </label>
        {editor.presentation && (
          <div className="grid-2" style={{ marginTop: 10 }}>
            <Field label="Вступление" hint="до 300 символов" error={err('presentation.intro')}>
              <textarea
                value={editor.presentation.intro}
                onChange={(e) =>
                  update({ presentation: { ...editor.presentation!, intro: e.target.value } })
                }
              />
            </Field>
            <Field
              label="Заголовок финала"
              hint="до 100"
              error={err('presentation.completionTitle')}
            >
              <input
                type="text"
                value={editor.presentation.completionTitle}
                onChange={(e) =>
                  update({
                    presentation: { ...editor.presentation!, completionTitle: e.target.value },
                  })
                }
              />
            </Field>
            <Field label="Текст финала" hint="до 400" error={err('presentation.completionMessage')}>
              <textarea
                value={editor.presentation.completionMessage}
                onChange={(e) =>
                  update({
                    presentation: { ...editor.presentation!, completionMessage: e.target.value },
                  })
                }
              />
            </Field>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="page-head">
          <h2>Медиа урока</h2>
          <span className="row">
            <button
              className="btn light sm"
              type="button"
              onClick={() =>
                updateDoc({
                  media: [
                    ...doc.media,
                    { id: nextId('img', doc.media), kind: 'image', assetId: '' },
                  ],
                })
              }
            >
              + Картинка
            </button>
            <button
              className="btn light sm"
              type="button"
              onClick={() =>
                updateDoc({
                  media: [
                    ...doc.media,
                    { id: nextId('snd', doc.media), kind: 'audio', assetId: '' },
                  ],
                })
              }
            >
              + Звук
            </button>
          </span>
        </div>
        <p className="muted small">
          Слова ссылаются на медиа по ID. Один PNG-атлас можно нарезать на ячейки через «область».
        </p>
        {err('media') && <p className="error-text">{err('media')!.join('. ')}</p>}
        {doc.media.map((media, index) => (
          <div key={index} className="exercise">
            <div className="grid-2">
              <Field
                label={media.kind === 'image' ? 'ID картинки' : 'ID звука'}
                error={err(`media.${index}.id`)}
              >
                <input
                  type="text"
                  value={media.id}
                  pattern="[a-z0-9][a-z0-9\-]{0,79}"
                  onChange={(e) => setMedia(index, { ...media, id: e.target.value })}
                />
              </Field>
              <Field label="Файл" error={err(`media.${index}.assetId`)}>
                <AssetPicker
                  kind={media.kind}
                  value={media.assetId || null}
                  onChange={(asset) => setMedia(index, { ...media, assetId: asset?.id ?? '' })}
                />
              </Field>
            </div>
            {media.kind === 'image' && (
              <label className="row">
                <input
                  type="checkbox"
                  checked={!!media.region}
                  onChange={(e) =>
                    setMedia(index, {
                      ...media,
                      region: e.target.checked
                        ? { columns: 2, rows: 2, column: 0, row: 0 }
                        : undefined,
                    })
                  }
                />
                Область атласа
                {media.region &&
                  (['columns', 'rows', 'column', 'row'] as const).map((key) => (
                    <label key={key} className="row">
                      <span className="small">{key}</span>
                      <input
                        type="number"
                        min={0}
                        max={8}
                        style={{ width: 64 }}
                        value={media.region![key]}
                        onChange={(e) =>
                          setMedia(index, {
                            ...media,
                            region: { ...media.region!, [key]: Number(e.target.value) },
                          })
                        }
                      />
                    </label>
                  ))}
              </label>
            )}
            {err(`media.${index}.region`) && (
              <p className="error-text">{err(`media.${index}.region`)}</p>
            )}
            <button
              className="link"
              type="button"
              onClick={() => updateDoc({ media: doc.media.filter((_, i) => i !== index) })}
            >
              Убрать
            </button>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="page-head">
          <h2>Слова</h2>
          <button
            className="btn light sm"
            type="button"
            onClick={() =>
              updateDoc({
                words: [
                  ...doc.words,
                  {
                    id: nextId('word', doc.words),
                    text: '',
                    spelling: '',
                    translation: '',
                    imageId: '',
                    audioId: '',
                  },
                ],
              })
            }
          >
            + Слово
          </button>
        </div>
        {err('words') && <p className="error-text">{err('words')!.join('. ')}</p>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Текст</th>
                <th>Для сборки</th>
                <th>Перевод</th>
                <th>Картинка</th>
                <th>Звук</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {doc.words.map((word, index) => (
                <tr key={index}>
                  <td>
                    <input
                      type="text"
                      value={word.id}
                      aria-invalid={!!err(`words.${index}.id`)}
                      onChange={(e) => setWord(index, { ...word, id: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={word.text}
                      aria-invalid={!!err(`words.${index}.text`)}
                      placeholder="A fox"
                      onChange={(e) => {
                        const text = e.target.value;
                        const auto = slugify(text.replace(/^(a|an|the)\s+/i, ''));
                        setWord(index, {
                          ...word,
                          text,
                          id: word.id.startsWith('word-') && auto ? auto : word.id,
                          spelling:
                            word.spelling || text.replace(/^(a|an|the)\s+/i, '').toLowerCase(),
                        });
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={word.spelling}
                      aria-invalid={!!err(`words.${index}.spelling`)}
                      placeholder="fox"
                      onChange={(e) => setWord(index, { ...word, spelling: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      value={word.translation}
                      aria-invalid={!!err(`words.${index}.translation`)}
                      placeholder="Лиса"
                      onChange={(e) => setWord(index, { ...word, translation: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={word.imageId}
                      aria-invalid={!!err(`words.${index}.imageId`)}
                      onChange={(e) => setWord(index, { ...word, imageId: e.target.value })}
                    >
                      <option value="">—</option>
                      {images.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={word.audioId}
                      aria-invalid={!!err(`words.${index}.audioId`)}
                      onChange={(e) => setWord(index, { ...word, audioId: e.target.value })}
                    >
                      <option value="">—</option>
                      {audios.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className="link"
                      type="button"
                      onClick={() => updateDoc({ words: doc.words.filter((_, i) => i !== index) })}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {doc.words.map((_, index) =>
          ['id', 'text', 'spelling', 'translation', 'imageId', 'audioId']
            .filter((key) => err(`words.${index}.${key}`))
            .map((key) => (
              <p key={`${index}-${key}`} className="error-text">
                Слово {index + 1}, {key}: {err(`words.${index}.${key}`)!.join('. ')}
              </p>
            )),
        )}
      </section>

      <section className="panel">
        <div className="page-head">
          <h2>Задания ({doc.exercises.length})</h2>
          <span className="row">
            {(['listen-and-select', 'match-pairs', 'build-word'] as const).map((type) => (
              <button
                key={type}
                className="btn light sm"
                type="button"
                onClick={() =>
                  updateDoc({
                    exercises: [...doc.exercises, newExercise(type, nextId('ex', doc.exercises))],
                  })
                }
              >
                +{' '}
                {type === 'listen-and-select'
                  ? 'Послушай и выбери'
                  : type === 'match-pairs'
                    ? 'Найди пары'
                    : 'Собери слово'}
              </button>
            ))}
          </span>
        </div>
        {err('exercises') && <p className="error-text">{err('exercises')!.join('. ')}</p>}
        {doc.exercises.map((exercise, index) => (
          <ExerciseForm
            key={exercise.id}
            exercise={exercise}
            index={index}
            total={doc.exercises.length}
            words={doc.words}
            errors={(path) => err(`exercises.${index}.${path}`)}
            onChange={(next) => setExercise(index, next)}
            onRemove={() => updateDoc({ exercises: doc.exercises.filter((_, i) => i !== index) })}
            onDuplicate={() =>
              updateDoc({
                exercises: [
                  ...doc.exercises.slice(0, index + 1),
                  { ...structuredClone(exercise), id: nextId('ex', doc.exercises) },
                  ...doc.exercises.slice(index + 1),
                ],
              })
            }
            onMove={(delta) => moveExercise(index, delta)}
          />
        ))}
      </section>

      <TranslationsEditor
        title={editor.title}
        presentation={editor.presentation}
        document={editor.document}
        texts={editor.texts}
        states={query.data?.translations}
        onChange={(texts) => update({ texts })}
      />

      <section className="panel">
        <h2>Действия с уроком</h2>
        <div className="row">
          <button
            className="btn light"
            type="button"
            disabled={duplicate.isPending}
            onClick={() => {
              const newId = window.prompt('ID копии урока', `${lesson.id}-copy`);
              if (newId) duplicate.mutate(newId);
            }}
          >
            Дублировать урок
          </button>
          <button
            className="btn danger"
            type="button"
            disabled={!!lesson.lastPublishedVersion || remove.isPending}
            title={lesson.lastPublishedVersion ? 'Опубликованный урок удалить нельзя' : undefined}
            onClick={() => window.confirm('Удалить урок безвозвратно?') && remove.mutate()}
          >
            Удалить урок
          </button>
          {(duplicate.error || remove.error) && (
            <span className="error-text">{describeError(duplicate.error ?? remove.error)}</span>
          )}
        </div>
      </section>
    </>
  );
}
