import { useReducer, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import {
  lessonLocales,
  localizeLesson,
  type Answer,
  type CourseExercise,
  type CourseLesson,
  type Locale,
} from '@lingvohero/contracts';
import { assess, learn, newLearningState, starsFor } from '@lingvohero/learning-core';
import { ApiError, api, describeError } from '../../app/api';
import type { Preview } from '../../app/types';
import { Crumbs, Notice } from '../../components/ui';

/**
 * The lesson exactly as the mobile engine runs it (same reducer, same grading, same review
 * queue), rendered with plain HTML. State lives only in this component: nothing is saved.
 */
const LOCALE_LABELS: Record<Locale, string> = { ru: 'Русский', en: 'English', he: 'עברית' };

export function PreviewPage() {
  const { id = '' } = useParams();
  const [locale, setLocale] = useState<Locale>('ru');
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
      <div dir={locale === 'he' ? 'rtl' : 'ltr'}>
        <Player
          key={`${query.dataUpdatedAt}-${locale}`}
          preview={{ ...query.data, lesson: localizeLesson(query.data.lesson, locale) }}
        />
      </div>
    </>
  );
}

function Player({ preview }: { preview: Preview }) {
  const { lesson, mediaUrls } = preview;
  const [state, dispatch] = useReducer(learn, undefined, () =>
    learn(newLearningState(), { type: 'start', lesson }),
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
  const exercise = lesson.exercises[session.queue[session.exerciseIndex]!]!;
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

function Sprite({
  lesson,
  id,
  size,
  mediaUrls,
}: {
  lesson: CourseLesson;
  id: string;
  size: number;
  mediaUrls: Record<string, string>;
}) {
  const media = lesson.media.find((m) => m.id === id)!;
  const region = media.region ?? { columns: 1, rows: 1, column: 0, row: 0 };
  return (
    <span className="sprite" style={{ width: size, height: size }}>
      <img
        src={mediaUrls[id]}
        alt=""
        style={{
          width: size * region.columns,
          height: size * region.rows,
          left: -size * region.column,
          top: -size * region.row,
        }}
      />
    </span>
  );
}

function AudioButtons({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const play = (rate: number) => {
    const audio = ref.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.playbackRate = rate;
    void audio.play();
  };
  return (
    <div className="audio-row">
      <audio ref={ref} src={src} preload="auto" />
      <button className="btn amber" type="button" onClick={() => play(1)}>
        🔊 Послушать
      </button>
      <button className="btn light" type="button" onClick={() => play(0.7)}>
        🐢 Медленно
      </button>
    </div>
  );
}

function Exercise({
  lesson,
  exercise,
  draft,
  correct,
  mediaUrls,
  onChange,
}: {
  lesson: CourseLesson;
  exercise: CourseExercise;
  draft: Answer | null;
  correct: boolean;
  mediaUrls: Record<string, string>;
  onChange: (answer: Answer | null) => void;
}) {
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const word = (id: string) => lesson.words.find((w) => w.id === id)!;
  if (exercise.type === 'listen-and-select')
    return (
      <>
        <p className="muted small">Послушай слово и выбери картинку.</p>
        <AudioButtons src={mediaUrls[word(exercise.wordId).audioId]!} />
        <div className="choice-grid">
          {exercise.choices.map((id) => {
            const selected = draft !== null && 'choiceId' in draft && draft.choiceId === id;
            return (
              <button
                key={id}
                type="button"
                className={`choice ${selected ? 'selected' : ''} ${correct && id === exercise.wordId ? 'correct' : ''}`}
                disabled={correct}
                onClick={() => onChange({ choiceId: id })}
              >
                <Sprite lesson={lesson} id={word(id).imageId} size={110} mediaUrls={mediaUrls} />
                <span className="word">{word(id).text}</span>
                <span className="muted small">{correct ? word(id).translation : ' '}</span>
              </button>
            );
          })}
        </div>
      </>
    );
  if (exercise.type === 'match-pairs') {
    const pairs = draft && 'pairs' in draft ? draft.pairs : {};
    return (
      <>
        <p className="muted small">Сначала слово, потом картинка. Номера покажут твои пары.</p>
        <div className="pairs">
          <div className="col">
            {exercise.wordIds.map((id, index) => (
              <button
                key={id}
                type="button"
                className={`pair ${pairs[id] ? 'paired' : ''} ${selectedWord === id ? 'selected' : ''} ${correct ? 'correct' : ''}`}
                disabled={correct}
                onClick={() => setSelectedWord(id)}
              >
                <span className="word">
                  {index + 1}. {word(id).text}
                </span>
              </button>
            ))}
          </div>
          <div className="col">
            {exercise.imageOrder.map((id) => {
              const owner = exercise.wordIds.find((w) => pairs[w] === id);
              return (
                <button
                  key={id}
                  type="button"
                  className={`pair ${owner ? 'paired' : ''} ${correct ? 'correct' : ''}`}
                  disabled={correct || !selectedWord}
                  onClick={() => {
                    if (!selectedWord) return;
                    const next = { ...pairs };
                    if (owner) delete next[owner];
                    next[selectedWord] = id;
                    onChange({ pairs: next });
                    setSelectedWord(null);
                  }}
                >
                  <Sprite lesson={lesson} id={word(id).imageId} size={62} mediaUrls={mediaUrls} />
                  <span className="n">{owner ? exercise.wordIds.indexOf(owner) + 1 : '?'}</span>
                </button>
              );
            })}
          </div>
        </div>
        {!correct && (
          <button
            className="btn light"
            type="button"
            onClick={() => {
              onChange(null);
              setSelectedWord(null);
            }}
          >
            Сбросить пары
          </button>
        )}
      </>
    );
  }
  const chosen = draft && 'tileIds' in draft ? draft.tileIds : [];
  const tile = (id: string) => exercise.tiles.find((t) => t.id === id)!;
  return (
    <>
      <p className="muted small">Собери слово без артикля. Нажми на буквы по порядку.</p>
      <div style={{ textAlign: 'center' }}>
        <Sprite
          lesson={lesson}
          id={word(exercise.wordId).imageId}
          size={110}
          mediaUrls={mediaUrls}
        />
        <div>{word(exercise.wordId).translation}</div>
      </div>
      <AudioButtons src={mediaUrls[word(exercise.wordId).audioId]!} />
      <div className="answer-box" aria-label="Собранное слово">
        {chosen.length === 0 && <span className="muted">Здесь появится слово</span>}
        {chosen.map((id) => (
          <button
            key={id}
            type="button"
            className="letter chosen"
            disabled={correct}
            onClick={() => onChange({ tileIds: chosen.filter((t) => t !== id) })}
          >
            {tile(id).letter}
          </button>
        ))}
      </div>
      <div className="tiles" style={{ justifyContent: 'center', margin: '16px 0' }}>
        {exercise.tiles.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`letter ${chosen.includes(t.id) ? 'used' : ''}`}
            disabled={correct || chosen.includes(t.id)}
            onClick={() => onChange({ tileIds: [...chosen, t.id] })}
          >
            {t.letter}
          </button>
        ))}
      </div>
      {!correct && (
        <button className="btn light" type="button" onClick={() => onChange(null)}>
          Начать слово заново
        </button>
      )}
    </>
  );
}
