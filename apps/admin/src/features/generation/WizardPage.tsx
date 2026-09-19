import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiError, api, describeError } from '../../app/api';
import type { GenerationEstimate, GenerationSettings, GenerationView } from '../../app/types';
import { Crumbs, Field, GeneralErrors, Notice } from '../../components/ui';
import { useCourse } from '../courses/CoursePage';

const topicPresets = [
  'Лесные животные',
  'Домашние питомцы',
  'Цвета и формы',
  'Фрукты и овощи',
  'Моя семья',
  'Одежда',
  'Погода',
  'Игрушки',
];
const mechanics = [
  { value: 'listen-and-select', label: 'Послушай и выбери' },
  { value: 'match-pairs', label: 'Найди пары' },
  { value: 'build-word', label: 'Собери слово' },
] as const;

export function useGenerationSettings() {
  return useQuery({
    queryKey: ['generation-settings'],
    queryFn: () => api<GenerationSettings>('/generation-settings'),
    staleTime: 60_000,
  });
}

export function WizardPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const course = useCourse(id);
  const settings = useGenerationSettings();
  // One key per opened wizard: a double click or a retried request never starts a second job.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({
    topic: '',
    totalExercises: 24,
    lessonSize: 6,
    wordCount: '' as string | number,
    targetWords: '',
    mix: ['listen-and-select', 'match-pairs', 'build-word'] as string[],
    style: '',
  });
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    if (course.data?.course.topic && !form.topic)
      setForm((f) => ({ ...f, topic: course.data!.course.topic! }));
  }, [course.data, form.topic]);
  useEffect(() => {
    if (settings.data) setForm((f) => ({ ...f, lessonSize: settings.data.limits.lessonSize }));
  }, [settings.data]);
  const body = useMemo(
    () => ({
      topic: form.topic,
      totalExercises: Number(form.totalExercises),
      lessonSize: Number(form.lessonSize),
      wordCount: form.wordCount === '' ? null : Number(form.wordCount),
      targetWords: form.targetWords
        .split(/[,\n;]+/)
        .map((w) => w.trim())
        .filter(Boolean),
      mix: form.mix,
      style: form.style || null,
    }),
    [form],
  );
  const estimateQuery = useQuery({
    queryKey: ['generation-estimate', body],
    queryFn: () => api<GenerationEstimate>('/generation-estimates', { body }),
    enabled: body.topic.length >= 2 && body.mix.length > 0,
    retry: false,
  });
  const start = useMutation({
    mutationFn: () =>
      api<GenerationView>(`/courses/${id}/generations`, { body: { ...body, idempotencyKey } }),
    onSuccess: (view) => navigate(`/generations/${view.job.id}`),
  });
  if (course.isLoading || settings.isLoading) return <p className="muted">Загрузка…</p>;
  if (course.error || !course.data)
    return <Notice tone="error">{describeError(course.error)}</Notice>;
  if (settings.error || !settings.data)
    return <Notice tone="error">{describeError(settings.error)}</Notice>;
  const limits = settings.data.limits;
  const errors = start.error instanceof ApiError ? start.error.fieldErrors : {};
  const estimate = estimateQuery.data;
  const estimateError = estimateQuery.error instanceof ApiError ? estimateQuery.error : null;
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      <Crumbs
        items={[
          { to: '/courses', label: 'Сеты' },
          { to: `/courses/${id}`, label: course.data.course.title },
          { label: 'Черновик с ИИ' },
        ]}
      />
      <h1>Создать черновик с ИИ</h1>
      <p className="muted">
        Язык <code>{course.data.course.languageCode}</code>. Модель предложит словарь, уроки,
        задания, картинки и озвучку; результат станет <strong>черновиком</strong> — его можно
        поправить, проверить и только потом опубликовать.
      </p>
      {!settings.data.providerReady && (
        <Notice tone="warn">{settings.data.unavailableReason}</Notice>
      )}
      {settings.data.providerName === 'fake' && (
        <Notice tone="info">
          Включён тестовый провайдер: тексты и медиа будут условными, без обращения к OpenAI.
        </Notice>
      )}
      {start.error && !Object.keys(errors).length && (
        <Notice tone="error">{describeError(start.error)}</Notice>
      )}
      <GeneralErrors
        errors={errors}
        known={[
          'topic',
          'totalExercises',
          'lessonSize',
          'wordCount',
          'targetWords',
          'mix',
          'style',
        ]}
      />
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          start.mutate();
        }}
      >
        <Field label="Тема сета" hint="выберите или впишите свою" error={errors.topic}>
          <input
            type="text"
            list="topic-presets"
            value={form.topic}
            required
            minLength={2}
            maxLength={200}
            onChange={(e) => set('topic', e.target.value)}
          />
          <datalist id="topic-presets">
            {topicPresets.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field
          label="Всего заданий в сете"
          hint={`${limits.minExercises}–${limits.maxExercises}; уроков получится столько, сколько нужно`}
          error={errors.totalExercises}
        >
          <input
            type="number"
            min={limits.minExercises}
            max={limits.maxExercises}
            value={form.totalExercises}
            onChange={(e) => set('totalExercises', Number(e.target.value))}
          />
        </Field>
        <button className="link" type="button" onClick={() => setAdvanced(!advanced)}>
          {advanced ? 'Скрыть дополнительно' : 'Дополнительно…'}
        </button>
        {advanced && (
          <div className="grid-2" style={{ marginTop: 12 }}>
            <Field
              label="Заданий в уроке"
              hint="по умолчанию 6, не больше 30"
              error={errors.lessonSize}
            >
              <input
                type="number"
                min={3}
                max={limits.maxPerLesson}
                value={form.lessonSize}
                onChange={(e) => set('lessonSize', Number(e.target.value))}
              />
            </Field>
            <Field
              label="Слов в сете"
              hint={`пусто = ${limits.wordsPerLesson} на урок; каждое слово = картинка + озвучка`}
              error={errors.wordCount ?? estimateError?.fieldErrors.wordCount}
            >
              <input
                type="number"
                min={3}
                max={limits.maxWords}
                placeholder={estimate ? String(estimate.words) : ''}
                value={form.wordCount}
                onChange={(e) => set('wordCount', e.target.value)}
              />
            </Field>
            <Field
              label="Обязательные слова"
              hint="через запятую, на изучаемом языке"
              error={errors.targetWords}
            >
              <input
                type="text"
                value={form.targetWords}
                onChange={(e) => set('targetWords', e.target.value)}
              />
            </Field>
            <Field label="Механики" error={errors.mix}>
              <span className="checks">
                {mechanics.map((m) => (
                  <label key={m.value}>
                    <input
                      type="checkbox"
                      checked={form.mix.includes(m.value)}
                      onChange={(e) =>
                        set(
                          'mix',
                          e.target.checked
                            ? [...form.mix, m.value]
                            : form.mix.filter((x) => x !== m.value),
                        )
                      }
                    />
                    {m.label}
                  </label>
                ))}
              </span>
            </Field>
            <Field
              label="Стиль иллюстраций"
              hint="по умолчанию — мягкая детская книжная иллюстрация"
              error={errors.style}
            >
              <input
                type="text"
                value={form.style}
                maxLength={300}
                onChange={(e) => set('style', e.target.value)}
              />
            </Field>
            <p className="muted small">
              Уровень: beginner · возраст: 6–9 · голос: {settings.data.models.voice} · модели:{' '}
              {settings.data.models.text}, {settings.data.models.image}, {settings.data.models.tts}
            </p>
          </div>
        )}
        <div className="panel" style={{ background: 'var(--cream)', marginTop: 16 }}>
          <h3>Что получится</h3>
          {estimateError ? (
            <p className="error-text">{estimateError.message}</p>
          ) : estimate ? (
            <ul className="diff-list">
              <li>
                Уроков: <strong>{estimate.lessons}</strong> ({estimate.distribution.join(' + ')}{' '}
                заданий)
              </li>
              <li>
                Слов: <strong>{estimate.words}</strong>, иллюстраций {estimate.images} (включая
                обложку), озвучек {estimate.audios}
              </li>
              <li>
                Оценка стоимости: <strong>≈ {estimate.estimatedUsd.toFixed(2)} $</strong>; лимит на
                работу {settings.data.costLimitUsd} $ — при превышении работа остановится
              </li>
            </ul>
          ) : (
            <p className="muted">Введите тему, чтобы увидеть расчёт.</p>
          )}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button
            className="btn amber"
            type="submit"
            disabled={!settings.data.providerReady || start.isPending || !estimate}
          >
            {start.isPending ? 'Запускаем…' : 'Создать черновик с ИИ'}
          </button>
          <Link className="btn light" to={`/courses/${id}`}>
            Отмена
          </Link>
        </div>
      </form>
    </>
  );
}
