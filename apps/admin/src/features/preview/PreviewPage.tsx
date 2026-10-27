import { useReducer, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  AGE_BANDS,
  lessonLocales,
  localizeLesson,
  type AgeBand,
  type Answer,
  type CourseExercise,
  type CourseLesson,
  type Locale,
} from '@lingvohero/contracts';
import {
  assess,
  currentExercise,
  learn,
  newLearningState,
  starsFor,
} from '@lingvohero/learning-core';
import { ApiError, api, describeError } from '../../app/api';
import type { Preview } from '../../app/types';
import { Crumbs, Notice } from '../../components/ui';
import { mechanicFor } from '../../mechanics';

/**
 * The lesson exactly as the mobile engine runs it (same reducer, same grading, same review
 * queue), rendered with plain HTML. State lives only in this component: nothing is saved.
 */
const LOCALE_LABELS: Record<Locale, string> = { ru: 'Русский', en: 'English', he: 'עברית' };
// 8–9 plays the lesson as published; 6–7 gets fewer options and extra letters.
const AGE_LABELS: Record<AgeBand, string> = { '6-7': '6–7 лет', '8-9': '8–9 лет' };

export function PreviewPage() {
  const { id = '' } = useParams();
  const [locale, setLocale] = useState<Locale>('ru');
  const [ageBand, setAgeBand] = useState<AgeBand>('8-9');
  const query = useQuery({
    queryKey: ['preview', id],
    queryFn: () => api<Preview>(`/lessons/${id}/preview`),
  });
  if (query.isLoading) return <p className="muted">Собираем урок…</p>;
  if (query.error instanceof ApiError && query.error.status === 422)
    return (
      <>
        <Crumbs items={[{ to: `/lessons/${id}`, label: 'Редактор' }, { label: 'Предпросмотр' }]} />
        <Notice tone="error">
          Урок пока нельзя пройти:
          <ul>
            {Object.entries(query.error.fieldErrors).map(([key, messages]) => (
              <li key={key}>
                {key !== '_' && <code>{key}</code>} {messages.join('. ')}
              </li>
            ))}
          </ul>
        </Notice>
        <Link className="btn light" to={`/lessons/${id}`}>
          Вернуться в редактор
        </Link>
      </>
    );
  if (query.error || !query.data) return <Notice tone="error">{describeError(query.error)}</Notice>;
  return (
    <>
      <Crumbs
        items={[
          {
            to: `/courses/${query.data.courseId}`,
            label: 'Сет',
          },
          { to: `/lessons/${id}`, label: 'Редактор' },
          { label: 'Предпросмотр' },
        ]}
      />
      <div className="page-head">
        <h1>Пройти как ребёнок</h1>
        <span className="row">
          {(['ru', 'en', 'he'] as const).map((code) => (
            <button
              key={code}
              type="button"
              className={`btn sm ${locale === code ? '' : 'light'}`}
              aria-pressed={locale === code}
              disabled={!lessonLocales(query.data.lesson).includes(code)}
              title={
                lessonLocales(query.data.lesson).includes(code)
                  ? undefined
                  : 'Урок не переведён полностью на этот язык'
              }
              onClick={() => setLocale(code)}
            >
              {LOCALE_LABELS[code]}
            </button>
          ))}
        </span>
      </div>
      <p className="muted small">
        Ответы, ошибки, повторение и звёзды считаются движком приложения; прогресс не сохраняется.
      </p>
      <p className="row">
        <span className="muted small">Возраст ребёнка:</span>
        {AGE_BANDS.map((band) => (
          <button
            key={band}
            type="button"
            className={`btn sm ${ageBand === band ? '' : 'light'}`}
            aria-pressed={ageBand === band}
            onClick={() => setAgeBand(band)}
          >
            {AGE_LABELS[band]}
          </button>
        ))}
      </p>
      <div dir={locale === 'he' ? 'rtl' : 'ltr'}>
        <Player
          key={`${query.dataUpdatedAt}-${locale}-${ageBand}`}
          preview={{ ...query.data, lesson: localizeLesson(query.data.lesson, locale) }}
          ageBand={ageBand}
        />
      </div>
    </>
  );
}

function Player({ preview, ageBand }: { preview: Preview; ageBand: AgeBand }) {
  const { lesson, mediaUrls } = preview;
  // Every replay eases the lesson anew (the seed is random), as a new attempt in the app does.
  const [state, dispatch] = useReducer(learn, undefined, () =>
    learn(newLearningState(), {
      type: 'start',
      lesson,
      difficulty: { ageBand, seed: crypto.randomUUID() },
    }),
  );
  const [wrong, setWrong] = useState(false);
  const [hint, setHint] = useState(false);
  const session = state.session!;
  if (session.finished) {
    const stars = starsFor(session.mistakes);
    return (
      <div className="play">
        <div className="play-body" style={{ textAlign: 'center', padding: 28 }}>
          <div className="stars" aria-label={`${stars} из 3 звёзд`}>
            {[1, 2, 3].map((n) => (
              <span key={n} style={{ opacity: n <= stars ? 1 : 0.2 }}>
                ⭐
              </span>
            ))}
          </div>
          <p className="muted small">{lesson.title.toUpperCase()} — ПРОЙДЕНО</p>
          <h2>{lesson.presentation?.completionTitle ?? 'Ты — друг леса!'}</h2>
          <p>
            {lesson.presentation?.completionMessage ??
              'Слова становятся знакомее с каждой игрой. Тим очень тобой гордится!'}
          </p>
          <p className="muted small">
            Ошибок: {session.mistakes} · слов в уроке: {lesson.words.length}
          </p>
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            Пройти ещё раз
          </button>
        </div>
      </div>
    );
  }
  const exercise = currentExercise(session);
  const correct = session.correct;
  const assessment = session.draft ? assess(exercise, session.draft, lesson) : 'invalid';
  const review = session.exerciseIndex >= lesson.exercises.length;
  const last = session.exerciseIndex === session.queue.length - 1;
  return (
    <div className="play">
      <div className="play-top">
        <span>{lesson.title}</span>
        <div className="play-progress" aria-hidden="true">
          <div
            style={{
              width: `${((session.exerciseIndex + (correct ? 1 : 0)) / session.queue.length) * 100}%`,
            }}
          />
        </div>
        <span>
          {session.exerciseIndex + 1} / {session.queue.length}
        </span>
      </div>
      <div className="play-body" key={`${session.exerciseIndex}`}>
        <div className="bubble">
          🦊{' '}
          {review
            ? 'Закрепим то, что было сложным!'
            : (lesson.presentation?.intro ?? 'Маленький шаг — большое открытие!')}
        </div>
        {review && (
          <p className="small" style={{ color: 'var(--green-ink)' }}>
            ПОВТОРЕНИЕ ОШИБОК
          </p>
        )}
        <div className="play-prompt">{exercise.prompt}</div>
        <Exercise
          lesson={lesson}
          exercise={exercise}
          draft={session.draft}
          correct={correct}
          mediaUrls={mediaUrls}
          onChange={(answer) => {
            dispatch({ type: 'draft', answer });
            setWrong(false);
          }}
        />
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button className="link" type="button" onClick={() => setHint(!hint)}>
            💡 Подсказка Тима
          </button>
          {hint && (
            <p className="bubble" style={{ background: 'var(--cream)', marginTop: 8 }}>
              {exercise.hint}
            </p>
          )}
        </div>
      </div>
      <div className={`play-dock ${correct ? 'correct' : wrong ? 'wrong' : ''}`}>
        {(correct || wrong) && (
          <p>
            <strong>{correct ? 'Здорово! Ты справился!' : 'Почти! Попробуй ещё'}</strong>
            <br />
            <span className="muted small">
              {correct ? 'Ещё один шаг вперёд!' : 'Можно изменить ответ или посмотреть подсказку.'}
            </span>
          </p>
        )}
        <button
          className="btn"
          type="button"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={!correct && (assessment === 'invalid' || wrong)}
          onClick={() => {
            if (correct) {
              dispatch({ type: 'next' });
              setWrong(false);
              setHint(false);
            } else {
              dispatch({ type: 'answer' });
              setWrong(assessment === 'wrong');
            }
          }}
        >
          {correct ? (last ? 'Забрать награду' : 'Продолжить') : 'Проверить'}
        </button>
      </div>
    </div>
  );
}

function Exercise(props: {
  lesson: CourseLesson;
  exercise: CourseExercise;
  draft: Answer | null;
  correct: boolean;
  mediaUrls: Record<string, string>;
  onChange: (answer: Answer | null) => void;
}) {
  const { Preview } = mechanicFor(props.exercise.type);
  return <Preview {...props} />;
}
